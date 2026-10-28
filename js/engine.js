// Ticket to Ride rules engine. Pure: newGame(map, opts) -> state, apply(state, action) -> new state,
// view(state, seat) -> what that seat may see. The same engine runs local, computer and online seats.
// No DOM. Browser: window.TTR. Node: require('./engine.js').
(function (root) {
  'use strict';
  const G = (typeof module !== 'undefined' && module.exports) ? require('./graph.js') : root.TTRGraph;

  const COLORS = ['pink', 'white', 'blue', 'yellow', 'orange', 'black', 'red', 'green'];
  const LOCO = 'loco';
  const MAPS = {}; // id -> map json (registered by the app or tests)
  function register(map) { MAPS[map.id] = map; return map; }
  function mapOf(s) { const m = MAPS[s.mapId]; if (!m) throw new Error('map not loaded: ' + s.mapId); return m; }

  // ---------------------------------------------------------------- rng (seeded, kept in state)
  function rnd(s) { // mulberry32; mutates s.rng
    let t = (s.rng = (s.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(s, arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  const clone = o => JSON.parse(JSON.stringify(o));
  const emptyHand = () => Object.fromEntries(COLORS.concat(LOCO).map(c => [c, 0]));
  const handSize = h => Object.values(h).reduce((a, b) => a + b, 0);

  // ---------------------------------------------------------------- rules derived from map + options
  function deckFor(map, s) {
    const d = map.ticketDecks.find(d => d.id === s.deckId) || map.ticketDecks[0];
    return d;
  }
  function rules(s) {
    const map = mapOf(s), d = deckFor(map, s);
    const r = {
      setup: d.setup || map.setup, draw: d.draw || map.draw,
      longest: map.bonuses.longest || 0, globetrotter: d.globetrotter || map.bonuses.globetrotter || 0,
      mandala: map.bonuses.mandala || null, stations: map.stations, stationPoints: map.stationPoints,
      bothDoubles: s.players.length >= map.bothDoublesFrom,
      ticketReturn: map.ticketReturn || 'bottom', // 'box' = unkept tickets leave the game
    };
    // USA 1910 deck plays Globetrotter instead of Longest Route; Mega Game plays both.
    if (map.id === 'usa' && s.deckId === '1910') r.longest = 0;
    const o = s.options || {};
    if (o.noLongest) r.longest = 0;
    // house rules (Settings → Rules, off by default)
    if (o.globe && !r.globetrotter) r.globetrotter = 15; // most completed tickets: 15 (as USA 1910)
    if (o.doubles) r.bothDoubles = true; // both tracks of a double open with any player count
    r.freeLocos = freeLocoDraw(map) || !!o.freeLocos; // a face-up locomotive counts as one card
    return r;
  }

  // ---------------------------------------------------------------- new game
  // opts: {deckId, seed, seats:[{name, kind:'human'|'cpu'|'online', level}]}
  function newGame(map, opts) {
    register(map);
    const n = opts.seats.length;
    if (n < map.players[0] || n > map.players[1]) throw new Error(map.name + ' takes ' + map.players.join('–') + ' players');
    const s = {
      v: 1, mapId: map.id, deckId: opts.deckId || map.ticketDecks[0].id, options: opts.options || {},
      rng: (opts.seed >>> 0) || 1,
      players: opts.seats.map((p, i) => ({
        name: p.name || 'Player ' + (i + 1), kind: p.kind || 'human', level: p.level || null, color: i,
        trains: map.trains, stations: map.stations, hand: emptyHand(), tickets: [], pending: null,
        routes: [], stationCities: [], ticketsDrawn: 0,
      })),
      owner: {}, // routeId -> seat
      stationAt: {}, // cityId -> seat
      trainDeck: [], discard: [], faceUp: [], ticketDeck: [], longDeck: [],
      turn: 0, phase: 'setup', drew: 0, pendingTunnel: null,
      lastRound: null, turnsLeft: null, turnNo: 0, log: [], result: null,
    };
    const deck = [];
    Object.entries(map.deck.colors).forEach(([c, k]) => { for (let i = 0; i < k; i++) deck.push(c); });
    for (let i = 0; i < map.deck.loco; i++) deck.push(LOCO);
    s.trainDeck = shuffle(s, deck);
    const tix = deckFor(map, s).tickets.map((t, i) => i);
    s.ticketDeck = shuffle(s, tix.filter(i => !deckFor(map, s).tickets[i].long));
    s.longDeck = shuffle(s, tix.filter(i => deckFor(map, s).tickets[i].long));
    s.turn = Math.floor(rnd(s) * n); // random first player
    s.firstPlayer = s.turn;
    for (const p of s.players) for (let k = 0; k < map.startHand; k++) p.hand[s.trainDeck.pop()]++;
    refillFaceUp(s);
    const R = rules(s);
    for (const p of s.players) {
      const draw = [];
      for (let k = 0; k < (R.setup.long || 0) && s.longDeck.length; k++) draw.push(s.longDeck.pop());
      for (let k = 0; k < R.setup.deal && s.ticketDeck.length; k++) draw.push(s.ticketDeck.pop());
      p.pending = { tickets: draw, min: R.setup.keep, setup: true };
    }
    log(s, null, 'New game on ' + map.name + '. ' + s.players[s.turn].name + ' goes first.');
    return s;
  }

  function log(s, seat, text) { s.log.push({ n: s.turnNo, seat, text }); if (s.log.length > 400) s.log.shift(); }

  // ---------------------------------------------------------------- train cards
  function drawOne(s) {
    if (!s.trainDeck.length && s.discard.length) { s.trainDeck = shuffle(s, s.discard); s.discard = []; }
    return s.trainDeck.length ? s.trainDeck.pop() : null;
  }
  function refillFaceUp(s) {
    const map = mapOf(s);
    for (let guard = 0; guard < 10; guard++) {
      while (s.faceUp.filter(Boolean).length < 5) {
        const slot = s.faceUp.findIndex(c => !c);
        const c = drawOne(s);
        if (!c) break;
        if (slot >= 0) s.faceUp[slot] = c; else s.faceUp.push(c);
      }
      // Three or more locomotives face up: discard all five and deal again (not on maps with locoFlush false: Nordic).
      const locos = s.faceUp.filter(c => c === LOCO).length;
      if (map.locoFlush === false || locos < 3) break;
      // stop if what's left can't fix it (avoid an endless loop)
      const left = s.trainDeck.concat(s.discard);
      if (left.filter(c => c !== LOCO).length < 3) break;
      s.discard.push(...s.faceUp.filter(Boolean)); s.faceUp = [];
      log(s, null, 'Three locomotives face up: the five cards were replaced.');
    }
    while (s.faceUp.length < 5) s.faceUp.push(null);
  }

  // ---------------------------------------------------------------- legality helpers
  function routeOpen(s, r, seat) {
    if (s.owner[r.id] != null) return 'taken';
    if (r.twin) {
      const o = s.owner[r.twin];
      if (o != null) {
        if (o === seat) return 'own twin';
        if (!rules(s).bothDoubles) return 'double closed';
      }
    }
    return null;
  }

  // Are locomotives wild on this route? (Nordic: ferries and tunnels only; Switzerland: tunnels only.)
  function locosWild(map, r) { return !map.locosOn || map.locosOn.includes(r.kind || 'train'); }
  // Card swaps: any N cards stand in for one card. Nordic ferries: any 3 for a locomotive;
  // Nordic Murmansk–Lieksa (route.anyFor = 4): any 4 for one card of the chosen colour.
  function swapSize(map, r) { return r.anyFor || (r.kind === 'ferry' && map.ferryAny) || 0; }
  const anyCount = any => any ? Object.values(any).reduce((a, b) => a + b, 0) : 0;
  // Pick `count` cards for a swap from what is left in the hand: most plentiful other colours first,
  // then the colour being played, then (only if allowed) locomotives.
  function pickAny(rest, count, avoid, withLocos) {
    const order = COLORS.filter(c => c !== avoid).sort((a, b) => rest[b] - rest[a]).concat(avoid ? [avoid] : [], withLocos ? [LOCO] : []);
    const any = {}; let left = count;
    for (const c of order) { const k = Math.min(rest[c] || 0, left); if (k > 0) { any[c] = k; left -= k; } if (!left) break; }
    return left ? null : any;
  }

  // Ways to pay for a route from a hand. Returns [{color, n, locos, any?}]:
  //   color  the colour played (null = no coloured cards), n = how many of it, locos = locomotive cards,
  //   any    optional {colour or 'loco': count} of extra cards used in swaps (see swapSize).
  function payOptions(s, seat, routeId) {
    const map = mapOf(s), r = G.index(map).routeById[routeId], p = s.players[seat], h = p.hand;
    const out = [];
    const L = r.len, k = r.locos || 0, wild = locosWild(map, r), swap = swapSize(map, r);
    const myLocos = wild ? h.loco : 0;
    const colors = r.color === 'gray' ? COLORS : [r.color];
    for (const c of colors) {
      const have = h[c];
      if (!have) continue;
      // use as many coloured cards as possible, then locos
      const n = Math.min(have, L - k);
      const locos = L - n;
      if (n > 0 && locos <= myLocos) out.push({ color: c, n, locos });
      if (!swap) continue;
      if (r.anyFor) {
        // every missing card of the colour = any `swap` cards (locomotives included)
        const n2 = Math.min(have, L), u = L - n2;
        if (!u) continue;
        const rest = Object.assign({}, h); rest[c] -= n2;
        const any = pickAny(rest, u * swap, c, true);
        if (any) out.push({ color: c, n: n2, locos: 0, any });
      } else {
        // ferry: replace 1..k locomotive symbols with any `swap` cards each
        const fill = L - k - n; // colour spaces still empty: locomotives
        for (let u = 1; u <= k; u++) {
          const locos2 = fill + (k - u);
          if (locos2 > myLocos) continue;
          const rest = Object.assign({}, h); rest[c] -= n; rest.loco -= locos2;
          const any = pickAny(rest, u * swap, c, false);
          if (any) out.push({ color: c, n, locos: locos2, any });
        }
      }
    }
    if (wild && h.loco >= L) out.push({ color: null, n: 0, locos: L });
    // no coloured cards played -> colour null; drop duplicates
    const seen = new Set();
    return out.map(o => (o.n === 0 ? Object.assign(o, { color: null }) : o)).filter(o => { const key = JSON.stringify(o); if (seen.has(key)) return false; seen.add(key); return true; });
  }

  function canClaim(s, seat, routeId, pay) {
    const map = mapOf(s), r = G.index(map).routeById[routeId], p = s.players[seat];
    if (!r) return 'no such route';
    const why = routeOpen(s, r, seat); if (why) return why;
    if (p.trains < r.len) return 'not enough trains';
    if (!pay) return payOptions(s, seat, routeId).length ? null : 'not enough cards';
    const { color, n, locos } = pay, any = pay.any || null;
    if (!Number.isInteger(n) || !Number.isInteger(locos) || n < 0 || locos < 0) return 'bad payment';
    if (any) for (const [c, k] of Object.entries(any)) if (!(COLORS.includes(c) || c === LOCO) || !Number.isInteger(k) || k < 0) return 'bad payment';
    const A = anyCount(any), swap = swapSize(map, r);
    if (A) {
      if (!swap) return 'no card swaps on this route';
      if (A % swap) return 'swap cards come in groups of ' + swap;
    }
    const u = A ? A / swap : 0;
    if (n + locos + u !== r.len) return 'wrong number of cards';
    if (locos > 0 && !locosWild(map, r)) return 'locomotives can only be used on ' + map.locosOn.map(k => k === 'ferry' ? 'ferries' : k + 's').join(' and ');
    if (r.locos && locos + (r.anyFor ? 0 : u) < r.locos) return 'ferry needs ' + r.locos + ' locomotive' + (r.locos > 1 ? 's' : '');
    if (n > 0) {
      if (!COLORS.includes(color)) return 'bad colour';
      if (r.color !== 'gray' && r.color !== color) return 'wrong colour';
    }
    const use = cardsOf(pay);
    for (const c of Object.keys(use)) if ((p.hand[c] || 0) < use[c]) return c === LOCO ? 'not enough locomotives' : 'not enough cards';
    return null;
  }

  // All cards a payment takes from the hand: {colour: count}.
  function cardsOf(pay) {
    const use = {};
    const add = (c, k) => { if (k > 0) use[c] = (use[c] || 0) + k; };
    if (pay.n > 0) add(pay.color, pay.n);
    add(LOCO, pay.locos);
    if (pay.any) for (const [c, k] of Object.entries(pay.any)) add(c, k);
    return use;
  }

  function stationCost(s, seat) { return mapOf(s).stations - s.players[seat].stations + 1; }

  function legal(s, seat) {
    // what kinds of action this seat may take now (used by UI and computers)
    if (s.phase === 'over') return [];
    if (s.phase === 'setup') return s.players[seat].pending ? ['keepTickets'] : [];
    if (s.turn !== seat) return [];
    const p = s.players[seat];
    if (s.pendingTunnel) return ['tunnelPay'];
    if (p.pending) return ['keepTickets'];
    if (s.drew === 1) return ['draw'];
    const out = [];
    if (s.faceUp.some(Boolean) || s.trainDeck.length || s.discard.length) out.push('draw');
    if (s.ticketDeck.length) out.push('drawTickets');
    out.push('claim');
    if (p.stations > 0) out.push('station');
    return out;
  }

  // ---------------------------------------------------------------- apply
  function apply(state, a) {
    const s = clone(state);
    const map = mapOf(s);
    const seat = a.seat;
    const p = s.players[seat];
    const fail = msg => { const e = new Error(msg); e.rule = true; throw e; };
    if (!p) fail('no such seat');
    if (s.phase === 'over') fail('game over');
    const R = rules(s);
    const tickets = deckFor(map, s).tickets;

    if (a.type === 'keepTickets') {
      if (!p.pending) fail('no tickets to choose');
      if (s.phase !== 'setup' && s.turn !== seat) fail('not your turn');
      const keep = [...new Set(a.keep || [])];
      if (keep.some(t => !p.pending.tickets.includes(t))) fail('not one of your choices');
      if (keep.length < Math.min(p.pending.min, p.pending.tickets.length)) fail('keep at least ' + p.pending.min);
      p.tickets.push(...keep);
      for (const t of p.pending.tickets) if (!keep.includes(t)) {
        if (tickets[t].long) continue; // unkept long tickets leave the game
        if (R.ticketReturn === 'box') continue; // Nordic, Switzerland: unkept tickets leave the game
        s.ticketDeck.unshift(t); // bottom of the deck
      }
      log(s, seat, p.name + ' kept ' + keep.length + ' ticket' + (keep.length === 1 ? '' : 's') + '.');
      const wasSetup = p.pending.setup;
      p.pending = null;
      if (wasSetup) {
        if (s.players.every(q => !q.pending)) { s.phase = 'main'; s.turnNo = 1; }
        return s;
      }
      return endTurn(s);
    }
    if (s.phase === 'setup') fail('choose starting tickets first');
    if (s.turn !== seat) fail('not your turn');

    if (a.type === 'tunnelPay') {
      const t = s.pendingTunnel;
      if (!t) fail('no tunnel');
      if (a.pay) {
        // extra cards: of the colour used, or locomotives (if paid with locomotives only, locomotives only)
        const extraLocos = a.extraLocos || 0, extraColor = t.extra - extraLocos;
        if (extraLocos < 0 || extraColor < 0) fail('bad payment');
        if (t.color == null && extraColor > 0) fail('must pay locomotives');
        if (p.hand.loco < t.locos + extraLocos) fail('not enough locomotives');
        if (extraColor && p.hand[t.color] < t.n + extraColor) fail('not enough cards');
        s.pendingTunnel = null;
        return finishClaim(s, seat, t.route, { color: t.color, n: t.n + extraColor, locos: t.locos + extraLocos }, t.extra);
      }
      s.pendingTunnel = null;
      log(s, seat, p.name + ' gave up the tunnel.');
      return endTurn(s);
    }

    if (p.pending) fail('choose tickets first');

    if (a.type === 'draw') {
      const free = R.freeLocos;
      if (a.from === 'deck') {
        const c = drawOne(s);
        if (!c) fail('no cards left');
        p.hand[c]++;
        s.drew++;
        log(s, seat, p.name + ' drew from the deck.');
      } else {
        const i = a.from;
        const c = s.faceUp[i];
        if (!c) fail('no card there');
        if (c === LOCO && s.drew === 1 && !free) fail('a face-up locomotive must be your only draw');
        p.hand[c]++;
        s.faceUp[i] = null;
        refillFaceUp(s);
        s.drew += (c === LOCO && !free) ? 2 : 1;
        log(s, seat, p.name + ' took a face-up ' + (c === LOCO ? 'locomotive' : c) + '.');
      }
      // If nothing can be drawn as a second card, the turn ends.
      const nothingLeft = !s.trainDeck.length && !s.discard.length && !s.faceUp.some(c => c && !(c === LOCO && !free));
      if (s.drew >= 2 || nothingLeft) return endTurn(s);
      return s;
    }
    if (s.drew) fail('take your second card');

    if (a.type === 'drawTickets') {
      if (!s.ticketDeck.length) fail('no tickets left');
      const draw = [];
      for (let k = 0; k < R.draw.deal && s.ticketDeck.length; k++) draw.push(s.ticketDeck.pop());
      p.pending = { tickets: draw, min: R.draw.keep };
      p.ticketsDrawn++;
      log(s, seat, p.name + ' drew ' + draw.length + ' tickets.');
      return s;
    }

    if (a.type === 'claim') {
      const why = canClaim(s, seat, a.route, a.pay);
      if (why) fail(why);
      const r = G.index(map).routeById[a.route];
      if (r.kind === 'tunnel') {
        const shown = [];
        for (let k = 0; k < 3; k++) { const c = drawOne(s); if (c) shown.push(c); }
        s.discard.push(...shown);
        const match = c => c === LOCO || (a.pay.n > 0 && c === a.pay.color);
        const extra = shown.filter(match).length;
        log(s, seat, p.name + ' tried a tunnel: ' + (shown.join(', ') || 'no cards') + ' — ' + extra + ' extra.');
        if (extra === 0) return finishClaim(s, seat, a.route, a.pay, 0, shown);
        s.pendingTunnel = { route: a.route, color: a.pay.n > 0 ? a.pay.color : null, n: a.pay.n, locos: a.pay.locos, extra, shown };
        return s;
      }
      return finishClaim(s, seat, a.route, a.pay, 0);
    }

    if (a.type === 'station') {
      if (!R.stations) fail('no stations on this map');
      if (p.stations <= 0) fail('no stations left');
      if (s.stationAt[a.city] != null) fail('city already has a station');
      if (!G.index(map).cityById[a.city]) fail('no such city');
      const cost = stationCost(s, seat);
      const { color, n, locos } = a.pay || {};
      if (!Number.isInteger(n) || !Number.isInteger(locos) || n < 0 || locos < 0) fail('bad payment');
      if (n + locos !== cost) fail('station costs ' + cost + ' card' + (cost === 1 ? '' : 's'));
      if (n > 0 && (!COLORS.includes(color) || p.hand[color] < n)) fail('not enough cards');
      if (p.hand.loco < locos) fail('not enough locomotives');
      if (n > 0) { p.hand[color] -= n; for (let k = 0; k < n; k++) s.discard.push(color); }
      p.hand.loco -= locos; for (let k = 0; k < locos; k++) s.discard.push(LOCO);
      p.stations--; p.stationCities.push(a.city); s.stationAt[a.city] = seat;
      log(s, seat, p.name + ' built a station in ' + G.index(map).cityById[a.city].name + '.');
      return endTurn(s);
    }

    if (a.type === 'pass') {
      if (legal(s, seat).some(t => t === 'draw' || t === 'drawTickets')) fail('you can still draw');
      log(s, seat, p.name + ' passed.');
      s.passes = (s.passes || 0) + 1;
      // Nothing left to draw and every player in turn passed: no one can move again, so the game ends
      // (the rulebook has no rule for this; it would otherwise go round forever).
      if (s.passes >= s.players.length) {
        s.drew = 0; s.phase = 'over'; s.result = score(s);
        log(s, null, 'Nobody can move: game over.');
        return s;
      }
      return endTurn(s, true);
    }
    fail('unknown action ' + a.type);
  }

  function freeLocoDraw(map) { return !!(map.freeLocoDraw || map.nordicLocos); }

  function finishClaim(s, seat, routeId, pay, extra) {
    const map = mapOf(s), r = G.index(map).routeById[routeId], p = s.players[seat];
    for (const [c, k] of Object.entries(cardsOf(pay))) { p.hand[c] -= k; for (let i = 0; i < k; i++) s.discard.push(c); }
    s.owner[routeId] = seat; p.routes.push(routeId); p.trains -= r.len;
    const cn = G.index(map).cityById;
    log(s, seat, p.name + ' claimed ' + cn[r.a].name + '–' + cn[r.b].name + ' (' + r.len + ')' + (extra ? ' paying ' + extra + ' extra' : '') + '.');
    // the face-up row may have been short when the deck was empty; try again now that cards are discarded
    if (s.faceUp.some(c => !c)) refillFaceUp(s);
    return endTurn(s);
  }

  function endTurn(s, passed) {
    const p = s.players[s.turn];
    s.drew = 0;
    if (!passed) s.passes = 0;
    if (s.faceUp.some(c => !c)) refillFaceUp(s);
    if (s.lastRound == null && p.trains <= 2) {
      s.lastRound = s.turn; s.turnsLeft = s.players.length;
      log(s, s.turn, p.name + ' has ' + p.trains + ' trains left: everyone gets one last turn.');
    } else if (s.turnsLeft != null) {
      s.turnsLeft--;
      if (s.turnsLeft <= 0) { s.phase = 'over'; s.result = score(s); log(s, null, 'Game over.'); return s; }
    }
    s.turn = (s.turn + 1) % s.players.length;
    s.turnNo++;
    return s;
  }

  // ---------------------------------------------------------------- scoring
  function routePoints(map, len) { return map.points[len] || 0; }

  // Ticket shapes: city–city {a, b, pts}; country ticket (Switzerland) {a, opts:[{to, pts}]} where `a` is a
  // city or country id and each `to` a country id. A country id stands for all its border dots (map.countries).
  function ticketEnds(map, id) { return map.countries && map.countries[id] ? map.countries[id].cities.slice() : [id]; }

  // Outcome of one ticket for a set of route ids: {ok, pts} with pts signed (+ completed, − not).
  // Country tickets score the best option completed, else lose the lowest option.
  function ticketOutcome(map, ids, t) {
    if (!t.opts) { const ok = G.connected(map, ids, t.a, t.b); return { ok, pts: ok ? t.pts : -t.pts }; }
    const from = ticketEnds(map, t.a);
    let best = null;
    for (const o of t.opts) if ((best == null || o.pts > best) && G.connectedAny(map, ids, from, ticketEnds(map, o.to))) best = o.pts;
    return best != null ? { ok: true, pts: best } : { ok: false, pts: -Math.min(...t.opts.map(o => o.pts)) };
  }

  // Every ticket as a plain {a, b, pts} pair, for planners (computers, odds) that think in city pairs.
  // A country ticket becomes its most attractive single pair: highest points minus half the trains needed.
  const plainCache = new WeakMap();
  function plainTickets(map, sOrDeckId) {
    const d = typeof sOrDeckId === 'string' ? (map.ticketDecks.find(x => x.id === sOrDeckId) || map.ticketDecks[0]) : deckFor(map, sOrDeckId);
    if (!d.tickets.some(t => t.opts)) return d.tickets;
    let byDeck = plainCache.get(map); if (!byDeck) plainCache.set(map, byDeck = {});
    if (byDeck[d.id]) return byDeck[d.id];
    return (byDeck[d.id] = d.tickets.map(t => {
      if (!t.opts) return t;
      let best = null;
      for (const o of t.opts) for (const a of ticketEnds(map, t.a)) for (const b of ticketEnds(map, o.to)) {
        const sp = G.shortest(map, a, b, r => r.len);
        if (!sp) continue;
        const v = o.pts - sp.dist / 2;
        if (!best || v > best.v) best = { v, a, b, pts: o.pts };
      }
      return { a: best.a, b: best.b, pts: best.pts, country: true };
    }));
  }

  // Tickets completed for one player, letting each station borrow one rival route into its city.
  // Returns [{t, ok, pts}] (pts signed).
  function ticketResult(s, seat, borrow) {
    const map = mapOf(s), tickets = deckFor(map, s).tickets, p = s.players[seat];
    const ids = p.routes.concat(borrow || []);
    return p.tickets.map(t => Object.assign({ t }, ticketOutcome(map, ids, tickets[t])));
  }

  function bestBorrow(s, seat) {
    const map = mapOf(s), ix = G.index(map), p = s.players[seat], tickets = deckFor(map, s).tickets;
    const choices = p.stationCities.map(city => [null].concat(ix.adj[ix.cityIdx[city]].map(e => e.r.id).filter(id => s.owner[id] != null && s.owner[id] !== seat)));
    let best = { pts: -Infinity, borrow: [] };
    const rec = (i, cur) => {
      if (i === choices.length) {
        const res = ticketResult(s, seat, cur);
        const pts = res.reduce((a, x) => a + x.pts, 0);
        if (pts > best.pts) best = { pts, borrow: cur.slice() };
        return;
      }
      for (const c of choices[i]) { if (c) cur.push(c); rec(i + 1, cur); if (c) cur.pop(); }
    };
    rec(0, []);
    return best.borrow;
  }

  function score(s) {
    const map = mapOf(s), R = rules(s), tickets = deckFor(map, s).tickets;
    const rows = s.players.map((p, seat) => {
      const routePts = p.routes.reduce((a, id) => a + routePoints(map, G.index(map).routeById[id].len), 0);
      const borrow = p.stationCities.length ? bestBorrow(s, seat) : [];
      const res = ticketResult(s, seat, borrow);
      const ticketPts = res.reduce((a, x) => a + x.pts, 0);
      const done = res.filter(x => x.ok).length;
      const longest = G.longestTrail(map, p.routes);
      let mandalas = 0;
      if (R.mandala) for (const x of res) if (x.ok && !tickets[x.t].opts && G.disjointPaths(map, p.routes, tickets[x.t].a, tickets[x.t].b, 2) >= 2) mandalas++;
      return {
        seat, name: p.name, routePts, ticketPts, tickets: res, done, borrow,
        longest: longest.len, longestPath: longest.path,
        stationPts: R.stations ? p.stations * R.stationPoints : 0, mandalas,
        mandalaPts: R.mandala ? R.mandala[Math.min(mandalas, R.mandala.length - 1)] : 0,
        longestPts: 0, globePts: 0,
      };
    });
    if (R.longest) { const m = Math.max(...rows.map(r => r.longest)); if (m > 0) rows.forEach(r => { if (r.longest === m) r.longestPts = R.longest; }); }
    if (R.globetrotter) { const m = Math.max(...rows.map(r => r.done)); if (m > 0) rows.forEach(r => { if (r.done === m) r.globePts = R.globetrotter; }); }
    rows.forEach(r => { r.total = r.routePts + r.ticketPts + r.stationPts + r.longestPts + r.globePts + r.mandalaPts; });
    // ranking: total, then most completed tickets, then (Europe) fewest stations used, then longest route
    const rank = (x, y) => y.total - x.total || y.done - x.done || ((s.players[y.seat].stations || 0) - (s.players[x.seat].stations || 0)) || y.longest - x.longest;
    const order = rows.slice().sort(rank);
    // still level after every tie-break: they share the win
    const tied = order.filter(r => rank(r, order[0]) === 0).map(r => r.seat);
    return { rows, winner: order[0].seat, order: order.map(r => r.seat), tied };
  }

  // Live score during the game (route points only + what is already certain), for scoreboards.
  function liveRoutePoints(s, seat) {
    const map = mapOf(s);
    return s.players[seat].routes.reduce((a, id) => a + routePoints(map, G.index(map).routeById[id].len), 0);
  }

  // ---------------------------------------------------------------- view (hide secrets)
  function view(state, seat) {
    const s = clone(state);
    s.rng = 0;
    s.trainDeck = s.trainDeck.length; s.ticketDeck = s.ticketDeck.length; s.longDeck = s.longDeck.length;
    s.players.forEach((p, i) => {
      if (i === seat || s.phase === 'over') return;
      p.handCount = handSize(p.hand); p.hand = null;
      p.ticketCount = p.tickets.length; p.tickets = null;
      if (p.pending) p.pending = { count: p.pending.tickets.length, min: p.pending.min, setup: p.pending.setup };
    });
    s.viewer = seat;
    return s;
  }

  const api = {
    COLORS, LOCO, register, maps: MAPS, mapOf, newGame, apply, view, legal, rules, payOptions, canClaim,
    routeOpen, score, liveRoutePoints, routePoints, stationCost, deckFor, handSize, emptyHand, clone,
    locosWild, swapSize, cardsOf, freeLocoDraw, ticketEnds, ticketOutcome, plainTickets,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TTR = api;
})(typeof window !== 'undefined' ? window : globalThis);
