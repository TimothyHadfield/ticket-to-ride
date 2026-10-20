// Per-map rules: Nordic Countries, India and Switzerland, each checked against the published rulebook
// (sources per number in docs/rules-check.md). Every test sets up a small position by hand.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const T = require('../js/engine.js');
const G = require('../js/graph.js');
const file = id => path.join(__dirname, '..', 'maps', id + '.json');
const load = id => T.register(JSON.parse(fs.readFileSync(file(id), 'utf8')));

const pair = (r, a, b) => (r.a === a && r.b === b) || (r.a === b && r.b === a);
const rid = (m, a, b, color) => { const r = m.routes.find(r => pair(r, a, b) && (!color || r.color === color)); if (!r) throw new Error('no route ' + a + '-' + b); return r.id; };
const route = (m, a, b, color) => m.routes.find(r => r.id === rid(m, a, b, color));
function start(map, n, seed) {
  let s = T.newGame(map, { seed: seed || 1, seats: Array.from({ length: n }, (_, i) => ({ name: 'P' + i })) });
  for (let i = 0; i < n; i++) s = T.apply(s, { type: 'keepTickets', seat: i, keep: s.players[i].pending.tickets.slice(0, s.players[i].pending.min) });
  return s;
}
const give = (s, seat, cards) => { const h = T.emptyHand(); Object.assign(h, cards); s.players[seat].hand = h; return s; };
const throwsRule = (fn, re) => assert.throws(fn, e => e.rule && (!re || re.test(e.message)));
const deckSize = m => Object.values(m.deck.colors).reduce((a, b) => a + b, 0) + m.deck.loco;
function cardsInPlay(s) {
  let n = s.trainDeck.length + s.discard.length + s.faceUp.filter(Boolean).length;
  for (const p of s.players) n += T.handSize(p.hand);
  return n;
}
const own = (s, seat, ids) => { for (const id of ids) { s.owner[id] = seat; s.players[seat].routes.push(id); } };
const endGameNow = s => T.score(s);

// ================================================================ Nordic Countries
test('Nordic: standard 110-card deck (12 of each colour + 14 locomotives)', () => {
  const m = load('nordic');
  assert.strictEqual(m.deck.loco, 14);
  assert.strictEqual(deckSize(m), 110);
  assert.strictEqual(cardsInPlay(start(m, 3, 2)), 110);
});

test('Nordic: locomotives are not wild on ordinary routes', () => {
  const m = load('nordic'); let s = start(m, 2, 3); const seat = s.turn;
  give(s, seat, { red: 1, loco: 3 });
  const r = rid(m, 'imatra', 'helsinki'); // red 3, ordinary
  throwsRule(() => T.apply(s, { type: 'claim', seat, route: r, pay: { color: 'red', n: 1, locos: 2 } }), /locomotive/);
  throwsRule(() => T.apply(s, { type: 'claim', seat, route: r, pay: { color: null, n: 0, locos: 3 } }), /locomotive/);
  assert.deepStrictEqual(T.payOptions(s, seat, r), []);
  give(s, seat, { red: 3, loco: 3 });
  assert.ok(T.payOptions(s, seat, r).every(o => o.locos === 0));
  assert.strictEqual(T.apply(s, { type: 'claim', seat, route: r, pay: { color: 'red', n: 3, locos: 0 } }).owner[r], seat);
});

test('Nordic: locomotives are wild on ferries and tunnels', () => {
  const m = load('nordic'); let s = start(m, 2, 4); const seat = s.turn;
  give(s, seat, { white: 1, loco: 2 });
  const ferry = rid(m, 'kirkenes', 'murmansk'); // white 3, 1 loco symbol
  assert.strictEqual(T.apply(s, { type: 'claim', seat, route: ferry, pay: { color: 'white', n: 1, locos: 2 } }).owner[ferry], seat);
  const tunnel = rid(m, 'narvik', 'kiruna', 'pink'); // pink tunnel 1
  give(s, seat, { loco: 1 });
  s.trainDeck.push('red', 'red', 'red');
  assert.strictEqual(T.apply(s, { type: 'claim', seat, route: tunnel, pay: { color: null, n: 0, locos: 1 } }).owner[tunnel], seat);
});

