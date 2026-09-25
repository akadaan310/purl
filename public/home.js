// Landing page: register a principal and create a resource, using only the
// instance manifest embedded in the page.
(function () {
  const manifest = JSON.parse(document.getElementById('purl-document').textContent);
  const root = document.querySelector('#home-console .console-body');
  if (!root) return;
  const $ = (tag, props = {}, ...children) => {
    const e = Object.assign(document.createElement(tag), props);
    for (const c of children) e.append(c);
    return e;
  };
  const store = (t) => { try { sessionStorage.setItem('purl-token', t); } catch { /* ignore */ } };
  const load = () => { try { return sessionStorage.getItem('purl-token') || ''; } catch { return ''; } };

  const label = $('input', { className: 'grow', placeholder: 'your label (self-declared)', value: 'browser user' });
  const reg = $('button', { type: 'button', textContent: '1 · register principal' });
  const regOut = $('pre', { className: 'json', textContent: load() ? 'A token is stored in this tab.' : 'No token yet.' });
  const type = $('input', { value: 'research-session' });
  const vis = $('select', {}, $('option', { value: '', textContent: 'private' }), $('option', { value: 'observer', textContent: 'public: observer' }), $('option', { value: 'reader', textContent: 'public: reader' }));
  const state = $('textarea', { value: JSON.stringify({ title: 'My first PURL' }, null, 2) });
  const create = $('button', { type: 'button', textContent: '2 · create resource' });
  const createOut = $('pre', { className: 'json' });
  root.append($('div', { className: 'row' }, label, reg), regOut, $('div', { className: 'row' }, $('span', { textContent: 'type' }), type, vis, create), state, createOut);

  reg.addEventListener('click', async () => {
    const { method, href } = manifest.authentication.obtain;
    const res = await fetch(href, { method, headers: { 'Content-Type': 'application/json', Accept: 'application/purl+json' }, body: JSON.stringify({ kind: 'human', label: label.value }) });
    const json = await res.json();
    if (res.ok) store(json.token);
    regOut.textContent = res.ok ? `principal ${json.principal.id}\ntoken stored in this tab's sessionStorage (shown once, never put in URLs)` : JSON.stringify(json, null, 2);
  });
  create.addEventListener('click', async () => {
    let s;
    try { s = JSON.parse(state.value); } catch (e) { createOut.textContent = e.message; return; }
    const op = manifest.vocabulary.operations.find((o) => o.name === 'create');
    const res = await fetch(op.href, { method: op.method, headers: { 'Content-Type': 'application/json', Accept: 'application/purl+json', Authorization: `Bearer ${load()}` }, body: JSON.stringify({ type: type.value, state: s, ...(vis.value ? { public: vis.value } : {}) }) });
    const json = await res.json();
    createOut.textContent = `${res.status}\n${JSON.stringify(json, null, 2)}`;
    if (res.ok) createOut.append('\n', $('a', { href: json.resource.href, textContent: `open ${json.resource.href}` }));
  });
})();
