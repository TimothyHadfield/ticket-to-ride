// Rules engine: each test sets up a small position by hand and checks one rule.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const T = require('../js/engine.js');
const G = require('../js/graph.js');
const load = id => T.register(require(path.join(__dirname, '..', 'maps', id + '.json')));
const USA = load('usa'), EU = load('europe'), NORDIC = load('nordic'), INDIA = load('india');

const rid = (m, a, b, color) => m.routes.find(r => ((r.a === a && r.b === b) || (r.a === b && r.b === a)) && (!color || r.color === color)).id;
function start(map, n, seed, deckId) {
  let s = T.newGame(map, { seed: seed || 1, deckId, seats: Array.from({ length: n }, (_, i) => ({ name: 'P' + i })) });
  for (let i = 0; i < n; i++) s = T.apply(s, { type: 'keepTickets', seat: i, keep: s.players[i].pending.tickets.slice(0, s.players[i].pending.min) });
  return s;
}
const give = (s, seat, cards) => { const h = T.emptyHand(); Object.assign(h, cards); s.players[seat].hand = h; return s; };
const throwsRule = (fn, re) => assert.throws(fn, e => e.rule && (!re || re.test(e.message)));
function cardsInPlay(s) {
  let n = s.trainDeck.length + s.discard.length + s.faceUp.filter(Boolean).length;
  for (const p of s.players) n += T.handSize(p.hand);
  return n;
}

test('setup: 4 cards each, 5 face up, tickets dealt and a minimum kept', () => {
  let s = T.newGame(USA, { seed: 5, seats: [{}, {}, {}] });
  assert.strictEqual(s.phase, 'setup');
  s.players.forEach(p => { assert.strictEqual(T.handSize(p.hand), 4); assert.strictEqual(p.pending.tickets.length, 3); assert.strictEqual(p.pending.min, 2); });
  assert.strictEqual(s.faceUp.filter(Boolean).length, 5);
  throwsRule(() => T.apply(s, { type: 'keepTickets', seat: 0, keep: [s.players[0].pending.tickets[0]] }), /at least 2/);
  for (let i = 0; i < 3; i++) s = T.apply(s, { type: 'keepTickets', seat: i, keep: s.players[i].pending.tickets.slice(0, 2) });
  assert.strictEqual(s.phase, 'main');
  assert.strictEqual(s.ticketDeck.length, 30 - 9 + 3); // unkept go to the bottom
  assert.strictEqual(cardsInPlay(s), 110);
});

test('Europe setup: one long ticket + three short; unkept long tickets leave the game', () => {
  let s = T.newGame(EU, { seed: 3, seats: [{}, {}] });
  const tk = T.deckFor(EU, s).tickets;
  for (const p of s.players) { assert.strictEqual(p.pending.tickets.filter(t => tk[t].long).length, 1); assert.strictEqual(p.pending.tickets.length, 4); }
  const longs = s.players.map(p => p.pending.tickets.find(t => tk[t].long));
  s = T.apply(s, { type: 'keepTickets', seat: 0, keep: s.players[0].pending.tickets.filter(t => !tk[t].long).slice(0, 2) });
  assert.ok(!s.ticketDeck.includes(longs[0]) && !s.longDeck.includes(longs[0]));
  assert.strictEqual(s.players[0].stations, 3);
});

test('draw: two cards, a face-up locomotive ends the turn, and cannot be the second card', () => {
  let s = start(USA, 2, 11);
  const seat = s.turn;
  s.faceUp = ['loco', 'red', 'blue', 'green', 'black'];
  let a = T.apply(s, { type: 'draw', seat, from: 0 });
  assert.strictEqual(a.turn, 1 - seat, 'face-up loco is the whole turn');
  let b = T.apply(s, { type: 'draw', seat, from: 1 });
  assert.strictEqual(b.turn, seat);
  b.faceUp[0] = 'loco';
  throwsRule(() => T.apply(b, { type: 'draw', seat, from: 0 }), /only draw/);
  throwsRule(() => T.apply(b, { type: 'claim', seat, route: b.faceUp[1] }), /second card/);
  b = T.apply(b, { type: 'draw', seat, from: 'deck' });
  assert.strictEqual(b.turn, 1 - seat);
});

