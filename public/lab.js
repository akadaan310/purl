// Lab: render an experiment record with its epistemic categories kept apart.
(function () {
  const root = document.getElementById('lab');
  if (!root) return;
  const ids = root.dataset.experiments ? root.dataset.experiments.split(',') : [];
  const want = new URLSearchParams(location.search).get('exp') || ids[0];
  if (!want) return;
  const $ = (tag, props = {}, ...children) => {
    const e = Object.assign(document.createElement(tag), props);
    for (const c of children) e.append(c);
    return e;
  };
  const cat = (c) => $('span', { className: `cat ${c}`, textContent: c });
  const f = (v, d = 3) => (v === null || v === undefined ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(d)) : String(v));
  const table = (head, rows) => $('div', { className: 'table-wrap' }, $('table', {}, $('tr', {}, ...head.map((h) => $('th', { textContent: h }))), ...rows.map((r) => $('tr', {}, ...r.map((c) => $('td', {}, c instanceof Node ? c : document.createTextNode(f(c))))))));

  fetch(`/experiments/${encodeURIComponent(want)}`).then((r) => r.json()).then((rec) => {
    const out = rec.transformations.outputs;
    root.append(
      $('section', {}, $('h2', { textContent: `${rec.experiment_id} — ${rec.title}` }), $('p', { textContent: rec.question }),
        $('p', { className: 'muted', textContent: `run ${rec.run.timestamp} · purl ${rec.version.purl} · commit ${rec.version.git_commit ?? 'n/a'} · node ${rec.environment.node} · output hash ${rec.output_hash.slice(0, 23)}…` })),
      $('section', {}, $('h2', {}, cat('hypothesis'), ' Pre-registered hypotheses'),
        table(['id', 'status', 'statement'], rec.hypotheses.map((h) => [h.id, $('span', { className: `status-${h.status}`, textContent: h.status.replace('_', ' ') }), h.statement]))),
      $('section', {}, $('h2', {}, cat('interpretation'), ' ', cat('conclusion')),
        $('p', { className: 'muted', textContent: `${rec.interpretation.note} ${rec.conclusions.note}` })),
      $('section', {}, $('h2', { textContent: 'Uncertainty' }), $('ul', {}, ...rec.uncertainty.notes.map((n) => $('li', { textContent: n })))),
    );
    for (const [name, a] of Object.entries(out.datasets)) {
      const obs = rec.observations.datasets[name];
      const card = $('div', { className: 'card' });
      card.append($('h3', { textContent: name }), $('p', { className: 'muted', textContent: `${rec.configuration.datasets[name].role} · n = ${obs.n} · alphabet ${obs.alphabet.length} · units ${obs.units}` }));
      const strip = $('div', { className: 'strip', title: 'first 64 symbols (observation)' });
      for (const ch of obs.preview) strip.append($('span', { className: ch === '0' ? '' : 's1', title: ch }));
      card.append($('div', {}, cat('observation'), ` raw ${obs.raw_sha256.slice(0, 19)}… (${obs.raw_file})`), strip);
      const s = a.symbolic, t = a.tests;
      const grid = $('div', { className: 'grid2' });
      const measures = $('div', {}, cat('transformation'), table(['measure', 'value'], [
        ['H1 (bits)', s.entropy_H1], ['LZ76 normalised', s.lz76.normalized], ['changes per step', s.changes.per_step], ['candidate period', s.period.period],
        [`h_${t.cond_entropy_L} vs shuffle: p`, t.cond_entropy_vs_shuffle.p], [`h_${t.cond_entropy_L} vs Markov-1: p`, t.cond_entropy_vs_markov1.p], ['grammar ratio', a.grammar.compression_ratio], ['grammar vs shuffle: p', t.grammar_ratio_vs_shuffle.p],
        ...(a.temporal ? [['burstiness B', a.temporal.burstiness], ['B vs Poisson: p', t.burstiness_vs_poisson.p], ['memory M', a.temporal.memory_coefficient], ['Fano (changes)', a.temporal.changes.fano_factor]] : []),
      ]));
      const profile = $('div', {}, $('p', { className: 'muted', textContent: 'conditional entropy h_L (bits/symbol); hollow = unreliable estimate' }));
      window.PurlGraph.line(profile, s.entropy_profile.map((e) => [e.L, e.h, e.reliable ? 'ok' : 'unreliable']), { yMax: Math.max(1, ...s.entropy_profile.map((e) => e.h)), label: 'entropy profile' });
      grid.append(measures, profile);
      const g1 = $('div', {}, $('p', { className: 'muted', textContent: 'order-1 transition graph' }));
      window.PurlGraph.render(g1, a.graph.order1);
      grid.append(g1);
      if (a.graph.order2) {
        const g2 = $('div', {}, $('p', { className: 'muted', textContent: 'order-2 transition graph (states = pairs)' }));
        window.PurlGraph.render(g2, a.graph.order2);
        grid.append(g2);
      }
      card.append(grid);
      card.append($('h3', { textContent: 'Grammar (compressed representation — not meaning)' }), table(['rule', 'expansion', 'uses'], a.grammar.rules.slice(0, 6).map((r) => [r.symbol, r.expansion.length > 60 ? r.expansion.slice(0, 60) + '…' : r.expansion, r.uses])));
      if (a.invariance) {
        card.append($('h3', { textContent: 'Invariance under relabelling (0↔1)' }), table(['measure', 'original', 'relabelled', 'invariant'], Object.entries(a.invariance.relabel.measures).map(([k, v]) => [k, v.original, v.relabelled, v.invariant ? 'yes' : 'NO'])));
      }
      if (a.perturbation) {
        card.append($('h3', { textContent: 'Persistence under flips' }), table(['eps', 'mean h', 'period agreement', 'grammar ratio'], a.perturbation.levels.map((l) => [l.eps, l.cond_entropy_mean, l.period_agreement, l.grammar_ratio_mean])));
      }
      if (a.bridge) card.append($('h3', { textContent: 'Bridge: grammar segmentation vs invocation boundaries' }), $('pre', { className: 'json', textContent: JSON.stringify(a.bridge.grammar_segmentation, null, 2) }));
      root.append(card);
    }
    const c = out.cross.convergence;
    root.append($('section', {}, $('h2', {}, cat('transformation'), ' Convergence across independent datasets'), $('p', { className: 'muted', textContent: c.signature }),
      table(['group', 'mean Jaccard'], [...Object.entries(c.within_generator_mean), ['cross-generator', c.cross_generator_mean]])));
  });
})();
