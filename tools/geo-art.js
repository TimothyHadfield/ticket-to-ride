// Real-geography board art, made at build time only (the site loads nothing from the network).
// Data: Natural Earth (public domain, naturalearthdata.com) via the npm packages world-atlas (land, countries)
// and us-atlas (US states), plus Natural Earth lakes (tools/cache, fetched once from the natural-earth-vector repo).
//
// How the land and the cities agree:
//   1. every city is projected from its real latitude/longitude ("home" spot);
//   2. build-maps.js nudges crowded cities apart so names and routes stay readable;
//   3. ONE smooth warp (a thin-plate spline from home spots to board spots) is applied to the coastlines,
//      lakes and borders too, so the land bends with the cities and every city stays on its real piece of land.
// Needs Node 22+ (require of the ES-module d3-geo).
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const d3 = require('d3-geo');
const topo = require('topojson-client');

const CACHE = path.join(__dirname, 'cache');
const LAKES_URL = f => `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/${f}.geojson`;

function fetchOnce(name) {
  const file = path.join(CACHE, name + '.geojson');
  if (fs.existsSync(file)) return Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8')));
  fs.mkdirSync(CACHE, { recursive: true });
  return new Promise((ok, bad) => {
    const get = url => https.get(url, res => {
      if (res.statusCode >= 300 && res.headers.location) return get(res.headers.location);
      if (res.statusCode !== 200) return bad(new Error(url + ' ' + res.statusCode));
      const out = fs.createWriteStream(file); res.pipe(out); out.on('finish', () => ok(JSON.parse(fs.readFileSync(file, 'utf8'))));
    }).on('error', bad);
    get(LAKES_URL(name));
  });
}

// ---------------------------------------------------------------- projections
// conic conformal (Lambert) for every board, like a printed wall map; parallels per region
function projection(cfg) {
  const p = cfg.proj;
  return d3.geoConicConformal().parallels(p.parallels).rotate([-p.lon0, 0]).center([0, p.lat0]).scale(1).translate([0, 0]);
}
// fit so the cities span x = 50..950 (the board's coordinate frame before nudging)
function fitCities(proj, lonlats) {
  const raw = lonlats.map(ll => proj(ll));
  const minX = Math.min(...raw.map(p => p[0])), maxX = Math.max(...raw.map(p => p[0])), minY = Math.min(...raw.map(p => p[1]));
  const s = 900 / (maxX - minX);
  proj.scale(s).translate([50 - minX * s, 50 - minY * s]);
  return lonlats.map(ll => proj(ll));
}

// ---------------------------------------------------------------- thin-plate spline
function solve(A, b) { // Gaussian elimination with partial pivoting
  const n = b.length; A = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (f) for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; }
  return x;
}
// from[i] -> to[i]; lambda > 0 smooths (then cities land on warp(from), not exactly on to)
function tps(from, to, lambda) {
  const S = 1000, n = from.length, P = from.map(p => [p[0] / S, p[1] / S]);
  const U = r2 => r2 > 1e-12 ? r2 * Math.log(r2) / 2 : 0; // r^2 log r
  const A = [];
  for (let i = 0; i < n + 3; i++) A.push(new Array(n + 3).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) { const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1]; A[i][j] = U(dx * dx + dy * dy) + (i === j ? lambda || 0 : 0); }
    A[i][n] = A[n][i] = 1; A[i][n + 1] = A[n + 1][i] = P[i][0]; A[i][n + 2] = A[n + 2][i] = P[i][1];
  }
  const wx = solve(A, to.map(p => p[0] / S).concat([0, 0, 0])), wy = solve(A, to.map(p => p[1] / S).concat([0, 0, 0]));
  return (x, y) => {
    x /= S; y /= S;
    let u = wx[n] + wx[n + 1] * x + wx[n + 2] * y, v = wy[n] + wy[n + 1] * x + wy[n + 2] * y;
    for (let i = 0; i < n; i++) { const dx = x - P[i][0], dy = y - P[i][1], k = U(dx * dx + dy * dy); u += wx[i] * k; v += wy[i] * k; }
    return [u * S, v * S];
  };
}
// smallest local area ratio of the warp over a box (<= 0 means it folds)
function foldCheck(warp, box) {
  let worst = Infinity; const h = 2;
  for (let x = box[0]; x <= box[2]; x += 20) for (let y = box[1]; y <= box[3]; y += 20) {
    const a = warp(x, y), b = warp(x + h, y), c = warp(x, y + h);
    const det = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / (h * h);
    worst = Math.min(worst, det);
  }
  return worst;
}

