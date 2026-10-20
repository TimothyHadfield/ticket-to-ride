// The numbers layer (ticket chances, keep/toss advice, heat, detours) on the real USA map.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const G = require('../js/graph.js');
const O = require('../js/odds.js');
const usa = require(path.join(__dirname, '..', 'maps', 'usa.json'));
const deck = usa.ticketDecks[0].tickets; // classic 30

const routeBetween = (a, b) => usa.routes.filter(r => (r.a === a && r.b === b) || (r.a === b && r.b === a));
const ticket = (a, b) => deck.find(t => (t.a === a && t.b === b) || (t.a === b && t.b === a));
const basePos = extra => Object.assign({ owner: {}, me: 0, bothDoubles: false, myTrains: 45, rivalTrains: [45], tickets: [], deckTickets: deck, samples: 120, seed: 3 }, extra);

test('heat: normalised to 1 at the busiest route, and busy routes beat dead ends', () => {
  const h = O.heat(usa, deck);
  const max = Math.max(...Object.values(h.norm));
  assert.equal(max, 1);
  assert.equal(h.tickets, 30);
  // Kansas City–Oklahoma City sits on many cheapest paths; Miami–Charleston only on Miami tickets
  const kcOkc = routeBetween('kansas-city', 'oklahoma-city')[0];
  const miaCha = routeBetween('charleston', 'miami')[0];
  assert.ok(h.raw[kcOkc.id] > h.raw[miaCha.id], `KC–OKC ${h.raw[kcOkc.id]} vs Charleston–Miami ${h.raw[miaCha.id]}`);
});

test('ticket chances: a finished ticket is done at 100%, a cut-off one is 0%', () => {
  const t = ticket('denver', 'el-paso'); // 4 points: Denver–Santa Fe 2 + Santa Fe–El Paso 2
  assert.ok(t, 'Denver–El Paso is in the classic deck');
  const mine = [routeBetween('denver', 'santa-fe')[0], routeBetween('el-paso', 'santa-fe')[0]];
  // finished: I own both routes
  let r = O.ticketChances(usa, basePos({ owner: Object.fromEntries(mine.map(x => [x.id, 0])), myTrains: 41, tickets: [t] }));
  assert.equal(r.tickets[0].done, true);
  assert.equal(r.tickets[0].chance, 1);
  // cut off: a rival owns every route into El Paso
  const into = usa.routes.filter(x => x.a === 'el-paso' || x.b === 'el-paso');
  const owner = Object.fromEntries(into.map(x => [x.id, 1]));
  r = O.ticketChances(usa, basePos({ owner, tickets: [t] }));
  assert.equal(r.tickets[0].done, false);
  assert.equal(r.tickets[0].need, Infinity);
  assert.equal(r.tickets[0].chance, 0);
});

test('ticket chances: a short ticket at the start is very likely; the same ticket with 3 trains left is not', () => {
  const t = ticket('denver', 'el-paso');
  const early = O.ticketChances(usa, basePos({ tickets: [t] })).tickets[0];
  assert.ok(early.chance > 0.8, 'early chance ' + early.chance);
  const late = O.ticketChances(usa, basePos({ tickets: [t], myTrains: 3, rivalTrains: [3] })).tickets[0];
  assert.equal(late.chance, 0, 'needs 4 trains, has 3');
});

test('keep/toss: keeps at least the minimum and tosses a ticket that is already cut off', () => {
  const good = ticket('denver', 'el-paso');
  const dead = ticket('los-angeles', 'miami');
  const into = usa.routes.filter(x => x.a === 'miami' || x.b === 'miami');
  const owner = Object.fromEntries(into.map(x => [x.id, 1]));
  const adv = O.keepAdvice(usa, basePos({ owner }), [good, dead], 1);
  assert.deepEqual(adv.best, [0]);
  assert.ok(adv.rows[1].chance === 0);
  assert.ok(adv.options.every(o => o.keep.length >= 1));
  // with min 2 both must be kept
  const adv2 = O.keepAdvice(usa, basePos({ owner }), [good, dead], 2);
  assert.deepEqual(adv2.best.slice().sort(), [0, 1]);
});

test('detour: blocking a route costs at least nothing extra, and its twin is blocked too', () => {
  const [a, b] = routeBetween('new-york', 'pittsburgh');
  assert.ok(a && b && a.twin === b.id, 'NY–Pittsburgh is a double');
  const d = O.detour(usa, a.id);
  assert.ok(d.extra >= 0);
  assert.ok(!d.path.includes(b.id), 'the twin is not the way around');
  const sp = G.shortest(usa, a.a, a.b, r => (r.id === a.id || r.id === b.id) ? Infinity : r.len);
  assert.equal(d.len, sp.dist);
});
