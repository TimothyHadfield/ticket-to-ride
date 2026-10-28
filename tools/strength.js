// Measures how strong each computer level is, by self-play on every map, and writes data/strength.json.
//   node tools/strength.js [games=2000] [maps=usa,europe,nordic,india] [--no-write] [--merge] [--only=medium-hard] [--hard={"trainCost":1}]
// Pairings: Easy v Medium, Medium v Hard, Easy v Hard (2 players); Easy/Medium/Hard (3 players, every map);
// a 4-player mix (Hard, Medium, Medium, Easy) on USA and Europe. Seats rotate so every level sits in every seat
// equally often (the first player is also random). Games run in parallel worker threads.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const PAIRINGS = [
  { key: 'easy-medium', lineup: ['easy', 'medium'] },
  { key: 'medium-hard', lineup: ['medium', 'hard'] },
  { key: 'easy-hard', lineup: ['easy', 'hard'] },
  { key: 'easy-medium-hard', lineup: ['easy', 'medium', 'hard'] },
  { key: 'hard-medium-medium-easy', lineup: ['hard', 'medium', 'medium', 'easy'], maps: ['usa', 'europe'] },
];

if (!isMainThread) {
  // worker: play games [from, to) of one pairing and send back totals per level
  const { playGame, loadMap } = require('./sim.js');
  const AI = require('../js/ai.js');
  const { mapId, lineup, from, to, seedBase, hard } = workerData;
  if (hard) Object.assign(AI.HARD, hard);
  const map = loadMap(mapId);
  const n = lineup.length;
  const acc = { games: 0, wins: {}, score: {}, seats: {}, turns: 0, errors: [] };
  for (let g = from; g < to; g++) {
    const rot = g % n;
    const levels = lineup.map((_, i) => lineup[(i + rot) % n]);
    let s;
    try { s = playGame(map, levels, seedBase + g); } catch (e) { acc.errors.push(e.message); continue; }
    const rows = s.result.rows, top = Math.max(...rows.map(r => r.total));
    const winners = rows.filter(r => r.total === top);
    for (const w of winners) acc.wins[levels[w.seat]] = (acc.wins[levels[w.seat]] || 0) + 1 / winners.length;
    for (const r of rows) { const l = levels[r.seat]; acc.score[l] = (acc.score[l] || 0) + r.total; acc.seats[l] = (acc.seats[l] || 0) + 1; }
    acc.turns += s.turnNo; acc.games++;
  }
  parentPort.postMessage(acc);
} else if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

function runPairing(mapId, lineup, games, seedBase, hard, threads) {
  threads = threads || Math.max(1, Math.min(os.cpus().length - 1, 16));
  const chunk = Math.ceil(games / threads);
  const jobs = [];
  for (let from = 0; from < games; from += chunk) {
    jobs.push(new Promise((res, rej) => {
      const w = new Worker(__filename, { workerData: { mapId, lineup, from, to: Math.min(games, from + chunk), seedBase, hard } });
      w.on('message', res); w.on('error', rej);
    }));
  }
  return Promise.all(jobs).then(parts => {
    const t = { games: 0, wins: {}, score: {}, seats: {}, turns: 0, errors: [] };
    for (const p of parts) {
      t.games += p.games; t.turns += p.turns; t.errors.push(...p.errors);
      for (const k of ['wins', 'score', 'seats']) for (const l in p[k]) t[k][l] = (t[k][l] || 0) + p[k][l];
    }
    const out = { players: lineup.length, games: t.games, winPct: {}, avgScore: {}, avgTurns: +(t.turns / Math.max(1, t.games)).toFixed(1) };
    const per = {}; lineup.forEach(l => { per[l] = (per[l] || 0) + 1; });
    for (const l of ['easy', 'medium', 'hard']) if (per[l]) {
      // share of games won by one seat of this level (fair share = 100 / players)
      out.winPct[l] = +(100 * (t.wins[l] || 0) / t.games / per[l]).toFixed(1);
      out.avgScore[l] = +(t.score[l] / t.seats[l]).toFixed(1);
    }
    if (t.errors.length) out.errors = t.errors.slice(0, 5);
    return out;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const flag = name => { const a = args.find(x => x.startsWith('--' + name)); return a ? (a.includes('=') ? a.slice(a.indexOf('=') + 1) : true) : null; };
  const pos = args.filter(a => !a.startsWith('--'));
  const games = +(pos[0] || 2000);
  const maps = (pos[1] || 'usa,europe,nordic,india').split(',');
  const only = flag('only') ? String(flag('only')).split(',') : null;
  const hard = flag('hard') ? JSON.parse(flag('hard')) : null;
  const threads = Math.max(1, Math.min(+(flag('threads') || 0) || os.cpus().length - 1, 16));
  const out = { date: new Date().toISOString().slice(0, 10), gamesPerPairing: games, note: 'winPct = share of games won by one seat of that level (ties split); fair share is 100 / players.', maps: {} };
  const t0 = Date.now(); let total = 0;
  for (const mapId of maps) {
    out.maps[mapId] = {};
    const maxP = require(path.join(__dirname, '..', 'maps', mapId + '.json')).players[1];
    let k = 0;
    for (const p of PAIRINGS) {
      k++;
      if (only && !only.includes(p.key)) continue;
      if (p.maps && !p.maps.includes(mapId)) continue;
      if (p.lineup.length > maxP) continue;
      const t1 = Date.now();
      const res = await runPairing(mapId, p.lineup, games, 100000 * k + 1, hard, threads);
      total += res.games;
      out.maps[mapId][p.key] = res;
      console.log(mapId.padEnd(7), p.key.padEnd(24), JSON.stringify(res.winPct), JSON.stringify(res.avgScore), res.games + ' games', ((Date.now() - t1) / 1000).toFixed(1) + 's', res.errors ? 'ERRORS ' + res.errors.length : '');
    }
  }
  const secs = (Date.now() - t0) / 1000;
  out.speed = { games: total, seconds: +secs.toFixed(1), gamesPerSecond: +(total / secs).toFixed(1), threads };
  console.log('total', total, 'games in', secs.toFixed(1) + 's =', (total / secs).toFixed(1), 'games/s on', threads, 'threads');
  if (!flag('no-write')) {
    fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
    // --merge: keep the other maps already measured, replace only the maps run now
    if (flag('merge')) { try { const old = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'strength.json'), 'utf8')); out.maps = Object.assign(old.maps || {}, out.maps); } catch (e) { /* nothing to keep */ } }
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'strength.json'), JSON.stringify(out, null, 2) + '\n');
    console.log('wrote data/strength.json');
  }
}

module.exports = { runPairing, PAIRINGS };
