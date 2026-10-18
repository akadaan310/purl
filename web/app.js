const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const json = value => JSON.stringify(value, null, 2);
const short = (value, length = 15) => String(value ?? '').length > length ? `${String(value).slice(0, length)}…` : String(value ?? '');
const icon = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true"><rect x="5.5" y="5.5" width="7" height="8" rx="1.5"/><path d="M3.5 10.5h-1v-8h7v1"/></svg>';
const storeKey = 'purl.session';
const authIntentKey = 'purl.auth.intent';
let savedSession;
try { savedSession = JSON.parse(sessionStorage.getItem(storeKey) || 'null'); } catch { savedSession = null; }
const state = { programs: [], templates: [], operators: [], metadata: null, authConfig: null, loaded: false, available: false, error: '', session: savedSession, route: location.pathname, filter: 'all', search: '', program: null, programData: {}, editor: null, execution: null, compile: null, lastResult: null, busy: false, editorTab: 'source', dataTab: 'diagnostics', panelData: null, editorManifest: null, detailManifest: null, routeEpoch: 0 };
let toastTimer, pollTimer;

function safeUrl(value, fallback = '/') {
  try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback; } catch { return fallback; }
}
function programUrl(program) { return safeUrl(program.url || `${location.origin}/p/${encodeURIComponent(program.id)}`); }
function programRoute(program, editor = false) { return `${editor ? '/ide/' : '/p/'}${encodeURIComponent(program.id)}`; }
function sourceText(source) { return typeof source === 'string' ? source : json(source); }
function sourceValue(source) { const text = String(source).trim(); if (text.startsWith('{')) { try { return JSON.parse(text); } catch {} } return source; }
function unwrapProgram(response) { return response?.program || response?.data?.program || (response?.id && response?.source !== undefined ? response : null); }
function ownerId(program) { return typeof program.owner === 'object' ? program.owner?.id : program.owner; }
function principalId() { return state.session?.principal?.id || state.session?.principal?.principal_id; }
function programDescription(program) {
  if (program.description) return program.description;
  if (program.kind === 'mission') return 'A living mission. Every next step, carried forward.';
  if (program.kind === 'game') return 'A shared game. Your next move is a URL away.';
  if (/diagnostic|inspect|health/i.test(program.title)) return 'A closer look at what’s running underneath.';
  if (/math|number|arithmetic|transform/i.test(program.title)) return 'Small operations. Beautifully composed.';
  return 'An addressable idea, ready to run and continue.';
}
function identity(program) { return program.kind === 'mission' ? 'mission' : program.kind === 'game' ? 'game' : /diagnostic|inspect|health/i.test(program.title) ? 'diagnostic' : /math|number|arithmetic|transform/i.test(program.title) ? 'math' : ''; }
function programState(program) {
  if (program.state?.status) return program.state.status;
  if (program.state?.winner) return 'complete';
  const currentBuild = program.builds?.find(build => build.id === program.active_build) || program.builds?.filter(build => build.source_revision === program.source_revision).at(-1);
  if (currentBuild?.status === 'failed' || currentBuild?.status === 'blocked') return currentBuild.status;
  if ((program.release || program.published || program.releases?.length) && program.active_build) return 'published';
  if (currentBuild?.status === 'passed') return 'built';
  return 'addressable';
}
function date(value) { if (!value) return ''; const d = new Date(value); return Number.isNaN(d.valueOf()) ? String(value) : d.toLocaleString(undefined, {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3500); }
function busy(on) { state.busy = on; document.body.classList.toggle('is-busy', on); $$('.mutation-button').forEach(button => { button.disabled = on; }); const line = $('.busy-line'); if (on && !line) { const node = document.createElement('div'); node.className = 'busy-line'; document.body.append(node); } else if (!on) line?.remove(); }
async function api(path, options = {}) {
  const headers = {Accept:'application/json', ...options.headers};
  if (state.session?.token) headers.Authorization = `Bearer ${state.session.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {...options, headers, body: options.body !== undefined ? JSON.stringify(options.body) : undefined});
  let data;
  try { data = await response.json(); } catch { throw new Error(`The service returned an unreadable response (${response.status}).`); }
  if (!response.ok) { const error = new Error(data?.error?.message || data?.message || `Request failed (${response.status}).`); error.code = data?.error?.code; error.status = response.status; error.details = data?.error; if (response.status === 401 && state.session) { state.session = null; sessionStorage.removeItem(storeKey); updateSession(); } throw error; }
  return data;
}
async function ensureSession() {
  if (state.session?.token) return state.session;
  const session = await api('/api/session', {method:'POST', body:{label:'Curious guest',kind:'guest'}});
  state.session = session; sessionStorage.setItem(storeKey, JSON.stringify(session)); updateSession();
  return session;
}
function updateSession() {
  const button = $('[data-session]');
  if (!button) return;
  const label = state.session?.principal?.label || 'Guest session';
  button.innerHTML = `<span class="session-dot ${state.session ? 'connected' : ''}"></span><span>${escape(label)}</span>`;
  button.setAttribute('aria-label', state.session ? `Manage session: ${label}` : 'Connect a guest session');
}
async function refreshLibrary() {
  const response = await api('/api/programs');
  state.programs = response.items || response.programs || [];
  return state.programs;
}
async function loadInitial() {
  const hadSession = Boolean(state.session?.token);
  const requests = await Promise.allSettled([api('/api/programs'), api('/api/templates'), api('/api/operators'), api('/.well-known/purl'), api('/api/auth/config')]);
  const [programs, templates, operators, metadata, authConfig] = requests;
  if (programs.status === 'fulfilled') { state.programs = programs.value.items || programs.value.programs || []; state.available = true; }
  else { state.available = false; state.error = programs.reason.message; }
  if (templates.status === 'fulfilled') state.templates = templates.value.items || [];
  if (operators.status === 'fulfilled') state.operators = operators.value.items || [];
  if (metadata.status === 'fulfilled') state.metadata = metadata.value;
  if (authConfig.status === 'fulfilled') state.authConfig = authConfig.value;
  if (hadSession && programs.status === 'rejected' && programs.reason.status === 401 && !state.session) return loadInitial();
  state.loaded = true;
  if (state.session?.token) {
    try { const result = await api('/api/session'); state.session.principal = result.principal || state.session.principal; } catch (error) { if (error.status === 401) { state.session = null; sessionStorage.removeItem(storeKey); } }
  }
  render();
}

async function consumeAuthCallback() {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get('access_token');
  if (!token && !params.has('error_description')) return;
  const callbackUrl = new URL(location.href), returnedState = callbackUrl.searchParams.get('auth_state');
  callbackUrl.searchParams.delete('auth_state');
  history.replaceState({},'',callbackUrl.pathname+callbackUrl.search);
  if (!token) { toast(params.get('error_description') || 'The account provider could not finish signing in.'); return; }
  let intent;
  try { intent = JSON.parse(localStorage.getItem(authIntentKey) || 'null'); localStorage.removeItem(authIntentKey); } catch { intent = null; }
  const age = intent ? Date.now() - intent.created_at : Infinity;
  if (!intent || !returnedState || intent.nonce !== returnedState || !Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) {
    toast('This sign-in link could not be verified. Request a fresh link from Guest session in this browser.');
    return;
  }
  try {
    const response = await fetch('/api/auth/session',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:'{}'});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Account verification failed.');
    state.session = result; sessionStorage.setItem(storeKey,JSON.stringify(result));
    toast('Account verified. Your workspace is ready.');
  } catch (error) { toast(error.message); }
}

function openSessionDialog() {
  $('#session-label').value = state.session?.principal?.label || ''; $('#session-error').textContent = '';
  const content = $('#session-form');
  let extra = $('#session-extra');
  if (!extra) { extra = document.createElement('div'); extra.id = 'session-extra'; content.append(extra); }
  const principal = state.session?.principal;
  extra.innerHTML = `${principal ? `<p class="session-current">${principal.identity_verified ? 'Verified account' : 'Current self-declared session'} · ${escape(principal.kind)}<br><span class="session-principal">${escape(principal.id)}</span><br>Starting a new session does not transfer ownership of your existing programs.</p><button type="button" class="button-link" data-copy="${escape(principal.id)}">Copy principal ID ↗︎</button><button type="button" class="button-link" data-disconnect>Disconnect this session ↗︎</button>` : ''}${state.authConfig?.available ? '<div class="account-signin"><span class="eyebrow">OR USE A VERIFIED ACCOUNT</span><label for="account-email">Your email address</label><input id="account-email" type="email" autocomplete="email" placeholder="you@example.com"><button type="button" class="button button-light" data-account-start>Email a sign-in link ↗︎</button><p id="account-message" role="status"></p></div>' : ''}`;
  $('#session-dialog').showModal();
}

function header() {
  const route = state.route;
  return `<header class="site-header"><a class="brand" href="/" data-nav aria-label="PURL home"><span class="brand-pearl" aria-hidden="true"></span>PURL<span class="brand-dot">.</span></a><nav class="header-nav" id="main-nav" aria-label="Main navigation"><a href="/explore" data-nav class="${route === '/explore' ? 'active' : ''}">Explore</a><a href="/workspace" data-nav class="${/^\/(workspace|ide|create)/.test(route) ? 'active' : ''}">Workspace</a><a href="/observatory" data-nav class="${route === '/observatory' ? 'active' : ''}">Observatory</a><a href="/docs" data-nav class="${route === '/docs' ? 'active' : ''}">Docs</a></nav><div class="header-right"><button class="session-button" data-session><span class="session-dot ${state.session ? 'connected' : ''}"></span><span>${escape(state.session?.principal?.label || 'Guest session')}</span></button><a href="/create" data-nav class="button button-dark">Create a PURL <span aria-hidden="true">↗︎</span></a><button class="mobile-menu-toggle" aria-label="Toggle navigation" aria-expanded="false" aria-controls="main-nav"><span></span><span></span></button></div></header>`;
}
function liveLabel() { return `<span class="live-indicator ${state.available ? '' : 'unavailable'}">${state.available ? 'LIVE SERVICE' : state.loaded ? 'UNAVAILABLE' : 'CONNECTING'}</span>`; }
function footer() { return `<footer class="footer"><div class="footer-left"><a class="brand" href="/" data-nav><span class="brand-pearl" aria-hidden="true"></span>PURL<span class="brand-dot">.</span></a><span>Programmable URLs. Pronounced pearl.</span></div><div class="footer-links"><a href="/docs" data-nav>How it works</a><a href="/.well-known/purl" target="_blank" rel="noopener">Protocol ↗︎</a><a href="/observatory" data-nav>Observatory</a>${liveLabel()}</div></footer>`; }
function card(program) {
  const url = programUrl(program), kind = program.kind || 'program', heading = state.route === '/' ? 'h3' : 'h2';
  const status = programState(program), statusClass = ['published','built','failed','blocked','running','queued','addressable','complete'].includes(status) ? status : 'addressable';
  const address = new URL(url, location.origin).pathname;
  return `<article class="capsule ${identity(program)} state-${statusClass}" data-program-id="${escape(program.id)}"><button class="capsule-copy" data-copy="${escape(url)}" aria-label="Copy canonical URL for ${escape(program.title)}"></button><div class="capsule-top"><span>${escape(kind === 'program' ? program.language === 'purl' ? 'PURL PROGRAM' : program.language || 'PROGRAM' : kind.toUpperCase())}</span><span class="capsule-state">${escape(programState(program))}</span></div><div class="capsule-visual" aria-hidden="true"><div class="capsule-orb"></div><div class="capsule-ring"></div><div class="capsule-ring two"></div></div><div class="capsule-content"><${heading}>${escape(program.title)}</${heading}><p class="capsule-description">${escape(programDescription(program))}</p><div class="capsule-footer"><span class="capsule-address copy-default">${escape(address)}</span><span class="capsule-address copy-feedback">✓ Canonical URL copied</span></div></div><a class="capsule-open" href="${programRoute(program)}" data-nav aria-label="Open ${escape(program.title)}">Open <span aria-hidden="true">↗︎</span></a></article>`;
}
function cards(programs) {
  if (!state.loaded) return '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  if (!state.available) return `<div class="empty-state"><h3>A little out of reach.</h3><p>The program service is unavailable. ${escape(state.error)}</p><button class="button button-light" data-refresh>Try connecting again ↻</button></div>`;
  if (!programs.length) return '<div class="empty-state"><h3>A little space for something new.</h3><p>No programs match this view. Start with an idea and give it an address.</p><a href="/create" data-nav class="button button-light">Create a PURL ↗︎</a></div>';
  return programs.map(card).join('');
}
function copyHint() { return `<p class="copy-hint">${icon} Tap anywhere on a capsule to copy its URL. Open to look inside.</p>`; }
function landing() {
  const featured = [state.programs.find(program => program.kind === 'mission'), state.programs.find(program => /math|arithmetic/i.test(program.title)), state.programs.find(program => program.kind === 'game')].filter(Boolean);
  for (const program of state.programs) { if (featured.length >= 3) break; if (!featured.includes(program)) featured.push(program); }
  return `<main id="main"><section class="hero"><div class="hero-copy reveal"><div class="eyebrow eyebrow-line">A NEW KIND OF ADDRESS</div><h1>Ideas become<br><em>living</em> URLs.</h1><p class="hero-description">A program. A possibility. A place to pick up<br>where you left off. All in one beautiful link.</p><div class="hero-actions"><a class="button button-dark" href="/create" data-nav>Create a PURL <span aria-hidden="true">↗︎</span></a><a class="button-link" href="/explore" data-nav>Explore the possibilities <span aria-hidden="true">↗︎</span></a></div><div class="hero-caption"><span class="tiny-spark" aria-hidden="true">✧</span>Made for humans. Open to every kind of mind.</div></div><div class="pearl-stage reveal delay-one" role="img" aria-label="An iridescent pearl surrounded by fine orbital rings, a visual metaphor for an idea with its own address"><div class="pearl-aura"></div><div class="pearl-orbit"></div><div class="pearl-orbit two"></div><div class="pearl-main"></div><div class="pearl-shadow"></div><div class="floating-address"><span class="address-glow"></span><span>purl<span class="url-slash"> / </span>a-little-possibility</span><span aria-hidden="true">↗︎</span></div><div class="stage-coordinate" aria-hidden="true">ONE ADDRESS.<br>ENDLESS CONTINUATIONS.</div><span class="pearl-note" aria-hidden="true">THOUGHT → PROGRAM → POSSIBILITY</span><span class="hero-tick" aria-hidden="true"></span></div></section><div class="intro-strip reveal delay-two"><div class="intro-label">More than a link. <em>A living thing.</em></div><div class="intro-items"><div class="intro-item"><span class="intro-icon" aria-hidden="true">⌘</span> Create something real</div><div class="intro-item"><span class="intro-icon" aria-hidden="true">↗︎</span> Share the whole possibility</div><div class="intro-item"><span class="intro-icon" aria-hidden="true">∞</span> Continue from anywhere</div></div></div><section class="library-section"><div class="section-heading"><div><div class="eyebrow">SMALL PROGRAMS. OPEN POSSIBILITIES.</div><h2>A few things that live here.</h2></div><a class="text-link" href="/explore" data-nav>Explore all PURLs <span aria-hidden="true">↗︎</span></a></div><div class="capsule-grid">${cards(featured)}</div>${copyHint()}</section><section class="philosophy"><h2>The internet gave everything<br>an address. <em>Now, a little agency.</em></h2><p>PURLs hold more than information. They hold a program, its history, and the next possible step. Open one, see how it works, and make something of your own.<br><a class="text-link" href="/docs" data-nav>Meet the idea behind PURL <span aria-hidden="true">↗︎</span></a></p></section></main>`;
}
function filteredPrograms(owned = false) {
  return state.programs.filter(program => (!owned || ownerId(program) === principalId()) && (state.filter === 'all' || state.filter === 'mine' ? state.filter !== 'mine' || ownerId(program) === principalId() : program.kind === state.filter) && (!state.search || `${program.title} ${program.kind} ${program.language}`.toLowerCase().includes(state.search.toLowerCase())));
}
function filterbar() { return `<div class="filterbar"><div class="filter-chips" aria-label="Program filters">${[['all','All PURLs'],['program','Programs'],['mission','Missions'],['game','Games'],...(state.session ? [['mine','Yours']] : [])].map(([key,label]) => `<button class="chip ${state.filter === key ? 'active' : ''}" data-filter="${key}" aria-pressed="${state.filter === key}">${label}</button>`).join('')}</div><label class="search-wrap"><span aria-hidden="true">⌕</span><input class="search-input" id="library-search" type="search" placeholder="Find a little possibility…" value="${escape(state.search)}" aria-label="Search programs"></label></div>`; }
function templateCards() { return state.templates.length ? `<section class="template-section"><div class="section-heading"><div><span class="eyebrow">A PLACE TO BEGIN</span><h2>Borrow a spark.</h2></div><a class="text-link" href="/create" data-nav>Start from scratch ↗︎</a></div><div class="template-grid">${state.templates.slice(0,6).map((template,index) => `<button class="template-card" data-template="${escape(template.id)}"><span class="template-icon" aria-hidden="true">${['ƒ','◇','⌘','∞','✧','↗︎'][index % 6]}</span><h3>${escape(template.title)}</h3><p>${escape(template.description || `A ${template.language || 'PURL'} starting point. Open, make it yours, and run it.`)}</p><small>${escape(template.kind || template.language || 'PROGRAM')} <span aria-hidden="true">↗︎</span></small></button>`).join('')}</div></section>` : ''; }
function explore(workspace = false) {
  return `<main id="main" class="page"><div class="page-heading"><div><span class="eyebrow">${workspace ? 'YOUR IDEAS, IN GOOD COMPANY' : 'THE OPEN LIBRARY'}</span><h1>${workspace ? 'Room to make.' : 'Follow your curiosity.'}</h1><p>${workspace ? 'A home for your programs, experiments, and unfinished possibilities. Pick up a thread or start a new one.' : 'Little computations. Living missions. Shared worlds. Open a program, see its workings, and follow what comes next.'}</p></div><a class="button button-dark" href="/create" data-nav>Create a PURL <span aria-hidden="true">↗︎</span></a></div>${workspace && !state.session ? '<div class="workspace-welcome"><div><h2>Your work deserves an address.</h2><p>Connect a guest session to keep the things you create together. Your session belongs to this browser tab.</p></div><button class="button button-light" data-session>Make yourself at home ↗︎</button></div>' : ''}${filterbar()}<div class="capsule-grid" id="library-grid">${cards(filteredPrograms(workspace))}</div>${copyHint()}${workspace ? templateCards() : ''}</main>`;
}

const defaultEditor = () => ({title:'A little possibility',language:'purl',kind:'program',visibility:'public',source:'input number | math.add 2 | math.multiply 3',input:'4',tests:'[\n  { "input": 4, "expected": 18 }\n]',input_schema:'{"type":"number"}',output_schema:'{"type":"number"}'});
function resetEditor(program = null, template = null) {
  state.program = program; state.compile = null; state.execution = null; state.lastResult = null; state.panelData = null; state.editorManifest = null; state.editorTab = 'source'; state.dataTab = 'diagnostics';
  if (program) state.editor = {title:program.title,language:program.language || 'purl',kind:program.kind || 'program',visibility:program.visibility || 'public',source:sourceText(program.source),savedSource:sourceText(program.source),input:'4',tests:json(program.tests || []),input_schema:json(program.input_schema || {}),output_schema:json(program.output_schema || {})};
  else { state.editor = defaultEditor(); if (template) Object.assign(state.editor,{title:template.title,language:template.language || 'purl',kind:template.kind || 'program',source:sourceText(template.source),input:json(template.input ?? 4),tests:json(template.tests || []),input_schema:json(template.input_schema || {type:'number'}),output_schema:json(template.output_schema || {})}); }
}
function captureEditor() {
  if (!state.editor) return;
  for (const key of ['title','language','visibility','source','input','tests','input_schema','output_schema']) { const node = $(`[data-field="${key}"]`); if (node) state.editor[key] = node.value; }
}
function parseField(name, fallback) { const value = state.editor[name]; if (!value?.trim()) return fallback; try { return JSON.parse(value); } catch { throw new Error(`${name.replaceAll('_',' ')} must be valid JSON.`); } }
function graphView() {
  const plan = state.compile?.plan || state.lastResult?.plan || state.lastResult?.build?.plan || state.program?.compilation?.plan;
  let nodes;
  if (plan?.steps) nodes = [plan.input || 'input', ...plan.steps.map(step => step.op || step.operation || step.kind || 'step')];
  else { const source = sourceValue(state.editor.source); nodes = typeof source === 'object' ? [source.input || 'input', ...(source.steps || []).map(step => step.op || 'step')] : String(source).split('|').map(step => step.trim()).filter(Boolean); }
  return `<div class="graph-view">${nodes.slice(0,20).map((node,index) => `${index ? '<div class="graph-edge"></div>' : ''}<div class="graph-node"><small>${index ? `OPERATION ${String(index).padStart(2,'0')}` : 'INPUT'}</small>${escape(typeof node === 'object' ? json(node) : node)}</div>`).join('')}<p class="graph-note">${plan ? 'Compiled execution plan' : 'Source overview · compile to validate types and capabilities'}${nodes.length > 20 ? ' · showing first 20 nodes' : ''}</p></div>`;
}
function editorContent() {
  if (state.editorTab === 'graph') return graphView();
  if (state.editorTab === 'manifest') return `<pre class="detail-source">${escape(state.editorManifest?.operations ? json(state.editorManifest) : state.program ? 'Open the manifest tab to load this program’s live operations.' : 'Create the program to give it an address and discoverable operations.')}</pre>`;
  return `<div class="source-editor"><div class="line-numbers" aria-hidden="true">${state.editor.source.split('\n').map((_,i) => i+1).join('\n')}</div><textarea class="source-input" id="program-source" data-field="source" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Program source code">${escape(state.editor.source)}</textarea></div>`;
}
function runOutput() {
  const execution = state.execution;
  if (!execution) return '<div class="output-label"><span>OUTPUT</span><span>READY WHEN YOU ARE</span></div><p class="output-placeholder">A little input.<br>A new possibility.</p><span class="output-note">Run the program to see its result, captured environment, and execution trace.</span>';
  const status = execution.status || 'queued';
  let result;
  if (execution.result && Object.hasOwn(execution.result,'value')) result = execution.result.value;
  else if (['succeeded','completed','complete'].includes(status) && Object.hasOwn(execution,'value')) result = execution.value;
  else result = execution.output?.value ?? execution.output ?? execution.result;
  return `<div class="output-label"><span>OUTPUT</span><span>${escape(status.toUpperCase())}</span></div>${result !== undefined ? typeof result === 'number' || typeof result === 'boolean' || result === null ? `<div class="output-value">${escape(json(result))}</div>` : `<pre class="output-pre">${escape(typeof result === 'string' ? result : json(result))}</pre>` : `<p class="output-placeholder">${status === 'failed' || status === 'blocked' ? 'Something needs a closer look.' : 'An idea in motion…'}</p>`}${execution.error ? `<div class="diagnostic">${escape(typeof execution.error === 'object' ? execution.error.message || json(execution.error) : execution.error)}</div>` : ''}<span class="output-note">${escape(short(execution.id,36))}${execution.duration_ms != null ? ` · ${execution.duration_ms} ms` : ''}</span>`;
}
function dataContent() {
  if (state.dataTab === 'access') {
    if (!state.program) return '<p class="data-placeholder">Create the program to manage scoped access.</p>';
    const grants = state.program.grants || [];
    return `<p class="data-placeholder">Your current rights: ${escape((state.program.authority?.rights || []).join(', ') || 'read public information')}. Grants are checked by the service and can be revoked.</p><div class="access-form"><div class="field"><label for="grant-principal">Principal ID</label><input id="grant-principal" placeholder="principal_…"></div><div class="field"><label for="grant-rights">Rights · comma separated</label><input id="grant-rights" value="read,run" placeholder="read,run"></div><button class="button button-small mutation-button" data-grant>Grant access ↗︎</button></div>${grants.map(grant => `<div class="history-row"><span class="history-icon" aria-hidden="true">◇</span><div><strong>${escape(grant.principal_id)}</strong><small>${escape(grant.rights.join(' · '))} · ${grant.active ? 'active' : 'inactive'}</small></div>${grant.active ? `<button class="button-link mutation-button" data-revoke="${escape(grant.id)}">Revoke ↗︎</button>` : ''}</div>`).join('')}`;
  }
  if (state.dataTab === 'proposals') {
    if (!state.program) return '<p class="data-placeholder">Create the program to propose and review changes.</p>';
    const proposals = Array.isArray(state.program.proposals) ? state.program.proposals : Object.values(state.program.proposals || {});
    return `<p class="data-placeholder">Propose the source currently in the editor. The owner can review and commit a proposal against the live program version.</p><div class="access-form"><div class="field"><label for="proposal-summary">What does this change?</label><input id="proposal-summary" placeholder="Describe your proposed change…"></div><button class="button button-small mutation-button" data-propose>Submit proposal ↗︎</button></div>${proposals.length ? proposals.map(proposal => `<div class="history-row"><span class="history-icon" aria-hidden="true">↗︎</span><div><strong>${escape(proposal.summary || proposal.id)}</strong><small>${escape(proposal.status)} · ${escape(proposal.proposed_by)} · v${escape(proposal.proposed_at_version || proposal.base_version)}</small><details><summary class="button-link">Inspect proposed source</summary><pre class="output-pre">${escape(sourceText(proposal.source))}</pre></details></div>${proposal.status === 'pending' ? `<button class="button-link mutation-button" data-commit="${escape(proposal.id)}">Commit ↗︎</button>` : ''}</div>`).join('') : '<p class="data-placeholder" style="margin-top:18px">No proposals have been recorded.</p>'}`;
  }
  if (state.dataTab === 'diagnostics') {
    const result = state.compile || state.lastResult;
    const diagnostics = result?.diagnostics || result?.compile?.diagnostics || [];
    if (diagnostics.length) return diagnostics.map(item => `<div class="diagnostic ${item.severity === 'info' ? 'success' : ''}"><strong>${escape(item.code || item.severity || 'DIAGNOSTIC')}</strong>${escape(item.message || json(item))}${item.line ? ` · line ${escape(item.line)}` : ''}</div>`).join('');
    if (result) { const failed = result.ok === false || result.build?.status === 'failed' || result.build?.status === 'blocked'; return `<div class="diagnostic ${failed ? '' : 'success'}"><strong>${failed ? 'NEEDS ATTENTION' : result.build ? 'BUILD & TEST EVIDENCE' : 'OPERATION COMPLETE'}</strong>${failed ? 'This operation needs attention. Inspect its recorded diagnostics below.' : result.build ? `${result.build.tests?.filter(test => test.passed).length || 0} of ${result.build.tests?.length || 0} declared tests passed. Build status: ${escape(result.build.status)}.` : 'The service accepted this operation. Its live response is recorded below.'}</div>${result.release?.url ? `<a class="text-link" href="${escape(safeUrl(result.release.url))}" target="_blank" rel="noopener">Inspect immutable release ↗︎</a><button class="button-link" data-copy="${escape(safeUrl(result.release.url))}">Copy release URL ↗︎</button>` : ''}<pre class="output-pre">${escape(json(result))}</pre>`; }
    return '<p class="data-placeholder">Good ideas start somewhere. Compile your source to check its types, operators, and required capabilities.</p>';
  }
  if (state.dataTab === 'output') {
    if (!state.execution) return '<p class="data-placeholder">Execution logs, environment, and trace will appear here after a run.</p>';
    const ex = state.execution;
    return `<span class="subtle-label">CAPTURED EXECUTION · ${escape(ex.status)}</span><pre class="output-pre">${escape(json({id:ex.id,input:ex.input,seed:ex.seed,environment:ex.environment,logs:ex.logs || [],trace:ex.trace || ex.result?.trace || [],error:ex.error}))}</pre>`;
  }
  if (state.dataTab === 'history') {
    const events = state.panelData?.events;
    if (!events) return '<p class="data-placeholder">Loading the program’s recorded transitions…</p>';
    return events.length ? events.slice().reverse().map(event => `<div class="history-row"><span class="history-icon" aria-hidden="true">↗︎</span><div><strong>${escape(event.type || event.operation || event.kind || 'transition')}</strong><small>${escape(event.id || '')}${event.version ? ` · v${escape(event.version)}` : ''}</small>${event.summary ? escape(event.summary) : ''}</div><time>${escape(date(event.at || event.created_at || event.timestamp))}</time></div>`).join('') : '<p class="data-placeholder">No transitions have been recorded yet.</p>';
  }
  if (state.dataTab === 'artifacts') {
    const refs = state.execution?.artifacts || state.execution?.artifact_refs || [];
    return refs.length ? refs.map(artifact => { const id = typeof artifact === 'string' ? artifact : artifact.id || artifact.artifact_id; return `<button class="artifact-link button-link" data-artifact="${escape(id)}">${escape(artifact.name || id)} ↗︎</button>`; }).join('') : '<p class="data-placeholder">Immutable result artifacts will appear here when the worker completes a run.</p>';
  }
  if (state.dataTab === 'diff') return `<div class="history-diff-controls"><div class="field"><label for="diff-from">From version</label><input id="diff-from" type="number" min="1" value="${Math.max(1,(state.program?.version || 1)-1)}"></div><div class="field"><label for="diff-to">To version</label><input id="diff-to" type="number" min="1" value="${state.program?.version || 1}"></div><button class="button button-small" data-diff>Compare ↗︎</button></div>${state.panelData ? `<pre class="output-pre">${escape(json(state.panelData))}</pre>` : '<p class="data-placeholder">Inspect the actual state and source changes between recorded versions.</p>'}`;
  return state.panelData ? `<pre class="output-pre">${escape(json(state.panelData))}</pre>` : '<p class="data-placeholder">Loading live continuity information…</p>';
}
function editor() {
  const edit = state.editor || (resetEditor(), state.editor), program = state.program;
  return `<main id="main" class="page editor-page"><a href="/workspace" data-nav class="back-link">← Back to your workspace</a><div class="editor-top"><div class="editor-title"><span class="eyebrow">${program ? 'A LIVING PROGRAM' : 'A NEW POSSIBILITY'}</span><h1>${escape(program?.title || 'Give an idea an address.')}</h1><small>${program ? `${escape(programUrl(program))} · v${escape(program.version)}` : 'Create · compose · run · continue'}</small></div><div class="editor-top-actions">${program ? `<button class="button button-small mutation-button" data-action="fork">Fork ↗︎</button><button class="button button-small mutation-button" data-action="checkpoint">Checkpoint ◇</button>` : ''}<button class="button button-small mutation-button" data-action="save">${program ? 'Save source' : 'Create PURL'} <span aria-hidden="true">↗︎</span></button><button class="button button-small button-dark mutation-button" data-action="publish">Publish <span aria-hidden="true">↗︎</span></button></div></div><div class="editor-layout"><section class="editor-main" aria-label="Program editor"><div class="editor-settings"><div class="field"><label for="program-title">PROGRAM TITLE</label><input id="program-title" data-field="title" value="${escape(edit.title)}" maxlength="120" ${program ? 'readonly title="Fork this program to choose a new title"' : ''}></div><div class="field"><label for="program-language">LANGUAGE</label><select id="program-language" data-field="language" ${program ? 'disabled' : ''}>${['purl','javascript','typescript','python'].map(language => `<option value="${language}" ${language === edit.language ? 'selected' : ''}>${language === 'purl' ? 'PURL / 1' : language === 'javascript' ? 'JavaScript' : language === 'typescript' ? 'TypeScript' : 'Python'}</option>`).join('')}</select></div><div class="field"><label for="program-visibility">VISIBILITY</label><select id="program-visibility" data-field="visibility" ${program ? 'disabled' : ''}>${['public','private','unlisted'].map(value => `<option value="${value}" ${value === edit.visibility ? 'selected' : ''}>${value}</option>`).join('')}</select></div></div><details class="advanced-settings"><summary>Input / output schemas &amp; tests</summary><div class="advanced-grid"><div class="field"><label for="input-schema">INPUT SCHEMA · JSON</label><textarea id="input-schema" data-field="input_schema" spellcheck="false" ${program ? 'readonly' : ''}>${escape(edit.input_schema)}</textarea></div><div class="field"><label for="output-schema">OUTPUT SCHEMA · JSON</label><textarea id="output-schema" data-field="output_schema" spellcheck="false" ${program ? 'readonly' : ''}>${escape(edit.output_schema)}</textarea></div><div class="field"><label for="program-tests">TESTS · [{ input, expected }]</label><textarea id="program-tests" data-field="tests" spellcheck="false" ${program ? 'readonly' : ''}>${escape(edit.tests)}</textarea></div></div></details><div class="editor-toolbar"><div class="editor-dots" aria-hidden="true"><span></span><span></span><span></span></div><div class="editor-tabs" role="tablist" aria-label="Editor views">${['source','graph','manifest'].map(tab => `<button class="editor-tab ${state.editorTab === tab ? 'active' : ''}" data-editor-tab="${tab}" role="tab" aria-selected="${state.editorTab === tab}">${tab[0].toUpperCase()+tab.slice(1)}</button>`).join('')}</div><span class="language-badge">${escape(edit.language.toUpperCase())}</span></div><div id="editor-content">${editorContent()}</div><div class="editor-statusbar"><span id="editor-lines">${edit.source.split('\n').length} LINES · UTF-8</span><span>${program ? `VERSION ${program.version}` : 'UNSAVED IDEA'} · ${edit.language === 'purl' ? 'TYPED PIPELINE' : 'AUTHORED SOURCE'}</span></div></section><section class="run-panel" aria-label="Run program"><div class="panel-header"><span class="eyebrow">A LITTLE EXPERIMENT</span>${liveLabel()}</div><div class="panel-inner"><div class="field"><label for="program-input">INPUT · JSON</label><textarea id="program-input" data-field="input" spellcheck="false">${escape(edit.input)}</textarea></div><div class="run-controls"><button class="button mutation-button" data-action="compile">Compile <span aria-hidden="true">◇</span></button><button class="button mutation-button" data-action="build">Build &amp; test <span aria-hidden="true">⌘</span></button><button class="button button-dark mutation-button" data-action="run">Run <span aria-hidden="true">↗︎</span></button></div>${edit.language !== 'purl' ? '<p class="output-note">Authored code can be stored and inspected. Running requires a configured isolated worker; the service will report its actual capability.</p>' : ''}</div><div class="run-output" id="run-output" aria-live="polite">${runOutput()}</div></section></div><div class="editor-foot"><span>${program ? `${escape(program.visibility.toUpperCase())} · ${escape(program.kind.toUpperCase())} · EACH CHANGE HAS A HISTORY` : 'SMALL OPERATIONS. SOMETHING ENTIRELY YOURS.'}</span><div class="editor-foot-actions">${program ? `<button class="button-link" data-copy="${escape(programUrl(program))}">Copy canonical URL ↗︎</button><a class="button-link" href="${programRoute(program)}" data-nav>Open program ↗︎</a>` : '<a class="button-link" href="/docs#language" data-nav>Meet the PURL language ↗︎</a>'}<a class="button-link" href="/docs#operators" data-nav>Operator library ↗︎</a></div></div><section class="data-panel" aria-label="Program evidence"><div class="data-tabs" role="tablist" aria-label="Evidence views">${['diagnostics','output','history','artifacts','continuity','diff','access','proposals'].map(tab => `<button class="editor-tab ${state.dataTab === tab ? 'active' : ''}" role="tab" aria-selected="${state.dataTab === tab}" data-data-tab="${tab}">${tab[0].toUpperCase()+tab.slice(1)}</button>`).join('')}</div><div class="data-body" id="data-body">${dataContent()}</div></section>${!program ? templateCards() : ''}</main>`;
}

function gameBoard(program) {
  const game = program.state?.game || program.state || {};
  const board = game.board || game.cells || Array(9).fill(null);
  const cells = Array.isArray(board[0]) ? board.flat() : board;
  return `<section class="detail-panel" style="margin-top:20px"><div class="panel-header"><span class="eyebrow">A SHARED LITTLE WORLD</span><button class="button button-small mutation-button" data-action="join">Join game ↗︎</button></div><div class="game-board" aria-label="Tic-tac-toe board">${Array.from({length:9},(_,index) => `<button class="game-cell mutation-button" data-cell="${index}" aria-label="Row ${Math.floor(index/3)+1}, column ${index%3+1}: ${escape(cells[index] || 'empty')}">${escape(cells[index] || '')}</button>`).join('')}</div><div class="game-status">${game.winner ? `Winner: ${escape(game.winner)}` : game.draw ? 'A well-matched draw.' : `Next turn: ${escape(game.turn || game.next || 'X')}`} · Turns and player authority are checked by the service.</div></section>`;
}

function missionView(program) {
  const mission = program.state || {}, nodes = mission.graph?.nodes || [];
  return `<section class="data-panel mission-panel"><div class="panel-header"><span class="eyebrow">A MISSION THAT CARRIES ITS OWN MAP</span><span class="subtle-label">${nodes.length} NODES · ${escape(mission.evidence_class || 'LIVE')}</span></div><div class="data-body"><p class="data-placeholder">The directive, dependencies, evidence, and completion predicates travel with this program. Inspect a node to find its next possible operations.</p><details><summary class="button-link">Read the full founding directive ↗︎</summary><pre class="output-pre">${escape(mission.directive || '')}</pre></details>${mission.amendment ? `<details><summary class="button-link">Read the deployment amendment ↗︎</summary><pre class="output-pre">${escape(mission.amendment)}</pre></details>` : ''}<div class="mission-nodes">${nodes.map(node => `<details class="mission-node"><summary><span class="mission-node-id">${escape(node.id)}</span><span>${escape(node.title)}</span><span class="mission-node-status">${escape(node.status)}</span></summary><p>${escape(node.text)}</p><small>Requires: ${escape(node.dependencies?.join(', ') || 'no preceding nodes')}</small><pre class="output-pre">${escape(json({tests:node.tests,completion_predicate:node.completion_predicate,evidence:node.evidence}))}</pre><a class="text-link" href="/api/programs/${encodeURIComponent(program.id)}/mission/${encodeURIComponent(node.id)}" target="_blank" rel="noopener">Open addressable node ↗︎</a></details>`).join('')}</div></div></section>`;
}
function detail() {
  const program = state.program;
  if (!program) return `<main id="main" class="page"><div class="skeleton" style="height:310px"></div></main>`;
  const manifest = state.detailManifest;
  return `<main id="main" class="page"><a href="/explore" data-nav class="back-link">← Back to the open library</a><div class="detail-hero"><div><span class="eyebrow">${escape(program.kind || 'program')} · ${escape(program.language || 'purl')}</span><h1 class="detail-title">${escape(program.title)}</h1><p class="section-subtitle">${escape(programDescription(program))}</p><div class="detail-meta"><span>VERSION ${escape(program.version)}</span><span>${escape(program.visibility?.toUpperCase() || 'PUBLIC')}</span><span>${escape(programState(program).toUpperCase())}</span></div><div class="detail-actions"><a class="button button-dark" href="${programRoute(program,true)}" data-nav>Open in workspace ↗︎</a><button class="button mutation-button" data-action="fork">Make it yours ↗︎</button></div></div>${card(program)}</div><div class="detail-grid"><div><section class="detail-panel"><div class="panel-header"><span class="eyebrow">THE IDEA, IN CODE</span><span class="language-badge">${escape(program.language?.toUpperCase())}</span></div><pre class="detail-source">${escape(sourceText(program.source))}</pre></section>${program.kind === 'game' ? gameBoard(program) : program.kind === 'mission' ? missionView(program) : ''}<section class="data-panel"><div class="data-tabs"><button class="editor-tab active" data-detail-tab="manifest">Operations</button><button class="editor-tab" data-detail-tab="history">History</button><button class="editor-tab" data-detail-tab="continuity">Continuity</button><button class="editor-tab" data-detail-tab="replay">Replay</button></div><div id="detail-data">${manifest ? `<div class="operation-list">${(manifest.operations || []).map(op => `<span class="operation-pill ${op.available === false ? 'unavailable' : ''}" title="${escape(json({requires:op.requires,effects:op.effects}))}">${escape(op.name)} ${op.available === false ? '· unavailable' : '↗︎'}</span>`).join('')}</div>` : '<div class="data-body"><p class="data-placeholder">Reading this program’s live manifest…</p></div>'}</div></section></div><div><section class="detail-panel"><div class="panel-header"><span class="eyebrow">A PROGRAM WITH A PAST</span><span aria-hidden="true">✧</span></div><div class="property-list">${[['Address',program.id],['Owner',ownerId(program)],['Version',program.version],['Kind',program.kind],['Language',program.language],['Visibility',program.visibility],['Recorded builds',program.builds?.length || 0],['Created',date(program.created_at || program.created)]].map(([label,value]) => `<div class="property"><span>${label}</span><span>${escape(value ?? '—')}</span></div>`).join('')}</div></section><div style="padding:16px 0"><a href="/api/programs/${encodeURIComponent(program.id)}/manifest" class="text-link" target="_blank" rel="noopener">Read the machine-readable manifest ↗︎</a><button class="button-link mutation-button" data-action="checkpoint">Leave a continuation checkpoint ◇</button></div><div class="notice">One URL carries the program, its state, its history, and the operations your session is allowed to perform.</div></div></div></main>`;
}
function observatory() {
  const programs = state.programs;
  const builds = programs.reduce((count,program) => count + (program.builds?.length || 0),0);
  const languages = new Set(programs.map(program => program.language));
  const capabilities = state.metadata?.capabilities;
  return `<main id="main" class="page"><div class="page-heading"><div><span class="eyebrow">A WINDOW INTO THE WORK</span><h1>Every idea leaves a trace.</h1><p>Live programs, recorded builds, and the shape of the service. A quiet place to see what’s really happening.</p></div><button class="refresh-button" data-refresh>Refresh live evidence <span aria-hidden="true">↻</span></button></div><div class="stat-grid">${[['Visible programs',programs.length,'Public programs and those your session can read.'],['Recorded builds',builds,'Build records on the programs visible here.'],['Languages',languages.size,'Languages represented by visible programs.'],['Trusted operators',state.operators.length,'Operators reported by the live registry.']].map(([label,value,note]) => `<div class="stat-card"><span class="stat-label">${label}</span><div class="stat-value">${state.available ? value : '—'}</div><span class="stat-note">${note}</span></div>`).join('')}</div><div class="section-heading"><div><span class="eyebrow">LIVE, WITH CONTEXT</span><h2>Programs in view.</h2></div>${liveLabel()}</div><div class="observatory-table"><div class="table-heading"><span>Program / address</span><span>State</span><span>Version</span><span>Builds</span><span></span></div>${programs.length ? programs.map(program => `<a class="table-row" href="${programRoute(program)}" data-nav><span><strong>${escape(program.title)}</strong><small>${escape(short(program.id,28))}</small></span><span class="status-pill ${programState(program) === 'addressable' ? 'neutral' : ''}">${escape(programState(program))}</span><span>v${escape(program.version)}</span><span>${program.builds?.length || 0} recorded</span><span aria-hidden="true">↗︎</span></a>`).join('') : `<div class="data-body"><p class="data-placeholder">${state.loaded ? 'No live program evidence is available.' : 'Connecting to the service…'}</p></div>`}</div><div class="section-heading" style="margin-top:37px"><div><span class="eyebrow">THE SERVICE, IN ITS OWN WORDS</span><h2>Capabilities &amp; provenance.</h2></div><a class="text-link" href="/.well-known/purl" target="_blank" rel="noopener">Open discovery document ↗︎</a></div><div class="notice">This view reports the resources visible to your session. It is not a global traffic or uptime measurement. Authored-code execution is available only when the service reports an isolated runtime.</div><pre class="code-block">${escape(json(state.metadata ? {protocol:state.metadata.protocol,version:state.metadata.version,capabilities:capabilities,runtime:state.metadata.runtime,persistence:state.metadata.persistence,worker:state.metadata.worker,environment:state.metadata.environment} : {status:'UNAVAILABLE',message:state.error || 'Connecting to discovery endpoint'}))}</pre></main>`;
}
function docs() {
  const metadata = state.metadata;
  const sdkEndpoint = metadata?.endpoints?.sdk;
  const sdkUrl = safeUrl(typeof sdkEndpoint === 'string' ? sdkEndpoint : sdkEndpoint?.href || '/sdk/client.js');
  const example = `import { PurlClient } from '${new URL(sdkUrl).pathname}';\n\nconst client = new PurlClient({ baseUrl: location.origin });\nconst manifest = await fetch('/.well-known/purl').then(r => r.json());\n\n// Discover first. Use the manifest’s operations and authority.\nconsole.log(manifest);`;
  return `<main id="main" class="page"><div class="page-heading"><div><span class="eyebrow">A SMALL GUIDE TO LIVING LINKS</span><h1>Open by design.</h1><p>Everything you need to create a program, discover its possibilities, and carry the next step forward.</p></div><a class="button" href="/.well-known/purl" target="_blank" rel="noopener">Discover the protocol ↗︎</a></div><div class="docs-layout"><nav class="docs-nav" aria-label="Documentation sections"><a href="#idea">The idea</a><a href="#quickstart">Your first PURL</a><a href="#language">The language</a><a href="#operators">Operator library</a><a href="#continuity">Continuity &amp; authority</a><a href="#sdk">SDK &amp; discovery</a></nav><div class="docs-body"><section id="idea"><h2>A program with an address.</h2><p>A PURL is an addressable program with state, history, authority, and discoverable operations. It is pronounced <em>pearl</em>. Share its canonical URL to let another person or AI inspect the same resource and discover what they may do next.</p><p>Every capsule copies the canonical URL when you tap its surface. Use the separate <strong>Open</strong> control to inspect the program.</p></section><section id="quickstart"><h2>Start with a little possibility.</h2><p>Open the <a href="/create" data-nav>workspace</a>, give your program a title, and write a typed pipeline. A guest session is created when you first save or run. Compile checks the program; build executes its declared tests; run queues an execution; publish creates an immutable release after a passing build.</p><div class="code-block">input number | math.add 2 | math.multiply 3

Input: 4
Output: 18</div><p>All values in the input and test panels use JSON. Build and run responses come from the service, and execution results appear when a worker completes the job.</p></section><section id="language"><h2>Small operations, composed.</h2><p>PURL accepts a pipeline or a structured <code>purl/1</code> syntax tree. Types flow from input through each operation. The compiler checks operator signatures and explicit capabilities before producing a versioned execution plan.</p><div class="code-block">${escape(json({language:'purl/1',input:'number',steps:[{op:'math.add',args:{value:2}},{op:'math.multiply',args:{value:3}}]}))}</div><p>Pure operations need no external effects. Authored Python and JavaScript are stored as programs; execution is blocked unless a suitable isolated runtime is configured. The service’s error message and discovery document describe the actual available capabilities.</p></section><section id="operators"><h2>A library of little performers.</h2><p>The registry below is loaded from <a href="/api/operators" target="_blank" rel="noopener">the live operator endpoint</a>. Each operator’s typed contract and effects belong to its manifest.</p><div class="operator-grid">${state.operators.length ? state.operators.map(op => `<article class="operator-card"><strong>${escape(op.name || op.op || op.id)}</strong><p>${escape(op.description || `Effects: ${Array.isArray(op.effects) ? op.effects.join(', ') || 'pure' : op.effect || 'reported by manifest'}`)}</p><small>${escape(op.signature || `${typeof op.input === 'string' ? op.input : json(op.input || op.input_type || '')} → ${typeof op.output === 'string' ? op.output : json(op.output || op.output_type || '')}`)}</small></article>`).join('') : '<p>The operator registry is currently unavailable.</p>'}</div></section><section id="continuity"><h2>Carry the thread forward.</h2><p>Programs record versioned transitions. A checkpoint can describe what happened and what should come next. History, replay, and diffs expose evidence that another session can inspect from the program URL.</p><p>Your session label is self-declared. It does not verify a human or AI identity and does not confer authority. The backend checks ownership, scoped grants, current versions, and operation requirements. Public and unlisted visibility allow reading under the resource’s rules; editing, running, publishing, and granting remain separate rights.</p><p>Existing-program mutations include <code>expected_version</code>. A stale version is rejected. The workspace refreshes the live version after every mutation.</p></section><section id="sdk"><h2>One address is enough to begin.</h2><p>Start at <a href="/.well-known/purl" target="_blank" rel="noopener">/.well-known/purl</a> to discover the service, templates, program manifests, and SDK. A program manifest lists available operations with HTTP methods, input schemas, effects, and required authority.</p><div class="code-block">${escape(example)}</div><p><a href="${escape(sdkUrl)}" target="_blank" rel="noopener">Open the live JavaScript SDK ↗︎</a> · <a href="/docs/SDK.md" target="_blank" rel="noopener">Read the SDK reference ↗︎</a></p><p>Bearer tokens stay in this tab’s session storage and travel in an Authorization header. They never belong in shared program URLs.</p><details><summary class="button-link">Inspect live service discovery ↗︎</summary><pre class="code-block">${escape(json(metadata || {status:'UNAVAILABLE'}))}</pre></details></section></div></div></main>`;
}
function render() {
  const route = state.route.replace(/\/$/,'') || '/';
  let page;
  if (route === '/') page = landing();
  else if (route === '/explore') page = explore();
  else if (route === '/workspace') page = explore(true);
  else if (route === '/create' || /^\/ide(?:\/|$)/.test(route)) page = editor();
  else if (/^\/p\//.test(route)) page = detail();
  else if (route === '/observatory') page = observatory();
  else if (route === '/docs') page = docs();
  else page = '<main id="main" class="not-found"><span class="eyebrow">A PATH YET TO BE MADE</span><h1>A little lost?</h1><p>There isn’t a program at this address.</p><a class="button button-dark" href="/explore" data-nav>Find a possibility ↗︎</a></main>';
  $('#app').innerHTML = `<div class="shell">${header()}${page}${footer()}</div>`;
  document.title = `${state.program && /^\/(p|ide)\//.test(route) ? state.program.title : ({'/explore':'Explore','/workspace':'Workspace','/create':'Create a PURL','/observatory':'Observatory','/docs':'Docs'})[route] || 'Ideas become living URLs.'} — PURL`;
  if (state.busy) $$('.mutation-button').forEach(button => {button.disabled = true;});
  if (location.hash) setTimeout(() => { let hash = location.hash.slice(1); try { hash = decodeURIComponent(hash); } catch {} document.getElementById(hash)?.scrollIntoView(); },0);
}
async function navigate(path, {replace = false, template = null} = {}) {
  captureEditor(); clearTimeout(pollTimer);
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin) { location.assign(url.href); return; }
  const epoch = ++state.routeEpoch;
  if (replace) history.replaceState({},'',url.pathname+url.search+url.hash); else if (location.pathname+location.hash !== url.pathname+url.hash) history.pushState({},'',url.pathname+url.search+url.hash);
  state.route = url.pathname; state.filter = 'all'; state.search = ''; state.detailManifest = null;
  const match = /^\/(ide|p)\/([^/]+)$/.exec(url.pathname);
  if (match) {
    state.program = null; if (match[1] === 'ide') resetEditor();
    render(); window.scrollTo(0,0);
    try {
      const response = await api(`/api/programs/${encodeURIComponent(decodeURIComponent(match[2]))}`);
      if (epoch !== state.routeEpoch) return;
      const program = unwrapProgram(response); if (!program) throw new Error('This address did not return a program.');
      if (match[1] === 'ide') resetEditor(program); else state.program = program;
      render();
      if (match[1] === 'p') { try { state.detailManifest = await api(`/api/programs/${encodeURIComponent(program.id)}/manifest`); if (epoch === state.routeEpoch) render(); } catch (error) { toast(error.message); } }
    } catch (error) {
      if (epoch !== state.routeEpoch) return;
      $('#main').innerHTML = `<div class="empty-state"><h3>This possibility is out of reach.</h3><p>${escape(error.message)}</p><a class="button" href="/explore" data-nav>Back to the library ↗︎</a></div>`;
    }
    return;
  }
  state.program = null;
  if (url.pathname === '/create' || url.pathname === '/ide') resetEditor(null,template);
  render(); window.scrollTo(0,0);
}
async function copyUrl(value, source) {
  const isUrl = /^https?:\/\//.test(value);
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(value);
    toast(isUrl ? 'Canonical URL copied. Take the possibility with you.' : 'Principal ID copied.');
    const capsule = source?.closest('.capsule');
    if (capsule) { capsule.classList.add('is-copied'); setTimeout(() => capsule.classList.remove('is-copied'),2600); }
  } catch {
    const input = $('#manual-copy'); input.value = value;
    $('#copy-dialog h2').innerHTML = isUrl ? 'Your program,<br>one URL.' : 'Your session,<br>one identity.';
    $('#copy-dialog p').textContent = `Your browser couldn’t copy automatically. Select and copy this ${isUrl ? 'canonical URL' : 'principal ID'}.`;
    $('#copy-dialog label').textContent = isUrl ? 'Canonical URL' : 'Principal ID';
    $('#copy-dialog').showModal(); setTimeout(() => { input.focus(); input.select(); },50);
  }
}
async function refreshProgram() {
  if (!state.program) return;
  const response = await api(`/api/programs/${encodeURIComponent(state.program.id)}`);
  state.program = unwrapProgram(response);
  if (/^\/ide\//.test(state.route) && state.editor && state.editor.source === state.editor.savedSource) { state.editor.source = sourceText(state.program.source); state.editor.savedSource = state.editor.source; }
  const index = state.programs.findIndex(program => program.id === state.program.id);
  if (index >= 0) state.programs[index] = state.program; else state.programs.unshift(state.program);
  return state.program;
}
async function saveProgram() {
  captureEditor(); await ensureSession();
  if (!state.editor.title.trim()) throw new Error('Give your program a title first.');
  if (!state.program) {
    const response = await api('/api/programs', {method:'POST', body:{title:state.editor.title.trim(),kind:state.editor.kind,language:state.editor.language,source:sourceValue(state.editor.source),visibility:state.editor.visibility,input_schema:parseField('input_schema',{}),output_schema:parseField('output_schema',{}),tests:parseField('tests',[])}});
    state.program = unwrapProgram(response);
    if (!state.program) throw new Error('The service did not return the created program.');
    state.programs.unshift(state.program); state.route = programRoute(state.program,true); history.replaceState({},'',state.route);
    state.editor.savedSource = sourceText(state.program.source); state.editor.source = state.editor.savedSource;
  } else if (state.editor.source !== state.editor.savedSource) {
    if (state.editor.savedSource !== undefined && state.editor.savedSource !== sourceText(state.program.source)) throw new Error('This source changed in another session. Open the current program in a new tab to review it before saving your changes.');
    const response = await api(`/api/programs/${encodeURIComponent(state.program.id)}/source`,{method:'POST',body:{expected_version:state.program.version,source:sourceValue(state.editor.source)}});
    const program = unwrapProgram(response); if (program) state.program = program;
    await refreshProgram();
    state.editor.savedSource = sourceText(state.program.source); state.editor.source = state.editor.savedSource;
  }
  return state.program;
}
async function mutate(action, extra = {}) {
  const program = state.program;
  if (!program) throw new Error('Create a program first.');
  await ensureSession();
  const response = await api(`/api/programs/${encodeURIComponent(program.id)}/${action}`,{method:'POST',body:{expected_version:program.version,...extra}});
  const next = unwrapProgram(response);
  if (next && action !== 'fork') state.program = next;
  if (action !== 'fork') await refreshProgram();
  return response;
}
async function action(name) {
  if (state.busy) return;
  captureEditor(); busy(true);
  try {
    if (name === 'fork') {
      const result = await mutate('fork',{title:`${state.program.title} · a new thread`});
      const fork = unwrapProgram(result); if (!fork) throw new Error('The service did not return the fork.');
      await refreshLibrary(); await navigate(programRoute(fork,true)); toast('A new thread. This program is yours to continue.'); return;
    }
    if (name === 'checkpoint') {
      await showCheckpoint(); return;
    }
    if (name === 'join') { await mutate('join'); render(); toast('Your session joined the game.'); return; }
    await saveProgram();
    if (name === 'save') { render(); toast('A little possibility, saved at its own address.'); return; }
    if (name === 'run') {
      const result = await mutate('run',{input:parseField('input',null)});
      state.execution = result.execution || result; state.dataTab = 'output'; render();
      if (state.execution.id && !['completed','succeeded','failed','blocked','cancelled','denied','complete'].includes(state.execution.status)) pollExecution(state.execution.id,state.program.id);
      toast(`Execution ${state.execution.status || 'queued'}.`); return;
    }
    const result = await mutate(name);
    state.lastResult = result;
    state.compile = name === 'compile' ? result : null;
    state.dataTab = 'diagnostics';
    render();
    if (name === 'publish') { const release = result.release; toast(release ? 'Published. An immutable release, with a story to tell.' : 'The service completed the publish request.'); }
    else if (name === 'build') toast('Build finished. Inspect the test evidence below.');
    else toast(result.ok === false ? 'The compiler found something to revisit.' : 'Compiled. The next step is yours.');
  } catch (error) {
    state.lastResult = {ok:false,diagnostics:[{code:error.code || 'REQUEST_ERROR',message:error.message}]}; state.compile = null; state.dataTab = 'diagnostics';
    if (state.program) { try { await refreshProgram(); } catch {} }
    if (/^\/(create|ide)/.test(state.route)) render();
    toast(error.message);
  } finally { busy(false); }
}
async function pollExecution(id, programId) {
  try {
    const response = await api(`/api/executions/${encodeURIComponent(id)}`);
    if (state.program?.id !== programId) return;
    state.execution = response.execution || response;
    const node = $('#run-output'); if (node) node.innerHTML = runOutput();
    if (state.dataTab === 'output') { const body = $('#data-body'); if (body) body.innerHTML = dataContent(); }
    if (!['completed','succeeded','failed','blocked','cancelled','denied','complete'].includes(state.execution.status)) pollTimer = setTimeout(() => pollExecution(id,programId),1100);
    else { await refreshProgram(); toast(state.execution.status === 'completed' || state.execution.status === 'succeeded' || state.execution.status === 'complete' ? 'The result is here.' : `Execution ${state.execution.status}. Inspect the evidence.`); }
  } catch (error) { toast(`Execution updates paused: ${error.message}`); }
}
async function showCheckpoint() {
  let dialog = $('#checkpoint-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog'); dialog.id = 'checkpoint-dialog'; dialog.className = 'dialog';
    dialog.innerHTML = '<form id="checkpoint-form" class="dialog-content"><button type="button" class="icon-button dialog-close" data-close-dialog aria-label="Close">×</button><span class="eyebrow">CARRY THE THREAD FORWARD</span><h2>A note for<br>what comes next.</h2><p>Leave a recorded checkpoint that another session can discover from this program’s URL.</p><div class="field checkpoint-field"><label for="checkpoint-summary">What happened?</label><textarea id="checkpoint-summary" name="summary" placeholder="Describe what is true at this point…" required></textarea></div><div class="field checkpoint-field"><label for="checkpoint-next">What comes next? · optional</label><input id="checkpoint-next" name="next" placeholder="The next useful step"></div><p class="inline-error" id="checkpoint-error" role="alert"></p><button class="button button-dark" type="submit">Save checkpoint ◇</button></form>';
    document.body.append(dialog);
    $('#checkpoint-form').addEventListener('submit', async event => {
      event.preventDefault(); const button = $('button[type="submit"]',event.target); button.disabled = true;
      try { await mutate('checkpoint',{summary:$('#checkpoint-summary').value,next:$('#checkpoint-next').value || undefined}); dialog.close(); render(); toast('Checkpoint saved. The thread continues.'); }
      catch (error) { $('#checkpoint-error').textContent = error.message; }
      finally { button.disabled = false; }
    });
  }
  $('#checkpoint-summary').value = ''; $('#checkpoint-next').value = ''; $('#checkpoint-error').textContent = ''; dialog.showModal();
}
async function loadDataTab(tab) {
  captureEditor(); state.dataTab = tab; state.panelData = null;
  render();
  if (['diagnostics','output','artifacts','diff','access','proposals'].includes(tab)) return;
  if (!state.program) { $('#data-body').innerHTML = '<p class="data-placeholder">Create your program to begin its history.</p>'; return; }
  try { state.panelData = await api(`/api/programs/${encodeURIComponent(state.program.id)}/${tab}`); const node = $('#data-body'); if (node && state.dataTab === tab) node.innerHTML = dataContent(); }
  catch (error) { const node = $('#data-body'); if (node) node.innerHTML = `<div class="diagnostic">${escape(error.message)}</div>`; }
}

