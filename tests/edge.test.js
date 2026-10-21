// Odd moments at the table: a stuck player, a game nobody can finish, a dead heat, a bad station payment.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const T = require('../js/engine.js');
const AI = require('../js/ai.js');
const load = id => T.register(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'maps', id + '.json'), 'utf8')));
function start(map, n, seed) {
  let s = T.newGame(map, { seed, seats: Array.from({ length: n }, (_, i) => ({ name: 'P' + i })) });
  for (let i = 0; i < n; i++) s = T.apply(s, { type: 'keepTickets', seat: i, keep: s.players[i].pending.tickets.slice(0, s.players[i].pending.min) });
  return s;
}
const throwsRule = (fn, re) => assert.throws(fn, e => e.rule && (!re || re.test(e.message)));

// every train card in hands, no tickets left, every short route taken (shared round the table, as in a long
// game) and 3 trains each, so nobody can draw or claim
function stuck(map, n, seed) {
  const s = start(map, n, seed);
  const all = s.trainDeck.concat(s.discard, s.faceUp.filter(Boolean));
  s.trainDeck = []; s.discard = []; s.faceUp = [null, null, null, null, null];
  all.forEach((c, i) => { s.players[i % n].hand[c]++; });
  s.ticketDeck = [];
  s.players.forEach(p => { p.trains = 3; });
  let k = 0;
  for (const r of map.routes) if (r.len <= 3) { const o = k++ % n; s.owner[r.id] = o; s.players[o].routes.push(r.id); }
  return s;
}

test('a station payment must be whole, non-negative cards (no free locomotive from -1)', () => {
  const m = load('europe'); const s = start(m, 2, 5); const seat = s.turn;
  s.players[seat].hand = Object.assign(T.emptyHand(), { red: 2 });
  throwsRule(() => T.apply(s, { type: 'station', seat, city: m.cities[0].id, pay: { color: 'red', n: 2, locos: -1 } }), /bad payment/);
  throwsRule(() => T.apply(s, { type: 'station', seat, city: m.cities[0].id, pay: { color: 'red', n: 0.5, locos: 0.5 } }), /bad payment/);
  // a good one still works
  assert.strictEqual(T.apply(s, { type: 'station', seat, city: m.cities[0].id, pay: { color: 'red', n: 1, locos: 0 } }).stationAt[m.cities[0].id], seat);
});

test('nothing to draw and nothing to claim: a player may pass; when everyone passes in turn the game ends', () => {
  for (const n of [2, 5]) {
    const m = load('usa'); let s = stuck(m, n, 7 + n);
    assert.deepStrictEqual(T.legal(s, s.turn).filter(t => t === 'draw' || t === 'drawTickets'), []);
    let passes = 0;
    while (s.phase !== 'over' && passes < 20) { s = T.apply(s, { type: 'pass', seat: s.turn }); passes++; }
    assert.strictEqual(s.phase, 'over');
    assert.strictEqual(passes, n);
    assert.ok(s.result && s.result.rows.length === n);
    assert.match(s.log[s.log.length - 1].text, /Nobody can move/);
  }
});

test('a pass streak is broken by any real move', () => {
  const m = load('usa'); let s = stuck(m, 3, 21);
  s = T.apply(s, { type: 'pass', seat: s.turn });
  s = T.apply(s, { type: 'pass', seat: s.turn });
  // the third player gets a ticket deck back and draws: the streak restarts
  s.ticketDeck = [0, 1, 2];
  const seat = s.turn;
  s = T.apply(s, { type: 'drawTickets', seat });
  s = T.apply(s, { type: 'keepTickets', seat, keep: s.players[seat].pending.tickets.slice(0, 1) });
  s.ticketDeck = []; // the two returned tickets: put them away so the next players are stuck again
  s = T.apply(s, { type: 'pass', seat: s.turn });
  s = T.apply(s, { type: 'pass', seat: s.turn });
  assert.notStrictEqual(s.phase, 'over');
});

test('computers in a dead position pass, and a computer-only game still ends', () => {
  const m = load('usa'); let s = stuck(m, 3, 31);
  let k = 0;
  while (s.phase !== 'over' && k++ < 30) { const a = AI.choose(T.view(s, s.turn), s.turn, 'hard'); s = T.apply(s, a); }
  assert.strictEqual(s.phase, 'over');
});

test('a dead heat after every tie-break is reported as shared', () => {
  const m = load('usa'); const s = start(m, 3, 9);
  s.players.forEach(p => { p.tickets = []; p.routes = []; }); s.owner = {};
  const r = T.score(s);
  assert.deepStrictEqual(r.tied.slice().sort(), [0, 1, 2]);
  // a tie on points broken by completed tickets is not shared
  const m2 = load('usa'); const s2 = start(m2, 2, 10);
  s2.players.forEach(p => { p.tickets = []; p.routes = []; }); s2.owner = {};
  const t = T.deckFor(m2, s2).tickets.findIndex(x => x.pts === 4);
  const tk = T.deckFor(m2, s2).tickets[t];
  // seat 1 holds a finished 4-point ticket; seat 0 holds 4 points of routes that finish nothing
  const G = require('../js/graph.js');
  const sp = G.shortest(m2, tk.a, tk.b, x => x.len);
  s2.players[1].tickets = [t]; for (const id of sp.path) { s2.owner[id] = 1; s2.players[1].routes.push(id); }
  const r2 = T.score(s2);
  if (r2.rows[0].total === r2.rows[1].total) assert.deepStrictEqual(r2.tied, [r2.winner]);
  assert.strictEqual(r2.tied.length, 1);
});