test('Nordic: any 3 cards may stand in for a ferry locomotive', () => {
  const m = load('nordic'); let s = start(m, 2, 5); const seat = s.turn;
  give(s, seat, { white: 2, red: 2, blue: 1 });
  const ferry = rid(m, 'kirkenes', 'murmansk');
  const base = cardsInPlay(s);
  const s2 = T.apply(s, { type: 'claim', seat, route: ferry, pay: { color: 'white', n: 2, locos: 0, any: { red: 2, blue: 1 } } });
  assert.strictEqual(s2.owner[ferry], seat);
  assert.strictEqual(T.handSize(s2.players[seat].hand), 0);
  assert.strictEqual(cardsInPlay(s2), base, 'no card created or lost');
  throwsRule(() => T.apply(s, { type: 'claim', seat, route: ferry, pay: { color: 'white', n: 2, locos: 0, any: { red: 2 } } }), /3/);
  throwsRule(() => T.apply(s, { type: 'claim', seat, route: ferry, pay: { color: 'white', n: 2, locos: 0, any: { red: 3 } } }), /not enough/);
  const opts = T.payOptions(s, seat, ferry);
  assert.ok(opts.some(o => o.any && o.n === 2 && o.locos === 0), JSON.stringify(opts));
  for (const o of opts) assert.strictEqual(T.canClaim(s, seat, ferry, o), null, JSON.stringify(o));
  // not on ordinary routes
  give(s, seat, { red: 2, blue: 3 });
  throwsRule(() => T.apply(s, { type: 'claim', seat, route: rid(m, 'imatra', 'helsinki'), pay: { color: 'red', n: 2, locos: 0, any: { blue: 3 } } }), /swap|substitute/);
});

test('Nordic: Murmansk–Lieksa takes any 4 cards in place of one card', () => {
  const m = load('nordic'); let s = start(m, 2, 6); const seat = s.turn;
  const ml = rid(m, 'murmansk', 'lieksa');
  assert.strictEqual(route(m, 'murmansk', 'lieksa').len, 9);
  give(s, seat, { green: 7, red: 5, loco: 3 });
  const s2 = T.apply(s, { type: 'claim', seat, route: ml, pay: { color: 'green', n: 7, locos: 0, any: { red: 5, loco: 3 } } });
  assert.strictEqual(s2.owner[ml], seat);
  assert.strictEqual(T.handSize(s2.players[seat].hand), 0);
  throwsRule(() => T.apply(s, { type: 'claim', seat, route: ml, pay: { color: 'green', n: 7, locos: 2 } }), /locomotive/);
  throwsRule(() => T.apply(s, { type: 'claim', seat, route: ml, pay: { color: 'green', n: 7, locos: 0, any: { red: 5, loco: 2 } } }), /4/);
  const opts = T.payOptions(s, seat, ml);
  assert.ok(opts.length >= 1 && opts.every(o => T.canClaim(s, seat, ml, o) === null), JSON.stringify(opts));
  assert.ok(opts.some(o => o.color === 'green' && o.n === 7));
});

test('Nordic: returned tickets leave the game, at the start and mid-game', () => {
  const m = load('nordic');
  let s = T.newGame(m, { seed: 7, seats: [{}, {}, {}] });
  s.players.forEach(p => { assert.strictEqual(p.pending.tickets.length, 5); assert.strictEqual(p.pending.min, 2); });
  for (let i = 0; i < 3; i++) s = T.apply(s, { type: 'keepTickets', seat: i, keep: s.players[i].pending.tickets.slice(0, 2) });
  assert.strictEqual(s.ticketDeck.length, 46 - 15);
  s = T.apply(s, { type: 'drawTickets', seat: s.turn });
  assert.strictEqual(s.players[s.turn].pending.tickets.length, 3);
  s = T.apply(s, { type: 'keepTickets', seat: s.turn, keep: s.players[s.turn].pending.tickets.slice(0, 1) });
  assert.strictEqual(s.ticketDeck.length, 46 - 18);
});

test('Nordic: face-up locomotives are drawn like any card; three face up are not swept (rulebook is silent)', () => {
  const m = load('nordic'); let s = start(m, 2, 8); const seat = s.turn;
  s.faceUp = ['loco', 'loco', 'loco', 'red', 'blue'];
  s = T.apply(s, { type: 'draw', seat, from: 0 });
  assert.strictEqual(s.turn, seat);
  s = T.apply(s, { type: 'draw', seat, from: 1 });
  assert.strictEqual(s.turn, 1 - seat);
  assert.strictEqual(s.players[seat].hand.loco >= 2, true);
});

