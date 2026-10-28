// The board: our own SVG drawing of a map (cities, routes as rows of train cars, real coastlines from map.art).
// Board.create(el, map, {onRoute, onCity}) -> {render(opts), setMap(map), fit(), focus(ids)}
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const CAR_W = 10.5, GAP = 3, CITY_R = 11, LANE = 7.5;
  // a claimed route: fatter cars in the player's colour on a dark casing, so it reads as a train sitting on the board
  const OWN_W = CAR_W + 5;
  // city names: ~15 map units, growing up to LABEL_MAX so they stay >= LABEL_PX on screen when the map is small,
  // and shrinking (in map units) when zoomed in so they stay <= LABEL_PX_MAX on screen
  const LABEL_MIN = 5, LABEL_MAX = 21, LABEL_PX = 9, LABEL_PX_MAX = 12.5, LABEL_BASE = 15;
  // names are kept inside the outermost cities (+ FRAME_PAD map units); OUT_K = how hard (area units per score point)
  const FRAME_PAD = 16, OUT_K = 150, CAR_HIT = 0.6;
  // small shapes inside each car (Settings: colour-blind marks), one per colour that is easy to confuse
  const CB = {
    red: 'M-1.9 0a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0z',
    green: 'M0-2.3L2.3 1.9H-2.3z',
    blue: 'M-1.8-1.8h3.6v3.6h-3.6z',
    yellow: 'M0-2.5L2.5 0L0 2.5L-2.5 0z',
    orange: 'M-2.8-.9h5.6v1.8h-5.6z',
    pink: 'M-2.8-.9h1.9v1.8h-1.9zM.9-.9h1.9v1.8h-1.9z',
  };
  const PLAYER_COL = ['red', 'blue', 'yellow', 'green', 'black'];
  const COLOR = {
    pink: '#d77bd0', white: '#eef0f4', blue: '#4f8ff0', yellow: '#f2cf45', orange: '#f0913a',
    black: '#2b2f3a', red: '#e2504c', green: '#4fbf6a', gray: '#8d93a6', loco: '#b9a3ff',
  };
  // passenger figures (Germany): six colours, drawn with a dark rim so white and yellow read on land
  const PAX = { red: '#e2504c', black: '#2b2f3a', green: '#4fbf6a', yellow: '#f2cf45', blue: '#4f8ff0', white: '#f4f1e8' };
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
      return { r, sx, sy, ex, ey, ux, uy, nx, ny, off, ang: Math.atan2(uy, ux) * 180 / Math.PI, carL, cars };
    });
  }

  // a city name's printed width in ems (bold Georgia, as drawn), measured once per name; ~0.58 em a letter without canvas
  const widths = {};
  let measureCtx = null;
  function nameW(s) {
    if (widths[s]) return widths[s];
    let w = s.length * 0.58;
    try {
      measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
      if (measureCtx) { measureCtx.font = '700 100px Georgia, "Times New Roman", serif'; w = measureCtx.measureText(s).width / 100 + 0.01 * s.length; }
    } catch (e) { /* no canvas: the estimate */ }
    return (widths[s] = w);
  }

  // label spot: the side of the city with the widest gap between its routes
  // ...and away from labels already placed and from other cities (so close cities don't print over each other).
  // ...and inside the board: a name that sticks out past the outermost cities widens the whole board and so shrinks
  // the map on a phone (San Francisco / Charleston printed outwards cost a third of the width), so that is penalised
  function labelSpot(map, c, placed, frame, cars) {
    const angs = [];
    const city = Object.fromEntries(map.cities.map(x => [x.id, x]));
    for (const r of map.routes) {
      if (r.a !== c.id && r.b !== c.id) continue;
      const o = city[r.a === c.id ? r.b : r.a];
      angs.push(Math.atan2(o.y - c.y, o.x - c.x));
    }
    // boxes are sized for the biggest label font (LABEL_MAX), so labels never collide when they grow on a phone
    const W = nameW(c.name) * LABEL_MAX, H = LABEL_MAX;
    const spot = (a, far) => {
      const ca = Math.cos(a) * (far || 1), sa = Math.sin(a) * (far || 1);
      const anchor = Math.cos(a) > 0.3 ? 'start' : Math.cos(a) < -0.3 ? 'end' : 'middle';
      // the baseline hangs below / sits above / centres on the city, so it stays put whatever the font size
      const base = Math.sin(a) > 0.3 ? 'hanging' : Math.sin(a) < -0.3 ? 'alphabetic' : 'central';
      const x = c.x + ca * 14, y = c.y + sa * 13;
      const x0 = anchor === 'start' ? x : anchor === 'end' ? x - W : x - W / 2;
      const y0 = base === 'hanging' ? y : base === 'alphabetic' ? y - H : y - H / 2;
      // the box keeps a little air above and below: the printed letters stand ~1.15 em tall, so two names stacked
      // exactly a line apart still touch (Zürich / München, Santa Fe / Oklahoma City)
      return { x, y, anchor, base, box: [x0, y0 - H * 0.1, x0 + W, y0 + H * 1.1] };
    };
    const overlap = (p, q) => Math.max(0, Math.min(p[2], q[2]) - Math.max(p[0], q[0])) * Math.max(0, Math.min(p[3], q[3]) - Math.max(p[1], q[1]));
    const cands = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, -3 * Math.PI / 4];
    let best = null, bestScore = -Infinity;
    // each direction close to the dot, or a little further out (a gap between two routes can be further away)
    for (const far of [1, 1.7]) for (const a of cands) {
      let gap = Math.PI;
      for (const b of angs) { let d = Math.abs(a - b) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; gap = Math.min(gap, d); }
      const s = spot(a, far);
      let hit = far > 1 ? 6 : 0;
      for (const p of placed) hit += 3 * overlap(s.box, p);
      // other cities: a wider keep-out, so a name never sits beside the wrong dot (Chicago / Pittsburgh)
      for (const o of map.cities) if (o !== c) hit += overlap(s.box, [o.x - 9, o.y - 9, o.x + 9, o.y + 9]) + 0.5 * overlap(s.box, [o.x - 20, o.y - 20, o.x + 20, o.y + 20]);
      // the spaces of routes: a name printed over them hides which colour they are
      if (cars) for (const k of cars) hit += CAR_HIT * overlap(s.box, k);
      const out = frame ? (W * H - overlap(s.box, frame)) : 0;
      // mild preference for above / right
      const score = gap + (a === -Math.PI / 2 ? 0.12 : 0) + (a === 0 ? 0.08 : 0) - hit / 40 - out / OUT_K;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    placed.push(best.box);
    return best;
  }

  function create(wrap, map, handlers) {
    handlers = handlers || {};
    const svg = el('svg', { class: 'board', role: 'img' });
    wrap.appendChild(svg);
    let geo = [], routeEls = {}, cityEls = {}, vb = null, labs = [], routesBox = null;
    const gLand = el('g', {}, svg), gBeds = el('g', { class: 'beds' }, svg), gRoutes = el('g', {}, svg), gMarks = el('g', {}, svg), gCities = el('g', {}, svg);

    function build(m) {
      map = m;
      [gLand, gBeds, gRoutes, gMarks, gCities].forEach(g => { while (g.firstChild) g.removeChild(g.firstChild); });
      svg.setAttribute('aria-label', map.name + ' map');
      geo = geometry(map); routeEls = {}; cityEls = {};
      const city = Object.fromEntries(map.cities.map(c => [c.id, c]));
      // land: the real coastlines, lakes and borders (map.art, made at build time from Natural Earth by
      // tools/geo-art.js, bent with the same warp as the cities). Without it: a smooth shape around the routes
      // (smoothLand), and plain strokes as the last fallback.
      if (map.art) drawArt(map.art);
      else if (!smoothLand(map, city)) for (const layer of [{ w: 84, r: 46, fill: 'var(--land-edge)' }, { w: 74, r: 41, fill: 'var(--land)' }]) {
        const g = el('g', { fill: layer.fill, stroke: layer.fill }, gLand);
        for (const r of map.routes) {
          if (r.kind === 'ferry') continue;
          el('line', { x1: city[r.a].x, y1: city[r.a].y, x2: city[r.b].x, y2: city[r.b].y, 'stroke-width': layer.w, 'stroke-linecap': 'round' }, g);
        }
        for (const c of map.cities) el('circle', { cx: c.x, cy: c.y, r: layer.r, stroke: 'none' }, g);
      }
      // track bed: one dark band per pair of cities, under both tracks of a double route, so the pair reads as one
      // (ferries get a sea-blue band instead)
      const pairs = {};
      for (const g of geo) { const k = g.r.a < g.r.b ? g.r.a + '|' + g.r.b : g.r.b + '|' + g.r.a; (pairs[k] = pairs[k] || []).push(g); }
      for (const k in pairs) {
        const gs = pairs[k], offs = gs.map(g => g.off), lo = Math.min(...offs), hi = Math.max(...offs), mid = (lo + hi) / 2, g = gs[0];
        const sx = g.sx + g.nx * (mid - g.off), sy = g.sy + g.ny * (mid - g.off), ex = g.ex + g.nx * (mid - g.off), ey = g.ey + g.ny * (mid - g.off);
        const ferry = gs.some(q => q.r.kind === 'ferry');
        el('line', { class: 'bed' + (ferry ? ' ferry' : ''), x1: sx.toFixed(1), y1: sy.toFixed(1), x2: ex.toFixed(1), y2: ey.toFixed(1), 'stroke-width': (hi - lo + CAR_W + (ferry ? 9 : 5)).toFixed(1) }, gBeds);
      }
      for (const g of geo) {
        const r = g.r;
        const grp = el('g', { class: 'route', 'data-route': r.id }, gRoutes);
        const seg = (cls, w) => el('line', { class: cls, x1: g.sx.toFixed(1), y1: g.sy.toFixed(1), x2: g.ex.toFixed(1), y2: g.ey.toFixed(1), 'stroke-width': w }, grp);
        // tunnel: rail ties sticking out on both sides of the cars
        if (r.kind === 'tunnel') seg('ties', CAR_W + 7);
        // claimed: the dark casing the train sits on (hidden until claimed)
        seg('casing', OWN_W + 3.2);
        g.carEls = g.cars.map((c, i) => {
          const cg = el('g', { transform: `translate(${c.x.toFixed(1)},${c.y.toFixed(1)}) rotate(${g.ang.toFixed(1)})` }, grp);
          const rect = el('rect', { class: 'car' + (r.kind === 'tunnel' ? ' tunnel' : '') + (r.color === 'black' ? ' blk' : ''), x: -g.carL / 2, y: -CAR_W / 2, width: g.carL, height: CAR_W, rx: 2, fill: COLOR[r.color] }, cg);
          // a space that needs a locomotive (ferries): a light badge with a dark dot, like the wild card
          if (r.locos && i < r.locos) {
            const k = Math.min(g.carL, CAR_W) * 0.36;
            el('circle', { class: 'loco-mark', r: k.toFixed(2) }, cg);
          }
          // claimed: a light shine along the top of each car (hidden until claimed)
          rect.shine = el('rect', { class: 'shine', rx: 1 }, cg);
          rect.cbm = el('path', { class: 'cbm', d: CB[r.color] || '' }, cg);
          return rect;
        });
        routeEls[r.id] = grp;
      }
      const placed = [], labelled = new Set(); labs = []; routesBox = null;
      const xs = map.cities.map(c => c.x), ys = map.cities.map(c => c.y);
      const frame = [Math.min(...xs) - FRAME_PAD, Math.min(...ys) - FRAME_PAD, Math.max(...xs) + FRAME_PAD, Math.max(...ys) + FRAME_PAD];
      const carBoxes = []; for (const g of geo) for (const k of g.cars) carBoxes.push([k.x - 5, k.y - 5, k.x + 5, k.y + 5]);
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
        const ls = labelSpot(map, c, placed, frame, carBoxes);
        labs.push({ x: ls.x, y: ls.y, anchor: ls.anchor, base: ls.base, n: nameW(c.name) });
        const t = el('text', { x: ls.x.toFixed(1), y: ls.y.toFixed(1), 'text-anchor': ls.anchor, 'dominant-baseline': ls.base }, grp);
        t.textContent = c.name;
        cityEls[c.id] = grp;
      }
      measured = false; fitKey = ''; obsCache = { f: null };
      fit();
    }

    // Real geography: a faint shelf in the sea along the coast, the land, lakes, then state and country borders.
    // A map with a home country (Switzerland) draws its neighbours darker so the border reads at a glance.
    function drawArt(a) {
      const p = (cls, d) => d && el('path', { class: cls, d }, gLand);
      p('geo-shelf', a.land);
      p(a.home ? 'geo-land far' : 'geo-land', a.land);
      p('geo-home', a.home);
      // hand-tinted coast, like an old printed map: a soft band of colour along every shore
      p('geo-tint', a.land);
      p('geo-lake', a.lakes);
      p('geo-states', a.states);
      p('geo-border', a.borders);
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
        const V = new Float32Array(N);
        for (let i = 0; i < N; i++) V[i] = Math.max(orig[i] * 0.6, a[i]); // keep every original stroke, fill gaps where the blur is dense
        // fill lakes: sea that can't reach the edge of the map becomes land, unless a ferry crosses it
        const SEA = 0.42, seen = new Uint8Array(N), stack = [];
        const flood = () => { while (stack.length) { const i = stack.pop(), x = i % W, y = (i / W) | 0;
          for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && !seen[j] && V[j] < SEA) { seen[j] = 1; stack.push(j); } } };
        const seed = i => { if (!seen[i] && V[i] < SEA) { seen[i] = 1; stack.push(i); } };
        for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
        for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
        flood();
        for (const r of m.routes) {
          if (r.kind !== 'ferry') continue;
          for (const t of [0.3, 0.5, 0.7]) {
            const px = Math.round(((city[r.a].x + (city[r.b].x - city[r.a].x) * t) - x0) * K), py = Math.round(((city[r.a].y + (city[r.b].y - city[r.a].y) * t) - y0) * K);
            if (px >= 0 && py >= 0 && px < W && py < H) seed(py * W + px);
          }
        }
        flood();
        // the lake and its old shore ring (grown a few pixels) become plain land
        let F = new Uint8Array(N);
        for (let i = 0; i < N; i++) if (!seen[i] && V[i] < SEA) F[i] = 1;
        for (let k = 0; k < 5; k++) {
          const G2 = F.slice();
          for (let i = 0; i < N; i++) if (!F[i] && V[i] < 0.5) { const x = i % W; if ((x > 0 && F[i - 1]) || (x < W - 1 && F[i + 1]) || (i >= W && F[i - W]) || (i + W < N && F[i + W])) G2[i] = 1; }
          F = G2;
        }
        for (let i = 0; i < N; i++) if (F[i]) V[i] = 1;
        const out = cx.createImageData(W, H), d = out.data;
        for (let i = 0; i < N; i++) {
          const v = V[i];
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

    // The board's box hugs the drawn routes and the city names (names at the edge stay inside). Names are drawn at
    // a size that depends on the zoom, so the box does too: content(s) is the box at screen scale s (px per map unit).
    // getBBox needs the board on screen, so the routes are measured the first time it is visible.
    let measured = false, lastLf = '';
    function measure() {
      if (measured) return;
      try {
        const a = gRoutes.getBBox();
        if (!a.width) return;
        routesBox = [a.x, a.y, a.x + a.width, a.y + a.height]; measured = true;
      } catch (e) { /* not rendered yet */ }
    }
    // city-name font in map units at screen scale s: ~LABEL_BASE units, kept between LABEL_PX and LABEL_PX_MAX on screen
    function fontAt(s) {
      const px = Math.max(LABEL_PX, Math.min(LABEL_PX_MAX, LABEL_BASE * s));
      return Math.max(LABEL_MIN, Math.min(LABEL_MAX, px / s));
    }
    // routes, city dots and names (at font f, with the same boxes labelSpot places them by)
    function boxAt(f) {
      if (!routesBox) return { x: -10, y: -10, w: map.size[0] + 20, h: map.size[1] + 20 };
      let [x0, y0, x1, y1] = routesBox;
      for (const c of map.cities) { x0 = Math.min(x0, c.x - 12); y0 = Math.min(y0, c.y - 12); x1 = Math.max(x1, c.x + 12); y1 = Math.max(y1, c.y + 12); }
      for (const l of labs) {
        const W = l.n * f, H = f;
        const lx = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - W : l.x - W / 2;
        const ly = l.base === 'hanging' ? l.y : l.base === 'alphabetic' ? l.y - H : l.y - H / 2;
        x0 = Math.min(x0, lx); y0 = Math.min(y0, ly); x1 = Math.max(x1, lx + W); y1 = Math.max(y1, ly + H);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    let boxCache = { f: null, b: null };
    function content(s) {
      const f = +fontAt(s).toFixed(1);
      if (boxCache.f !== f || boxCache.r !== routesBox || boxCache.m !== map) boxCache = { f, r: routesBox, m: map, b: boxAt(f) };
      // plus a small margin, the same 6 screen px at every zoom
      const b = boxCache.b, m = 6 / s;
      return { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m };
    }
    function setVB(v) {
      vb = v; svg.setAttribute('viewBox', `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`);
      const cw = svg.clientWidth, ch = svg.clientHeight;
      if (cw && ch) {
        const f = fontAt(Math.min(cw / v.w, ch / v.h));
        if (f.toFixed(1) !== lastLf) { lastLf = f.toFixed(1); svg.style.setProperty('--lf', lastLf + 'px'); }
      }
    }

    // ------------------------------------------------------------ render state
    function render(o) {
      o = o || {};
      svg.classList.toggle('heat', !!o.heat);
      svg.classList.toggle('cb', !!(root.Board && root.Board.cbMarks));
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
        // a claimed route becomes a train: fatter cars coupled close together on a dark casing, with a shine on top,
        // so it can't be mistaken for an open route of the same colour
        const isOwn = own != null ? own : -1;
        if (g.own !== isOwn) {
          g.own = isOwn;
          const on = isOwn >= 0, L = on ? g.carL + GAP - 1.1 : g.carL, Wd = on ? OWN_W : CAR_W;
          g.carEls.forEach(c => {
            c.setAttribute('x', (-L / 2).toFixed(2)); c.setAttribute('width', L.toFixed(2)); c.setAttribute('y', -Wd / 2); c.setAttribute('height', Wd); c.setAttribute('rx', on ? 2.4 : 2);
            const sh = c.shine; sh.setAttribute('x', (-L / 2 + 1.6).toFixed(2)); sh.setAttribute('width', Math.max(0, L - 3.2).toFixed(2)); sh.setAttribute('y', (-Wd / 2 + 1.5).toFixed(2)); sh.setAttribute('height', (Wd * 0.26).toFixed(2));
            c.cbm.setAttribute('d', CB[on ? PLAYER_COL[isOwn] : g.r.color] || '');
          });
          if (on) e.setAttribute('data-own', isOwn); else e.removeAttribute('data-own');
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
      // Germany: the passengers waiting at each city (a country's at its first border dot), small figures round the dot
      if (o.pax) {
        const at = {};
        for (const c of map.cities) { const k = c.country || c.id; if (!at[k]) at[k] = c; }
        for (const [k, list] of Object.entries(o.pax)) {
          const c = at[k]; if (!c || !list.length) continue;
          list.forEach((col, i) => {
            const a = -Math.PI / 2 + (i - (list.length - 1) / 2) * 0.66, R = c.country ? 16 : 18;
            el('circle', { class: 'pax', cx: (c.x + R * Math.cos(a)).toFixed(1), cy: (c.y + R * Math.sin(a)).toFixed(1), r: 5.4, fill: PAX[col] || col }, gMarks);
          });
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
    // One zoom mode: AUTO shows the whole board, centred and as big as it fits, and re-fits by itself when the board
    // area changes size. Pinch, wheel or + zooms in by hand (physical feel: the map sticks to the fingers, a flick
    // keeps gliding); zooming back out to the fit, the fit button or a double tap on empty board returns to auto.
    // The view box always has the board area's own shape, so the view box is exactly what is on screen.
    // The zoom control sits in a corner of the map. In auto only its + shows; the whole-board fit puts it in a corner
    // with nothing drawn under it, so the map can use the full width. Only when no corner is free is a strip kept
    // clear on the right for it (the old behaviour, which cost a phone 13% of the map's width).
    let reserve = 0, corner = 'br';
    const MAX_ZOOM = 6; // times the auto fit
    function btnSize() {
      const p = z && z.querySelector('[data-z=in]');
      return { w: (p && p.offsetWidth) || 40, h: (p && p.offsetHeight) || 38 };
    }
    // what must not sit under the button: city dots (and a station on top), route spaces, names at font f
    let obsCache = { f: null };
    function obstacles(f) {
      if (obsCache.f === f && obsCache.m === map) return obsCache.list;
      const list = [];
      for (const c of map.cities) list.push([c.x - 12, c.y - 26, c.x + 12, c.y + 12]);
      for (const g of geo) for (const k of g.cars) list.push([k.x - 7, k.y - 7, k.x + 7, k.y + 7]);
      for (const l of labs) {
        const W = l.n * f, H = f;
        const lx = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - W : l.x - W / 2;
        const ly = l.base === 'hanging' ? l.y : l.base === 'alphabetic' ? l.y - H : l.y - H / 2;
        list.push([lx, ly, lx + W, ly + H]);
      }
      obsCache = { f, m: map, list };
      return list;
    }
    // the first corner of view v (scale s) where the + button covers nothing, or null
    function freeCorner(v, s) {
      const b = btnSize(), bw = (b.w + 8) / s, bh = (b.h + 8) / s, obs = obstacles(+fontAt(s).toFixed(1));
      const R = { br: [v.x + v.w - bw, v.y + v.h - bh], tr: [v.x + v.w - bw, v.y], bl: [v.x, v.y + v.h - bh], tl: [v.x, v.y] };
      for (const k of ['br', 'tr', 'bl', 'tl']) {
        const [x0, y0] = R[k], x1 = x0 + bw, y1 = y0 + bh;
        if (!obs.some(o => o[0] < x1 && o[2] > x0 && o[1] < y1 && o[3] > y0)) return k;
      }
      return null;
    }
    function setCorner(k) {
      if (corner === k) return;
      z.classList.remove('c-' + corner); corner = k; z.classList.add('c-' + k);
    }
    const pts = new Map();
    let drag = null, anim = 0, track = [], auto = true, lastSize = null, lastTap = null;
    function stopAnim() { if (anim) cancelAnimationFrame(anim); anim = 0; }
    function area() { return { w: svg.clientWidth || 390, h: svg.clientHeight || 260 }; }
    function toSvg(cx, cy, v) {
      v = v || vb;
      const r = svg.getBoundingClientRect();
      const s = Math.min(r.width / v.w, r.height / v.h);
      const ox = (r.width - v.w * s) / 2, oy = (r.height - v.h * s) / 2;
      return { x: v.x + (cx - r.left - ox) / s, y: v.y + (cy - r.top - oy) / s, s };
    }
    // screen px per map unit when the whole board fits. Names shrink in map units as the board grows, so start from
    // the box at the biggest names and grow a few times; each step still holds the names at the size they'll be drawn.
    function fitScale(w, h, res) {
      if (res == null) res = reserve;
      const sc = b => Math.min(Math.max(40, w - res) / b.w, h / b.h);
      // start a little small (the names at their biggest), then grow: each step's box still fits at the new scale
      let s = 0.9 * sc(boxAt(LABEL_MAX));
      for (let i = 0; i < 3 && sc(content(s)) < s; i++) s = sc(content(s));
      for (let i = 0; i < 6; i++) { const s2 = sc(content(s)); if (s2 <= s * 1.0005) break; s = s2; }
      return s;
    }
    // decide the corner (and whether a strip is needed) for the current board area; returns the fit scale
    let fitKey = '', fitS = 1;
    function autoScale() {
      const a = area(), key = a.w + 'x' + a.h + ':' + (map && map.id) + ':' + (routesBox ? routesBox.join() : '') + ':' + labs.length;
      if (key === fitKey) return fitS;
      reserve = 0;
      let s = fitScale(a.w, a.h);
      const c = measured ? freeCorner(viewAt(0, 0, s), s) : 'br';
      if (c) setCorner(c);
      else { setCorner('br'); reserve = btnSize().w + 8; s = fitScale(a.w, a.h); }
      if (measured) fitKey = key;
      fitS = s;
      return s;
    }
    // one axis: if the board (plus the button strip) is wider than the screen, keep its edges at or past the screen's
    // edges; if it is narrower, centre it (but leave the strip clear)
    function axis(p, start, len, post, vlen) {
      if (len + post >= vlen) return Math.max(start, Math.min(start + len + post - vlen, p));
      const gap = vlen - len;
      return start - Math.min(gap / 2, gap - post);
    }
    // the view showing screen scale s, roughly at top-left x, y, kept on the board
    function viewAt(x, y, s) {
      const a = area(), w = a.w / s, h = a.h / s, b = content(s);
      return { x: axis(x, b.x, b.w, reserve / s, w), y: axis(y, b.y, b.h, 0, h), w, h };
    }
    // the default ("auto") view. Usually the whole board. A screen can ask for names of at least N px instead
    // (handlers.homeLabelPx, Play on a phone: 9 px, 2026-10-20 "City names must be at least 9 px in the default phone
    // view, or the view zooms so they are"): then the default view is zoomed in that far, centred on handlers.focus()
    // (the player's tickets), one-finger drags pan it, and the fit button shows the whole board.
    function homeScale() {
      const s0 = autoScale(), px = handlers.homeLabelPx ? +handlers.homeLabelPx() || 0 : 0;
      return px ? Math.min(s0 * MAX_ZOOM, Math.max(s0, px / LABEL_MAX)) : s0;
    }
    function cropped() { return homeScale() > autoScale() * 1.001; }
    function wholeView() { return viewAt(0, 0, autoScale()); }
    function autoView() {
      const s0 = autoScale(), s = homeScale();
      if (s <= s0 * 1.001) return viewAt(0, 0, s0);
      const a = area(), b = content(s), f = handlers.focus && handlers.focus();
      const c = f || { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const v = viewAt(c.x - a.w / s / 2, c.y - a.h / s / 2, s);
      if (measured) setCorner(freeCorner(v, s) || 'br');
      lightFit();
      return v;
    }
    function scaleOf(v) { return area().w / v.w; }
    function clamp(v) { return viewAt(v.x, v.y, scaleOf(v)); }
    // the view after zooming by k around screen point (cx, cy), starting from view v; null = back at the fit (auto)
    function zoomed(v, cx, cy, k) {
      const p = toSvg(cx, cy, v), r = svg.getBoundingClientRect(), s0 = autoScale();
      const s = Math.min(s0 * MAX_ZOOM, scaleOf(v) * k);
      if (s <= s0 * 1.001) return cropped() ? wholeView() : null; // zoomed out to the whole board (a zoomed default: stay there)
      return viewAt(p.x - (cx - r.left) / s, p.y - (cy - r.top) / s, s);
    }
    function lightFit() { fitBtn.classList.toggle('lit', !auto); fitBtn.setAttribute('aria-pressed', String(!auto)); z.classList.toggle('auto', auto); z.classList.toggle('crop', auto && cropped()); }
    function setAuto(on) { if (auto !== on) { auto = on; lightFit(); } }
    function zoomAt(cx, cy, k) {
      const v = zoomed(vb, cx, cy, k);
      setAuto(!v); setVB(v || autoView());
    }
    // back to the whole board: a glide, or a jump (first showing, new map, tab return)
    function toAuto(instant) {
      measure(); stopAnim(); setAuto(true);
      if (instant || !vb) setVB(autoView()); else glideTo(autoView(), 320);
    }
    function fit() { toAuto(true); }
    // glide to a view (ease-out)
    function glideTo(target, ms) {
      stopAnim();
      const from = Object.assign({}, vb), t0 = performance.now(), T = ms || 260;
      const step = now => {
        const t = Math.min(1, (now - t0) / T), e = 1 - Math.pow(1 - t, 3);
        setVB({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e });
        anim = t < 1 ? requestAnimationFrame(step) : 0;
      };
      anim = requestAnimationFrame(step);
    }
    // a flick: keep moving at the release speed, slowing down
    function coast(vx, vy) {
      stopAnim();
      let last = performance.now();
      const step = now => {
        const dt = Math.min(40, now - last); last = now;
        const s = scaleOf(vb);
        const want = { x: vb.x - vx * dt / s, y: vb.y - vy * dt / s, w: vb.w, h: vb.h };
        const next = clamp(Object.assign({}, want));
        if (Math.abs(next.x - want.x) > 0.01) vx = 0; // hit the edge: stop that way
        if (Math.abs(next.y - want.y) > 0.01) vy = 0;
        setVB(next);
        const f = Math.pow(0.94, dt / 16); vx *= f; vy *= f;
        anim = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : 0;
      };
      anim = requestAnimationFrame(step);
    }
    svg.addEventListener('pointerdown', e => {
      stopAnim();
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already-ended pointer */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      track = [];
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, vb: Object.assign({}, vb), moved: false, t: Date.now() };
      else drag = Object.assign(drag || {}, { moved: true, pinch: dist(), vb: Object.assign({}, vb), mid: mid() });
    });
    svg.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!drag) return;
      if (pts.size >= 2 && drag.pinch) {
        // zoom around where the fingers started, then move with the fingers' midpoint
        const k = dist() / drag.pinch, m0 = drag.mid, m = mid();
        const v = zoomed(drag.vb, m0.x, m0.y, k);
        if (!v) { setAuto(true); setVB(autoView()); return; }
        const s = scaleOf(v);
        setAuto(false); setVB(clamp({ x: v.x - (m.x - m0.x) / s, y: v.y - (m.y - m0.y) / s, w: v.w, h: v.h }));
        return;
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 7) return;
      drag.moved = true;
      if (auto && !cropped()) return; // auto mode: a one-finger drag never moves the board (unless the default is zoomed in)
      setAuto(false);
      const s = scaleOf(drag.vb);
      setVB(clamp({ x: drag.vb.x - dx / s, y: drag.vb.y - dy / s, w: drag.vb.w, h: drag.vb.h }));
      track.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (track.length > 6) track.shift();
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 1) {
        // one finger of a pinch lifted: carry on panning from where the other finger is now, without a jump
        const p = [...pts.values()][0];
        drag = { x: p.x, y: p.y, vb: Object.assign({}, vb), moved: true, t: Date.now() };
        track = [];
        return;
      }
      if (pts.size === 0) {
        if (drag && !drag.moved && e.type === 'pointerup') tap(e.clientX, e.clientY);
        else if (!auto && !cropped() && scaleOf(vb) <= autoScale() * 1.03) toAuto(); // let go just past the fit: settle into auto
        else if (!auto && drag && drag.moved && !drag.pinch && e.type === 'pointerup' && track.length >= 2) {
          const a = track[0], b = track[track.length - 1], dt = b.t - a.t;
          if (dt > 0 && performance.now() - b.t < 80) {
            const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt; // px per ms
            if (Math.hypot(vx, vy) > 0.25) coast(vx, vy);
          }
        }
        drag = null;
      }
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    // wheel / trackpad: zoom in proportion to the scroll, so a trackpad pinch is smooth
    svg.addEventListener('wheel', e => {
      e.preventDefault(); stopAnim();
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(e.clientX, e.clientY, Math.exp(-Math.max(-120, Math.min(120, d)) * (e.ctrlKey ? 0.01 : 0.0022)));
    }, { passive: false });
    function dist() { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1; }
    function mid() { const a = [...pts.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }

    // city taps only count while the screen uses them (Lab ends, station mode); otherwise a tap by a city is a route tap
    const cityOn = () => !!handlers.onCity && (!handlers.cityActive || handlers.cityActive());
    const CLOSE_PX = 7; // two things nearer than this (screen px) to the finger count as a crowded spot
    function magnifyAt(p, routeHit, bd, bd2, bc, bc2) {
      const s = p.s, s0 = autoScale(), tolU = 16 / s;
      if (s >= s0 * MAX_ZOOM * 0.98) return false;
      const near = d => d < tolU;
      const twoRoutes = routeHit && near(bd2) && (bd2 - bd) * s < CLOSE_PX;
      const routeCity = routeHit && cityOn() && near(bc) && Math.abs(bc - bd) * s < CLOSE_PX * 0.6;
      const twoCities = cityOn() && near(bc) && near(bc2) && (bc2 - bc) * s < CLOSE_PX;
      if (!twoRoutes && !routeCity && !twoCities) return false;
      const s1 = Math.min(s0 * MAX_ZOOM, s * 2.6), a = area();
      setAuto(false);
      glideTo(viewAt(p.x - a.w / s1 / 2, p.y - a.h / s1 / 2, s1), 300);
      if (handlers.onMagnify) handlers.onMagnify();
      return true;
    }
    function tap(cx, cy) {
      const p = toSvg(cx, cy);
      const tol = 16 / p.s; // ~16 screen px
      let bestCity = null, bc = Infinity, bc2 = Infinity;
      for (const c of map.cities) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < bc) { bc2 = bc; bc = d; bestCity = c.id; } else if (d < bc2) bc2 = d; }
      // nearest route, and the nearest one between a different pair of cities (the twin of a double doesn't count)
      let best = null, bd = Infinity, bestPair = null, bd2 = Infinity;
      const pair = r => r.a < r.b ? r.a + '|' + r.b : r.b + '|' + r.a;
      for (const g of geo) {
        const vx = g.ex - g.sx, vy = g.ey - g.sy, L2 = vx * vx + vy * vy;
        const t = Math.max(0, Math.min(1, ((p.x - g.sx) * vx + (p.y - g.sy) * vy) / L2));
        const d = Math.hypot(p.x - (g.sx + t * vx), p.y - (g.sy + t * vy)), k = pair(g.r);
        if (d < bd) { if (k !== bestPair) bd2 = bd; bd = d; best = g.r.id; bestPair = k; }
        else if (d < bd2 && k !== bestPair) bd2 = d;
      }
      const routeHit = handlers.onRoute && bd < Math.max(tol, 9);
      // a crowded spot (two routes, a route and a city, or two cities within a few screen px of each other): instead
      // of guessing, glide in around the finger so the next tap is clear. Back out with the fit button or zoom out.
      if (magnifyAt(p, routeHit, bd, bd2, bc, bc2)) return;
      // a city wins only when the tap is nearer to it than to any route (short routes sit close to their cities)
      if (cityOn() && bc < Math.max(tol, 13) && (!routeHit || bc < bd)) { handlers.onCity(bestCity); return; }
      if (routeHit) { handlers.onRoute(best); return; }
      if (cityOn() && bc < tol * 2.2) { handlers.onCity(bestCity); return; }
      // empty board: a double tap goes back to the whole board
      const now = Date.now();
      if (lastTap && now - lastTap.t < 350 && Math.hypot(cx - lastTap.x, cy - lastTap.y) < 30) { lastTap = null; if (!auto) toAuto(); }
      else lastTap = { t: now, x: cx, y: cy };
      if (handlers.onEmpty) handlers.onEmpty();
    }

    // zoom buttons: + and − glide; the fit button is lit while zoomed by hand and dimmed in auto
    const z = document.createElement('div');
    z.className = 'zoom c-br';
    z.innerHTML = '<button type="button" aria-label="Zoom in" data-z="in">+</button><button type="button" aria-label="Zoom out" data-z="out">−</button><button type="button" aria-label="Show whole map" data-z="fit">⤢</button>';
    const fitBtn = z.querySelector('[data-z=fit]');
    z.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.z === 'fit') {
        // a zoomed default view: the fit button shows the whole board, and tapped again goes back to the default
        if (auto && cropped()) { stopAnim(); setAuto(false); glideTo(wholeView(), 320); return; }
        toAuto(); return;
      }
      const r = svg.getBoundingClientRect();
      const v = zoomed(vb, r.left + (r.width - reserve) / 2, r.top + r.height / 2, b.dataset.z === 'in' ? 1.6 : 1 / 1.6);
      if (!v) { if (!auto) toAuto(); return; }
      setAuto(false); glideTo(v, 240);
    });
    wrap.appendChild(z);
    lightFit();
    // the board area changed size (window, rotation, phone toolbar, panel): auto re-fits with a glide;
    // a hand zoom keeps its scale and centre, unless the screen turned (then back to auto)
    if (window.ResizeObserver) new ResizeObserver(() => {
      const a = { w: svg.clientWidth, h: svg.clientHeight, land: window.innerWidth > window.innerHeight };
      const prev = lastSize; lastSize = a;
      if (!a.w || !a.h || !vb) return;
      if (prev && prev.w === a.w && prev.h === a.h) return;
      if (prev && prev.land !== a.land) setAuto(true);
      if (auto) { if (!prev || !prev.w || !prev.h) toAuto(true); else glideTo(autoView(), 200); return; }
      stopAnim();
      const c = { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }, s = scaleOf(vb) * (prev && prev.w ? prev.w / a.w : 1);
      // keep the same map units per screen px: s stays, the box gets the new shape
      const s1 = Math.max(s, autoScale());
      if (s1 <= autoScale() * 1.001) { toAuto(true); return; }
      setVB(viewAt(c.x - a.w / s1 / 2, c.y - a.h / s1 / 2, s1));
    }).observe(svg);

    build(map);
    return {
      render, fit, setMap(m) { if (m !== map) build(m); }, get map() { return map; },
      // back to the whole board (new game, tab return); instant = no glide
      toAuto(instant) { toAuto(instant !== false); },
      get auto() { return auto; },
      // first time on screen: measure and show the whole board; returns the box the phone layout sizes the board
      // area from (the whole board at the full width: the zoom button goes in a free corner)
      ready() {
        if (!measured) toAuto(true);
        const W = svg.clientWidth || 390, b = content(fitScale(W, 1e6, 0));
        return { x: b.x, y: b.y, w: b.w, h: b.h };
      },
      // the board's own shape (width / height) when it fills an area about w px wide: the frame is sized to it
      ratio(w) { measure(); const b = content(fitScale(w || 900, 1e6, 0)); return b.w / b.h; },
      // a zoomed default view (names >= homeLabelPx): the map's height in px at that zoom for an area w px wide, or null
      homeBox(w) {
        const px = handlers.homeLabelPx ? +handlers.homeLabelPx() || 0 : 0;
        if (!px) return null;
        measure();
        const s0 = fitScale(w, 1e6, 0), s = Math.min(s0 * MAX_ZOOM, Math.max(s0, px / LABEL_MAX));
        if (s <= s0 * 1.001) return null;
        return { h: content(s).h * s };
      },
    };
  }

  root.Board = { create, COLOR, PLAYER, PLAYER_NAME, CB, cbMarks: false };
})(window);
