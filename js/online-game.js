// Ticket to Ride as a game for the shared online module (js/online.js, see Board and Card Games/_online/README.md).
// Pure wrappers around the engine: the host's browser holds the full state and applies every move;
// each player only ever receives the public view plus their own hand and tickets.
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const T = isNode ? require('./engine.js') : root.TTR;
  const AI = isNode ? require('./ai.js') : root.TTRAI;

  // house rules from the room options: only the known switches, as booleans
  const houseOf = h => { const o = {}; for (const k of ['noLongest', 'globe', 'freeLocos', 'doubles']) if (h && h[k]) o[k] = true; return o; };

  const game = {
    id: 'ticket-to-ride',
    minSeats: 2, maxSeats: 5,
    // options: {mapId, deckId, level}. The map must already be registered (T.register) on the host.
    setup(n, options, rng, seats) {
      const map = T.maps[options.mapId];
      if (!map) throw new Error('map not loaded: ' + options.mapId);
      if (n < map.players[0] || n > map.players[1]) throw new Error(map.name + ' takes ' + map.players.join('–') + ' players');
      return T.newGame(map, {
        seed: Math.floor(rng() * 2147483647) + 1, deckId: options.deckId, options: Object.assign({ noLongest: !!options.noLongest }, houseOf(options.house)),
        seats: seats.map((x, i) => ({ name: x.name || (x.kind === 'computer' ? 'Computer ' + (i + 1) : 'Player ' + (i + 1)), kind: x.kind === 'computer' ? 'cpu' : 'human', level: x.kind === 'computer' ? (options.level || 'medium') : null })),
      });
    },
    toAct(s) {
      if (s.phase === 'over') return [];
      if (s.phase === 'setup') return s.players.map((p, i) => p.pending ? i : -1).filter(i => i >= 0);
      return [s.turn];
    },
    apply(s, seat, action) { return T.apply(s, Object.assign({}, action, { seat })); },
    // what everyone sees: board, face-up cards, counts, scores; no hands, tickets or deck order
    publicView(s) {
      const v = T.view(s, -1);
      v.log = v.log.slice(-12);
      delete v.rng;
      return v;
    },
    // only this seat's secrets
    privateView(s, seat) {
      const p = s.players[seat];
      return p ? { hand: p.hand, tickets: p.tickets, pending: p.pending } : null;
    },
    bot(ctx, seat) {
      const v = merge(ctx.pub, ctx.mine, seat);
      return AI.choose(v, seat, (ctx.state && ctx.state.players[seat].level) || 'medium');
    },
    isOver(s) { return s.phase === 'over'; },
  };

  // public view + one seat's secrets = that seat's view (same shape as T.view(state, seat))
  function merge(pub, mine, seat) {
    const v = JSON.parse(JSON.stringify(pub));
    v.viewer = seat;
    if (mine && v.players[seat]) Object.assign(v.players[seat], mine, { handCount: undefined, ticketCount: undefined });
    return v;
  }

  // a seat's view as a full state for the screen and for checking a move before it is sent:
  // hidden decks become stand-in cards of the right size (only their lengths are shown)
  function asState(v) {
    const s = JSON.parse(JSON.stringify(v));
    const fill = (n, x) => typeof n === 'number' ? Array(n).fill(x) : n;
    s.trainDeck = fill(s.trainDeck, T.COLORS[0]); s.ticketDeck = fill(s.ticketDeck, 0); s.longDeck = fill(s.longDeck, 0);
    s.players.forEach(q => { if (q.hand == null) q.hand = T.emptyHand(); if (q.tickets == null) q.tickets = Array(q.ticketCount || 0).fill(null); });
    return s;
  }

  const api = { game, merge, asState };
  if (isNode) module.exports = api; else root.TTROnlineGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