test('Nordic: no longest-route bonus, Globetrotter 10, ties go to most tickets then longest route', () => {
  const m = load('nordic'); let s = start(m, 2, 9);
  const tk = T.deckFor(m, s).tickets;
  const ti = tk.findIndex(t => [t.a, t.b].sort().join() === 'helsinki,lieksa');
  s.players[0].tickets = [ti]; s.players[1].tickets = [];
  const p0 = G.shortest(m, 'helsinki', 'lieksa', r => r.len).path;
  own(s, 0, p0);
  const res = endGameNow(s);
  assert.strictEqual(res.rows[0].longestPts, 0);
  assert.strictEqual(res.rows[0].globePts, 10);
  assert.strictEqual(res.rows[1].globePts, 0);
  assert.strictEqual(T.rules(s).longest, 0);
  // tie on points: more completed tickets wins, even against a longer route
  assert.strictEqual(res.rows[0].total, 6 + 5 + 10);
  own(s, 1, [rid(m, 'mo-i-rana', 'trondheim', 'red'), rid(m, 'oulu', 'vaasa'), rid(m, 'oulu', 'kajaani')]); // 15 + 4 + 2
  const r = endGameNow(s);
  assert.strictEqual(r.rows[1].total, 21);
  assert.ok(r.rows[1].longest > r.rows[0].longest);
  assert.strictEqual(r.winner, 0);
  s.players[0].tickets = []; s.players[1].tickets = [];
  s.players[0].routes = [rid(m, 'oulu', 'kuopio')]; s.players[1].routes = [rid(m, 'imatra', 'helsinki')]; // 3 each, equal tickets -> equal
  own(s, 1, [rid(m, 'rovaniemi', 'tornio')]); s.players[0].routes.push(rid(m, 'tornio', 'oulu')); // 4+1 each; P1 longest 3, P0 longest 4
  const r2 = endGameNow(s);
  assert.strictEqual(r2.rows[0].total, r2.rows[1].total);
  assert.strictEqual(r2.winner, 0, 'then the longest route');
});

// ================================================================ India
test('India: drawing tickets mid-game deals 3, keep at least 1', () => {
  const m = load('india'); let s = start(m, 2, 10);
  s = T.apply(s, { type: 'drawTickets', seat: s.turn });
  assert.strictEqual(s.players[s.turn].pending.tickets.length, 3);
  assert.strictEqual(s.players[s.turn].pending.min, 1);
  const s0 = T.newGame(m, { seed: 10, seats: [{}, {}] });
  assert.strictEqual(s0.players[0].pending.tickets.length, 4);
});

test('India: Indian Express 10 for the longest path', () => {
  const m = load('india'); let s = start(m, 2, 11);
  assert.strictEqual(m.longestName, 'Indian Express');
  s.players[0].tickets = []; s.players[1].tickets = [];
  own(s, 0, [rid(m, 'lahore', 'ambala')]);
  const res = endGameNow(s);
  assert.strictEqual(res.rows[0].longestPts, 10);
  assert.strictEqual(res.rows[1].longestPts, 0);
});

test('India: Mandala total by qualifying tickets 1→5, 2→10, 3→20, 4→30, 5+→40', () => {
  const m = load('india'); const s0 = start(m, 2, 12);
  const tk = T.deckFor(m, s0).tickets;
  // for each ticket: its shortest path plus a second path that shares no track; keep the 7 smallest
  const ix = G.index(m);
  const two = tk.map((t, i) => {
    const p1 = G.shortest(m, t.a, t.b, r => r.len), ban = new Set();
    p1.path.forEach(id => { ban.add(id); const r = ix.routeById[id]; if (r.twin) ban.add(r.twin); });
    const p2 = G.shortest(m, t.a, t.b, r => ban.has(r.id) ? Infinity : r.len);
    return p2 && { i, ids: p1.path.concat(p2.path) };
  }).filter(Boolean).sort((x, y) => x.ids.length - y.ids.length).slice(0, 7);
  const qual = two.map(x => x.i);
  const all = [...new Set([].concat(...two.map(x => x.ids)))];
  for (const i of qual) assert.ok(G.disjointPaths(m, all, tk[i].a, tk[i].b, 2) >= 2);
  const want = [0, 5, 10, 20, 30, 40, 40, 40];
  for (let k = 0; k <= 7; k++) {
    const s = T.clone(s0);
    s.players[0].tickets = qual.slice(0, k); s.players[1].tickets = [];
    s.players[0].routes = all.slice(); all.forEach(id => { s.owner[id] = 0; });
    const row = endGameNow(s).rows[0];
    assert.strictEqual(row.mandalas, k);
    assert.strictEqual(row.mandalaPts, want[k], k + ' qualifying tickets');
  }
});

