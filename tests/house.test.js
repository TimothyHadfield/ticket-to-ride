// House rules (Settings → Rules, all off by default): Globetrotter bonus, face-up locomotive counts as one card,
// both double routes open with 2–3 players. Each is a game option the engine applies and the computers respect.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const T = require('../js/engine.js');
const AI = require('../js/ai.js');
const load = id => T.register(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'maps', id + '.json'), 'utf8')));
const pair = (r, a, b) => (r.a === a && r.b === b) || (r.a === b && r.b === a);

function start(map, n, seed, options) {
  let s = T.newGame(map, { seed: seed || 1, options, seats: Array.from({ length: n }, (_, i) => ({ name: 'P' + i })) });
  for (let i = 0; i < n; i++) s = T.apply(s, { type: 'keepTickets', seat: i, keep: s.players[i].pending.tickets.slice(0, s.players[i].pending.min) });
  return s;
}
const give = (s, seat, cards) => { const h = T.emptyHand(); Object.assign(h, cards); s.players[seat].hand = h; return s; };

test('house rules are off by default', () => {
  const s = start(load('usa'), 2, 3);
  const R = T.rules(s);
  assert.strictEqual(R.globetrotter, 0);
  assert.strictEqual(R.bothDoubles, false);
  assert.strictEqual(R.freeLocos, false);
});

test('Globetrotter house rule: most completed tickets scores 15 (ties all); maps that have one keep theirs', () => {
  const m = load('usa');
  const s = start(m, 2, 3, { globe: true });
  assert.strictEqual(T.rules(s).globetrotter, 15);
  s.phase = 'over';
  const res = T.score(s);
  // nobody finished a ticket: no bonus
  assert.ok(res.rows.every(r => r.globePts === 0));
  // Nordic already has Globetrotter 10: the house rule does not change it
  assert.strictEqual(T.rules(start(load('nordic'), 2, 3, { globe: true })).globetrotter, 10);
});

test('Face-up locomotive house rule: a face-up locomotive counts as one card', () => {
  const m = load('usa');
  let s = start(m, 2, 5, { freeLocos: true });
  const seat = s.turn;
  s.faceUp = ['loco', 'loco', 'red', 'blue', 'green'];
  s = T.apply(s, { type: 'draw', seat, from: 0 });
  assert.strictEqual(s.turn, seat, 'still my turn after one face-up locomotive');
  s = T.apply(s, { type: 'draw', seat, from: s.faceUp.indexOf('loco') });
  assert.notStrictEqual(s.turn, seat);
  assert.strictEqual(s.players[seat].hand.loco >= 2, true);
  // without the house rule the first face-up locomotive ends the turn
  let s2 = start(m, 2, 5);
  const seat2 = s2.turn;
  s2.faceUp = ['loco', 'red', 'blue', 'green', 'pink'];
  s2 = T.apply(s2, { type: 'draw', seat: seat2, from: 0 });
  assert.notStrictEqual(s2.turn, seat2);
});

test('Double routes house rule: with 2 players the second track of a double stays open', () => {
  const m = load('usa');
  const twins = m.routes.filter(r => r.twin);
  const r = twins[0], tw = m.routes.find(x => x.id === r.twin);
  for (const [opt, open] of [[undefined, false], [{ doubles: true }, true]]) {
    const s = start(m, 2, 7, opt);
    const a = s.turn, b = 1 - a;
    s.owner[r.id] = a; s.players[a].routes.push(r.id);
    give(s, b, { [tw.color === 'gray' ? 'red' : tw.color]: tw.len });
    s.turn = b;
    assert.strictEqual(T.canClaim(s, b, tw.id) === null, open, JSON.stringify(opt));
    // the same player still can't take both tracks
    s.turn = a; give(s, a, { [tw.color === 'gray' ? 'red' : tw.color]: tw.len });
    assert.strictEqual(T.canClaim(s, a, tw.id), 'own twin');
  }
});

test('computers take a second face-up locomotive only when the house rule allows it', () => {
  const m = load('usa');
  let s = start(m, 2, 11, { freeLocos: true });
  const seat = s.turn;
  s.faceUp = ['loco', 'red', 'blue', 'green', 'pink'];
  s = T.apply(s, { type: 'draw', seat, from: 'deck' });
  s.faceUp = ['loco', 'loco', 'loco', 'loco', 'loco'];
  s.trainDeck = []; s.discard = [];
  const a = AI.choose(T.view(s, seat), seat, 'medium', () => 0.5);
  assert.strictEqual(a.type, 'draw');
  assert.notStrictEqual(a.from, 'deck');
});
