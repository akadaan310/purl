// Human interface. Every page is rendered from a machine document and embeds
// that document verbatim in <script type="application/purl+json">, so the page
// is a visualisation of the protocol and never a separate source of truth.
import { escapeHtml as h, embedJson } from './http.js';

function layout({ title, doc, alternate, describedby, body, scripts = [] }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="purl-protocol" content="PURL/0.1">
<title>${h(title)}</title>
<link rel="stylesheet" href="/static/purl.css">
${alternate ? `<link rel="alternate" type="application/purl+json" href="${h(alternate)}">` : ''}
${describedby ? `<link rel="describedby" type="application/purl+json" href="${h(describedby)}">` : ''}
<link rel="service-desc" type="application/purl+json" href="/.well-known/purl">
</head>
<body>
<header class="top">
  <a class="brand" href="/">PURL</a>
  <nav><a href="/r/purl-protocol">protocol</a><a href="/lab">lab</a><a href="/.well-known/purl">/.well-known/purl</a></nav>
</header>
<main>
${body}
</main>
${doc ? `<script type="application/purl+json" id="purl-document">${embedJson(doc)}</script>` : ''}
${scripts.map((s) => `<script src="${h(s)}" defer></script>`).join('\n')}
</body>
</html>`;
}

const pre = (v) => `<pre class="json">${h(JSON.stringify(v, null, 2))}</pre>`;
const pill = (text, cls = '') => `<span class="pill ${cls}">${h(text)}</span>`;
const pid = (id) => (id ? `<code>${h(id)}</code>` : '<span class="muted">none</span>');

export function resourcePage(doc, events) {
  const id = doc.resource.id;
  const ops = doc.operations
    .map((o) => `<tr class="${o.available ? 'ok' : 'no'}"><td><code>${h(o.name)}</code></td><td>${h(o.method)}</td><td><code>${h(o.href ?? '')}</code></td><td>${o.available ? '✓ allowed' : `✗ ${h(o.reason ?? '')}`}</td></tr>`)
    .join('');
  const collections = doc.collections
    ? Object.entries(doc.collections)
        .map(([name, entries]) => `<h3>${h(name)} <span class="muted">(${entries.length})</span></h3><ol class="entries">${entries
          .map((e) => `<li class="${e.current ? '' : 'superseded'}"><div class="meta"><code>${h(e.id)}</code> by ${pid(e.author)} · v${e.version}${e.supersedes ? ` · supersedes <code>${h(e.supersedes)}</code>` : ''}${e.superseded_by.length ? ` · ${pill('superseded by ' + e.superseded_by.join(', '), 'warn')}` : ''}${e.origin ? ` · origin <code>${h(e.origin.resource)}</code>` : ''}</div>${pre(e.body)}</li>`)
          .join('')}</ol>`)
        .join('') || '<p class="muted">No collections yet.</p>'
    : `<p class="muted">Redacted: you do not hold the <code>read</code> right. Counts: ${h(JSON.stringify(doc.counts))}</p>`;
  const grants = doc.grants
    ? `<table><tr><th>grant</th><th>grantee</th><th>rights</th><th>ops</th><th>chain parent</th><th>purpose</th><th>effective</th></tr>${doc.grants
        .map((g) => `<tr class="${g.effective ? 'ok' : 'no'}"><td><code>${h(g.id)}</code></td><td>${pid(g.grantee)}</td><td>${h(g.role)}: ${h(g.rights.join(', '))}</td><td>${h(g.operations?.join(', ') ?? 'any')}</td><td>${pid(g.parent)}</td><td>${h(g.purpose ?? '')}</td><td>${g.effective ? '✓' : `✗ ${h(g.ineffective_reason)}`}</td></tr>`)
        .join('')}</table>`
    : '<p class="muted">Redacted.</p>';
  const evs = events.events
    .slice(-60)
    .map((e) => `<li><span class="v">v${e.version}</span> ${pill(e.kind, 'k-' + e.kind)} <code>${h(e.op)}</code> by ${pid(e.actor)} via ${h(e.authority.via)}${e.authority.chain.length ? ` [${h(e.authority.chain.join(' → '))}]` : ''} <span class="muted">${h(e.at)} · ${h(e.hash.slice(0, 19))}…</span></li>`)
    .join('');
  const body = `
<section class="hero">
  <p class="eyebrow">PURL resource · ${h(doc.type)}</p>
  <h1><code>${h(id)}</code></h1>
  <p>This is not merely a page. It is an addressable, versioned resource. Machines: request this URL with <code>Accept: application/purl+json</code>, or read the <a href="/r/${h(id)}/manifest">manifest</a>.</p>
  <dl class="facts">
    <dt>version</dt><dd>${doc.version}</dd>
    <dt>lifecycle</dt><dd>${pill(doc.lifecycle.status, 'l-' + doc.lifecycle.status)}</dd>
    <dt>owner</dt><dd>${pid(doc.owner)}</dd>
    <dt>assignee</dt><dd>${pid(doc.assignee)}</dd>
    <dt>derived from</dt><dd>${doc.derived_from ? `<a href="/r/${h(doc.derived_from.resource)}"><code>${h(doc.derived_from.resource)}</code></a> @ v${doc.derived_from.version}` : '<span class="muted">—</span>'}</dd>
    <dt>head</dt><dd><code>${h(doc.resource.head.slice(0, 23))}…</code> <a href="/r/${h(id)}/verify">verify</a></dd>
    <dt>you</dt><dd>${pid(doc.you.principal)} · rights: ${h(doc.you.rights.join(', ') || 'none')}</dd>
  </dl>
  <p class="notice">${h(doc.notice)}</p>
</section>

<section><h2>Operations <span class="muted">— what you may do right now</span></h2>
<table class="ops"><tr><th>operation</th><th>method</th><th>href</th><th>for you</th></tr>${ops}</table></section>

<section id="console" class="console" data-resource="${h(id)}"><h2>Console <span class="muted">— built from the manifest at runtime</span></h2>
<p class="muted">Paste a bearer token (kept in this tab's sessionStorage only). Operation forms are generated from <code>/r/${h(id)}/manifest</code>; this page has no hand-written operation buttons.</p>
<div class="console-body"><noscript>Requires JavaScript; the same calls work with any HTTP client.</noscript></div></section>

<section><h2>State</h2>${doc.state ? pre(doc.state) : '<p class="muted">Redacted.</p>'}</section>
<section><h2>Collections</h2>${collections}</section>
<section><h2>Authority</h2>${grants}</section>
<section><h2>Lineage</h2><p><a href="/r/${h(id)}/lineage">lineage document</a> · <a href="/r/${h(id)}/continuity">continuity view</a> · <a href="/r/${h(id)}/events">events</a></p></section>
<section><h2>Event transitions <span class="muted">— Layer 2 projection of this resource's log</span></h2><div id="transitions" data-href="/r/${h(id)}/transitions"></div></section>
<section><h2>History <span class="muted">(${events.count} events${events.payloads.startsWith('redacted') ? ', payloads redacted' : ''})</span></h2><ol class="events">${evs}</ol></section>`;
  return layout({ title: `PURL ${id}`, doc, alternate: `/r/${id}?format=json`, describedby: `/r/${id}/manifest`, body, scripts: ['/static/graph.js', '/static/resource.js'] });
}

export function homePage(manifest, resources) {
  const list = resources.length
    ? `<ul>${resources.map((r) => `<li><a href="/r/${h(r.id)}"><code>${h(r.id)}</code></a> ${h(r.type)} · v${r.version} · ${pill(r.lifecycle.status, 'l-' + r.lifecycle.status)}</li>`).join('')}</ul>`
    : '<p class="muted">No public resources yet.</p>';
  const body = `
<section class="hero">
  <p class="eyebrow">PURL/0.1 reference implementation</p>
  <h1>Programmable URL Protocol</h1>
  <p>A PURL is a URL for a <em>stateful resource</em>: it exposes its current state, the operations it supports, the authority each requires, its full hash-chained history and its lineage — to people in a browser and to machines as JSON.</p>
</section>
<section><h2>For machines</h2>
<pre class="code">curl -H 'Accept: application/purl+json' ${h('<this-host>')}/.well-known/purl
curl -X POST -H 'Content-Type: application/json' -d '{"kind":"agent","label":"me"}' ${h('<this-host>')}/principals
curl -H 'Accept: application/purl+json' ${h('<this-host>')}/r/{id}/manifest</pre>
<p>The instance manifest lists ${manifest.vocabulary.operations.length} operations, ${Object.keys(manifest.vocabulary.primitives).length} primitives, ${Object.keys(manifest.vocabulary.rights).length} rights and ${manifest.vocabulary.invariants.length} invariants.</p></section>
<section><h2>Invariants</h2><ol>${manifest.vocabulary.invariants.map((i) => `<li>${h(i)}</li>`).join('')}</ol></section>
<section id="home-console" class="console"><h2>Try it</h2><div class="console-body"><noscript>Requires JavaScript.</noscript></div></section>
<section><h2>Public resources</h2>${list}</section>`;
  return layout({ title: 'PURL — Programmable URL Protocol', doc: manifest, alternate: '/.well-known/purl', describedby: '/.well-known/purl', body, scripts: ['/static/home.js'] });
}

export function labPage(index) {
  const body = `
<section class="hero"><p class="eyebrow">Layer 2 · research substrate</p><h1>Lab</h1>
<p>Experiment records, rendered with their epistemic categories kept apart: <span class="cat observation">observation</span> <span class="cat transformation">transformation</span> <span class="cat hypothesis">hypothesis</span> <span class="cat interpretation">interpretation</span> <span class="cat conclusion">conclusion</span>.</p>
<p>Records: ${index.map((e) => `<a href="/lab?exp=${h(e)}">${h(e)}</a> (<a href="/experiments/${h(e)}">json</a>)`).join(' · ') || '<span class="muted">none — run <code>npm run experiment</code></span>'}</p></section>
<div id="lab" data-experiments="${h(index.join(','))}"></div>`;
  return layout({ title: 'PURL Lab', doc: { protocol: 'PURL/0.1', kind: 'experiment-index', experiments: index.map((e) => ({ id: e, href: `/experiments/${e}` })) }, body, scripts: ['/static/graph.js', '/static/lab.js'] });
}

export function errorPage(problem) {
  return layout({ title: `${problem.status} ${problem.title}`, doc: problem, body: `<section class="hero"><p class="eyebrow">${problem.status}</p><h1>${h(problem.title)}</h1><p>${h(problem.detail)}</p><p><a href="/">home</a></p></section>` });
}
