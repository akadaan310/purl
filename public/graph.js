// Render a PURL transition graph ({nodes, edges}) as SVG. Nodes on a circle,
// edge width ∝ count, label = empirical transition probability. No data is
// ever inserted as HTML.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs = {}, text) => {
    const e = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  function render(container, graph, { size = 360, maxNodes = 32 } = {}) {
    container.replaceChildren();
    const nodes = graph.nodes.slice(0, maxNodes);
    const ids = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    const svg = el('svg', { class: 'graph', viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': `transition graph with ${nodes.length} states and ${edges.length} edges` });
    const defs = el('defs');
    const marker = el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '9', markerHeight: '9', markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' });
    marker.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrowhead' }));
    defs.appendChild(marker);
    svg.appendChild(defs);
    const c = size / 2, R = size / 2 - 72, r = Math.max(12, Math.min(22, 120 / Math.max(1, nodes.length)));
    const pos = new Map(nodes.map((n, i) => {
      const a = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      return [n.id, nodes.length === 1 ? [c, c] : [c + R * Math.cos(a), c + R * Math.sin(a)]];
    }));
    const maxCount = Math.max(1, ...edges.map((e) => e.count));
    for (const e of edges) {
      const [x1, y1] = pos.get(e.from), [x2, y2] = pos.get(e.to);
      const w = 0.8 + 5 * (e.count / maxCount);
      let path, lx, ly;
      if (e.from === e.to) {
        const dx = x1 - c, dy = y1 - c, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        const cx = x1 + ux * (r + 14), cy = y1 + uy * (r + 14);
        path = `M ${x1 + ux * r - uy * 6} ${y1 + uy * r + ux * 6} C ${cx - uy * 16} ${cy + ux * 16}, ${cx + uy * 16} ${cy - ux * 16}, ${x1 + ux * r + uy * 6} ${y1 + uy * r - ux * 6}`;
        lx = cx + ux * 14; ly = cy + uy * 14 + 3;
      } else {
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
        const sx = x1 + ux * r, sy = y1 + uy * r, ex = x2 - ux * (r + 2), ey = y2 - uy * (r + 2);
        const mx = (sx + ex) / 2 - uy * 18, my = (sy + ey) / 2 + ux * 18;
        path = `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`;
        lx = mx; ly = my;
      }
      const p = el('path', { d: path, class: 'edge', 'stroke-width': w.toFixed(2), 'marker-end': 'url(#arrow)' });
      p.appendChild(el('title', {}, `${e.from} → ${e.to}: ${e.count} (p = ${e.p.toFixed(3)})`));
      svg.appendChild(p);
      svg.appendChild(el('text', { x: lx, y: ly, class: 'elabel', 'text-anchor': 'middle' }, e.p.toFixed(2)));
    }
    for (const n of nodes) {
      const [x, y] = pos.get(n.id);
      const g = el('g');
      g.appendChild(el('circle', { cx: x, cy: y, r, class: 'node' }));
      g.appendChild(el('text', { x, y: y + 4, 'text-anchor': 'middle' }, n.id.length > 8 ? n.id.slice(0, 7) + '…' : n.id));
      g.appendChild(el('title', {}, `${n.id}: seen ${n.count}×, out-degree ${n.out_degree}, in-degree ${n.in_degree}`));
      svg.appendChild(g);
    }
    container.appendChild(svg);
    if (graph.nodes.length > maxNodes) container.appendChild(Object.assign(document.createElement('p'), { className: 'muted', textContent: `showing ${maxNodes} of ${graph.nodes.length} states` }));
  }
  function line(container, series, { width = 320, height = 120, yMax = null, label = '' } = {}) {
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label });
    const pad = 24, xs = series.map((p) => p[0]), ys = series.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = yMax ?? Math.max(...ys, 1e-9);
    const X = (v) => pad + ((v - x0) / (x1 - x0 || 1)) * (width - 2 * pad), Y = (v) => height - pad - (v / y1) * (height - 2 * pad);
    svg.appendChild(el('line', { x1: pad, y1: height - pad, x2: width - pad, y2: height - pad, class: 'axis' }));
    svg.appendChild(el('line', { x1: pad, y1: pad, x2: pad, y2: height - pad, class: 'axis' }));
    svg.appendChild(el('polyline', { points: series.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ') }));
    for (const [x, y, tag] of series) {
      svg.appendChild(el('circle', { cx: X(x), cy: Y(y), r: 3, fill: tag === 'unreliable' ? 'none' : 'currentColor', stroke: 'currentColor' }));
      svg.appendChild(el('text', { x: X(x), y: height - 8, 'text-anchor': 'middle' }, String(x)));
    }
    svg.appendChild(el('text', { x: 2, y: Y(y1) + 4 }, y1.toFixed(2)));
    svg.appendChild(el('text', { x: 2, y: height - pad }, '0'));
    container.appendChild(svg);
  }
  window.PurlGraph = { render, line };
})();
