// Resource page behaviour. The console is generated from the resource manifest
// at run time: this file contains no knowledge of any specific operation.
(function () {
  const doc = JSON.parse(document.getElementById('purl-document').textContent);
  const $ = (tag, props = {}, ...children) => {
    const e = Object.assign(document.createElement(tag), props);
    for (const c of children) e.append(c);
    return e;
  };
  const tokenKey = 'purl-token';
  const getToken = () => { try { return sessionStorage.getItem(tokenKey) || ''; } catch { return ''; } };
  const setToken = (t) => { try { sessionStorage.setItem(tokenKey, t); } catch { /* storage unavailable */ } };
  const headers = () => ({ Accept: 'application/purl+json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) });

  async function consoleUI() {
    const root = document.querySelector('#console .console-body');
    if (!root) return;
    root.replaceChildren();
    const token = $('input', { className: 'grow', type: 'password', placeholder: 'bearer token (optional for reads)', value: getToken(), autocomplete: 'off' });
    const who = $('span', { className: 'muted' });
    const apply = $('button', { textContent: 'use token', type: 'button' });
    root.append($('div', { className: 'row' }, token, apply, who));
    const select = $('select');
    const info = $('div', { className: 'muted' });
    const body = $('textarea', { spellcheck: false });
    const send = $('button', { textContent: 'invoke', type: 'button' });
    const out = $('pre', { className: 'json' });
    root.append($('div', { className: 'row' }, select, send), info, body, out);

    let manifest;
    async function load() {
      const res = await fetch(doc.links.manifest, { headers: headers() });
      manifest = await res.json();
      if (!res.ok) { out.textContent = JSON.stringify(manifest, null, 2); return; }
      who.textContent = manifest.requester.principal ? `as ${manifest.requester.principal} · rights: ${manifest.requester.rights.join(', ') || 'none'}` : 'anonymous';
      select.replaceChildren(...manifest.operations.filter((o) => !o.safe).map((o) => $('option', { value: o.name, textContent: `${o.available ? '✓' : '✗'} ${o.name} (${o.classification})` })));
      show();
    }
    function show() {
      const op = manifest.operations.find((o) => o.name === select.value);
      if (!op) return;
      info.textContent = `${op.description} Requires: ${op.requires.rights.join(', ') || '—'}${op.requires.owner_only ? ' (owner only)' : ''}. Effects: ${op.effects.join(', ') || '—'}. ${op.available ? `Available via ${op.via}.` : `Unavailable: ${op.reason}.`}`;
      const example = op.example ?? { expected_version: manifest.resource.version, input: {} };
      body.value = JSON.stringify({ ...example, expected_version: manifest.resource.version }, null, 2);
    }
    select.addEventListener('change', show);
    apply.addEventListener('click', () => { setToken(token.value.trim()); load(); });
    send.addEventListener('click', async () => {
      const op = manifest.operations.find((o) => o.name === select.value);
      let payload;
      try { payload = JSON.parse(body.value); } catch (e) { out.textContent = `invalid JSON: ${e.message}`; return; }
      const res = await fetch(op.href, { method: op.method, headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      out.textContent = `${res.status}\n${JSON.stringify(json, null, 2)}`;
      if (res.ok) {
        const link = $('a', { href: json.resource?.href ?? location.pathname, textContent: 'reload to see the new version' });
        out.append('\n', link);
        load();
      }
    });
    load();
  }

  async function transitions() {
    const box = document.getElementById('transitions');
    if (!box || !window.PurlGraph) return;
    const res = await fetch(box.dataset.href, { headers: headers() });
    if (!res.ok) return;
    const t = await res.json();
    window.PurlGraph.render(box, t.graph);
    box.append($('p', { className: 'muted', textContent: `Projection "${t.projection.name}": ${t.projection.definition}. ${t.caution}` }));
  }

  consoleUI();
  transitions();
})();
