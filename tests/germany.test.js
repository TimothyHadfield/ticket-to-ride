// Germany (Ticket to Ride: Germany, 2017): 35 cities + 5 neighbouring countries, 110 routes (two triples),
// 89 tickets (55 short, 34 long), 60 passengers (10 of 6 colours) spread over the cities, short/long ticket mixes,
// passenger majorities 20 / 10 per colour. Sources: docs/rules-check.md (Germany).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const T = require('../js/engine.js');
const AI = require('../js/ai.js');
const load = id => T.register(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'maps', id + '.json'), 'utf8')));
const seats = n => Array.from({ length: n }, (_, i) => ({ name: 'P' + i }));
const sum = o => Object.values(o).reduce((a, b) => a + (Array.isArray(b) ? b.length : b), 0);

test('Germany map: cities, routes, triples, tickets and passengers as printed', () => {
  const m = load('germany');
  assert.deepStrictEqual(m.players, [2, 5]);
  assert.strictEqual(m.trains, 45);
  assert.strictEqual(m.cities.filter(c => !c.country).length, 35);
  assert.strictEqual(Object.keys(m.countries).length, 5);
  assert.strictEqual(m.routes.length, 110);
  assert.strictEqual(m.routes.reduce((a, r) => a + r.len, 0), 313);
  assert.strictEqual(m.routes.filter(r => r.sibs).length, 6, 'two triples (Dortmund–Düsseldorf, Köln–Düsseldorf)');
  const t = m.ticketDecks[0].tickets;
  assert.strictEqual(t.length, 89);
  assert.strictEqual(t.filter(x => x.long).length, 34);
  assert.strictEqual(m.bonuses.globetrotter, 15);
  assert.ok(!m.bonuses.longest);
  assert.strictEqual(sum(m.passengers.at), 60);
  assert.strictEqual(m.passengers.at.berlin, 5);
});

test('Germany setup: choose the mix first, then 4 tickets in that mix, keep at least 2; the rest go back', () => {
  const m = load('germany');
  let s = T.newGame(m, { seed: 4, seats: seats(3) });
  // passengers: 60 on the board, 10 of each colour, per-place counts as printed
  assert.strictEqual(sum(s.pax), 60);
  for (const c of m.passengers.colors) assert.strictEqual(Object.values(s.pax).flat().filter(x => x === c).length, 10);
  for (const [k, n] of Object.entries(m.passengers.at)) assert.strictEqual(s.pax[k].length, n, k);
  assert.deepStrictEqual(T.legal(s, 0), ['ticketMix']);
  const short0 = s.ticketDeck.length, long0 = s.longDeck.length;
  s = T.apply(s, { type: 'ticketMix', seat: 0, long: 2 });
  const pend = s.players[0].pending.tickets, tk = T.deckFor(m, s).tickets;
  assert.strictEqual(pend.length, 4);
  assert.strictEqual(pend.filter(i => tk[i].long).length, 2);
  assert.throws(() => T.apply(s, { type: 'keepTickets', seat: 0, keep: [pend[0]] }), /at least 2/);
  s = T.apply(s, { type: 'keepTickets', seat: 0, keep: pend.slice(0, 2) });
  // the two not kept went back into their own decks
  assert.strictEqual(s.ticketDeck.length + s.longDeck.length, short0 + long0 - 2);
  for (const i of s.ticketDeck) assert.ok(!tk[i].long);
  for (const i of s.longDeck) assert.ok(tk[i].long);
});

test('Germany mid-game ticket draw: 4 in the announced mix, keep at least 1, the rest to the bottom of their decks', () => {
  const m = load('germany');
  let s = T.newGame(m, { seed: 9, seats: seats(2) });
  for (const i of [0, 1]) { s = T.apply(s, { type: 'ticketMix', seat: i, long: 0 }); s = T.apply(s, { type: 'keepTickets', seat: i, keep: s.players[i].pending.tickets.slice(0, 2) }); }
  const seat = s.turn, tk = T.deckFor(m, s).tickets;
  s = T.apply(s, { type: 'drawTickets', seat, long: 3 });
  const pend = s.players[seat].pending.tickets;
  assert.strictEqual(pend.length, 4);
  assert.strictEqual(pend.filter(i => tk[i].long).length, 3);
  assert.strictEqual(s.players[seat].pending.min, 1);
  const back = pend.slice(1);
  s = T.apply(s, { type: 'keepTickets', seat, keep: [pend[0]] });
  for (const i of back) {
    const d = tk[i].long ? s.longDeck : s.ticketDeck;
    assert.ok(d.indexOf(i) < back.length, 'returned ticket sits at the bottom');
  }
});

