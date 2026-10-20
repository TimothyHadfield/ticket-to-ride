// The numbers layer: ticket chances, keep/toss advice, route heat and detours.
// Pure functions, used by the Table companion, the Play hint panel and the Route Lab. Node-testable.
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const G = isNode ? require('./graph.js') : root.TTRGraph;

  // Trains placed per turn on average (45 trains over ~36 turns in measured computer games).
  const TRAINS_PER_TURN = 1.25;

  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // Shortest-path heat: for each route, the share of the deck's tickets whose cheapest path uses it.
  // When a pair has two equal-length paths, each gets half the credit.
  const heatCache = new Map();
  function heat(map, tickets) {
    const key = map.id + ':' + tickets.length + ':' + (tickets[0] ? tickets[0].a + tickets[0].b : '');
    if (heatCache.has(key)) return heatCache.get(key);
    const ix = G.index(map);
    const h = Object.fromEntries(map.routes.map(r => [r.id, 0]));
    for (const t of tickets) {
      const p1 = G.shortest(map, t.a, t.b, r => r.len);
      if (!p1) continue;
      // second path of equal length with the first path's pairs removed (catch ties)
      const used = new Set(p1.path.map(id => ix.routeById[id]).map(r => r.a + '|' + r.b));
      const p2 = G.shortest(map, t.a, t.b, r => used.has(r.a + '|' + r.b) ? r.len + 0.001 : r.len);
      const paths = p2 && Math.abs(p2.dist - p1.dist) < 0.01 && p2.path.join() !== p1.path.join() ? [p1.path, p2.path] : [p1.path];
      for (const path of paths) for (const id of path) {
        const r = ix.routeById[id];
        // credit both routes of a double
        h[id] += 1 / paths.length;
        if (r.twin) h[r.twin] += 1 / paths.length;
      }
    }
    const max = Math.max(...Object.values(h)) || 1;
    const out = { raw: h, norm: Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v / max])), tickets: tickets.length };
    heatCache.set(key, out);
    return out;
  }

  // Cost function for a seat on a board position.
  // pos: {owner:{routeId:seat}, me, bothDoubles, stationCities:[...] (cities where I have a station)}
  function costFn(map, pos, extraBlocked) {
    const ix = G.index(map), st = new Set(pos.stationCities || []);
    return r => {
      const o = pos.owner[r.id];
      if (o === pos.me) return 0;
      if (r.twin && pos.owner[r.twin] === pos.me) return 0;
      if (o != null) return (st.has(r.a) || st.has(r.b)) ? 0 : Infinity;
      if (extraBlocked && extraBlocked.has(r.id)) return Infinity;
      if (r.twin && pos.owner[r.twin] != null && !pos.bothDoubles) return Infinity;
      return r.len;
    };
  }

  // For each ticket: done?, trains still needed, cheapest path, and a chance of finishing.
  // pos adds: myTrains, rivalTrains:[...], myCards (optional), tickets:[{a,b,pts}], deckTickets (for heat), samples
  function ticketChances(map, pos) {
    const ix = G.index(map);
    const myRoutes = Object.keys(pos.owner).filter(id => pos.owner[id] === pos.me);
    const base = costFn(map, pos);
    const rivals = pos.rivalTrains || [];
    const minRival = rivals.length ? Math.min(...rivals) : pos.myTrains;
    // turns I still get: the game ends soon after anyone reaches 2 trains
    const turnsLeft = Math.max(1, Math.min(minRival, pos.myTrains) - 2) / TRAINS_PER_TURN + 1;
    const hm = heat(map, pos.deckTickets || pos.tickets).norm;
    const plan = G.plan(map, pos.tickets.filter(t => !G.connected(map, myRoutes, t.a, t.b)), base);
    const planTurns = turnsFor(plan.cost, plan.routes.filter(id => base(ix.routeById[id]) > 0).length, pos.myCards);
    const rand = rng(pos.seed || 7);
    const samples = pos.samples || 200;
    const res = pos.tickets.map(t => {
      const done = G.connected(map, myRoutes, t.a, t.b) || (pos.stationCities && pos.stationCities.length && G.shortest(map, t.a, t.b, base) && G.shortest(map, t.a, t.b, base).dist === 0);
      const sp = G.shortest(map, t.a, t.b, base);
      return { t, done: !!done, need: sp ? sp.dist : Infinity, path: sp ? sp.path : [], chance: done ? 1 : 0, ok: 0 };
    });
    const open = res.filter(x => !x.done && x.need <= pos.myTrains);
    if (open.length) {
      // pool of routes rivals might take, weighted by how busy they are
      const pool = map.routes.filter(r => base(r) > 0 && base(r) < Infinity);
      const budgetTurns = Math.min(planTurns, turnsLeft);
      const rivalTrainsDuring = rivals.reduce((a, rt) => a + Math.min(rt, budgetTurns * TRAINS_PER_TURN * 0.8), 0);
      for (let k = 0; k < samples; k++) {
        const taken = new Set();
        let budget = rivalTrainsDuring * (0.6 + rand() * 0.8);
        // weighted sampling without replacement
        const w = pool.map(r => 0.25 + hm[r.id] * 2);
        let wsum = w.reduce((a, b) => a + b, 0);
        while (budget > 0 && wsum > 0.01) {
          let x = rand() * wsum, i = 0;
          for (; i < pool.length; i++) { x -= w[i]; if (x <= 0) break; }
          if (i >= pool.length) i = pool.length - 1;
          const r = pool[i];
          if (w[i] > 0) {
            taken.add(r.id);
            if (r.twin && !pos.bothDoubles) taken.add(r.twin);
            budget -= r.len; wsum -= w[i]; w[i] = 0;
          }
        }
        const cost = costFn(map, pos, taken);
        const jitter = 0.8 + rand() * 0.4;
        for (const x of open) {
          const sp = G.shortest(map, x.t.a, x.t.b, cost);
          if (!sp || sp.dist > pos.myTrains) continue;
          const turns = turnsFor(sp.dist, sp.path.filter(id => cost(ix.routeById[id]) > 0).length, pos.myCards);
          if (turns <= turnsLeft * jitter) x.ok++;
        }
      }
      for (const x of open) x.chance = x.ok / samples;
    }
    res.forEach(x => { delete x.ok; });
    return { tickets: res, turnsLeft, plan: { cost: plan.cost, routes: plan.routes, turns: planTurns } };
  }

  // Turns to build `cost` trains in `claims` claims: two cards per draw turn plus one turn per claim.
  function turnsFor(cost, claims, cardsInHand) {
    const missing = Math.max(0, cost - (cardsInHand || 0) * 0.6);
    return Math.ceil(missing / 2) + claims;
  }

  // Keep/toss advice. drawn: [{a,b,pts}], min = how many must be kept.
  // Returns {rows:[{t, extra, chance, ev}], best:[indexes into drawn], options:[{keep, ev}]}
  function keepAdvice(map, pos, drawn, min) {
    const myRoutes = Object.keys(pos.owner).filter(id => pos.owner[id] === pos.me);
    const openNow = pos.tickets.filter(t => !G.connected(map, myRoutes, t.a, t.b));
    const base = costFn(map, pos);
    const basePlan = G.plan(map, openNow, base);
    const single = ticketChances(map, Object.assign({}, pos, { tickets: drawn }));
    const rows = drawn.map((t, i) => {
      const p = G.plan(map, openNow.concat([t]), base);
      return { t, extra: p.cost - basePlan.cost, chance: single.tickets[i].chance, done: single.tickets[i].done };
    });
    const options = [];
    const n = drawn.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      const keep = drawn.map((_, i) => i).filter(i => mask & (1 << i));
      if (keep.length < min) continue;
      const p = G.plan(map, openNow.concat(keep.map(i => drawn[i])), base);
      const fit = p.cost <= pos.myTrains ? 1 : Math.max(0, 1 - (p.cost - pos.myTrains) / 6);
      const turns = turnsFor(p.cost, p.routes.length, pos.myCards);
      const time = turns <= single.turnsLeft ? 1 : Math.max(0, 1 - (turns - single.turnsLeft) / 5);
      let ev = 0;
      for (const i of keep) {
        const pr = rows[i].done ? 1 : rows[i].chance * fit * time;
        ev += drawn[i].pts * (2 * pr - 1);
      }
      options.push({ keep, ev, cost: p.cost });
    }
    options.sort((a, b) => b.ev - a.ev);
    rows.forEach((r, i) => { const pr = r.done ? 1 : r.chance; r.ev = r.t.pts * (2 * pr - 1); });
    return { rows, best: options[0] ? options[0].keep : [], options, turnsLeft: single.turnsLeft };
  }

  // If a route is taken, how much longer does the cheapest path between its ends get?
  function detour(map, routeId, blocked) {
    const ix = G.index(map), r = ix.routeById[routeId];
    const gone = new Set(blocked || []); gone.add(r.id); if (r.twin) gone.add(r.twin);
    const sp = G.shortest(map, r.a, r.b, x => gone.has(x.id) ? Infinity : x.len);
    return sp ? { len: sp.dist, extra: sp.dist - r.len, path: sp.path } : null;
  }

  const api = { heat, ticketChances, keepAdvice, detour, costFn, turnsFor, TRAINS_PER_TURN };
  if (isNode) module.exports = api; else root.TTROdds = api;
})(typeof window !== 'undefined' ? window : globalThis);
