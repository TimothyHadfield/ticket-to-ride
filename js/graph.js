// Graph helpers shared by the engine, the computers, the companion and the Route Lab.
// Pure functions; no DOM. Works in the browser (window.TTRGraph) and in node.
(function (root) {
  'use strict';
  const cache = new WeakMap();

  // Index a map once: city list, adjacency (pair-level and route-level).
  function index(map) {
    let ix = cache.get(map);
    if (ix) return ix;
    const cityIds = map.cities.map(c => c.id);
    const cityIdx = Object.fromEntries(cityIds.map((id, i) => [id, i]));
    const routeById = {};
    const adj = cityIds.map(() => []); // [{route, to}]
    map.routes.forEach(r => {
      routeById[r.id] = r;
      adj[cityIdx[r.a]].push({ r, to: r.b });
      adj[cityIdx[r.b]].push({ r, to: r.a });
    });
    const cityById = Object.fromEntries(map.cities.map(c => [c.id, c]));
    ix = { cityIds, cityIdx, routeById, adj, cityById };
    cache.set(map, ix);
    return ix;
  }

  // Dijkstra. costOf(route) -> number, or Infinity when the route can't be used.
  // Returns {dist, path:[routeIds]} or null when unreachable.
  function shortest(map, from, to, costOf) {
    const ix = index(map);
    const n = ix.cityIds.length;
    const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(null), done = new Array(n).fill(false);
    const s = ix.cityIdx[from], t = ix.cityIdx[to];
    dist[s] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === t) break;
      done[u] = true;
      for (const { r, to: v } of ix.adj[u]) {
        const c = costOf(r);
        if (!(c < Infinity)) continue;
        const vi = ix.cityIdx[v];
        if (dist[u] + c < dist[vi] - 1e-9) { dist[vi] = dist[u] + c; prev[vi] = r; }
      }
    }
    if (!(dist[t] < Infinity)) return null;
    const path = [];
    let cur = t;
    while (cur !== s) { const r = prev[cur]; path.push(r.id); cur = ix.cityIdx[r.a === ix.cityIds[cur] ? r.b : r.a]; }
    return { dist: dist[t], path: path.reverse() };
  }

  // All-pairs shortest train counts on the empty board (Floyd–Warshall on lengths).
  function allPairs(map, costOf) {
    const ix = index(map), n = ix.cityIds.length;
    const d = Array.from({ length: n }, (_, i) => { const row = new Array(n).fill(Infinity); row[i] = 0; return row; });
    map.routes.forEach(r => {
      const c = costOf ? costOf(r) : r.len;
      const a = ix.cityIdx[r.a], b = ix.cityIdx[r.b];
      if (c < d[a][b]) { d[a][b] = c; d[b][a] = c; }
    });
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) { const dik = d[i][k]; if (dik === Infinity) continue; for (let j = 0; j < n; j++) if (dik + d[k][j] < d[i][j]) d[i][j] = dik + d[k][j]; }
    return d;
  }

  // Are a and b joined using only the given route ids?
  function connected(map, routeIds, a, b) {
    if (a === b) return true;
    const ix = index(map);
    const nb = {};
    routeIds.forEach(id => { const r = ix.routeById[id]; (nb[r.a] = nb[r.a] || []).push(r.b); (nb[r.b] = nb[r.b] || []).push(r.a); });
    const seen = new Set([a]), stack = [a];
    while (stack.length) { const c = stack.pop(); for (const x of nb[c] || []) if (!seen.has(x)) { if (x === b) return true; seen.add(x); stack.push(x); } }
    return false;
  }

  // Is any city in list `as` joined to any city in list `bs` using only the given route ids?
  function connectedAny(map, routeIds, as, bs) {
    const goal = new Set(bs);
    if (as.some(a => goal.has(a))) return true;
    const ix = index(map);
    const nb = {};
    routeIds.forEach(id => { const r = ix.routeById[id]; (nb[r.a] = nb[r.a] || []).push(r.b); (nb[r.b] = nb[r.b] || []).push(r.a); });
    const seen = new Set(as), stack = as.slice();
    while (stack.length) { const c = stack.pop(); for (const x of nb[c] || []) if (!seen.has(x)) { if (goal.has(x)) return true; seen.add(x); stack.push(x); } }
    return false;
  }

  // Longest continuous trail (no route used twice; cities may repeat) through the given routes.
  function longestTrail(map, routeIds) {
    const ix = index(map);
    const rs = routeIds.map(id => ix.routeById[id]);
    if (!rs.length) return { len: 0, path: [] };
    const nb = {};
    rs.forEach((r, i) => { (nb[r.a] = nb[r.a] || []).push(i); (nb[r.b] = nb[r.b] || []).push(i); });
    const used = new Array(rs.length).fill(false);
    let best = 0, bestPath = [];
    const cur = [];
    function dfs(city, len) {
      let ext = false;
      for (const i of nb[city]) {
        if (used[i]) continue;
        ext = true; used[i] = true; cur.push(rs[i].id);
        dfs(rs[i].a === city ? rs[i].b : rs[i].a, len + rs[i].len);
        cur.pop(); used[i] = false;
      }
      if (!ext && len > best) { best = len; bestPath = cur.slice(); }
    }
    Object.keys(nb).forEach(c => dfs(c, 0));
    return { len: best, path: bestPath };
  }

  // Number of route-disjoint paths between a and b (max-flow, unit capacity per route), capped at cap.
  function disjointPaths(map, routeIds, a, b, cap) {
    cap = cap || 2;
    const ix = index(map);
    // undirected unit edges -> residual graph with two arcs per route
    const arcs = []; const out = {};
    const addArc = (u, v) => { arcs.push({ u, v, f: 0, cap: 1 }); (out[u] = out[u] || []).push(arcs.length - 1); };
    routeIds.forEach(id => { const r = ix.routeById[id]; addArc(r.a, r.b); addArc(r.b, r.a); });
    let flow = 0;
    while (flow < cap) {
      const prev = { [a]: -1 }; const q = [a];
      while (q.length && !(b in prev)) {
        const u = q.shift();
        for (const k of out[u] || []) {
          const e = arcs[k], rev = arcs[k ^ 1];
          // residual = cap - f + reverse flow cancellation
          const res = e.cap - e.f + rev.f;
          if (res > 0 && !(e.v in prev)) { prev[e.v] = k; q.push(e.v); }
        }
      }
      if (!(b in prev)) break;
      let v = b;
      while (v !== a) { const k = prev[v]; const e = arcs[k], rev = arcs[k ^ 1]; if (rev.f > 0) rev.f--; else e.f++; v = e.u; }
      flow++;
    }
    return flow;
  }

  // Greedy Steiner-style plan: connect every ticket using cheapest paths, re-using routes already chosen.
  // costOf(route) -> trains still needed (0 if mine, Infinity if blocked). Returns {cost, routes:[ids], failed:[ticketIdx]}.
  function plan(map, tickets, costOf) {
    const chosen = new Set();
    const pairChosen = new Set(); // a double route counts once
    let cost = 0; const failed = [];
    const order = tickets.map((t, i) => i).sort((x, y) => tickets[y].pts - tickets[x].pts);
    for (const i of order) {
      const t = tickets[i];
      const res = shortest(map, t.a, t.b, r => (chosen.has(r.id) || pairChosen.has(r.a + '|' + r.b)) ? 0 : costOf(r));
      if (!res) { failed.push(i); continue; }
      for (const id of res.path) {
        const r = index(map).routeById[id];
        if (!chosen.has(id) && !pairChosen.has(r.a + '|' + r.b)) { cost += costOf(r); chosen.add(id); pairChosen.add(r.a + '|' + r.b); }
      }
    }
    return { cost, routes: [...chosen], failed };
  }

  const api = { index, shortest, allPairs, connected, connectedAny, longestTrail, disjointPaths, plan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TTRGraph = api;
})(typeof window !== 'undefined' ? window : globalThis);
