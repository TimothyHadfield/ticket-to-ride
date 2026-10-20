// The board: our own SVG drawing of a map (cities, routes as rows of train cars, land shaped by the network).
// Board.create(el, map, {onRoute, onCity}) -> {render(opts), setMap(map), fit(), focus(ids)}
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const CAR_W = 9, GAP = 3, CITY_R = 11, LANE = 6.5;
  const COLOR = {
    pink: '#d77bd0', white: '#eef0f4', blue: '#4f8ff0', yellow: '#f2cf45', orange: '#f0913a',
    black: '#2b2f3a', red: '#e2504c', green: '#4fbf6a', gray: '#8d93a6', loco: '#b9a3ff',
  };
  const PLAYER = ['#e2504c', '#4f8ff0', '#f2cf45', '#4fbf6a', '#2b2f3a'];
  const PLAYER_NAME = ['Red', 'Blue', 'Yellow', 'Green', 'Black'];

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function geometry(map) {
    const city = Object.fromEntries(map.cities.map(c => [c.id, c]));
    return map.routes.map(r => {
      const A = city[r.a], B = city[r.b];
      const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      const nx = -uy, ny = ux, off = (r.lane || 0) * LANE;
      const sx = A.x + ux * CITY_R + nx * off, sy = A.y + uy * CITY_R + ny * off;
      const ex = B.x - ux * CITY_R + nx * off, ey = B.y - uy * CITY_R + ny * off;
      const avail = Math.hypot(ex - sx, ey - sy);
      const carL = Math.max(4, (avail - GAP * (r.len - 1)) / r.len);
      const cars = [];
      for (let i = 0; i < r.len; i++) {
        const t = (i * (carL + GAP) + carL / 2);
        cars.push({ x: sx + ux * t, y: sy + uy * t });
      }
      return { r, sx, sy, ex, ey, ang: Math.atan2(uy, ux) * 180 / Math.PI, carL, cars };
    });
  }

  // label spot: the side of the city with the widest gap between its routes
  function labelSpot(map, c) {
    const angs = [];
    const city = Object.fromEntries(map.cities.map(x => [x.id, x]));
    for (const r of map.routes) {
      if (r.a !== c.id && r.b !== c.id) continue;
      const o = city[r.a === c.id ? r.b : r.a];
      angs.push(Math.atan2(o.y - c.y, o.x - c.x));
    }
    const cands = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, -3 * Math.PI / 4];
    let best = cands[0], bestGap = -1;
    for (const a of cands) {
      let gap = Math.PI;
      for (const b of angs) { let d = Math.abs(a - b) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; gap = Math.min(gap, d); }
      // mild preference for above / right
      const pref = (a === -Math.PI / 2 ? 0.12 : 0) + (a === 0 ? 0.08 : 0);
      if (gap + pref > bestGap) { bestGap = gap + pref; best = a; }
    }
    const ca = Math.cos(best), sa = Math.sin(best);
    const anchor = ca > 0.3 ? 'start' : ca < -0.3 ? 'end' : 'middle';
    return { x: c.x + ca * 15, y: c.y + sa * 15 + (sa > 0.3 ? 11 : sa < -0.3 ? -1 : 5), anchor };
  }

  function create(wrap, map, handlers) {
    handlers = handlers || {};
    const svg = el('svg', { class: 'board', role: 'img' });
    wrap.appendChild(svg);
    let geo = [], routeEls = {}, cityEls = {}, vb = null, full = null;
    const gLand = el('g', {}, svg), gRoutes = el('g', {}, svg), gMarks = el('g', {}, svg), gCities = el('g', {}, svg);

    function build(m) {
      map = m;
      [gLand, gRoutes, gMarks, gCities].forEach(g => { while (g.firstChild) g.removeChild(g.firstChild); });
      svg.setAttribute('aria-label', map.name + ' map');
      geo = geometry(map); routeEls = {}; cityEls = {};
      const city = Object.fromEntries(map.cities.map(c => [c.id, c]));
      // land: thick rounded strokes along overland routes + discs at cities (ferries stay at sea)
      for (const layer of [{ w: 84, r: 46, fill: 'var(--land-edge)' }, { w: 74, r: 41, fill: 'var(--land)' }]) {
        const g = el('g', { fill: layer.fill, stroke: layer.fill }, gLand);
        for (const r of map.routes) {
          if (r.kind === 'ferry') continue;
          el('line', { x1: city[r.a].x, y1: city[r.a].y, x2: city[r.b].x, y2: city[r.b].y, 'stroke-width': layer.w, 'stroke-linecap': 'round' }, g);
        }
        for (const c of map.cities) el('circle', { cx: c.x, cy: c.y, r: layer.r, stroke: 'none' }, g);
      }
      for (const g of geo) {
        const r = g.r;
        const grp = el('g', { class: 'route', 'data-route': r.id }, gRoutes);
        g.carEls = g.cars.map((c, i) => {
          const cg = el('g', { transform: `translate(${c.x.toFixed(1)},${c.y.toFixed(1)}) rotate(${g.ang.toFixed(1)})` }, grp);
          const rect = el('rect', { class: 'car' + (r.kind === 'tunnel' ? ' tunnel' : ''), x: -g.carL / 2, y: -CAR_W / 2, width: g.carL, height: CAR_W, rx: 2, fill: COLOR[r.color] }, cg);
          if (r.locos && i < r.locos) el('path', { class: 'loco-mark', d: `M${-g.carL / 2 + 2} 0 h${g.carL - 4} M0 ${-CAR_W / 2 + 2} v${CAR_W - 4}` }, cg);
          return rect;
        });
        routeEls[r.id] = grp;
      }
      for (const c of map.cities) {
        const grp = el('g', { class: 'city', 'data-city': c.id }, gCities);
        el('circle', { class: 'ring', cx: c.x, cy: c.y, r: 10 }, grp);
        el('circle', { class: 'dot', cx: c.x, cy: c.y, r: 6.5 }, grp);
        const ls = labelSpot(map, c);
        const t = el('text', { x: ls.x.toFixed(1), y: ls.y.toFixed(1), 'text-anchor': ls.anchor }, grp);
        t.textContent = c.name;
        cityEls[c.id] = grp;
      }
      full = { x: -10, y: -10, w: map.size[0] + 20, h: map.size[1] + 20 };
      fit();
    }

    function setVB(v) { vb = v; svg.setAttribute('viewBox', `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`); }
    function fit() { setVB(Object.assign({}, full)); }

    // ------------------------------------------------------------ render state
    function render(o) {
      o = o || {};
      const owner = o.owner || {}, hl = o.highlight || new Set(), path = o.path || new Set(), blocked = o.blocked || new Set();
      for (const g of geo) {
        const id = g.r.id, e = routeEls[id];
        const own = owner[id];
        let cls = 'route';
        if (own != null) cls += ' claimed';
        if (hl.has(id)) cls += ' hl';
        if (path.has(id)) cls += ' path';
        if (blocked.has(id)) cls += ' blocked';
        if (o.sel === id) cls += ' sel';
        if (o.dimOthers && !path.has(id) && !hl.has(id) && own == null) cls += ' dim';
        e.setAttribute('class', cls);
        let fill = own != null ? PLAYER[own] : COLOR[g.r.color];
        if (o.heat && own == null) fill = heatColor(o.heat[id] || 0);
        g.carEls.forEach(c => c.setAttribute('fill', fill));
      }
      for (const id in cityEls) {
        let cls = 'city';
        if (o.selCities && o.selCities.includes(id)) cls += ' sel';
        if (o.endCities && o.endCities.includes(id)) cls += ' end';
        cityEls[id].setAttribute('class', cls);
      }
      while (gMarks.firstChild) gMarks.removeChild(gMarks.firstChild);
      if (o.stations) {
        const city = Object.fromEntries(map.cities.map(c => [c.id, c]));
        for (const [cid, seat] of Object.entries(o.stations)) {
          const c = city[cid];
          el('path', { class: 'station', d: `M${c.x - 9} ${c.y + 2} l9 -9 l9 9 v8 h-18 z`, fill: PLAYER[seat], transform: `translate(0,-14)` }, gMarks);
        }
      }
    }

    function heatColor(v) {
      // muted slate -> warm -> red
      const stops = [[58, 66, 88], [240, 179, 84], [240, 90, 76]];
      const t = Math.max(0, Math.min(1, v)) * 2, i = Math.min(1, Math.floor(t)), f = t - i;
      const a = stops[i], b = stops[i + 1];
      return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
    }

    // ------------------------------------------------------------ pan / zoom / tap
    const pts = new Map();
    let drag = null;
    function toSvg(cx, cy) {
      const r = svg.getBoundingClientRect();
      const s = Math.min(r.width / vb.w, r.height / vb.h);
      const ox = (r.width - vb.w * s) / 2, oy = (r.height - vb.h * s) / 2;
      return { x: vb.x + (cx - r.left - ox) / s, y: vb.y + (cy - r.top - oy) / s, s };
    }
    function zoomAt(cx, cy, k) {
      const p = toSvg(cx, cy);
      let w = vb.w / k, h = vb.h / k;
      const minW = full.w / 5;
      if (w < minW) { h *= minW / w; w = minW; }
      if (w > full.w) { h *= full.w / w; w = full.w; }
      const fx = (p.x - vb.x) / vb.w, fy = (p.y - vb.y) / vb.h;
      setVB(clamp({ x: p.x - fx * w, y: p.y - fy * h, w, h }));
    }
    function clamp(v) {
      v.x = Math.max(full.x - v.w * 0.25, Math.min(full.x + full.w - v.w * 0.75, v.x));
      v.y = Math.max(full.y - v.h * 0.25, Math.min(full.y + full.h - v.h * 0.75, v.y));
      if (v.w >= full.w) v.x = full.x + (full.w - v.w) / 2;
      return v;
    }
    svg.addEventListener('pointerdown', e => {
      svg.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, vb: Object.assign({}, vb), moved: false, t: Date.now() };
      else drag = Object.assign(drag || {}, { moved: true, pinch: dist(), vb: Object.assign({}, vb), mid: mid() });
    });
    svg.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!drag) return;
      if (pts.size >= 2 && drag.pinch) {
        const k = dist() / drag.pinch; const m = drag.mid;
        setVB(drag.vb); zoomAt(m.x, m.y, k);
        return;
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 7) return;
      drag.moved = true;
      if (drag.vb.w >= full.w - 1 && drag.vb.h >= full.h - 1) return; // nothing to pan when fully zoomed out
      const s = toSvg(0, 0).s;
      setVB(clamp({ x: drag.vb.x - dx / s, y: drag.vb.y - dy / s, w: drag.vb.w, h: drag.vb.h }));
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0) {
        if (drag && !drag.moved && e.type === 'pointerup') tap(e.clientX, e.clientY);
        drag = null;
      }
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
    function dist() { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1; }
    function mid() { const a = [...pts.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }

    function tap(cx, cy) {
      const p = toSvg(cx, cy);
      const tol = 16 / p.s; // ~16 screen px
      let bestCity = null, bc = Infinity;
      for (const c of map.cities) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bc) { bc = d; bestCity = c.id; } }
      if (handlers.onCity && bc < Math.max(tol, 13)) { handlers.onCity(bestCity); return; }
      let best = null, bd = Infinity;
      for (const g of geo) {
        const vx = g.ex - g.sx, vy = g.ey - g.sy, L2 = vx * vx + vy * vy;
        const t = Math.max(0, Math.min(1, ((p.x - g.sx) * vx + (p.y - g.sy) * vy) / L2));
        const d = Math.hypot(p.x - (g.sx + t * vx), p.y - (g.sy + t * vy));
        if (d < bd) { bd = d; best = g.r.id; }
      }
      if (handlers.onRoute && bd < Math.max(tol, 9)) handlers.onRoute(best);
      else if (handlers.onCity && bc < tol * 2.2) handlers.onCity(bestCity);
      else if (handlers.onEmpty) handlers.onEmpty();
    }

    // zoom buttons
    const z = document.createElement('div');
    z.className = 'zoom';
    z.innerHTML = '<button type="button" aria-label="Zoom in" data-z="in">+</button><button type="button" aria-label="Zoom out" data-z="out">−</button><button type="button" aria-label="Show whole map" data-z="fit">⤢</button>';
    z.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const r = svg.getBoundingClientRect();
      if (b.dataset.z === 'fit') fit(); else zoomAt(r.left + r.width / 2, r.top + r.height / 2, b.dataset.z === 'in' ? 1.5 : 1 / 1.5);
    });
    wrap.appendChild(z);

    build(map);
    return {
      render, fit, setMap(m) { if (m !== map) build(m); }, get map() { return map; },
      focus(cityIds) {
        if (!cityIds || !cityIds.length) return fit();
        const cs = map.cities.filter(c => cityIds.includes(c.id));
        const xs = cs.map(c => c.x), ys = cs.map(c => c.y);
        const pad = 80; let x = Math.min(...xs) - pad, y = Math.min(...ys) - pad, w = Math.max(...xs) - x + pad, h = Math.max(...ys) - y + pad;
        const minW = full.w / 3; if (w < minW) { x -= (minW - w) / 2; w = minW; }
        if (h < minW * full.h / full.w) { const nh = minW * full.h / full.w; y -= (nh - h) / 2; h = nh; }
        setVB(clamp({ x, y, w, h }));
      },
    };
  }

  root.Board = { create, COLOR, PLAYER, PLAYER_NAME };
})(window);