// ---------------------------------------------------------------- geometry -> board path
// stream geometry through projection (+ clip) and the warp, collecting rings / lines in board units
function collect(proj, warp, geo) {
  const rings = []; let cur = null;
  const ctx = {
    moveTo(x, y) { cur = [warp(x, y)]; rings.push(cur); },
    lineTo(x, y) { cur.push(warp(x, y)); },
    closePath() { if (cur) cur.closed = true; },
    arc() {}, rect() {},
  };
  d3.geoPath(proj, ctx)(geo);
  return rings;
}
function dp(pts, tol) { // Douglas-Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop(); const [ax, ay] = pts[i], [bx, by] = pts[j];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bd = tol;
    for (let k = i + 1; k < j; k++) { const d = Math.abs((pts[k][0] - ax) * dy - (pts[k][1] - ay) * dx) / L; if (d > bd) { bd = d; best = k; } }
    if (best >= 0) { keep[best] = 1; st.push([i, best], [best, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}
const area = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };
// compact SVG path: absolute start, relative steps, one decimal
// push a closed ring outwards by g board units (Switzerland's lakes: the routes run along their shores, so
// at true width the lakes hide under the track; the printed board widens them the same way)
function grow(r, g) {
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r = r.slice(0, -1);
  const s = area(r) > 0 ? 1 : -1, n = r.length;
  return r.map((p, i) => {
    const a = r[(i - 1 + n) % n], b = r[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [e1[1] / l1 * s, -e1[0] / l1 * s], n2 = [e2[1] / l2 * s, -e2[0] / l2 * s];
    let nx = n1[0] + n2[0], ny = n1[1] + n2[1]; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    const k = Math.min(2, 1 / Math.max(0.5, nx * n1[0] + ny * n1[1]));
    return [p[0] + nx * g * k, p[1] + ny * g * k];
  });
}
function toPath(rings, { tol, minArea, closed, widen }) {
  let d = '';
  const f = v => { const s = (Math.round(v * 10) / 10).toString(); return s.replace(/^(-?)0\./, '$1.'); };
  for (let r of rings) {
    if (closed && Math.abs(area(r)) < minArea) continue;
    if (r.length > 3) {
      // a ring that ends where it starts has no base line: split it at the point farthest from the start first
      let m = 0, md = -1;
      for (let k = 1; k < r.length; k++) { const d = Math.hypot(r[k][0] - r[0][0], r[k][1] - r[0][1]); if (d > md) { md = d; m = k; } }
      r = dp(r.slice(0, m + 1), tol).concat(dp(r.slice(m), tol).slice(1));
    } else r = dp(r, tol);
    if (widen && r.length > 3) r = grow(r, widen);
    if (r.length < (closed ? 3 : 2)) continue;
    let px = Math.round(r[0][0] * 10) / 10, py = Math.round(r[0][1] * 10) / 10;
    const start = 'M' + f(px) + ' ' + f(py) + 'l';
    let steps = '', n = 0;
    for (let k = 1; k < r.length; k++) {
      const x = Math.round(r[k][0] * 10) / 10, y = Math.round(r[k][1] * 10) / 10, dx = x - px, dy = y - py;
      if (!dx && !dy) continue;
      steps += (n ? ' ' : '') + f(dx) + ' ' + f(dy);
      n++; px = x; py = y;
    }
    if (n < (closed ? 2 : 1)) continue;
    d += start + steps + (closed ? 'z' : '');
  }
  return d.replace(/ -/g, '-');
}

// ---------------------------------------------------------------- per map
const ATLAS = {
  land50: () => require('world-atlas/land-50m.json'), land10: () => require('world-atlas/land-10m.json'),
  c50: () => require('world-atlas/countries-50m.json'), c10: () => require('world-atlas/countries-10m.json'),
  states: () => require('us-atlas/states-10m.json'),
};

// cfg.proj: {lat0, lon0, parallels}; cfg.art: {res: '50'|'10', states, home: 'Switzerland', margin}
async function build(cfg, home, final, opts) {
  const proj = opts.proj;
  const art = cfg.art || {};
  const res = art.res || '50';
  // the drawn area: the cities' box plus a wide margin, so no edge shows when zoomed out on a tall or wide screen
  const xs = home.map(p => p[0]), ys = home.map(p => p[1]);
  const W = Math.max(...xs) - Math.min(...xs), H = Math.max(...ys) - Math.min(...ys), M = (art.margin || 0.6) * Math.max(W, H);
  const box = [Math.min(...xs) - M, Math.min(...ys) - M, Math.max(...xs) + M, Math.max(...ys) + M];
  proj.clipExtent([[box[0], box[1]], [box[2], box[3]]]);
  let warp = tps(home, final, 0);
  const fold = foldCheck(warp, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  const tol = art.tol || 0.55, minArea = art.minArea || 6;
  const land = topo.feature(ATLAS['land' + res](), ATLAS['land' + res]().objects.land);
  const ctry = ATLAS['c' + res]();
  const out = {};
  const landRings = collect(proj, warp, land);
  out.land = toPath(landRings, { tol, minArea, closed: true });
  // lakes big enough to see on the board
  // (Switzerland adds Natural Earth's detailed Europe lakes: Neuchâtel, Zürich, Luzern, Thun, Brienz...)
  const lakes = { features: [] };
  for (const src of [res === '10' ? 'ne_10m_lakes' : 'ne_50m_lakes'].concat(art.moreLakes || [])) lakes.features.push(...(await fetchOnce(src)).features);
  const lakeRings = [];
  for (const f of lakes.features) {
    if ((f.properties.scalerank || 0) > (art.lakeRank != null ? art.lakeRank : 9)) continue;
    const rings = collect(proj, warp, f);
    for (const r of rings) if (Math.abs(area(r)) >= (art.lakeArea || 25)) lakeRings.push(r);
  }
  out.lakes = toPath(lakeRings, { tol, minArea: art.lakeArea || 25, closed: true, widen: art.lakeGrow || 0 });
  // country borders (land borders only), faint
  out.borders = toPath(collect(proj, warp, topo.mesh(ctry, ctry.objects.countries, (a, b) => a !== b)), { tol, closed: false });
  if (art.states) {
    const st = ATLAS.states();
    out.states = toPath(collect(proj, warp, topo.mesh(st, st.objects.states, (a, b) => a !== b)), { tol: tol * 1.4, closed: false });
  }
  if (art.home) {
    const f = topo.feature(ctry, ctry.objects.countries).features.find(f => f.properties.name === art.home);
    out.home = toPath(collect(proj, warp, f), { tol, minArea, closed: true });
  }
  // check: is every city on land (not in the sea, not in a lake)? reported by build-maps.js
  const landGeo = land, lakeGeo = { type: 'FeatureCollection', features: lakes.features };
  const wet = opts.lonlats.map((ll, i) => (!d3.geoContains(landGeo, ll) || lakeGeo.features.some(f => d3.geoContains(f, ll))) ? opts.keys[i] : null).filter(Boolean);
  return { art: out, fold, wet, warp };
}

module.exports = { projection, fitCities, tps, build };
