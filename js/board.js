// The board: our own SVG drawing of a map (cities, routes as rows of train cars, land shaped by the network).
// Board.create(el, map, {onRoute, onCity}) -> {render(opts), setMap(map), fit(), focus(ids)}
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const CAR_W = 9, GAP = 3, CITY_R = 11, LANE = 7.5;
  // city names: 15 map units on a big screen, growing up to LABEL_MAX so they stay ~LABEL_PX on screen when the map is small
  const LABEL_MIN = 15, LABEL_MAX = 21, LABEL_PX = 8.5;
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
  // ...and away from labels already placed and from other cities (so close cities don't print over each other).
  function labelSpot(map, c, placed) {
    const angs = [];
    const city = Object.fromEntries(map.cities.map(x => [x.id, x]));
    for (const r of map.routes) {
      if (r.a !== c.id && r.b !== c.id) continue;
      const o = city[r.a === c.id ? r.b : r.a];
      angs.push(Math.atan2(o.y - c.y, o.x - c.x));
    }
    // boxes are sized for the biggest label font (LABEL_MAX), so labels never collide when they grow on a phone
    const W = c.name.length * 0.56 * LABEL_MAX, H = LABEL_MAX;
    const spot = a => {
      const ca = Math.cos(a), sa = Math.sin(a);
      const anchor = ca > 0.3 ? 'start' : ca < -0.3 ? 'end' : 'middle';
      // the baseline hangs below / sits above / centres on the city, so it stays put whatever the font size
      const base = sa > 0.3 ? 'hanging' : sa < -0.3 ? 'alphabetic' : 'central';
      const x = c.x + ca * 14, y = c.y + sa * 13;
      const x0 = anchor === 'start' ? x : anchor === 'end' ? x - W : x - W / 2;
      const y0 = base === 'hanging' ? y : base === 'alphabetic' ? y - H : y - H / 2;
      return { x, y, anchor, base, box: [x0, y0, x0 + W, y0 + H] };
    };
    const overlap = (p, q) => Math.max(0, Math.min(p[2], q[2]) - Math.max(p[0], q[0])) * Math.max(0, Math.min(p[3], q[3]) - Math.max(p[1], q[1]));
    const cands = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, -3 * Math.PI / 4];
    let best = null, bestScore = -Infinity;
    for (const a of cands) {
      let gap = Math.PI;
      for (const b of angs) { let d = Math.abs(a - b) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; gap = Math.min(gap, d); }
      const s = spot(a);
      let hit = 0;
      for (const p of placed) hit += overlap(s.box, p);
      for (const o of map.cities) if (o !== c) hit += overlap(s.box, [o.x - 9, o.y - 9, o.x + 9, o.y + 9]);
      // mild preference for above / right
      const score = gap + (a === -Math.PI / 2 ? 0.12 : 0) + (a === 0 ? 0.08 : 0) - hit / 40;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    placed.push(best.box);
    return best;
  }

  function create(wrap, map, handlers) {
    handlers = handlers || {};
    const svg = el('svg', { class: 'board', role: 'img' });
    wrap.appendChild(svg);
    let geo = [], routeEls = {}, cityEls = {}, vb = null, full = null, labelBox = null;
    const gLand = el('g', {}, svg), gRoutes = el('g', {}, svg), gMarks = el('g', {}, svg), gCities = el('g', {}, svg);

    function build(m) {
      map = m;
      [gLand, gRoutes, gMarks, gCities].forEach(g => { while (g.firstChild) g.removeChild(g.firstChild); });
      svg.setAttribute('aria-label', map.name + ' map');
      geo = geometry(map); routeEls = {}; cityEls = {};
      const city = Object.fromEntries(map.cities.map(c => [c.id, c]));
      // land: thick rounded strokes along overland routes + discs at cities (ferries stay at sea),
      // with the small gaps between routes filled in (smoothLand); the plain strokes are the fallback
      if (!smoothLand(map, city)) for (const layer of [{ w: 84, r: 46, fill: 'var(--land-edge)' }, { w: 74, r: 41, fill: 'var(--land)' }]) {
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
          const rect = el('rect', { class: 'car' + (r.kind === 'tunnel' ? ' tunnel' : '') + (r.color === 'black' ? ' blk' : ''), x: -g.carL / 2, y: -CAR_W / 2, width: g.carL, height: CAR_W, rx: 2, fill: COLOR[r.color] }, cg);
          if (r.locos && i < r.locos) el('path', { class: 'loco-mark', d: `M${-g.carL / 2 + 2} 0 h${g.carL - 4} M0 ${-CAR_W / 2 + 2} v${CAR_W - 4}` }, cg);
          // a claimed space shows a little train piece: windows + wheels (hidden until claimed)
          el('path', { class: 'train-mark', d: `M${-g.carL / 2 + 3} -1.6 h${g.carL - 6} v2.6 h${-(g.carL - 6)} z` }, cg);
          return rect;
        });
        routeEls[r.id] = grp;
      }
      const placed = [], labelled = new Set();
      for (const c of map.cities) {
        const grp = el('g', Object.assign({ class: 'city', 'data-city': c.id }, c.country ? { 'data-border': c.country } : {}), gCities);
        if (c.country) {
          // a border point of a neighbouring country: a square, and the country's name once
          el('rect', { class: 'dot', x: c.x - 7, y: c.y - 7, width: 14, height: 14, rx: 3 }, grp);
          cityEls[c.id] = grp;
          if (labelled.has(c.country)) continue;
          labelled.add(c.country);
        } else {
          el('circle', { class: 'ring', cx: c.x, cy: c.y, r: 10 }, grp);
          el('circle', { class: 'dot', cx: c.x, cy: c.y, r: 6.5 }, grp);
        }
        const ls = labelSpot(map, c, placed);
        const t = el('text', { x: ls.x.toFixed(1), y: ls.y.toFixed(1), 'text-anchor': ls.anchor, 'dominant-baseline': ls.base }, grp);
        t.textContent = c.name;
        cityEls[c.id] = grp;
      }
      const bx = placed.concat(map.cities.map(c => [c.x - 12, c.y - 12, c.x + 12, c.y + 12]));
      const lx0 = Math.min(...bx.map(q => q[0])), ly0 = Math.min(...bx.map(q => q[1]));
      labelBox = { x: lx0, y: ly0, width: Math.max(...bx.map(q => q[2])) - lx0, height: Math.max(...bx.map(q => q[3])) - ly0 };
      full = { x: -10, y: -10, w: map.size[0] + 20, h: map.size[1] + 20 }; measured = false;
      fit();
    }

    // Land as one smooth shape: draw the route strokes on a small canvas, blur, and cut at a threshold.
    // That closes the little holes between routes (a "closing"), so the land doesn't look shattered.
    function smoothLand(m, city) {
      try {
        const K = 0.5, M = 70; // canvas px per map unit; margin in map units
        const x0 = -M, y0 = -M, W = Math.ceil((m.size[0] + 2 * M) * K), H = Math.ceil((m.size[1] + 2 * M) * K);
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const cx = cv.getContext('2d'); if (!cx) return false;
        cx.setTransform(K, 0, 0, K, -x0 * K, -y0 * K);
        cx.strokeStyle = cx.fillStyle = '#fff'; cx.lineCap = 'round'; cx.lineWidth = 74;
        cx.beginPath();
        for (const r of m.routes) { if (r.kind === 'ferry') continue; cx.moveTo(city[r.a].x, city[r.a].y); cx.lineTo(city[r.b].x, city[r.b].y); }
        cx.stroke();
        for (const c of m.cities) { cx.beginPath(); cx.arc(c.x, c.y, 41, 0, 7); cx.fill(); }
        const img = cx.getImageData(0, 0, W, H), N = W * H;
        let a = new Float32Array(N), b = new Float32Array(N);
        for (let i = 0; i < N; i++) a[i] = img.data[i * 4 + 3] / 255;
        const orig = a.slice();
        // three box blurs ~ a gaussian with sigma ~ 35 map units
        const R = Math.round(35 * K);
        const pass = (src, dst, horiz) => {
          const len = horiz ? W : H, lines = horiz ? H : W, step = horiz ? 1 : W, jump = horiz ? W : 1, n = 2 * R + 1;
          for (let l = 0; l < lines; l++) {
            const base = l * jump; let sum = 0;
            for (let k = -R; k <= R; k++) sum += src[base + Math.min(len - 1, Math.max(0, k)) * step];
            for (let k = 0; k < len; k++) {
              dst[base + k * step] = sum / n;
              sum += src[base + Math.min(len - 1, k + R + 1) * step] - src[base + Math.max(0, k - R) * step];
            }
          }
        };
        for (let k = 0; k < 3; k++) { pass(a, b, true); pass(b, a, false); }
        const col = v => { const h = getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#1b2130'; const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
        const land = col('--land'), edge = col('--land-edge');
        const out = cx.createImageData(W, H), d = out.data;
        for (let i = 0; i < N; i++) {
          const v = Math.max(orig[i] * 0.6, a[i]); // keep every original stroke, fill gaps where the blur is dense
          const inner = Math.min(1, Math.max(0, (v - 0.42) / 0.05)), outer = Math.min(1, Math.max(0, (v - 0.33) / 0.05));
          const c = inner > 0 ? land : edge, al = inner > 0 ? 1 : outer;
          d[i * 4] = inner > 0 && inner < 1 ? edge[0] + (land[0] - edge[0]) * inner : c[0];
          d[i * 4 + 1] = inner > 0 && inner < 1 ? edge[1] + (land[1] - edge[1]) * inner : c[1];
          d[i * 4 + 2] = inner > 0 && inner < 1 ? edge[2] + (land[2] - edge[2]) * inner : c[2];
          d[i * 4 + 3] = Math.round(al * 255);
        }
        cx.setTransform(1, 0, 0, 1, 0, 0); cx.putImageData(out, 0, 0);
        el('image', { href: cv.toDataURL('image/png'), x: x0, y: y0, width: W / K, height: H / K, preserveAspectRatio: 'none', class: 'land-img' }, gLand);
        return true;
      } catch (e) { return false; }
    }

    // The whole-map view hugs the drawn routes and labels (names at the edge stay inside).
    // getBBox needs the board on screen, so it is measured the first time it is visible.
    let measured = false;
    function measure() {
      if (measured) return;
      try {
        const a = gRoutes.getBBox();
        if (!a.width) return;
        // labels: use their placement boxes at the biggest font, so a name at the edge is never cut off on a phone
        const b = labelBox || { x: a.x, y: a.y, width: a.width, height: a.height };
        const x0 = Math.min(a.x, b.x) - 6, y0 = Math.min(a.y, b.y) - 6;
        let x1 = Math.max(a.x + a.width, b.x + b.width) + 6;
        // keep the right edge clear of the zoom buttons (~40 screen px) so no route sits under them
        const W = svg.clientWidth || 390;
        x1 += 36 * (x1 - x0) / Math.max(200, W - 36);
        const y1 = Math.max(a.y + a.height, b.y + b.height) + 6;
        full = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; measured = true;
      } catch (e) { /* not rendered yet */ }
    }
    function setVB(v) {
      vb = v; svg.setAttribute('viewBox', `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`);
      const cw = svg.clientWidth, ch = svg.clientHeight;
      if (cw && ch) {
        const s = Math.min(cw / v.w, ch / v.h);
        const f = Math.max(LABEL_MIN, Math.min(LABEL_MAX, LABEL_PX / s));
        svg.style.setProperty('--lf', f.toFixed(1) + 'px');
      }
    }
    function fit() { measure(); setVB(Object.assign({}, full)); }

    // ------------------------------------------------------------ render state
    function render(o) {
      o = o || {};
      svg.classList.toggle('heat', !!o.heat);
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
        // a claimed route becomes one solid, slightly fatter train (no gaps), so it can't be mistaken for an open route
        const isOwn = own != null ? own : -1;
        if (g.own !== isOwn) {
          g.own = isOwn;
          const L = isOwn >= 0 ? g.carL + GAP + 0.4 : g.carL, Wd = isOwn >= 0 ? CAR_W + 2.6 : CAR_W;
          g.carEls.forEach(c => { c.setAttribute('x', -L / 2); c.setAttribute('width', L); c.setAttribute('y', -Wd / 2); c.setAttribute('height', Wd); c.setAttribute('rx', isOwn >= 0 ? 1.2 : 2); });
          if (isOwn >= 0) e.setAttribute('data-own', isOwn); else e.removeAttribute('data-own');
        }
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
      let best = null, bd = Infinity;
      for (const g of geo) {
        const vx = g.ex - g.sx, vy = g.ey - g.sy, L2 = vx * vx + vy * vy;
        const t = Math.max(0, Math.min(1, ((p.x - g.sx) * vx + (p.y - g.sy) * vy) / L2));
        const d = Math.hypot(p.x - (g.sx + t * vx), p.y - (g.sy + t * vy));
        if (d < bd) { bd = d; best = g.r.id; }
      }
      const routeHit = handlers.onRoute && bd < Math.max(tol, 9);
      // a city wins only when the tap is nearer to it than to any route (short routes sit close to their cities)
      if (handlers.onCity && bc < Math.max(tol, 13) && (!routeHit || bc < bd)) { handlers.onCity(bestCity); return; }
      if (routeHit) handlers.onRoute(best);
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
    // the label size depends on how big the board is on screen
    if (window.ResizeObserver) new ResizeObserver(() => { if (vb) setVB(vb); }).observe(svg);

    build(map);
    return {
      render, fit, setMap(m) { if (m !== map) build(m); }, get map() { return map; },
      // first time on screen: measure and show the whole map; returns the whole-map box
      ready() { if (!measured) fit(); return full; },
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