test('three face-up locomotives are swept and replaced', () => {
  let s = start(USA, 2, 12);
  s.faceUp = ['loco', 'loco', 'red', 'blue', null];
  s.trainDeck.push('loco');
  s = T.apply(s, { type: 'draw', seat: s.turn, from: 2 }); // refill pulls the loco -> 3 locos -> sweep
  assert.ok(s.faceUp.filter(c => c === 'loco').length < 3);
  assert.strictEqual(cardsInPlay(s), 110);
});

test('claim: right colour and count, gray takes any one colour, locos are wild', () => {
  let s = start(USA, 2, 13);
  const seat = s.turn;
  give(s, seat, { red: 2, loco: 1, blue: 1 });
  const ny = rid(USA, 'boston', 'new-york', 'red');
  throwsRule(() => T.apply(s, { type: 'claim', seat, route: ny, pay: { color: 'blue', n: 2, locos: 0 } }), /wrong colour|not enough/);
  const s2 = T.apply(s, { type: 'claim', seat, route: ny, pay: { color: 'red', n: 1, locos: 1 } });
  assert.strictEqual(s2.owner[ny], seat);
  assert.strictEqual(s2.players[seat].trains, 43);
  assert.strictEqual(T.liveRoutePoints(s2, seat), 2);
  const gray = rid(USA, 'washington', 'raleigh');
  const s3 = T.apply(s, { type: 'claim', seat, route: gray, pay: { color: 'blue', n: 1, locos: 1 } });
  assert.strictEqual(s3.owner[gray], seat);
  throwsRule(() => T.apply(s, { type: 'claim', seat, route: gray, pay: { color: 'red', n: 1, locos: 0 } }), /number/);
});

test('double routes: closed to everyone in 2–3 player games, open to others with 4+, never both to one player', () => {
  for (const n of [2, 3, 4]) {
    let s = start(USA, n, 14);
    const a = s.turn, b = (a + 1) % n;
    give(s, a, { red: 2, yellow: 2 }); give(s, b, { yellow: 2 });
    const red = rid(USA, 'boston', 'new-york', 'red'), yellow = rid(USA, 'boston', 'new-york', 'yellow');
    s = T.apply(s, { type: 'claim', seat: a, route: red, pay: { color: 'red', n: 2, locos: 0 } });
    assert.strictEqual(s.turn, b);
    if (n < 4) throwsRule(() => T.apply(s, { type: 'claim', seat: b, route: yellow, pay: { color: 'yellow', n: 2, locos: 0 } }), /double/);
    else assert.strictEqual(T.apply(s, { type: 'claim', seat: b, route: yellow, pay: { color: 'yellow', n: 2, locos: 0 } }).owner[yellow], b);
    assert.strictEqual(T.routeOpen(s, USA.routes.find(r => r.id === yellow), a), 'own twin');
  }
});

