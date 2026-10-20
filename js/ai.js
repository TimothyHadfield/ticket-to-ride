// Computer players. Each level looks only at view(state, seat) — what a human in that seat could see.
// choose(view, seat, level, rand) -> action (with a short `why` for the hint button). Levels: 'easy', 'medium', 'hard'.
// Strength is measured by tools/strength.js (results in data/strength.json).
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const G = isNode ? require('./graph.js') : root.TTRGraph;
  const T = isNode ? require('./engine.js') : root.TTR;
  const { COLORS, LOCO } = T;
  const NC = COLORS.length;
  const CI = Object.fromEntries(COLORS.map((c, i) => [c, i]));

  // ---------------------------------------------------------------- per-map data, built once
  const compiled = new WeakMap();
  function compile(map) {
    let m = compiled.get(map);
    if (m) return m;
    const ix = G.index(map);
    const N = ix.cityIds.length, R = map.routes.length;
    const ra = new Int32Array(R), rb = new Int32Array(R), len = new Int32Array(R), col = new Int8Array(R);
    const locos = new Int32Array(R), tunnel = new Uint8Array(R), twin = new Int32Array(R).fill(-1);
    const idOf = [], idxOf = {};
    map.routes.forEach((r, i) => { idOf.push(r.id); idxOf[r.id] = i; });
    map.routes.forEach((r, i) => {
      ra[i] = ix.cityIdx[r.a]; rb[i] = ix.cityIdx[r.b]; len[i] = r.len;
      col[i] = r.color === 'gray' ? -1 : CI[r.color];
      locos[i] = r.locos || 0; tunnel[i] = r.kind === 'tunnel' ? 1 : 0;
      if (r.twin && idxOf[r.twin] != null) twin[i] = idxOf[r.twin];
    });
    const adjR = Array.from({ length: N }, () => []), adjV = Array.from({ length: N }, () => []);
    for (let i = 0; i < R; i++) { adjR[ra[i]].push(i); adjV[ra[i]].push(rb[i]); adjR[rb[i]].push(i); adjV[rb[i]].push(ra[i]); }
    const pts = new Float64Array(R);
    for (let i = 0; i < R; i++) pts[i] = T.routePoints(map, len[i]);
    m = {
      map, ix, N, R, ra, rb, len, col, locos, tunnel, twin, idOf, idxOf, pts,
      adjR: adjR.map(a => Int32Array.from(a)), adjV: adjV.map(a => Int32Array.from(a)),
      dist: new Float64Array(N), prev: new Int32Array(N), done: new Uint8Array(N), path: [],
      decks: {},
    };
    compiled.set(map, m);
    return m;
  }

  // Ticket deck data per deck: city indices, and how busy each route is (tickets whose shortest path uses it).
  function deckData(m, deckId) {
    if (m.decks[deckId]) return m.decks[deckId];
    const d0 = m.map.ticketDecks.find(x => x.id === deckId) || m.map.ticketDecks[0];
    const d = { tickets: T.plainTickets ? T.plainTickets(m.map, d0.id) : d0.tickets }; // country tickets -> one city pair
    const ta = d.tickets.map(t => m.ix.cityIdx[t.a]), tb = d.tickets.map(t => m.ix.cityIdx[t.b]);
    const heat = new Float64Array(m.R);
    const cost = Float64Array.from(m.len);
    d.tickets.forEach((t, k) => { if (dijkstra(m, cost, ta[k], tb[k]) >= 0) for (const r of m.path) heat[r]++; });
    let maxHeat = 1; for (let i = 0; i < m.R; i++) if (heat[i] > maxHeat) maxHeat = heat[i];
    const avgPts = d.tickets.filter(t => !t.long).reduce((a, t) => a + t.pts, 0) / Math.max(1, d.tickets.filter(t => !t.long).length);
    return (m.decks[deckId] = { tickets: d.tickets, ta, tb, heat, maxHeat, avgPts });
  }

  // Dijkstra over route costs (Infinity = can't use). Returns the distance (or -1) and leaves the route path in m.path.
  function dijkstra(m, cost, s, t) {
    const { N, dist, prev, done, adjR, adjV } = m;
    dist.fill(Infinity); done.fill(0);
    dist[s] = 0; prev[s] = -1;
    m.path.length = 0;
    if (s === t) return 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) return -1;
      if (u === t) break;
      done[u] = 1;
      const rs = adjR[u], vs = adjV[u];
      for (let k = 0; k < rs.length; k++) {
        const c = cost[rs[k]];
        if (c === Infinity) continue;
        const v = vs[k], nd = best + c;
        if (nd < dist[v] - 1e-9) { dist[v] = nd; prev[v] = rs[k]; }
      }
    }
    let cur = t;
    while (cur !== s) { const r = prev[cur]; m.path.push(r); cur = m.ra[r] === cur ? m.rb[r] : m.ra[r]; }
    return dist[t];
  }

  // ---------------------------------------------------------------- what this seat knows
  function ctx(v, seat, level) {
    const map = T.mapOf(v), m = compile(map), dk = deckData(m, v.deckId);
    const me = v.players[seat], R = T.rules(v);
    const bothDoubles = R.bothDoubles;
    const owner = new Int8Array(m.R).fill(-1);
    for (const id in v.owner) { const i = m.idxOf[id]; if (i != null) owner[i] = v.owner[id]; }
    const stationCity = new Uint8Array(m.N);
    for (const city of me.stationCities || []) stationCity[m.ix.cityIdx[city]] = 1;
    const hand = me.hand;
    const handC = new Int32Array(NC); let maxColor = 0;
    for (let k = 0; k < NC; k++) { handC[k] = hand[COLORS[k]] || 0; if (handC[k] > maxColor) maxColor = handC[k]; }
    const locoN = hand.loco || 0;
    // cost[r]: 0 = already mine (or borrowable through my station), Infinity = can't be used, else trains (+ a little for awkward routes)
    const cost = new Float64Array(m.R);
    const open = new Uint8Array(m.R); // claimable in principle (free, fits my trains)
    const handAware = on(level, 'cost');
    for (let i = 0; i < m.R; i++) {
      const o = owner[i], tw = m.twin[i];
      if (o === seat || (tw >= 0 && owner[tw] === seat)) { cost[i] = 0; continue; }
      if (o >= 0) { cost[i] = (stationCity[m.ra[i]] || stationCity[m.rb[i]]) ? 0 : Infinity; continue; }
      if (tw >= 0 && owner[tw] >= 0 && !bothDoubles) { cost[i] = Infinity; continue; }
      if (m.len[i] > me.trains) { cost[i] = Infinity; continue; }
      open[i] = 1;
      let c = m.len[i] + (m.tunnel[i] ? 0.5 : 0) + m.locos[i] * 0.5;
      if (handAware) { // routes my cards already cover are a little cheaper (fewer turns drawing)
        const have = m.col[i] < 0 ? maxColor : handC[m.col[i]];
        c -= HARD.handBias * Math.min(have, m.len[i]);
        c += HARD.routeTurn - HARD.longBias * (m.pts[i] - m.len[i]);
      }
      cost[i] = c;
    }
    // completed tickets (union-find on my routes)
    const uf = new Int32Array(m.N); for (let i = 0; i < m.N; i++) uf[i] = i;
    const find = x => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
    for (const id of me.routes) { const i = m.idxOf[id]; uf[find(m.ra[i])] = find(m.rb[i]); }
    const open_t = [], done_t = [];
    for (const t of me.tickets) (find(dk.ta[t]) === find(dk.tb[t]) ? done_t : open_t).push(t);
    const c = { v, seat, level, map, m, dk, me, R, owner, cost, open, handC, locoN, maxColor, find, openT: open_t, doneT: done_t, ix: m.ix, tickets: dk.tickets };
    c.turnsLeft = turnsLeft(c);
    return c;
  }

  // My own turns left before the game ends (estimate from how fast each player is spending trains).
  function turnsLeft(c) {
    const v = c.v, n = v.players.length;
    if (v.lastRound != null) return 1;
    const taken = Math.max(0, (v.turnNo || 1) - 1) / n;
    let best = Infinity;
    for (const p of v.players) {
      const used = c.map.trains - p.trains;
      const rate = (used + 6) / (taken + 5); // prior: about 1.2 trains per turn
      best = Math.min(best, Math.max(0, p.trains - 2) / Math.max(0.6, rate));
    }
    return best + 1;
  }

  // Greedy Steiner plan joining the given tickets, re-using routes already chosen.
  // Returns {routes:[route idx to build], trains, failed:[ticket ids], serve: Map(route idx -> ticket id)}.
  function plan(c, tix) {
    const m = c.m, dk = c.dk;
    const work = Float64Array.from(c.cost);
    const order = tix.slice().sort((x, y) => dk.tickets[y].pts - dk.tickets[x].pts);
    const routes = [], failed = [], serve = new Map();
    let trains = 0;
    for (const t of order) {
      if (dijkstra(m, work, dk.ta[t], dk.tb[t]) < 0) { failed.push(t); continue; }
      for (const r of m.path) {
        if (work[r] === 0) continue;
        work[r] = 0; if (m.twin[r] >= 0) work[m.twin[r]] = 0;
        routes.push(r); trains += m.len[r]; serve.set(r, t);
      }
    }
    return { routes, trains, failed, serve };
  }

  // Cards still to collect for a set of routes, per colour (gray routes take the colour I hold most of).
  function cardNeed(c, routes, handC, locoN) {
    const m = c.m;
    handC = handC || c.handC; locoN = locoN == null ? c.locoN : locoN;
    const need = new Float64Array(NC); let gray = [], ferry = 0, total = 0;
    for (const r of routes) {
      total += m.len[r]; ferry += m.locos[r];
      if (m.col[r] < 0) gray.push(r); else need[m.col[r]] += m.len[r] - m.locos[r];
    }
    const spare = Array.from(handC, (h, k) => h - need[k]);
    const grayCol = new Map();
    gray.sort((a, b) => m.len[b] - m.len[a]);
    for (const r of gray) {
      let k = 0; for (let j = 1; j < NC; j++) if (spare[j] > spare[k]) k = j;
      need[k] += m.len[r] - m.locos[r]; spare[k] -= m.len[r] - m.locos[r]; grayCol.set(r, k);
    }
    const deficit = new Float64Array(NC); let short = 0;
    for (let k = 0; k < NC; k++) { deficit[k] = Math.max(0, need[k] - handC[k]); short += deficit[k]; }
    const locoShort = Math.max(0, ferry - locoN);
    const spareLocos = Math.max(0, locoN - ferry);
    short = Math.max(0, short - spareLocos) + locoShort;
    return { need, deficit, short, ferry, total, grayCol, locoShort };
  }

  // Chance of finishing a plan in time: turns needed (draw 2 cards a turn, 1 turn per claim) vs turns left.
  function finishOdds(c, p, turns, sigma) {
    if (p.trains > c.me.trains) return 0.02;
    const cn = cardNeed(c, p.routes);
    const need = cn.short / 1.8 + p.routes.length;
    return 1 / (1 + Math.exp(-(turns - need - HARD.margin) / sigma));
  }

  // ---------------------------------------------------------------- ticket choice
  function chooseTickets(c, level, rand) {
    const pend = c.me.pending.tickets, min = Math.min(c.me.pending.min, pend.length);
    const tk = c.tickets;
    if (level === 'easy') {
      // keep the minimum, picking the cheapest-looking ones (with a coin flip)
      const scored = pend.map(t => { const d = dijkstra(c.m, c.cost, c.dk.ta[t], c.dk.tb[t]); return { t, cost: (d < 0 ? 99 : d) + rand() * 4 }; });
      scored.sort((a, b) => a.cost - b.cost);
      return { keep: scored.slice(0, min).map(x => x.t), why: 'looked closest' };
    }
    const n = pend.length;
    let best = null;
    // medium and hard: expected points — each ticket counts +pts if the plan finishes in time, -pts if not;
    // the plan's routes score their own points; trains spent cost what they could earn elsewhere.
    const turns = c.turnsLeft;
    const P = HARD;
    for (let mask = 1; mask < (1 << n); mask++) {
      const keep = pend.filter((_, i) => mask & (1 << i));
      if (keep.length < min) continue;
      const all = c.openT.concat(keep);
      const p = plan(c, all);
      const odds = finishOdds(c, p, turns, P.sigma);
      let tpts = 0; for (const t of all) if (!p.failed.includes(t)) tpts += tk[t].pts;
      let fpts = 0; for (const t of p.failed) fpts += tk[t].pts;
      let rpts = 0; for (const r of p.routes) rpts += c.m.pts[r];
      let score = tpts * (2 * odds - 1) - fpts + odds * rpts - P.trainCost * p.trains;
      if (c.R.globetrotter) score += odds * (all.length - p.failed.length) * P.globe;
      if (!best || score > best.score) best = { score, keep, odds };
    }
    const why = best.keep.length > min ? 'these fit together' : (best.odds > 0.6 ? 'easiest to finish' : 'least risky');
    return { keep: best.keep, why };
  }

  // Hard's knobs, tuned by self-play against Medium on all four maps (tools/strength.js --hard={...}).
  // off: names of hard-only features to switch off ('tickets','rank','draw','points','cost','tunnelWait','final').
  // margin/sigma: spare turns wanted / spread in the ticket finishing odds; trainCost: points a train could earn elsewhere;
  // routeTurn/longBias/handBias: plan prefers fewer, longer routes and colours already in hand;
  // ticketTurns/ticketTrains: when to draw more tickets; finalTurns: when to start cashing cards in; r*: claim order weights.
  const on = (level, f) => level === 'hard' && !HARD.off.includes(f);
  const HARD = { off: [], sigma: 3, trainCost: 1.5, globe: 1.5, ticketTurns: 11, ticketTrains: 14, handBias: 0.1, routeTurn: 1, longBias: 0.25, margin: 5, finalTurns: 2.5, drawLoco: 0,
    rLen: 2, rUrg: 0, rRiv: 2.5, rHeat: 4, rTwin: 1.5 };

  // ---------------------------------------------------------------- main decision
  function choose(v, seat, level, rand) {
    rand = rand || Math.random;
    level = level === 'easy' || level === 'hard' ? level : 'medium';
    const legal = legalIn(v, seat);
    if (!legal.length) return null;
    const c = ctx(v, seat, level);
    const tk = c.tickets, cn = id => c.ix.cityById[id].name;
    const tname = t => cn(tk[t].a) + '–' + cn(tk[t].b);
    const rname = r => cn(c.m.map.routes[r].a) + '–' + cn(c.m.map.routes[r].b);
    c.tname = tname; c.rname = rname;

    if (legal.includes('keepTickets')) { const k = chooseTickets(c, level, rand); return { type: 'keepTickets', seat, keep: k.keep, why: k.why }; }
    if (legal.includes('tunnelPay')) return tunnelPay(c, level, rand);

    const p = plan(c, c.openT);
    const need = cardNeed(c, p.routes);
    c.plan = p; c.need = need;
    const endgame = v.lastRound != null;

    if (legal.length === 1 && legal[0] === 'draw') return drawCard(c, level, rand, true);

    // last turn: the move worth most points right now (route points + any ticket it finishes)
    if (endgame && on(level, 'final')) {
      const fin = bestFinalClaim(c);
      if (fin) return fin;
    }

    // 1. claim a route on the plan
    let ready = p.routes.filter(r => claimable(c, r));
    if (on(level, 'tunnelWait') && !endgame && c.turnsLeft > 3) {
      // a tunnel without a spare card risks the turn: wait for a spare unless it's urgent
      ready = ready.filter(r => !c.m.tunnel[r] || spareFor(c, r) >= 1 || urgency(c, r) > 6);
    }
    if (ready.length && !(level === 'easy' && rand() < 0.25)) {
      let pick = ready[0], top = -Infinity;
      for (const r of ready) { const s = claimRank(c, r, level); if (s > top) { top = s; pick = r; } }
      const pay = bestPay(c, pick);
      if (pay) return { type: 'claim', seat, route: c.m.idOf[pick], pay, why: claimWhy(c, pick, level) };
    }

    // 2. station when a ticket is cut off (Europe)
    if (legal.includes('station') && level !== 'easy' && p.failed.length) {
      const st = stationMove(c, level);
      if (st) return st;
    }

    // 3. all tickets done or impossible: more tickets, or points
    if (p.routes.length === 0) {
      if (on(level, 'points')) {
        const minTrains = Math.min(...v.players.map(q => q.trains));
        if (legal.includes('drawTickets') && !endgame && c.turnsLeft >= HARD.ticketTurns && c.me.trains >= HARD.ticketTrains && minTrains > 8)
          return { type: 'drawTickets', seat, why: 'tickets done and time left: more tickets' };
        const pm = pointsMove(c, rand);
        if (pm) return pm;
      } else {
        const minTrains = Math.min(...v.players.map(q => q.trains));
        if (level !== 'easy' && legal.includes('drawTickets') && !endgame && c.me.trains >= 18 && minTrains > 8)
          return { type: 'drawTickets', seat, why: 'tickets done: more tickets' };
        const pts = bestPointsClaim(c, 3);
        if (pts) return pts;
      }
    }

    // 4. near the end: dump cards into any points
    const minTrains = Math.min(...v.players.map(q => q.trains));
    if (endgame || (level !== 'easy' && !on(level, 'final') && minTrains <= 4) || (on(level, 'final') && c.turnsLeft <= HARD.finalTurns)) {
      const pts = on(level, 'final') ? bestFinalClaim(c) : bestPointsClaim(c, 1);
      if (pts) return pts;
    }

    // 5. draw cards
    if (legal.includes('draw')) return drawCard(c, level, rand, false);
    if (legal.includes('drawTickets')) return { type: 'drawTickets', seat, why: 'nothing else to do' };
    const any = bestPointsClaim(c, 1);
    if (any) return any;
    return { type: 'pass', seat, why: 'nothing left to do' };
  }

  // T.legal() reads trainDeck/ticketDeck as arrays, but a view holds only their sizes (numbers):
  // on a view it would never offer 'drawTickets'. Give it array-like sizes instead.
  function legalIn(v, seat) {
    if (typeof v.ticketDeck !== 'number' && typeof v.trainDeck !== 'number') return T.legal(v, seat);
    const sz = x => (typeof x === 'number' ? { length: x } : x);
    return T.legal(Object.assign({}, v, { trainDeck: sz(v.trainDeck), ticketDeck: sz(v.ticketDeck) }), seat);
  }

  function claimable(c, r) { return c.open[r] && T.canClaim(c.v, c.seat, c.m.idOf[r]) === null; }

  // cards left over after paying for a tunnel (to cover the extra cards it may ask for)
  function spareFor(c, r) {
    const m = c.m, L = m.len[r];
    const best = m.col[r] < 0 ? c.maxColor : c.handC[m.col[r]];
    return best + c.locoN - L;
  }

  // How bad it would be to lose this route: extra trains for the detour (10 = no way round), more if rivals are near.
  function urgency(c, r) {
    const m = c.m;
    const cost = Float64Array.from(c.cost); cost[r] = Infinity; if (m.twin[r] >= 0) cost[m.twin[r]] = Infinity;
    const d = dijkstra(m, cost, m.ra[r], m.rb[r]);
    return d < 0 ? 10 : Math.min(10, d - m.len[r]);
  }
  function rivalsNear(c, r) {
    // rivals with a route touching either end of this one
    const m = c.m, seen = new Set();
    for (const end of [m.ra[r], m.rb[r]]) for (const x of m.adjR[end]) { const o = c.owner[x]; if (o >= 0 && o !== c.seat) seen.add(o); }
    return seen.size;
  }

  function claimRank(c, r, level) {
    const m = c.m;
    if (!on(level, 'rank')) return m.len[r] * 2;
    const P = HARD, twinClose = m.twin[r] >= 0 && !c.R.bothDoubles ? 1 : 0;
    return m.len[r] * P.rLen + (P.rUrg ? urgency(c, r) * P.rUrg : 0) + rivalsNear(c, r) * P.rRiv + (c.dk.heat[r] / c.dk.maxHeat) * P.rHeat + twinClose * P.rTwin;
  }

  function claimWhy(c, r, level) {
    const t = c.plan.serve.get(r);
    if (t != null) {
      // does this claim alone join the ticket's two cities?
      const m = c.m, a = c.find(m.ra[r]), b = c.find(m.rb[r]), x = c.find(c.dk.ta[t]), y = c.find(c.dk.tb[t]);
      if ((x === a && y === b) || (x === b && y === a)) return 'finishes ' + c.tname(t);
      if (level === 'hard' && (rivalsNear(c, r) || urgency(c, r) >= 6)) return 'grab it before it’s blocked (for ' + c.tname(t) + ')';
      return 'on the way to ' + c.tname(t);
    }
    return 'on your route plan';
  }

  // best way to pay: fewest locomotives, then the colour least needed elsewhere, then the colour I have most of
  function bestPay(c, r) {
    const id = c.m.idOf[r];
    const opts = T.payOptions(c.v, c.seat, id);
    if (!opts.length) return null;
    const need = c.need ? c.need.need : null;
    const h = c.me.hand;
    const left = o => o.color ? (h[o.color] - o.n) - (need ? need[CI[o.color]] : 0) : 0;
    const used = o => o.n + o.locos + (o.any ? Object.values(o.any).reduce((x, y) => x + y, 0) : 0); // fewest cards first (card swaps cost more)
    opts.sort((a, b) => used(a) - used(b) || a.locos - b.locos || left(b) - left(a) || (h[b.color] || 0) - (h[a.color] || 0));
    const o = opts[0];
    return o.any ? { color: o.color, n: o.n, locos: o.locos, any: o.any } : { color: o.color, n: o.n, locos: o.locos };
  }

  function tunnelPay(c, level, rand) {
    const t = c.v.pendingTunnel, h = c.me.hand, seat = c.seat;
    const colorLeft = t.color ? h[t.color] - t.n : 0, locoLeft = h.loco - t.locos;
    if (t.color && colorLeft + locoLeft >= t.extra) {
      const useColor = Math.min(colorLeft, t.extra);
      if (level === 'easy' && rand() < 0.3) return { type: 'tunnelPay', seat, pay: false, why: 'too expensive' };
      return { type: 'tunnelPay', seat, pay: true, extraLocos: t.extra - useColor, why: 'worth the extra cards' };
    }
    if (!t.color && locoLeft >= t.extra) return { type: 'tunnelPay', seat, pay: true, extraLocos: t.extra, why: 'worth the extra cards' };
    return { type: 'tunnelPay', seat, pay: false, why: 'not enough cards' };
  }

  // Points for a claim right now: the route, plus every open ticket it finishes (+2×, since it no longer loses points).
  function claimValue(c, r) {
    const m = c.m;
    let val = m.pts[r];
    if (c.openT.length) {
      const a = c.find(m.ra[r]), b = c.find(m.rb[r]);
      if (a !== b) for (const t of c.openT) {
        const x = c.find(c.dk.ta[t]), y = c.find(c.dk.tb[t]);
        if ((x === a && y === b) || (x === b && y === a)) val += 2 * c.tickets[t].pts;
      }
    }
    return val;
  }
  function bestFinalClaim(c) {
    let best = -1, bv = 0;
    for (let r = 0; r < c.m.R; r++) {
      if (!claimable(c, r)) continue;
      const val = claimValue(c, r);
      if (val > bv) { bv = val; best = r; }
    }
    if (best < 0) return null;
    const pay = bestPay(c, best);
    if (!pay) return null;
    const fin = bv > c.m.pts[best];
    return { type: 'claim', seat: c.seat, route: c.m.idOf[best], pay, why: fin ? 'finishes a ticket before the end' : 'most points before the end' };
  }

  function bestPointsClaim(c, minLen) {
    let best = -1, bs = 0;
    for (let r = 0; r < c.m.R; r++) {
      if (c.m.len[r] < minLen || !claimable(c, r)) continue;
      if (c.m.pts[r] > bs) { bs = c.m.pts[r]; best = r; }
    }
    if (best < 0) return null;
    const pay = bestPay(c, best);
    return pay ? { type: 'claim', seat: c.seat, route: c.m.idOf[best], pay, why: c.m.len[best] >= 4 ? 'long route for points' : 'points before the end' } : null;
  }

  // Hard, all tickets done: aim at the route that earns most points per turn (long routes, cards I already hold),
  // a bit more if it lengthens my longest train; claim it when ready, otherwise draw toward it.
  function pointsMove(c, rand) {
    const m = c.m, me = c.me;
    const myCity = new Uint8Array(m.N);
    for (const id of me.routes) { const i = m.idxOf[id]; myCity[m.ra[i]] = 1; myCity[m.rb[i]] = 1; }
    let best = -1, bv = 0, bestReady = -1, brv = 0;
    for (let r = 0; r < m.R; r++) {
      if (!c.open[r]) continue;
      const L = m.len[r];
      if (L > me.trains) continue;
      const have = (m.col[r] < 0 ? c.maxColor : c.handC[m.col[r]]) + c.locoN;
      const short = Math.max(0, L - have) + Math.max(0, m.locos[r] - c.locoN);
      const turns = 1 + short / 1.8;
      if (turns > c.turnsLeft + 0.5) continue;
      let val = m.pts[r] + (c.R.longest && (myCity[m.ra[r]] || myCity[m.rb[r]]) ? L * 0.4 : 0);
      const rate = val / turns;
      if (rate > bv) { bv = rate; best = r; }
      if (short === 0 && claimable(c, r) && rate > brv) { brv = rate; bestReady = r; }
    }
    if (best < 0) return null;
    if (bestReady >= 0 && (bestReady === best || brv >= bv * 0.7 || c.turnsLeft <= 3)) {
      const pay = bestPay(c, bestReady);
      if (pay) return { type: 'claim', seat: c.seat, route: m.idOf[bestReady], pay, why: m.len[bestReady] >= 5 ? 'long route for points' : 'points while tickets are done' };
    }
    // draw toward the target route
    c.target = best;
    return null;
  }

  function stationMove(c, level) {
    const p = c.me, m = c.m;
    if (p.stations <= 0) return null;
    const cost = T.stationCost(c.v, c.seat);
    if (p.trains < 6 && cost > 2) return null;
    for (const t of c.plan.failed) {
      if (level === 'hard' && 2 * c.tickets[t].pts <= c.map.stationPoints + cost) continue;
      // cheapest path allowing rival routes almost free; build the station at a free end of the first rival route
      const w = Float64Array.from(c.cost);
      for (let r = 0; r < m.R; r++) if (c.owner[r] >= 0 && c.owner[r] !== c.seat) w[r] = 0.01;
      if (dijkstra(m, w, c.dk.ta[t], c.dk.tb[t]) < 0) continue;
      const rival = m.path.find(r => c.owner[r] >= 0 && c.owner[r] !== c.seat);
      if (rival == null) continue;
      const rr = c.map.routes[rival];
      const city = [rr.a, rr.b].find(x => c.v.stationAt[x] == null);
      if (!city) continue;
      // pay with the colour least needed by the plan
      const need = c.need.need;
      const col = COLORS.slice().sort((a, b) => (p.hand[b] - need[CI[b]]) - (p.hand[a] - need[CI[a]]))[0];
      const n = Math.min(p.hand[col], cost), locos = cost - n;
      if (locos > p.hand.loco) continue;
      return { type: 'station', seat: c.seat, city, pay: { color: n ? col : null, n, locos }, why: 'station to get round a blocked route (' + c.tname(t) + ')' };
    }
    return null;
  }

  function drawCard(c, level, rand, second) {
    const v = c.v, seat = c.seat, map = c.map;
    const deckLeft = v.trainDeck > 0 || v.discard.length > 0;
    const okUp = (card) => card && !(second && card === LOCO && !map.nordicLocos);
    if (level === 'easy') {
      const opts = v.faceUp.map((card, i) => ({ card, i })).filter(x => okUp(x.card));
      if (opts.length && rand() < 0.5) { const o = opts[Math.floor(rand() * opts.length)]; return { type: 'draw', seat, from: o.i, why: 'liked the look of it' }; }
      return deckLeft ? { type: 'draw', seat, from: 'deck', why: 'blind draw' } : (opts.length ? { type: 'draw', seat, from: opts[0].i, why: 'only cards left' } : { type: 'pass', seat, why: 'no cards left' });
    }
    if (on(level, 'draw')) { const a = hardDraw(c, second); if (a) return a; }
    // demand per colour
    let want = new Float64Array(NC), locoWant = 0, forName = '';
    const need = c.need;
    if (c.target != null) {
      const r = c.target, m = c.m;
      if (m.col[r] >= 0) want[m.col[r]] = Math.max(0, m.len[r] - c.handC[m.col[r]]);
      else { let k = 0; for (let j = 1; j < NC; j++) if (c.handC[j] > c.handC[k]) k = j; want[k] = Math.max(0, m.len[r] - c.handC[k]); }
      locoWant = Math.max(0, m.locos[r] - c.locoN);
      forName = c.rname(r);
    } else {
      for (let k = 0; k < NC; k++) want[k] = need.deficit[k];
      locoWant = need.locoShort;
    }
    if (level === 'hard' && c.target == null && c.plan.routes.length) {
      // weight colours by the most urgent route on the plan
      let top = -1, tv = -1;
      for (const r of c.plan.routes) { const u = rivalsNear(c, r) * 3 + c.dk.heat[r] / c.dk.maxHeat * 3; if (u > tv) { tv = u; top = r; } }
      if (top >= 0) {
        const k = c.m.col[top] >= 0 ? c.m.col[top] : need.grayCol.get(top);
        if (k != null && want[k] > 0) want[k] += 2;
        forName = c.tname(c.plan.serve.get(top));
      } else forName = '';
    }
    let best = -1, bestScore = 0;
    v.faceUp.forEach((card, i) => {
      if (!okUp(card)) return;
      let sc;
      if (card === LOCO) {
        if (map.nordicLocos) sc = 1.2;
        else if (locoWant > 0) sc = 2.2;
        else if (level === 'hard') {
          // one wild card instead of two: worth it only when one card short of everything
          let short = 0; for (let k = 0; k < NC; k++) short += want[k];
          sc = short > 0 && short <= 1 ? 1.5 : 0.5;
        } else sc = 0.6;
      } else {
        const w = want[CI[card]];
        sc = w > 0 ? 1 + Math.min(w, 6) * 0.1 : 0;
      }
      if (sc > bestScore) { bestScore = sc; best = i; }
    });
    if (best >= 0 && (bestScore >= 1 || !deckLeft)) {
      const card = v.faceUp[best];
      return { type: 'draw', seat, from: best, why: (card === LOCO ? 'a locomotive fits anything' : 'need ' + card) + (forName ? ' for ' + forName : '') };
    }
    if (deckLeft) return { type: 'draw', seat, from: 'deck', why: 'no face-up card helps: draw blind' };
    const any = v.faceUp.findIndex(okUp);
    if (any >= 0) return { type: 'draw', seat, from: any, why: 'only cards left' };
    return { type: 'pass', seat, why: 'no cards left' };
  }

  // Hard: pick the card that most cuts the cards still missing for the plan (or the target route),
  // against what a blind draw is expected to give (deck odds from the cards I can't see).
  function hardDraw(c, second) {
    const v = c.v, map = c.map, m = c.m;
    const routes = c.target != null ? [c.target] : c.plan.routes;
    if (!routes.length) return null;
    const hc = Int32Array.from(c.handC);
    const base = cardNeed(c, routes, hc, c.locoN).short;
    if (base <= 0) return null;
    const red = new Float64Array(NC + 1);
    for (let k = 0; k < NC; k++) { hc[k]++; red[k] = base - cardNeed(c, routes, hc, c.locoN).short; hc[k]--; }
    red[NC] = base - cardNeed(c, routes, hc, c.locoN + 1).short;
    // unseen cards: the whole deck minus my hand, the face-up row and the discard pile
    const unseen = new Float64Array(NC + 1);
    for (let k = 0; k < NC; k++) unseen[k] = (map.deck.colors[COLORS[k]] || 0) - c.handC[k];
    unseen[NC] = map.deck.loco - c.locoN;
    const sub = card => { if (!card) return; const k = card === LOCO ? NC : CI[card]; unseen[k]--; };
    v.faceUp.forEach(sub); (v.discard || []).forEach(sub);
    let tot = 0; for (let k = 0; k <= NC; k++) { unseen[k] = Math.max(0, unseen[k]); tot += unseen[k]; }
    let blind = 0; if (tot > 0) for (let k = 0; k <= NC; k++) blind += unseen[k] / tot * red[k];
    const deckLeft = v.trainDeck > 0 || v.discard.length > 0;
    if (!deckLeft) blind = -1;
    let best = -1, bv = -Infinity, loco = -1;
    v.faceUp.forEach((card, i) => {
      if (!card) return;
      if (card === LOCO) { if (map.nordicLocos) { if (red[NC] > bv) { bv = red[NC]; best = i; } } else loco = i; return; }
      const val = red[CI[card]] + 0.01 * c.handC[CI[card]];
      if (val > bv) { bv = val; best = i; }
    });
    const forName = c.target != null ? c.rname(c.target) : '';
    const need = card => (card === LOCO ? 'a locomotive fits anything' : 'need ' + card) + (forName ? ' for ' + forName : '');
    // a face-up locomotive takes the whole turn: worth it when it beats a colour card plus a blind draw
    if (!second && loco >= 0 && (HARD.drawLoco || c.need.locoShort > 0) && red[NC] > Math.max(bv, blind) + Math.max(0, blind) + 0.15) return { type: 'draw', seat: c.seat, from: loco, why: need(LOCO) };
    if (best >= 0 && bv > 0 && bv >= blind) return { type: 'draw', seat: c.seat, from: best, why: need(v.faceUp[best]) };
    if (deckLeft) return { type: 'draw', seat: c.seat, from: 'deck', why: 'no face-up card helps: draw blind' };
    return null;
  }

  // Explain a suggested action in a few words (hint button). The action's `why` says the reason.
  function explain(v, seat, action) {
    const map = T.mapOf(v), ix = G.index(map);
    if (!action) return '';
    const cn = id => ix.cityById[id].name;
    switch (action.type) {
      case 'claim': { const r = ix.routeById[action.route]; return 'Claim ' + cn(r.a) + '–' + cn(r.b) + ' (' + r.len + ')'; }
      case 'draw': return action.from === 'deck' ? 'Draw from the deck' : 'Take the face-up ' + (v.faceUp[action.from] === LOCO ? 'locomotive' : v.faceUp[action.from]);
      case 'drawTickets': return 'Draw new tickets';
      case 'keepTickets': return 'Keep ' + action.keep.map(t => { const k = (T.plainTickets ? T.plainTickets(map, v) : T.deckFor(map, v).tickets)[t]; return cn(k.a) + '–' + cn(k.b); }).join(', ');
      case 'station': return 'Build a station in ' + cn(action.city);
      case 'tunnelPay': return action.pay ? 'Pay the extra cards' : 'Give up the tunnel';
      default: return 'Pass';
    }
  }

  // Legacy helpers kept for other callers: route heat by id, and a plan in the old {cost, routes:[ids], failed} shape.
  function heat(map, deckId) { const m = compile(map), d = deckData(m, deckId), h = {}; for (let i = 0; i < m.R; i++) if (d.heat[i]) h[m.idOf[i]] = d.heat[i]; return h; }
  function planFor(c, ticketIdxs) { const p = plan(c, ticketIdxs); return { cost: p.trains, routes: p.routes.map(r => c.m.idOf[r]), failed: p.failed }; }

  const api = { choose, explain, heat, chooseTickets: (c, level, rand) => chooseTickets(c, level, rand).keep, ctx, planFor, HARD };
  if (isNode) module.exports = api; else root.TTRAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
