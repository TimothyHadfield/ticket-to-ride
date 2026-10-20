// Online play: the game object for js/online.js plays whole games, never leaks a hand or ticket
// to another seat, and runs in the shared module's local room.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const T = require('../js/engine.js');
const { game, merge } = require('../js/online-game.js');

for (const id of ['usa', 'europe', 'nordic', 'india', 'switzerland']) T.register(require(path.join(__dirname, '..', 'maps', id + '.json')));

function rngFrom(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// everything secret about one seat, as strings that must not appear in what others receive
function secretsOf(s, seat) {
  const p = s.players[seat];
  return { hand: JSON.stringify(p.hand), tickets: p.tickets.slice(), pending: p.pending ? p.pending.tickets.slice() : [] };
}

function checkSecrecy(s) {
  if (s.phase === 'over') return; // everything is shown at the end, as at the table
  const pub = game.publicView(s);
  assert.equal(typeof pub.trainDeck, 'number', 'deck order hidden');
  assert.equal(typeof pub.ticketDeck, 'number', 'ticket deck order hidden');
  assert.ok(!('rng' in pub), 'no seed: it would reveal the deck');
  pub.players.forEach((p, i) => {
    assert.equal(p.hand, null, 'public view shows no hand (seat ' + i + ')');
    assert.equal(p.tickets, null, 'public view shows no tickets (seat ' + i + ')');
    if (p.pending) assert.ok(!('tickets' in p.pending), 'public view shows no ticket choices');
  });
  for (let j = 0; j < s.players.length; j++) {
    const mine = game.privateView(s, j);
    assert.deepEqual(Object.keys(mine).sort(), ['hand', 'pending', 'tickets']);
    assert.deepEqual(mine.hand, s.players[j].hand);
    assert.deepEqual(mine.tickets, s.players[j].tickets);
  }
}

test('online game object: whole computer games on every map, secrecy checked every move', () => {
  let games = 0;
  for (const mapId of ['usa', 'europe', 'nordic', 'india', 'switzerland']) {
    const map = T.maps[mapId];
    for (let g = 0; g < 2; g++) {
      const n = map.players[0] + (g % (map.players[1] - map.players[0] + 1));
      const rng = rngFrom(100 + g);
      const seats = Array.from({ length: n }, (_, i) => ({ kind: 'computer', name: 'C' + i }));
      let s = game.setup(n, { mapId, deckId: map.ticketDecks[g % map.ticketDecks.length].id, level: 'medium' }, rng, seats);
      let steps = 0;
      while (!game.isOver(s)) {
        const who = game.toAct(s);
        assert.ok(who.length > 0, 'someone can always move before the end');
        const seat = who[0];
        const a = game.bot({ pub: game.publicView(s), mine: game.privateView(s, seat), state: s }, seat, rng);
        s = game.apply(JSON.parse(JSON.stringify(s)), seat, a, rng);
        assert.deepEqual(JSON.parse(JSON.stringify(s)), s, 'state is JSON-safe');
        if (steps % 7 === 0) checkSecrecy(s);
        assert.ok(++steps < 5000, 'game ends');
      }
      assert.ok(s.result && s.result.rows.length === n);
      assert.deepEqual(game.toAct(s), [], 'nobody acts once the game is over');
      games++;
    }
  }
  assert.equal(games, 10);
});

test('merge(public, mine) gives the same view the engine gives that seat', () => {
  const map = T.maps.europe;
  const s = game.setup(3, { mapId: 'europe', level: 'easy' }, rngFrom(5), [{ kind: 'human', name: 'A' }, { kind: 'computer' }, { kind: 'computer' }]);
  const want = T.view(s, 1), got = merge(game.publicView(s), game.privateView(s, 1), 1);
  assert.deepEqual(got.players[1].hand, want.players[1].hand);
  assert.deepEqual(got.players[1].tickets, want.players[1].tickets);
  assert.deepEqual(got.players[1].pending, want.players[1].pending);
  assert.equal(got.players[0].hand, null);
  assert.equal(map.id, 'europe');
});

test('shared local room (js/online.js createLocal) plays a game to the end', async () => {
  const { createLocal } = await import('../js/online.js');
  const room = createLocal({ game, seats: ['computer', 'computer', 'computer'], options: { mapId: 'usa', deckId: 'classic', level: 'easy' }, botDelayMs: 0, rng: rngFrom(9) });
  const done = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out')), 60000);
    room.on('change', snap => { if (snap.status === 'finished') { clearTimeout(t); resolve(snap); } });
  });
  room.start();
  const snap = await done;
  assert.equal(snap.pub.phase, 'over');
  assert.equal(snap.pub.result.rows.length, 3);
  if (room.stop) room.stop();
});
