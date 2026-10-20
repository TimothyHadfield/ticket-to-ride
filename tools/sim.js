// Self-play: measures how strong each computer level is.
//   node tools/sim.js [games=1000] [map=usa|europe|nordic|india|switzerland|all] [lineup=hard,medium]
// Seats rotate so nobody always moves first. Prints win rates and average scores.
'use strict';
const path = require('path');
const T = require('../js/engine.js');
const AI = require('../js/ai.js');

function loadMap(id) { return T.register(require(path.join(__dirname, '..', 'maps', id + '.json'))); }

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function playGame(map, levels, seed, deckId, opts) {
  const rand = rng(seed * 7919 + 13);
  let s = T.newGame(map, { seed, deckId, seats: levels.map((l, i) => ({ name: l + i, kind: 'cpu', level: l })) });
  let steps = 0;
  while (s.phase !== 'over') {
    if (++steps > 5000) throw new Error('game did not end (seed ' + seed + ')');
    // setup: everyone chooses; main: the player whose turn it is
    let seat = s.phase === 'setup' ? s.players.findIndex(p => p.pending) : s.turn;
    const a = AI.choose(T.view(s, seat), seat, levels[seat], rand);
    if (!a) throw new Error('no action');
    try { s = T.apply(s, a); }
    catch (e) { throw new Error('illegal ' + JSON.stringify(a) + ': ' + e.message + ' seed ' + seed); }
    if (opts && opts.check) opts.check(s);
  }
  return s;
}

function run(mapId, games, lineup, deckId) {
  const map = loadMap(mapId);
  const n = lineup.length;
  const wins = {}, totals = {}, counts = {}, turns = [];
  let draws = 0;
  for (let g = 0; g < games; g++) {
    const rot = g % n; // rotate seats
    const levels = lineup.map((_, i) => lineup[(i + rot) % n]);
    const s = playGame(map, levels, g + 1, deckId);
    const res = s.result;
    const top = Math.max(...res.rows.map(r => r.total));
    const winners = res.rows.filter(r => r.total === top);
    if (winners.length > 1) draws++;
    winners.forEach(w => { const l = levels[w.seat]; wins[l] = (wins[l] || 0) + 1 / winners.length; });
    res.rows.forEach(r => { const l = levels[r.seat]; totals[l] = (totals[l] || 0) + r.total; counts[l] = (counts[l] || 0) + 1; });
    turns.push(s.turnNo);
  }
  const out = { map: mapId, deck: deckId || map.ticketDecks[0].id, games, lineup: lineup.join(' v '), avgTurns: +(turns.reduce((a, b) => a + b, 0) / games).toFixed(1), rows: {} };
  const seatsPer = {};
  lineup.forEach(l => { seatsPer[l] = (seatsPer[l] || 0) + 1; });
  for (const l of Object.keys(seatsPer)) out.rows[l] = { winPct: +(100 * (wins[l] || 0) / games / seatsPer[l]).toFixed(1), avgScore: +(totals[l] / counts[l]).toFixed(1) };
  return out;
}

if (require.main === module) {
  const games = +(process.argv[2] || 1000);
  const which = process.argv[3] || 'usa';
  const lineup = (process.argv[4] || 'hard,medium').split(',');
  const maps = which === 'all' ? ['usa', 'europe', 'nordic', 'india', 'switzerland'] : [which];
  for (const m of maps) {
    const t0 = Date.now();
    const lu = lineup.slice(0, loadMap(m).players[1]);
    console.log(JSON.stringify(run(m, games, lu)), ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
}
module.exports = { playGame, run, loadMap };
