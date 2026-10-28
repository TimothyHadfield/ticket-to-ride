// Map data checks: counts match the published games, every graph is connected,
// and ticket values agree with the shortest route on our data (a strong typo detector).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const G = require('../js/graph.js');
const load = id => require(path.join(__dirname, '..', 'maps', id + '.json'));
const MAPS = ['usa', 'europe', 'nordic', 'india', 'switzerland', 'germany'];

// Published facts (sources in docs/rules-check.md)
const FACTS = {
  usa: { cities: 36, routes: 100, pairs: 78, tickets: { classic: 30, 1910: 35, bigcities: 35, mega: 69 }, trains: 45, players: [2, 5], cards: 110 },
  europe: { cities: 47, routes: 101, pairs: 90, tickets: { standard: 46 }, long: 6, trains: 45, players: [2, 5], cards: 110, stations: 3 },
  nordic: { cities: 39, routes: 81, tickets: { standard: 46 }, trains: 40, players: [2, 3], cards: 110 },
  india: { cities: 39, routes: 108, tickets: { standard: 58 }, trains: 45, players: [2, 4], cards: 110 },
  // 34 Swiss cities + 17 border dots (5 Germany, 3 Austria, 5 Italy, 4 France)
  switzerland: { cities: 51, routes: 88, tickets: { standard: 46 }, trains: 40, players: [2, 3], cards: 110 },
  // 35 German cities + 14 border dots (2 Denmark, 3 Netherlands, 3 France, 3 Switzerland, 3 Austria); 55 short + 34 long
  germany: { cities: 49, routes: 110, tickets: { standard: 89 }, long: 34, trains: 45, players: [2, 5], cards: 110 },
};

for (const id of MAPS) {
  const m = load(id), f = FACTS[id];
  test(id + ': counts match the published game', () => {
    assert.strictEqual(m.cities.length, f.cities);
    if (f.routes) assert.strictEqual(m.routes.length, f.routes);
    if (f.pairs) assert.strictEqual(new Set(m.routes.map(r => r.a + '|' + r.b)).size, f.pairs);
    for (const [deck, n] of Object.entries(f.tickets)) assert.strictEqual(m.ticketDecks.find(d => d.id === deck).tickets.length, n, deck);
    assert.strictEqual(m.trains, f.trains);
    assert.deepStrictEqual(m.players, f.players);
    if (f.cards) assert.strictEqual(Object.values(m.deck.colors).reduce((a, b) => a + b, 0) + m.deck.loco, f.cards);
    if (f.long) assert.strictEqual(m.ticketDecks[0].tickets.filter(t => t.long).length, f.long);
    if (f.stations) assert.strictEqual(m.stations, f.stations);
  });
  test(id + ': every city is reachable from every other', () => {
    const all = m.routes.map(r => r.id);
    for (const c of m.cities) assert.ok(G.connected(m, all, m.cities[0].id, c.id), c.id);
  });
  test(id + ': routes are well formed', () => {
    const ids = new Set(m.cities.map(c => c.id));
    const colors = new Set(['gray', 'pink', 'white', 'blue', 'yellow', 'orange', 'black', 'red', 'green']);
    for (const r of m.routes) {
      assert.ok(ids.has(r.a) && ids.has(r.b) && r.a !== r.b, r.id);
      assert.ok(r.len >= 1 && r.len <= 9, r.id);
      assert.ok(colors.has(r.color), r.id);
      assert.ok(m.points[r.len], 'score for length ' + r.len);
      if (r.sibs) for (const id of r.sibs) { const t = m.routes.find(x => x.id === id); assert.ok(t && t.sibs.includes(r.id) && t.a === r.a && t.b === r.b && (r.color === 'gray' || t.color !== r.color), r.id); }
      else if (r.twin) { const t = m.routes.find(x => x.id === r.twin); assert.ok(t && t.twin === r.id && t.a === r.a && t.b === r.b); }
      if (r.color !== 'gray' && r.twin) assert.notStrictEqual(m.routes.find(x => x.id === r.twin).color, r.color, 'double route with the same colour twice: ' + r.a + '-' + r.b);
    }
    // no city sits on top of another
    for (let i = 0; i < m.cities.length; i++) for (let j = i + 1; j < m.cities.length; j++) {
      const a = m.cities[i], b = m.cities[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 30, a.id + ' overlaps ' + b.id);
    }
  });
}