test('ferry needs its locomotives; tunnel asks for extra cards that match', () => {
  let s = start(EU, 2, 15);
  const seat = s.turn;
  give(s, seat, { red: 6, loco: 2 });
  const ferry = rid(EU, 'palermo', 'smyrna');
  throwsRule(() => T.apply(s, { type: 'claim', seat, route: ferry, pay: { color: 'red', n: 5, locos: 1 } }), /ferry needs 2/);
  assert.strictEqual(T.apply(s, { type: 'claim', seat, route: ferry, pay: { color: 'red', n: 4, locos: 2 } }).owner[ferry], seat);

  const tunnel = rid(EU, 'madrid', 'pamplona', 'black');
  give(s, seat, { black: 5, loco: 1 });
  s.trainDeck.push('green', 'loco', 'black'); // revealed: black, loco, green -> 2 extra
  let t = T.apply(s, { type: 'claim', seat, route: tunnel, pay: { color: 'black', n: 3, locos: 0 } });
  assert.deepStrictEqual(t.pendingTunnel.extra, 2);
  assert.strictEqual(t.owner[tunnel], undefined);
  const paid = T.apply(t, { type: 'tunnelPay', seat, pay: true, extraLocos: 0 });
  assert.strictEqual(paid.owner[tunnel], seat);
  assert.strictEqual(paid.players[seat].hand.black, 0);
  const quit = T.apply(t, { type: 'tunnelPay', seat, pay: false });
  assert.strictEqual(quit.owner[tunnel], undefined);
  assert.strictEqual(quit.players[seat].hand.black, 5, 'cards go back to the hand');
  assert.strictEqual(quit.turn, 1 - seat);
  // paying only with locomotives: only locomotives count as matches
  give(s, seat, { loco: 5 });
  s.trainDeck.push('black', 'black', 'loco');
  const base = cardsInPlay(s);
  t = T.apply(s, { type: 'claim', seat, route: tunnel, pay: { color: null, n: 0, locos: 3 } });
  assert.strictEqual(t.pendingTunnel.extra, 1);
  assert.strictEqual(cardsInPlay(T.apply(t, { type: 'tunnelPay', seat, pay: true, extraLocos: 1 })), base, 'no card created or lost');
});

test('stations: cost 1, 2, 3 cards; one per city; unused ones score 4', () => {
  let s = start(EU, 2, 16);
  let seat = s.turn;
  give(s, seat, { red: 6 });
  s = T.apply(s, { type: 'station', seat, city: 'paris', pay: { color: 'red', n: 1, locos: 0 } });
  assert.strictEqual(s.players[seat].stations, 2);
  s = T.apply(s, { type: 'draw', seat: s.turn, from: 'deck' }); s = T.apply(s, { type: 'draw', seat: s.turn, from: 'deck' });
  throwsRule(() => T.apply(s, { type: 'station', seat, city: 'roma', pay: { color: 'red', n: 1, locos: 0 } }), /costs 2/);
  throwsRule(() => T.apply(s, { type: 'station', seat, city: 'paris', pay: { color: 'red', n: 2, locos: 0 } }), /already/);
  s = T.apply(s, { type: 'station', seat, city: 'roma', pay: { color: 'red', n: 2, locos: 0 } });
  assert.strictEqual(s.players[seat].stations, 1);
});

test('station borrows one rival route for tickets', () => {
  let s = start(EU, 2, 17);
  const me = 0, rival = 1;
  const tk = T.deckFor(EU, s).tickets;
  const ti = tk.findIndex(t => [t.a, t.b].sort().join() === 'edinburgh,paris');
  s.players[me].tickets = [ti]; s.players[rival].tickets = [];
  const own = (seat, r) => { s.owner[r] = seat; s.players[seat].routes.push(r); };
  own(me, rid(EU, 'edinburgh', 'london', 'black'));
  own(rival, rid(EU, 'london', 'dieppe'));
  own(me, rid(EU, 'dieppe', 'paris'));
  let res = T.score(s);
  assert.strictEqual(res.rows[me].ticketPts, -7);
  s.players[me].stationCities = ['dieppe']; s.players[me].stations = 2;
  res = T.score(s);
  assert.strictEqual(res.rows[me].ticketPts, 7);
  assert.strictEqual(res.rows[me].stationPts, 8);
});

