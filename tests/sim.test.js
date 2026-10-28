// Whole games between computers on every map: no illegal moves, no cards created or lost,
// every game ends, and the final score adds up.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../js/engine.js');
const G = require('../js/graph.js');
const { playGame, loadMap } = require('../tools/sim.js');

function cards(s) {
  let n = s.trainDeck.length + s.discard.length + s.faceUp.filter(Boolean).length;
  for (const p of s.players) n += T.handSize(p.hand);
  return n;
}

for (const id of ['usa', 'europe', 'nordic', 'india', 'switzerland', 'germany']) {
  test(id + ': computer games run to the end by the rules', () => {
    const map = loadMap(id);
    const total = Object.values(map.deck.colors).reduce((a, b) => a + b, 0) + map.deck.loco;
    const lineups = [['easy', 'medium'], ['hard', 'medium', 'easy'], ['hard', 'hard', 'medium', 'easy', 'hard']].map(l => l.slice(0, map.players[1]));
    let g = 0;
    for (const lineup of lineups) for (let k = 0; k < 6; k++) {
      const s = playGame(map, lineup, 1000 + g++, undefined, { check: st => assert.strictEqual(cards(st), total) });
      assert.strictEqual(s.phase, 'over');
      for (const row of s.result.rows) {
        const p = s.players[row.seat];
        assert.ok(p.trains >= 0);
        assert.strictEqual(row.routePts, p.routes.reduce((a, r) => a + T.routePoints(map, G.index(map).routeById[r].len), 0));
        assert.strictEqual(row.total, row.routePts + row.ticketPts + row.stationPts + row.longestPts + row.globePts + row.mandalaPts + (row.paxPts || 0));
        // trains used = sum of claimed lengths
        assert.strictEqual(map.trains - p.trains, p.routes.reduce((a, r) => a + G.index(map).routeById[r].len, 0));
      }
      // nobody holds both routes of a double; in small games no double is fully taken
      for (const r of map.routes) if (r.twin && s.owner[r.id] != null && s.owner[r.twin] != null) {
        assert.notStrictEqual(s.owner[r.id], s.owner[r.twin]);
        assert.ok(s.players.length >= map.bothDoublesFrom);
      }
    }
  });
}
