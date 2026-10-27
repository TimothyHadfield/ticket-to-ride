// The guided first game (js/tutorial.js) and the My stats glue (js/profile-ttr.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../js/engine.js');
const G = require('../js/graph.js');
const AI = require('../js/ai.js');
const TUT = require('../js/tutorial.js');
const TP = require('../js/profile-ttr.js');
const { loadMap } = require('../tools/sim.js');

function tutorialGame() {
  const map = loadMap(TUT.GAME.mapId);
  const seats = [{ name: 'You', kind: 'human' }].concat(TUT.GAME.levels.map(l => ({ name: 'Blue', kind: 'cpu', level: l })));
  return { map, s: T.newGame(map, { seed: TUT.GAME.seed, deckId: map.ticketDecks[0].id, seats, options: {} }) };
}

test('tutorial deal: you go first, 3 green cards, and a green route on your tickets\' way you can claim at once', () => {
  let { map, s } = tutorialGame();
  assert.strictEqual(s.turn, 0);
  assert.strictEqual(s.players[0].hand.green, 3, JSON.stringify(s.players[0].hand));
  const offered = s.players[0].pending.tickets, deck = T.deckFor(map, s).tickets;
  // whichever 2 of the 3 the player keeps, some green route on one of their cheapest paths is affordable
  for (const keep of [[0, 1], [0, 2], [1, 2]].map(k => k.map(i => offered[i]))) {
    let t = T.apply(s, { type: 'keepTickets', seat: 0, keep });
    t = T.apply(t, { type: 'keepTickets', seat: 1, keep: t.players[1].pending.tickets.slice(0, 2) });
    assert.strictEqual(t.phase, 'main');
    const green = map.routes.filter(r => r.color === 'green' && T.canClaim(t, 0, r.id) === null);
    assert.ok(green.length > 0, 'no green route to claim');
    const onPath = new Set();
    for (const i of keep) { const p = G.shortest(map, deck[i].a, deck[i].b, r => r.len); if (p) p.path.forEach(r => onPath.add(r)); }
    // the coach only promises "a short green route"; it is a bonus when it is also on the way
    if (keep.includes(offered[0]) && keep.includes(offered[1])) assert.ok(green.some(r => onPath.has(r.id)), 'no green route on the way');
  }
});

test('tutorial steps follow the game: ticket step, then claim, then the computer, then drawing', () => {
  let { map, s } = tutorialGame();
  const ctx = { state: () => s, me: () => 0 };
  const steps = TUT.steps(ctx);
  assert.ok(steps.length >= 7);
  const tick = steps.find(x => /tickets/i.test(x.title || ''));
  assert.ok(tick.when() && !tick.until());
  s = T.apply(s, { type: 'keepTickets', seat: 0, keep: s.players[0].pending.tickets.slice(0, 2) });
  s = T.apply(s, { type: 'keepTickets', seat: 1, keep: s.players[1].pending.tickets.slice(0, 2) });
  assert.ok(tick.until());
  const claim = steps.find(x => x.title === 'Claim a route');
  assert.ok(claim.when() && !claim.until() && !claim.skipIf());
  const r = map.routes.find(x => x.color === 'green' && T.canClaim(s, 0, x.id) === null);
  const pay = T.payOptions ? T.payOptions(s, 0, r.id)[0] : null;
  s = T.apply(s, Object.assign({ type: 'claim', seat: 0, route: r.id }, pay ? { pay } : {}));
  assert.ok(claim.until());
  assert.ok(!claim.when(), 'the computer\'s turn now');
  s = T.apply(s, AI.choose(T.view(s, 1), 1, 'easy', () => 0.5));
  const draw = steps.find(x => x.title === 'Draw 2 cards');
  assert.ok(draw.when() && !draw.until());
});

test('rules sheet covers every part of the game in our own words', () => {
  const R = TUT.rules();
  const ids = R.sections.map(x => x.id);
  for (const id of ['goal', 'setup', 'turn', 'cards', 'routes', 'tickets', 'end', 'maps']) assert.ok(ids.includes(id), id);
  const all = R.sections.map(x => x.html).join(' ');
  for (const n of ['45 trains', '>15<', 'Mandala', 'Globetrotter', 'Stations', 'Tunnels']) assert.ok(all.includes(n), n);
});

test('profile: a finished game becomes a rated result, or "with help" after Hint/Undo; a shared win is a draw', () => {
  const map = loadMap('usa');
  let s = T.newGame(map, { seed: 5, seats: [{ kind: 'human' }, { kind: 'cpu', level: 'medium' }, { kind: 'cpu', level: 'hard' }] });
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 3000) {
    const seat = s.phase === 'setup' ? s.players.findIndex(p => p.pending) : s.turn;
    s = T.apply(s, AI.choose(T.view(s, seat), seat, 'hard', () => 0.5));
  }
  assert.strictEqual(s.phase, 'over');
  const r = TP.result(s, 0, { map });
  assert.strictEqual(r.mode, 'computer');
  assert.strictEqual(r.level, 'hard', 'rated against the strongest computer at the table');
  assert.strictEqual(r.won, s.result.winner === 0 && (s.result.tied || [0]).length <= 1);
  assert.strictEqual(r.extra.players, 3);
  assert.ok(r.extra.maxRoute >= 1 && r.extra.maxRoute <= 6);
  const h = TP.result(s, 0, { helped: true, map });
  assert.strictEqual(h.mode, 'help'); assert.strictEqual(h.level, null);
  const tie = JSON.parse(JSON.stringify(s)); tie.result.tied = [0, 1]; tie.result.winner = 0;
  const t = TP.result(tie, 0, { map });
  assert.ok(t.draw && !t.won);
});

test('profile: Daily game rotates through all 5 maps against Hard; achievements read the game', () => {
  const seen = new Set();
  for (let d = 0; d < 20; d++) { const g = TP.dailyGame(1000003 * d + 7); seen.add(g.mapId); assert.deepStrictEqual(g.levels, ['hard']); assert.ok(g.seed >= 1); }
  assert.strictEqual(seen.size, 5);
  const ach = TP.achievements(() => ({ usa: 1, europe: 2, nordic: 1, india: 1, switzerland: 1 }));
  const ctx = { stats: { wins: 1, bestStreak: 1 }, daily: { streak: 0 }, last: { won: true, level: 'hard', extra: { players: 2, done: 6, failed: 0, score: 151, longest: true, maxRoute: 6 } } };
  const got = ach.filter(a => a.test(ctx)).map(a => a.id).sort();
  assert.deepStrictEqual(got, ['century', 'clean', 'first', 'hard', 'longest', 'medium', 'six', 'tickets', 'world'].sort());
});
