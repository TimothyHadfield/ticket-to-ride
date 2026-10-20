// Computer players: only legal moves, sensible ticket choices, and the levels in the right order of strength.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../js/engine.js');
const AI = require('../js/ai.js');
const { loadMap } = require('../tools/sim.js');
const { runPairing } = require('../tools/strength.js');

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rid = (m, a, b) => m.routes.find(r => (r.a === a && r.b === b) || (r.a === b && r.b === a)).id;

// Walk through games where the moves come from a random mix of levels; at every position ask all three
// levels what they would do (seeing only their own view) and check the engine accepts each answer.
for (const id of ['usa', 'europe', 'nordic', 'india']) {
  test(id + ': every level always answers with a legal move', () => {
    const map = loadMap(id);
    const levels = ['easy', 'medium', 'hard'];
    let asked = 0;
    for (let g = 0; g < 3; g++) {
      const n = Math.min(map.players[1], 2 + g);
      const rand = rng(31 + g);
      let s = T.newGame(map, { seed: 900 + g, seats: Array.from({ length: n }, () => ({ kind: 'cpu' })) });
      let steps = 0;
      while (s.phase !== 'over') {
        assert.ok(++steps < 3000, 'game did not end');
        const seat = s.phase === 'setup' ? s.players.findIndex(p => p.pending) : s.turn;
        const v = T.view(s, seat);
        let next = null;
        for (const level of levels) {
          const a = AI.choose(T.view(s, seat), seat, level, rand);
          assert.ok(a && a.type, level + ' gave no action');
          assert.strictEqual(typeof a.why, 'string', level + ' action has no reason: ' + JSON.stringify(a));
          assert.ok(AI.explain(v, seat, a).length > 0);
          let after;
          try { after = T.apply(s, a); } catch (e) { assert.fail(level + ' chose an illegal move ' + JSON.stringify(a) + ': ' + e.message); }
          asked++;
          if (level === levels[Math.floor(rand() * 3)] || !next) next = after;
        }
        s = next; s.log.length = 0;
      }
    }
    assert.ok(asked > 300);
  });
}

test('the computer sees only its own view: hidden cards and tickets do not change its move', () => {
  const map = loadMap('usa');
  let s = T.newGame(map, { seed: 4, seats: [{}, {}] });
  for (let i = 0; i < 2; i++) s = T.apply(s, { type: 'keepTickets', seat: i, keep: s.players[i].pending.tickets.slice(0, 2) });
  const seat = s.turn, other = 1 - seat;
  const a1 = AI.choose(T.view(s, seat), seat, 'hard', rng(1));
  const s2 = T.clone(s);
  s2.players[other].hand = T.emptyHand(); s2.players[other].hand.loco = 4; // different hidden hand, same size
  s2.players[other].tickets = [0, 1];
  s2.trainDeck.reverse();
  const a2 = AI.choose(T.view(s2, seat), seat, 'hard', rng(1));
  assert.deepStrictEqual(a2, a1);
});

test('hard keeps the ticket it has already finished when trains are nearly gone', () => {
  const map = loadMap('usa');
  let s = T.newGame(map, { seed: 2, seats: [{}, {}] });
  for (let i = 0; i < 2; i++) s = T.apply(s, { type: 'keepTickets', seat: i, keep: s.players[i].pending.tickets.slice(0, 2) });
  const p = s.players[0];
  // seat 0 owns Duluth–Omaha–Kansas City–Oklahoma City–Dallas–Houston; 8 trains left; draws three tickets
  p.routes = [rid(map, 'duluth', 'omaha'), rid(map, 'omaha', 'kansas-city'), rid(map, 'kansas-city', 'oklahoma-city'), rid(map, 'oklahoma-city', 'dallas'), rid(map, 'dallas', 'houston')];
  for (const r of p.routes) s.owner[r] = 0;
  p.trains = 8; p.tickets = [];
  const done = 1; // Duluth–Houston: already joined
  p.pending = { tickets: [23, done, 12], min: 1 }; // Seattle–New York, Duluth–Houston, Los Angeles–Miami
  s.turn = 0;
  const a = AI.choose(T.view(s, 0), 0, 'hard', rng(3));
  assert.strictEqual(a.type, 'keepTickets');
  assert.deepStrictEqual(a.keep, [done]);
  // at the start of the game, with every train still free, it takes on more than the minimum when they fit together
  p.routes = []; p.trains = 45; s.owner = {};
  p.pending = { tickets: [1, 15, 26], min: 2, setup: false }; // Duluth–Houston, Kansas City–Houston, Winnipeg–Houston: one corridor
  const b = AI.choose(T.view(s, 0), 0, 'hard', rng(3));
  assert.strictEqual(b.keep.length, 3);
});

test('strength order on USA (200 games each): hard beats medium, medium beats easy', async () => {
  const hm = await runPairing('usa', ['medium', 'hard'], 200, 4242);
  const me = await runPairing('usa', ['easy', 'medium'], 200, 4343);
  assert.ok(!hm.errors && !me.errors, 'games failed: ' + JSON.stringify(hm.errors || me.errors));
  assert.ok(hm.winPct.hard > 55, 'hard v medium: ' + JSON.stringify(hm.winPct));
  assert.ok(me.winPct.medium > 55, 'medium v easy: ' + JSON.stringify(me.winPct));
});