test('India: routes and city names as printed on the board', () => {
  const m = load('india');
  assert.strictEqual(m.routes.length, 108);
  const cm = m.routes.filter(r => pair(r, 'calcutta', 'madras'));
  assert.deepStrictEqual(cm.map(r => [r.len, r.kind, r.locos, r.color]), [[8, 'ferry', 2, 'gray']]);
  assert.strictEqual(m.routes.filter(r => pair(r, 'chittagong', 'madras')).length, 0);
  assert.strictEqual(m.routes.filter(r => pair(r, 'ambala', 'bareilly')).length, 1);
  const name = id => m.cities.find(c => c.id === id).name;
  assert.deepStrictEqual(['jarhat', 'ratiam', 'waltain', 'indur', 'mormugau'].map(name), ['Jarhat', 'Ratiam', 'Waltain', 'Indur', 'Mormugau']);
  assert.strictEqual(m.routes.filter(r => r.kind === 'tunnel').length, 0);
});

// ================================================================ Switzerland
test('Switzerland: counts match the published game', () => {
  const m = load('switzerland');
  assert.deepStrictEqual(m.players, [2, 3]);
  assert.strictEqual(m.trains, 40);
  assert.strictEqual(deckSize(m), 110);
  assert.strictEqual(m.deck.loco, 14);
  assert.strictEqual(m.cities.filter(c => !c.country).length, 34);
  assert.deepStrictEqual(Object.fromEntries(Object.entries(m.countries).map(([k, c]) => [k, c.cities.length])), { deutschland: 5, osterreich: 3, italia: 5, france: 4 });
  assert.strictEqual(m.routes.length, 88);
  const tk = m.ticketDecks[0].tickets;
  assert.strictEqual(tk.length, 46);
  assert.strictEqual(tk.filter(t => !t.opts).length, 34);
  assert.strictEqual(tk.filter(t => t.opts && !m.countries[t.a]).length, 4);
  assert.strictEqual(tk.filter(t => t.opts && m.countries[t.a]).length, 8);
  assert.deepStrictEqual([m.setup, m.draw], [{ deal: 5, keep: 2 }, { deal: 3, keep: 1 }]);
  assert.strictEqual(m.bonuses.longest, 10);
  assert.strictEqual(m.routes.filter(r => r.kind === 'ferry').length, 0);
  assert.ok(Math.max(...m.routes.map(r => r.len)) <= 6);
});

test('Switzerland: locomotives only on tunnels', () => {
  const m = load('switzerland'); let s = start(m, 2, 13); const seat = s.turn;
  give(s, seat, { blue: 2, loco: 3 });
  const plain = rid(m, 'bern', 'interlaken'); // blue 3
  throwsRule(() => T.apply(s, { type: 'claim', seat, route: plain, pay: { color: 'blue', n: 2, locos: 1 } }), /locomotive/);
  assert.deepStrictEqual(T.payOptions(s, seat, plain), []);
  const tunnel = rid(m, 'basel', 'olten'); // orange tunnel 2
  s.trainDeck.push('red', 'red', 'red');
  assert.strictEqual(T.apply(s, { type: 'claim', seat, route: tunnel, pay: { color: null, n: 0, locos: 2 } }).owner[tunnel], seat);
});

test('Switzerland: two face-up locomotives may be taken, and three face up are swept', () => {
  const m = load('switzerland'); let s = start(m, 2, 14); const seat = s.turn;
  s.faceUp = ['loco', 'loco', 'red', 'blue', 'green'];
  s.trainDeck.push('red', 'red');
  s = T.apply(s, { type: 'draw', seat, from: 0 });
  assert.strictEqual(s.turn, seat, 'a face-up locomotive is just one card');
  s = T.apply(s, { type: 'draw', seat, from: 1 });
  assert.strictEqual(s.turn, 1 - seat);
  let t = start(m, 2, 15);
  t.faceUp = ['loco', 'loco', 'red', 'blue', null];
  t.trainDeck.push('loco');
  t = T.apply(t, { type: 'draw', seat: t.turn, from: 2 });
  assert.ok(t.faceUp.filter(c => c === 'loco').length < 3);
  assert.strictEqual(cardsInPlay(t), 110);
});