test('longest trail: classic figure-eight and branch cases', () => {
  // Denver–Omaha–Kansas City–Denver loop plus a tail: trail may pass a city twice
  const ids = [rid(USA, 'denver', 'omaha'), rid(USA, 'omaha', 'kansas-city'), rid(USA, 'denver', 'kansas-city', 'black'), rid(USA, 'kansas-city', 'saint-louis', 'blue'), rid(USA, 'denver', 'helena')];
  // 4 + 1 + 4 + 2 + 4: helena-denver-omaha-kc-denver?? can't reuse denver-kc… best = helena(4)denver(4)omaha(1)kc(4)denver = 13, or …kc-stlouis: helena-denver-omaha-kc-stl = 11
  assert.strictEqual(G.longestTrail(USA, ids).len, 13);
  assert.strictEqual(G.longestTrail(USA, []).len, 0);
});

test('end of game: at 2 or fewer trains everyone gets exactly one more turn; scoring adds bonuses', () => {
  let s = start(USA, 3, 18);
  const seat = s.turn;
  s.players[seat].trains = 4;
  give(s, seat, { red: 2 });
  s = T.apply(s, { type: 'claim', seat, route: rid(USA, 'boston', 'new-york', 'red'), pay: { color: 'red', n: 2, locos: 0 } });
  assert.strictEqual(s.lastRound, seat);
  for (let k = 0; k < 2; k++) { assert.strictEqual(s.phase, 'main'); s = T.apply(s, { type: 'draw', seat: s.turn, from: 'deck' }); s = T.apply(s, { type: 'draw', seat: s.turn, from: 'deck' }); }
  assert.strictEqual(s.turn, seat, 'the player who triggered it also gets a last turn');
  s = T.apply(s, { type: 'draw', seat, from: 'deck' }); s = T.apply(s, { type: 'draw', seat, from: 'deck' });
  assert.strictEqual(s.phase, 'over');
  const row = s.result.rows[seat];
  assert.strictEqual(row.routePts, 2);
  assert.strictEqual(row.longestPts, 10); // the only player with track
  assert.strictEqual(row.total, row.routePts + row.ticketPts + 10);
});

test('route score table', () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => T.routePoints(EU, n)), [1, 2, 4, 7, 10, 15, 18, 21]);
  assert.strictEqual(T.routePoints(NORDIC, 9), 27);
});

test('India: Mandala counts tickets joined by two separate paths', () => {
  let s = start(INDIA, 2, 19);
  const tk = T.deckFor(INDIA, s).tickets;
  const ti = tk.findIndex(t => [t.a, t.b].sort().join() === 'delhi,lahore');
  s.players[0].tickets = [ti]; s.players[1].tickets = [];
  const own = r => { s.owner[r] = 0; s.players[0].routes.push(r); };
  // Lahore–Ambala–Delhi and Lahore–Bhatinda–Delhi: two paths, no route shared
  own(rid(INDIA, 'lahore', 'ambala')); own(rid(INDIA, 'ambala', 'delhi'));
  let res = T.score(s);
  assert.strictEqual(res.rows[0].mandalas, 0);
  own(rid(INDIA, 'lahore', 'bhatinda')); own(rid(INDIA, 'bhatinda', 'delhi'));
  res = T.score(s);
  assert.strictEqual(res.rows[0].mandalas, 1);
  assert.strictEqual(res.rows[0].mandalaPts, INDIA.bonuses.mandala[1]);
});

test('view hides other hands, tickets and the deck order', () => {
  const s = start(USA, 3, 20);
  const v = T.view(s, 1);
  assert.ok(v.players[1].hand && v.players[1].tickets);
  assert.strictEqual(v.players[0].hand, null);
  assert.strictEqual(v.players[0].tickets, null);
  assert.strictEqual(v.players[0].handCount, 4);
  assert.strictEqual(typeof v.trainDeck, 'number');
  assert.strictEqual(v.rng, 0);
  assert.ok(!JSON.stringify(v.players[2]).includes('"pink"'));
});

test('apply never mutates its input', () => {
  const s = start(USA, 2, 21);
  const before = JSON.stringify(s);
  T.apply(s, { type: 'draw', seat: s.turn, from: 'deck' });
  assert.strictEqual(JSON.stringify(s), before);
});