document.addEventListener('click', async event => {
  const target = event.target.closest('a,button'); if (!target) return;
  if (target.matches('[data-close-dialog]')) { target.closest('dialog').close(); return; }
  if (target.matches('[data-nav]')) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); event.stopPropagation(); await navigate(target.getAttribute('href')); return;
  }
  if (target.matches('[data-copy]')) { event.preventDefault(); await copyUrl(target.dataset.copy,target); return; }
  if (target.matches('[data-session]')) { openSessionDialog(); return; }
  if (target.matches('[data-disconnect]')) { state.session = null; sessionStorage.removeItem(storeKey); $('#session-dialog').close(); await refreshLibrary(); render(); toast('This tab’s session is disconnected.'); return; }
  if (target.matches('[data-account-start]')) {
    const email = $('#account-email');
    if (!email.value || !email.checkValidity()) { email.reportValidity(); return; }
    target.disabled = true;
    try { const nonce = crypto.randomUUID(); localStorage.setItem(authIntentKey,JSON.stringify({nonce,created_at:Date.now()})); const response = await api('/api/auth/start',{method:'POST',body:{email:email.value.trim(),state:nonce}}); $('#account-message').textContent = response.message || 'Check your email for a sign-in link. Return to this browser within ten minutes to continue.'; }
    catch (error) { $('#account-message').textContent = error.message; }
    finally { target.disabled = false; } return;
  }
  if (target.matches('.mobile-menu-toggle')) { const nav = $('#main-nav'); nav.classList.toggle('is-open'); target.setAttribute('aria-expanded',nav.classList.contains('is-open')); return; }
  if (target.matches('[data-filter]')) { state.filter = target.dataset.filter; $$('.chip').forEach(chip => { chip.classList.toggle('active',chip === target); chip.setAttribute('aria-pressed',chip === target); }); $('#library-grid').innerHTML = cards(filteredPrograms(state.route === '/workspace')); return; }
  if (target.matches('[data-template]')) { const template = state.templates.find(item => item.id === target.dataset.template); await navigate('/create',{template}); return; }
  if (target.matches('[data-action]')) { await action(target.dataset.action); return; }
  if (target.matches('[data-refresh]')) { busy(true); try { await loadInitial(); toast('Live evidence refreshed.'); } catch (error) { toast(error.message); } finally { busy(false); } return; }
  if (target.matches('[data-editor-tab]')) {
    captureEditor(); state.editorTab = target.dataset.editorTab;
    if (state.editorTab === 'manifest' && state.program) { try { state.editorManifest = await api(`/api/programs/${encodeURIComponent(state.program.id)}/manifest`); } catch (error) { toast(error.message); } }
    render(); return;
  }
  if (target.matches('[data-data-tab]')) { await loadDataTab(target.dataset.dataTab); return; }
  if (target.matches('[data-grant],[data-revoke],[data-propose],[data-commit]')) {
    if (state.busy) return; captureEditor(); busy(true);
    try {
      let operation, body;
      if (target.matches('[data-grant]')) { operation = 'grants'; body = {principal_id:$('#grant-principal').value.trim(),rights:$('#grant-rights').value.split(',').map(value => value.trim()).filter(Boolean)}; }
      else if (target.matches('[data-revoke]')) { operation = 'revoke'; body = {grant_id:target.dataset.revoke}; }
      else if (target.matches('[data-propose]')) { operation = 'propose'; body = {summary:$('#proposal-summary').value.trim(),source:sourceValue(state.editor.source)}; }
      else { operation = 'commit'; body = {proposal_id:target.dataset.commit}; }
      await mutate(operation,body); if (operation === 'commit') state.editor.source = sourceText(state.program.source);
      render(); toast(`${operation === 'grants' ? 'Access granted' : operation === 'revoke' ? 'Grant revoked' : operation === 'commit' ? 'Proposal committed' : 'Proposal recorded'}. The program’s history has been updated.`);
    } catch (error) { toast(error.message); } finally { busy(false); } return;
  }
  if (target.matches('[data-artifact]')) {
    try { const result = await api(`/api/artifacts/${encodeURIComponent(target.dataset.artifact)}`); $('#data-body').innerHTML = `<span class="subtle-label">IMMUTABLE ARTIFACT</span><pre class="output-pre">${escape(json(result.artifact || result))}</pre>`; } catch (error) { toast(error.message); } return;
  }
  if (target.matches('[data-diff]')) {
    if (!state.program) { toast('Create a program to compare recorded versions.'); return; }
    const from = Number($('#diff-from').value), to = Number($('#diff-to').value);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) { toast('Choose positive, whole version numbers.'); return; }
    try { state.panelData = await api(`/api/programs/${encodeURIComponent(state.program.id)}/diff?from=${from}&to=${to}`); $('#data-body').innerHTML = dataContent(); } catch (error) { toast(error.message); } return;
  }
  if (target.matches('[data-detail-tab]')) {
    const tab = target.dataset.detailTab;
    try { const response = await api(`/api/programs/${encodeURIComponent(state.program.id)}/${tab}`); $$('[data-detail-tab]').forEach(button => button.classList.toggle('active',button === target)); $('#detail-data').innerHTML = `<div class="data-body"><pre class="output-pre">${escape(json(response))}</pre></div>`; } catch (error) { toast(error.message); } return;
  }
  if (target.matches('[data-cell]')) {
    if (state.busy) return; busy(true);
    try { await mutate('move',{cell:Number(target.dataset.cell)}); render(); toast('Move recorded.'); } catch (error) { toast(error.message); } finally { busy(false); } return;
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'library-search') { state.search = event.target.value; $('#library-grid').innerHTML = cards(filteredPrograms(state.route === '/workspace')); }
  if (event.target.dataset.field) {
    state.editor[event.target.dataset.field] = event.target.value;
    if (event.target.dataset.field === 'source') { const lines = event.target.value.split('\n').length; const numbers = $('.line-numbers'); if (numbers) numbers.textContent = Array.from({length:lines},(_,i) => i+1).join('\n'); const label = $('#editor-lines'); if (label) label.textContent = `${lines} LINES · UNSAVED CHANGES`; }
  }
});
document.addEventListener('keydown', event => {
  if (event.target.matches('.source-input') && event.key === 'Tab') { event.preventDefault(); const input = event.target, start = input.selectionStart, end = input.selectionEnd; input.setRangeText('  ',start,end,'end'); input.dispatchEvent(new Event('input',{bubbles:true})); }
  if ((event.metaKey || event.ctrlKey) && event.key === 's' && /^\/(create|ide)/.test(state.route)) { event.preventDefault(); action('save'); }
});
$('#session-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('button[type="submit"]',event.target); button.disabled = true;
  try {
    const session = await api('/api/session',{method:'POST',body:{label:$('#session-label').value.trim() || 'Curious guest',kind:$('#session-kind').value}});
    state.session = session; sessionStorage.setItem(storeKey,JSON.stringify(session)); $('#session-dialog').close();
    await refreshLibrary(); render(); toast('Your session is connected. Make something of it.');
  } catch (error) { $('#session-error').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#manual-copy-select').addEventListener('click', () => { const input = $('#manual-copy'); input.focus(); input.select(); input.setSelectionRange(0,input.value.length); });
window.addEventListener('popstate', () => navigate(location.pathname+location.hash,{replace:true}));
render();
await consumeAuthCallback();
await loadInitial();
if (/^\/(p|ide)\//.test(location.pathname)) await navigate(location.pathname+location.hash,{replace:true});
else if (location.pathname === '/create' || location.pathname === '/ide') { if (!state.editor) resetEditor(); render(); }
