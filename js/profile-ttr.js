// Ticket to Ride's part of the player profile (shared kit: js/profile.js, never edit that one here).
// The computer levels' ratings, the achievement list, today's Daily game and turning a finished game into a result.
(function (root) {
  'use strict';
  // Elo of each level from the measured 2-player games (data/strength.json, USA, 1000 games a pairing,
  // 2026-10-27): Medium beats Easy 75% (+191), Hard beats Medium 69% (+139). Easy anchored at 1200, rounded.
  const LEVELS = [
    { id: 'easy', name: 'Easy', rating: 1200 },
    { id: 'medium', name: 'Medium', rating: 1400 },
    { id: 'hard', name: 'Hard', rating: 1550 },
  ];
  const RANK = { easy: 0, medium: 1, hard: 2 };
  const MAPS = ['usa', 'europe', 'nordic', 'india', 'switzerland'];
  const won = c => !!(c.last && c.last.won);
  const ex = c => (c.last && c.last.extra) || {};
  // mapWins(): { usa: n, ... } wins per map, kept by the app (the profile kit keeps no per-map numbers)
  const achievements = mapWins => [
    { id: 'first', title: 'First win', desc: 'Win a game', test: c => c.stats.wins >= 1 },
    { id: 'medium', title: 'Getting good', desc: 'Beat Medium', test: c => won(c) && RANK[c.last.level] >= 1 },
    { id: 'hard', title: 'Station master', desc: 'Beat Hard', test: c => won(c) && c.last.level === 'hard' },
    { id: 'crowd', title: 'Full table', desc: 'Win against 4 computers', test: c => won(c) && ex(c).players >= 5 },
    { id: 'tickets', title: 'Frequent traveller', desc: 'Finish 6 tickets in one game', test: c => ex(c).done >= 6 },
    { id: 'clean', title: 'Right on time', desc: 'Finish every ticket (3 or more)', test: c => ex(c).done >= 3 && ex(c).failed === 0 },
    { id: 'longest', title: 'Long haul', desc: 'Get the longest-route bonus', test: c => !!ex(c).longest },
    { id: 'six', title: 'Big one', desc: 'Claim a route of 6 or more', test: c => ex(c).maxRoute >= 6 },
    { id: 'century', title: 'Century', desc: 'Score 150 points', test: c => ex(c).score >= 150 },
    { id: 'world', title: 'Grand tour', desc: 'Win on all 5 maps', test: () => { const m = mapWins ? mapWins() : null; return !!m && MAPS.every(x => m[x] > 0); } },
    { id: 'streak', title: 'Hat trick', desc: 'Win 3 in a row', test: c => c.stats.bestStreak >= 3 },
    { id: 'daily', title: 'Daily commuter', desc: '3-day Daily streak', test: c => c.daily.streak >= 3 },
  ];

  // Today's Daily game: the same map, ticket deck and deal for everyone that day, against one Hard computer.
  function dailyGame(seed) {
    seed = seed >>> 0;
    return { mapId: MAPS[seed % MAPS.length], seed: (seed % 2147483646) + 1, levels: ['hard'] };
  }

  // A finished local game -> Profile.recordResult input. helped: Hint, Undo or Study mode was used -> "with help", not rated.
  function result(state, me, opts) {
    opts = opts || {};
    const res = state.result, row = res.rows[me];
    const levels = state.players.filter((_, i) => i !== me).map(q => q.level).filter(l => RANK[l] != null);
    const level = levels.length ? levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a)) : null; // the strongest computer at the table
    const tied = res.tied || [res.winner];
    const iWon = tied.includes(me);
    const map = opts.map || (root.TTR && root.TTR.mapOf ? root.TTR.mapOf(state) : null);
    let maxRoute = 0;
    if (map) for (const id of state.players[me].routes) { const r = map.routes.find(x => x.id === id); if (r && r.len > maxRoute) maxRoute = r.len; }
    const extra = {
      map: state.mapId, players: state.players.length, score: row.total,
      done: row.tickets.filter(x => x.ok).length, failed: row.tickets.filter(x => !x.ok).length,
      longest: row.longestPts > 0, maxRoute,
    };
    const mode = opts.helped ? 'help' : 'computer';
    // a shared win (level after every tie-break) counts as a draw
    return { mode, level: mode === 'computer' ? level : null, won: iWon && tied.length === 1, draw: iWon && tied.length > 1, score: row.total, daily: !!opts.daily, extra };
  }

  const api = { LEVELS, achievements, MAPS, dailyGame, result };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TTRProfile = api;
})(typeof window !== 'undefined' ? window : globalThis);