test('Switzerland: returned tickets leave the game', () => {
  const m = load('switzerland');
  let s = T.newGame(m, { seed: 16, seats: [{}, {}] });
  for (let i = 0; i < 2; i++) s = T.apply(s, { type: 'keepTickets', seat: i, keep: s.players[i].pending.tickets.slice(0, 2) });
  assert.strictEqual(s.ticketDeck.length, 46 - 10);
});

test('Switzerland: double routes open to both at 3 players, one side only at 2', () => {
  const m = load('switzerland');
  for (const n of [2, 3]) {
    let s = start(m, n, 17);
    const a = s.turn, b = (a + 1) % n;
    give(s, a, { red: 3 }); give(s, b, { pink: 3 });
    s = T.apply(s, { type: 'claim', seat: a, route: rid(m, 'fribourg', 'lausanne', 'red'), pay: { color: 'red', n: 3, locos: 0 } });
    const other = rid(m, 'fribourg', 'lausanne', 'pink');
    if (n === 2) throwsRule(() => T.apply(s, { type: 'claim', seat: b, route: other, pay: { color: 'pink', n: 3, locos: 0 } }), /double/);
    else assert.strictEqual(T.apply(s, { type: 'claim', seat: b, route: other, pay: { color: 'pink', n: 3, locos: 0 } }).owner[other], b);
  }
});

test('Switzerland: country tickets score the best option reached, else lose the lowest', () => {
  const m = load('switzerland'); const s0 = start(m, 2, 18);
  const tk = T.deckFor(m, s0).tickets;
  const bern = tk.findIndex(t => t.a === 'bern' && t.opts);
  assert.deepStrictEqual(tk[bern].opts.map(o => [o.to, o.pts]), [['deutschland', 6], ['osterreich', 11], ['italia', 8], ['france', 5]]);
  const fr = tk.findIndex(t => t.a === 'france' && t.opts);
  const pathTo = (from, country) => { let best = null; for (const c of m.countries[country].cities) { const p = G.shortest(m, from, c, r => r.len); if (p && (!best || p.dist < best.dist)) best = p; } return best.path; };
  const play = (tickets, routes) => { const s = T.clone(s0); s.players[0].tickets = tickets; s.players[1].tickets = []; s.players[0].routes = []; own(s, 0, [...new Set(routes)]); return endGameNow(s).rows[0]; };
  assert.strictEqual(play([bern], []).ticketPts, -5, 'none reached: lose the lowest');
  assert.strictEqual(play([bern], pathTo('bern', 'france')).ticketPts, 5);
  assert.strictEqual(play([bern], pathTo('bern', 'france').concat(pathTo('bern', 'deutschland'))).ticketPts, 6, 'best of the options reached');
  assert.strictEqual(play([bern], pathTo('bern', 'france').concat(pathTo('bern', 'deutschland'), pathTo('bern', 'osterreich'))).ticketPts, 11);
  // country to country: France -> Deutschland 5 via Genève–Lausanne–…–Basel
  const frDe = pathTo('geneve', 'france').concat(G.shortest(m, 'geneve', 'basel', r => r.len).path, pathTo('basel', 'deutschland'));
  const row = play([fr], frDe);
  assert.strictEqual(row.ticketPts, 5);
  assert.strictEqual(row.done, 1);
  // city-city tickets still work
  const bz = tk.findIndex(t => !t.opts && [t.a, t.b].sort().join() === 'bern,zurich');
  assert.strictEqual(play([bz], G.shortest(m, 'bern', 'zurich', r => r.len).path).ticketPts, 6);
});

test('Switzerland: country endpoints are separate dots that count as one country', () => {
  const m = load('switzerland');
  for (const [k, c] of Object.entries(m.countries)) for (const id of c.cities) {
    const city = m.cities.find(x => x.id === id);
    assert.strictEqual(city.country, k);
    assert.strictEqual(m.routes.filter(r => r.a === id || r.b === id).length, 1, id + ' has one track');
  }
  assert.strictEqual(T.ticketEnds(m, 'italia').length, 5);
  assert.deepStrictEqual(T.ticketEnds(m, 'bern'), ['bern']);
});
