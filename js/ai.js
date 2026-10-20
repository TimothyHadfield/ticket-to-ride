// Computer players. Each level looks only at view(state, seat) — what a human in that seat could see.
// choose(view, seat, level, rand) -> action. Levels: 'easy', 'medium', 'hard'.
// Strength is measured by tools/sim.js (results in progress.md and the "How strong?" note).
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const G = isNode ? require('./graph.js') : root.TTRGraph;
  const T = isNode ? require('./engine.js') : root.TTR;
  const { COLORS, LOCO } = T;

  // ---------------------------------------------------------------- shared reasoning
  function ctx(v, seat) {
    const map = T.mapOf(v), ix = G.index(map), me = v.players[seat];
    const tickets = T.plainTickets ? T.plainTickets(map, v) : T.deckFor(map, v).tickets; // country tickets -> one city pair
    const R = T.rules(v);
    const blocked = r => T.routeOpen(v, r, seat) !== null && v.owner[r.id] !== seat;
    const mineIds = new Set(me.routes);
    // a rival route into a city where I have a station can be borrowed (optimistic: ignores the one-route limit)
    const stationCities = new Set(me.stationCities || []);
    const costOf = r => {
      if (mineIds.has(r.id)) return 0;
      if (r.twin && mineIds.has(r.twin)) return 0;
      if (v.owner[r.id] != null && v.owner[r.id] !== seat && (stationCities.has(r.a) || stationCities.has(r.b))) return 0;
      if (blocked(r)) return Infinity;
      return r.len + (r.kind === 'tunnel' ? 0.5 : 0) + (r.locos ? r.locos * 0.5 : 0);
    };
    const doneIds = me.tickets.filter(t => G.connected(map, me.routes, tickets[t].a, tickets[t].b));
    const open = me.tickets.filter(t => !doneIds.includes(t));
    return { v, seat, map, ix, me, tickets, R, costOf, blocked, open, doneIds };
  }

  function planFor(c, ticketIdxs) {
    return G.plan(c.map, ticketIdxs.map(t => c.tickets[t]), c.costOf);
  }

  // How much of each colour the routes still to build need (gray routes are filled later).
  function colourNeed(c, routeIds) {
    const need = Object.fromEntries(COLORS.map(k => [k, 0])); let gray = 0, ferryLocos = 0;
    for (const id of routeIds) {
      const r = c.ix.routeById[id];
      if (c.v.owner[id] != null) continue;
      if (r.color === 'gray') gray += r.len; else need[r.color] += r.len;
      ferryLocos += r.locos || 0;
    }
    return { need, gray, ferryLocos };
  }

  // best way to pay: fewest locomotives, then the colour least needed elsewhere
  function bestPay(c, routeId, plannedNeed) {
    const opts = T.payOptions(c.v, c.seat, routeId);
    if (!opts.length) return null;
    const r = c.ix.routeById[routeId];
    const used = o => o.n + o.locos + (o.any ? Object.values(o.any).reduce((x, y) => x + y, 0) : 0); // fewest cards first (card swaps cost more)
    opts.sort((a, b) => used(a) - used(b) || a.locos - b.locos || ((plannedNeed ? plannedNeed[a.color] || 0 : 0) - (plannedNeed ? plannedNeed[b.color] || 0 : 0)) || ((c.me.hand[b.color] || 0) - (c.me.hand[a.color] || 0)));
    // tunnels: keep a spare card of the colour if possible (prefer the colour with the most cards)
    if (r.kind === 'tunnel') opts.sort((a, b) => used(a) - used(b) || a.locos - b.locos || (c.me.hand[b.color] || 0) - (c.me.hand[a.color] || 0));
    return opts[0];
  }

  function claimable(c, routeId) { return T.canClaim(c.v, c.seat, routeId) === null; }

  // Contested-ness of each route: how many tickets in the whole deck have it on a shortest path.
  const heatCache = new Map();
  function heat(map, deckId) {
    const key = map.id + '/' + deckId;
    if (heatCache.has(key)) return heatCache.get(key);
    const deck = (map.ticketDecks.find(d => d.id === deckId) || map.ticketDecks[0]).tickets;
    const h = {};
    for (const t of deck) { const res = G.shortest(map, t.a, t.b, r => r.len); if (res) res.path.forEach(id => { h[id] = (h[id] || 0) + 1; }); }
    heatCache.set(key, h);
    return h;
  }

  // ---------------------------------------------------------------- ticket choice
  function chooseTickets(c, level, rand) {
    const pend = c.me.pending.tickets, min = Math.min(c.me.pending.min, pend.length);
    if (level === 'easy') {
      // keep the minimum, picking the cheapest-looking ones (with a coin flip)
      const scored = pend.map(t => ({ t, cost: (G.shortest(c.map, c.tickets[t].a, c.tickets[t].b, c.costOf) || { dist: 99 }).dist + rand() * 4 }));
      scored.sort((a, b) => a.cost - b.cost);
      return scored.slice(0, min).map(x => x.t);
    }
    const trains = c.me.trains;
    const base = planFor(c, c.open);
    const progress = 1 - trains / c.map.trains; // 0 at start
    let best = null;
    const n = pend.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      const keep = pend.filter((_, i) => mask & (1 << i));
      if (keep.length < min) continue;
      const p = planFor(c, c.open.concat(keep));
      const extra = p.cost - base.cost;
      const failed = p.failed.length;
      let value = 0;
      for (const t of keep) value += c.tickets[t].pts;
      // budget: leave room for the long routes and for card draws; harder players are bolder at the start
      const budget = trains * (level === 'hard' ? (progress < 0.1 ? 0.9 : 0.8) : 0.75);
      const over = Math.max(0, p.cost - budget);
      // estimated turns needed vs turns likely left
      let score = value - failed * 30 - over * (level === 'hard' ? 4 : 3) - extra * (level === 'hard' ? 0.35 : 0.5);
      if (p.cost > trains) score -= 40;
      if (!best || score > best.score) best = { score, keep };
    }
    return best.keep;
  }

  // ---------------------------------------------------------------- main decision
  function choose(v, seat, level, rand) {
    rand = rand || Math.random;
    level = level || 'medium';
    const c = ctx(v, seat);
    const legal = T.legal(v, seat);
    if (!legal.length) return null;

    if (legal.includes('keepTickets')) return { type: 'keepTickets', seat, keep: chooseTickets(c, level, rand) };

    if (legal.includes('tunnelPay')) {
      const t = v.pendingTunnel, h = c.me.hand;
      const colorLeft = t.color ? h[t.color] - t.n : 0, locoLeft = h.loco - t.locos;
      if (t.color && colorLeft + locoLeft >= t.extra) {
        const useColor = Math.min(colorLeft, t.extra);
        // easy players sometimes chicken out
        if (level === 'easy' && rand() < 0.3) return { type: 'tunnelPay', seat, pay: false };
        return { type: 'tunnelPay', seat, pay: true, extraLocos: t.extra - useColor };
      }
      if (!t.color && locoLeft >= t.extra) return { type: 'tunnelPay', seat, pay: true, extraLocos: t.extra };
      return { type: 'tunnelPay', seat, pay: false };
    }

    const plan = planFor(c, c.open);
    const planRoutes = plan.routes.filter(id => v.owner[id] == null);
    const need = colourNeed(c, planRoutes);
    const endgame = v.lastRound != null;
    const minTrains = Math.min(...v.players.map(p => p.trains));

    if (legal.length === 1 && legal[0] === 'draw') return drawCard(c, level, need, rand, true);

    // 1. claim a route on the plan
    const ready = planRoutes.filter(id => claimable(c, id));
    if (ready.length && !(level === 'easy' && rand() < 0.25)) {
      const H = heat(c.map, v.deckId);
      const rank = id => {
        const r = c.ix.routeById[id];
        let s = r.len * 2;
        if (level === 'hard') {
          s += (H[id] || 0) * 0.6; // busy routes go first
          if (r.twin && !c.R.bothDoubles) s += 3; // one claim closes the pair
          const alt = G.shortest(c.map, r.a, r.b, x => x.id === id || x.id === r.twin ? Infinity : c.costOf(x));
          s += alt ? Math.min(6, alt.dist - r.len) : 8; // no cheap detour: grab it now
        }
        return s;
      };
      ready.sort((a, b) => rank(b) - rank(a));
      // medium/hard: wait to grab a route if colours would be better kept for a longer one? keep simple: claim best now
      const id = ready[0];
      const pay = bestPay(c, id, need.need);
      if (pay) return { type: 'claim', seat, route: id, pay };
    }

    // 2. station when a ticket is cut off (Europe)
    if (legal.includes('station') && level !== 'easy' && plan.failed.length) {
      const st = stationMove(c);
      if (st) return st;
    }

    // 3. all tickets done or impossible: more tickets, or points
    const allDone = planRoutes.length === 0;
    if (allDone) {
      const ticketsOk = legal.includes('drawTickets') && !endgame && c.me.trains >= (level === 'hard' ? 14 : 18) && minTrains > 8;
      if (ticketsOk && !(level === 'easy')) return { type: 'drawTickets', seat };
      const pts = bestPointsClaim(c, level);
      if (pts) return pts;
    }

    // 4. endgame: dump cards into any points
    if (endgame || (level !== 'easy' && minTrains <= 4)) {
      const pts = bestPointsClaim(c, level, true);
      if (pts) return pts;
    }

    // 5. draw cards
    if (legal.includes('draw')) return drawCard(c, level, need, rand, false);
    if (legal.includes('drawTickets')) return { type: 'drawTickets', seat };
    const any = bestPointsClaim(c, level, true);
    if (any) return any;
    return { type: 'pass', seat };
  }

  function bestPointsClaim(c, level, anyLength) {
    let best = null;
    for (const r of c.map.routes) {
      if (!claimable(c, r.id)) continue;
      if (!anyLength && r.len < (level === 'hard' ? 4 : 3)) continue;
      const s = T.routePoints(c.map, r.len) + (c.ix.routeById[r.id] && level === 'hard' ? 0.1 * r.len : 0);
      if (!best || s > best.s) best = { s, r };
    }
    if (!best) return null;
    const pay = bestPay(c, best.r.id);
    return pay ? { type: 'claim', seat: c.seat, route: best.r.id, pay } : null;
  }

  function stationMove(c) {
    const p = c.me;
    if (p.stations <= 0) return null;
    const cost = T.stationCost(c.v, c.seat);
    if (p.trains < 6 && cost > 2) return null;
    for (const fi of planFor(c, c.open).failed) {
      const t = c.tickets[c.open[fi]];
      // cheapest path allowing ONE rival route; build the station at that route's end nearest my side
      const res = G.shortest(c.map, t.a, t.b, r => (c.v.owner[r.id] != null && c.v.owner[r.id] !== c.seat) ? r.len * 0 + 0.01 : c.costOf(r));
      if (!res) continue;
      const rival = res.path.find(id => c.v.owner[id] != null && c.v.owner[id] !== c.seat);
      if (!rival) continue;
      const r = c.ix.routeById[rival];
      const city = [r.a, r.b].find(x => c.v.stationAt[x] == null);
      if (!city) continue;
      // pay with the most plentiful colour
      const col = COLORS.slice().sort((a, b) => p.hand[b] - p.hand[a])[0];
      const n = Math.min(p.hand[col], cost), locos = cost - n;
      if (locos > p.hand.loco) continue;
      return { type: 'station', seat: c.seat, city, pay: { color: n ? col : null, n, locos } };
    }
    return null;
  }

  function drawCard(c, level, need, rand, second) {
    const v = c.v, seat = c.seat;
    const map = c.map;
    const h = c.me.hand;
    // demand per colour = what the plan needs minus what I hold
    const want = {};
    for (const k of COLORS) want[k] = Math.max(0, need.need[k] - h[k]);
    if (need.gray) {
      // gray needs: top up the colour I already have most of
      const top = COLORS.slice().sort((a, b) => h[b] - h[a])[0];
      want[top] += Math.max(0, need.gray - h[top]) * 0.5;
    }
    if (level === 'easy') {
      const opts = v.faceUp.map((card, i) => ({ card, i })).filter(x => x.card && !(second && x.card === LOCO && !map.nordicLocos));
      if (opts.length && rand() < 0.5) { const o = opts[Math.floor(rand() * opts.length)]; return { type: 'draw', seat, from: o.i }; }
      return v.trainDeck > 0 || v.discard.length ? { type: 'draw', seat, from: 'deck' } : (opts.length ? { type: 'draw', seat, from: opts[0].i } : { type: 'pass', seat });
    }
    let best = -1, bestScore = 0;
    v.faceUp.forEach((card, i) => {
      if (!card) return;
      if (card === LOCO) {
        if (second && !map.nordicLocos) return;
        // a face-up loco costs the whole turn (except on Nordic); worth it for ferries or when hard and short of locos
        const sc = map.nordicLocos ? 1.2 : (need.ferryLocos > h.loco ? 2.2 : (level === 'hard' ? 0.9 : 0.6));
        if (sc > bestScore) { bestScore = sc; best = i; }
        return;
      }
      const sc = want[card] > 0 ? 1 + Math.min(want[card], 4) * 0.1 : 0;
      if (sc > bestScore) { bestScore = sc; best = i; }
    });
    const deckLeft = v.trainDeck > 0 || v.discard.length > 0;
    if (best >= 0 && (bestScore >= 1 || !deckLeft)) return { type: 'draw', seat, from: best };
    if (deckLeft) return { type: 'draw', seat, from: 'deck' };
    const any = v.faceUp.findIndex(card => card && !(second && card === LOCO && !map.nordicLocos));
    if (any >= 0) return { type: 'draw', seat, from: any };
    return { type: 'pass', seat };
  }

  // Explain a suggested action in a few words (hint button).
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

  const api = { choose, explain, heat, chooseTickets, ctx, planFor };
  if (isNode) module.exports = api; else root.TTRAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