test('Germany claim: one passenger from each end (your colour, or the best one), a country counts as one place', () => {
  const m = load('germany');
  let s = T.newGame(m, { seed: 2, seats: seats(2) });
  for (const i of [0, 1]) { s = T.apply(s, { type: 'ticketMix', seat: i, long: 1 }); s = T.apply(s, { type: 'keepTickets', seat: i, keep: s.players[i].pending.tickets.slice(0, 2) }); }
  const seat = s.turn;
  const r = m.routes.find(x => (x.a === 'berlin' || x.b === 'berlin') && (x.a === 'leipzig' || x.b === 'leipzig'));
  const h = T.emptyHand(); h.loco = 10; s.players[seat].hand = h;
  s.pax.berlin = ['red', 'red', 'blue', 'white', 'white']; s.pax.leipzig = ['black', 'green', 'green'];
  s = T.apply(s, { type: 'claim', seat, route: r.id, pay: { color: null, n: 0, locos: r.len }, pax: { berlin: 'blue', leipzig: 'black' } });
  assert.deepStrictEqual(s.pax.berlin.slice().sort(), ['red', 'red', 'white', 'white']);
  assert.deepStrictEqual(s.pax.leipzig, ['green', 'green']);
  assert.strictEqual(s.players[seat].pax.blue, 1);
  assert.strictEqual(s.players[seat].pax.black, 1);
  // to a country: the passenger comes from the country's spot
  const seat2 = s.turn;
  const rc = m.routes.find(x => [x.a, x.b].some(e => m.cities.find(c => c.id === e).country === 'schweiz'));
  const h2 = T.emptyHand(); h2.loco = 10; s.players[seat2].hand = h2;
  s.pax.schweiz = ['yellow'];
  s = T.apply(s, { type: 'claim', seat: seat2, route: rc.id, pay: { color: null, n: 0, locos: rc.len } });
  assert.deepStrictEqual(s.pax.schweiz, []);
  assert.strictEqual(s.players[seat2].pax.yellow, 1);
});

test('Germany triples: with 2–3 players one track closes the others; with 4–5 others stay open, never two for one player', () => {
  const m = load('germany');
  const [a, b, c] = m.routes.filter(r => r.sibs).slice(0, 3);
  for (const [n, open] of [[3, false], [4, true]]) {
    const s = T.newGame(m, { seed: 1, seats: seats(n) });
    s.owner[a.id] = 0; s.players[0].routes.push(a.id);
    assert.strictEqual(T.routeOpen(s, b, 1) === null, open, n + ' players');
    assert.strictEqual(T.routeOpen(s, c, 1) === null, open, n + ' players');
    assert.strictEqual(T.routeOpen(s, b, 0), 'own twin');
  }
});

test('Germany scoring: per colour 20 for most, 10 for second; ties for most share 20 with no second; ties break on passengers', () => {
  const m = load('germany');
  const s = T.newGame(m, { seed: 3, seats: seats(4) });
  for (const p of s.players) { p.pending = null; p.tickets = []; }
  const set = (i, o) => { s.players[i].pax = Object.assign(Object.fromEntries(m.passengers.colors.map(c => [c, 0])), o); };
  set(0, { red: 3, black: 2, green: 1 });
  set(1, { red: 1, black: 2, green: 1 });
  set(2, { red: 1, black: 1 });
  set(3, {});
  s.phase = 'over';
  const rows = T.score(s).rows;
  // red: P0 20, P1 and P2 tied second 10 each; black: P0 and P1 tied most 20 each, no second; green: P0, P1 20 each
  assert.deepStrictEqual(rows.map(r => r.paxPts), [60, 50, 10, 0]);
  assert.deepStrictEqual(rows.map(r => r.pax), [6, 4, 2, 0]);
  // equal points and tickets: the one with more passengers wins
  const s2 = T.newGame(m, { seed: 3, seats: seats(3) });
  for (const p of s2.players) { p.pending = null; p.tickets = []; }
  const set2 = (i, o) => { s2.players[i].pax = Object.assign(Object.fromEntries(m.passengers.colors.map(c => [c, 0])), o); };
  set2(0, { red: 4, black: 1 }); set2(1, { red: 1, black: 3 }); set2(2, { red: 2, black: 2 });
  s2.phase = 'over';
  const r2 = T.score(s2);
  assert.deepStrictEqual(r2.rows.map(r => r.total), [20, 20, 20]);
  assert.strictEqual(r2.winner, 0);
  assert.deepStrictEqual(r2.tied, [0]);
});

test('Germany: computers of every level play whole games by the rules', () => {
  const m = load('germany');
  for (const [n, seed] of [[2, 1], [3, 2], [5, 3]]) {
    const lv = ['easy', 'medium', 'hard'];
    let s = T.newGame(m, { seed, seats: Array.from({ length: n }, (_, i) => ({ name: 'C' + i, kind: 'cpu', level: lv[i % 3] })) });
    let rnd = seed * 7 + 1; const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 2000 && s.phase !== 'over'; k++) {
      const seat = s.phase === 'setup' ? s.players.findIndex(p => p.pending) : s.turn;
      s = T.apply(s, AI.choose(T.view(s, seat), seat, s.players[seat].level, rand));
    }
    assert.strictEqual(s.phase, 'over', n + ' players finished');
    const taken = s.players.reduce((a, p) => a + sum(p.pax), 0);
    assert.strictEqual(taken + sum(s.pax), 60, 'no passenger lost or made up');
    assert.ok(taken > 20, 'passengers were picked up (' + taken + ')');
  }
});