test('ticket values equal the shortest route (known exceptions only)', () => {
  // The original USA cards valued five tickets above their shortest route; USA 1910 reprinted four of them
  // at the shortest-route value. Europe has two tickets one point above. Everything else matches exactly.
  const known = new Set(['usa/classic/los-angeles/new-york', 'usa/classic/los-angeles/miami', 'usa/classic/chicago/los-angeles',
    'usa/classic/new-york/seattle', 'usa/1910/las-vegas/miami', 'usa/mega/las-vegas/miami', 'usa/bigcities/las-vegas/miami', 'usa/classic/oklahoma-city/sault-st-marie', 'usa/bigcities/chicago/los-angeles', 'usa/mega/chicago/los-angeles']);
  const offByOne = { europe: 2, germany: 1 }; // Germany: Kiel–Stuttgart 17 (shortest 16) in every source
  for (const id of MAPS) {
    const m = load(id);
    for (const d of m.ticketDecks) {
      let odd = 0;
      for (const t of d.tickets) {
        if (t.opts) continue; // country tickets: see the Switzerland test below
        const sp = G.shortest(m, t.a, t.b, r => r.len).dist;
        if (sp === t.pts) continue;
        const key = id + '/' + d.id + '/' + [t.a, t.b].sort().join('/');
        if (known.has(key)) continue;
        odd++;
        assert.ok(t.pts - sp === 1 && offByOne[id], key + ' worth ' + t.pts + ' but shortest is ' + sp);
      }
      if (offByOne[id]) assert.ok(odd <= offByOne[id]);
    }
  }
});

test('USA routes: spot checks against the printed board', () => {
  const m = load('usa');
  const find = (a, b) => m.routes.filter(r => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  assert.deepStrictEqual(find('salt-lake-city', 'san-francisco').map(r => r.len), [5, 5]);
  assert.deepStrictEqual(find('portland', 'san-francisco').map(r => r.len), [5, 5]);
  assert.deepStrictEqual(find('helena', 'omaha').map(r => [r.len, r.color]), [[5, 'red']]);
  assert.deepStrictEqual(find('oklahoma-city', 'santa-fe').map(r => [r.len, r.color]), [[3, 'blue']]);
  assert.strictEqual(m.routes.reduce((a, r) => a + r.len, 0), 309);
});

test('Switzerland: country ticket values sit within 2 of the shortest route (all 34 city tickets match exactly above)', () => {
  const T = require('../js/engine.js');
  const m = T.register(load('switzerland'));
  let off = 0;
  for (const t of m.ticketDecks[0].tickets) if (t.opts) for (const o of t.opts) {
    let sp = Infinity;
    for (const a of T.ticketEnds(m, t.a)) for (const b of T.ticketEnds(m, o.to)) { const p = G.shortest(m, a, b, r => r.len); if (p) sp = Math.min(sp, p.dist); }
    assert.ok(Math.abs(o.pts - sp) <= 2, t.a + '->' + o.to + ' ' + o.pts + ' vs ' + sp);
    if (o.pts !== sp) off++;
  }
  assert.strictEqual(off, 9); // the printed cards (per tCHu) differ from the shortest path on 9 options; see docs/rules-check.md
});

test('Europe: tunnels and ferries', () => {
  const m = load('europe');
  const kind = k => m.routes.filter(r => r.kind === k);
  assert.strictEqual(kind('tunnel').length, 18);
  assert.strictEqual(kind('ferry').length, 13);
  const r = m.routes.find(r => [r.a, r.b].sort().join() === 'palermo,smyrna');
  assert.deepStrictEqual([r.len, r.locos, r.kind], [6, 2, 'ferry']);
  const st = m.routes.find(r => [r.a, r.b].sort().join() === 'petrograd,stockholm');
  assert.deepStrictEqual([st.len, st.kind], [8, 'tunnel']);
});
