// Sounds and animations: a scripted short game must make the right sounds (js/sfx.js over the shared
// js/fx.js), Sound off must make none, Animations off must animate nothing, and game over must
// celebrate the right way for each player.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// ---- fake browser bits (before fx.js loads) ----
const audio = { nodes: 0 };
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
const node = extra => { audio.nodes++; return Object.assign({ connect() {}, disconnect() {} }, extra); };
const source = () => node({ start() {}, stop() {} });
class FakeAC {
  get currentTime() { return performance.now() / 1000; }
  constructor() { this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
  createGain() { return node({ gain: param() }); }
  createOscillator() { return Object.assign(source(), { type: 'sine', frequency: param() }); }
  createBufferSource() { return Object.assign(source(), { buffer: null, loop: false }); }
  createBiquadFilter() { return node({ type: 'lowpass', frequency: param(), Q: param() }); }
  createStereoPanner() { return node({ pan: param() }); }
  createDynamicsCompressor() { return node({}); }
  createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n) }; }
  resume() { return Promise.resolve(); }
}
globalThis.AudioContext = FakeAC;
// a tiny DOM stand-in: counts every element made and every animation started
const dom = { made: 0, animated: 0 };
const fakeEl = () => ({
  style: {}, dataset: {}, className: '', textContent: '7', isConnected: true,
  getBoundingClientRect: () => ({ left: 10, top: 10, width: 40, height: 60 }),
  animate() { dom.animated++; const a = { onfinish: null, oncancel: null }; setTimeout(() => a.onfinish && a.onfinish(), 5); return a; },
  appendChild() {}, remove() {}, removeAttribute() {}, setAttribute() {}, querySelector: () => fakeEl(), querySelectorAll: () => [],
  cloneNode() { dom.made++; return fakeEl(); },
});
globalThis.document = { body: { appendChild() {} }, head: { appendChild() {} }, createElement() { dom.made++; return fakeEl(); }, addEventListener() {}, removeEventListener() {}, getElementById: () => null };
globalThis.requestAnimationFrame = f => setTimeout(() => f(performance.now()), 4);
globalThis.innerWidth = 393; globalThis.innerHeight = 659;
globalThis.getComputedStyle = () => ({ borderRadius: '0' });

require('../js/fx.js');
const FX = globalThis.FX;
const T = require('../js/engine.js');
const G = require('../js/graph.js');
const Sfx = require('../js/sfx.js');
const map = T.register(require(path.join(__dirname, '..', 'maps', 'usa.json')));

FX.init({ game: 'ttr-test', clicks: false });
FX.unlock(); // the "first tap": audio exists from here on

// spies
const heard = [], celebrated = [], helpers = [];
const realPlay = FX.play;
FX.play = (name, o) => { const ok = realPlay(name, o); heard.push({ name, ok }); return ok; };
const realCelebrate = FX.celebrate;
FX.celebrate = o => { celebrated.push(o.kind); return realCelebrate(o); };
for (const k of ['flyTo', 'pop', 'floatText', 'flash', 'pulse', 'countUp']) { const f = FX[k]; FX[k] = (...a) => { helpers.push(k); return f(...a); }; }
const reset = () => { heard.length = 0; celebrated.length = 0; helpers.length = 0; dom.made = 0; dom.animated = 0; };

// screen hooks the app would give: every lookup finds an element
const cars = n => Array.from({ length: n }, () => Object.assign(fakeEl(), { shine: fakeEl(), cbm: fakeEl() }));
const ctx = me => ({ me, colors: ['#e55', '#58e'], chip: fakeEl, score: fakeEl, deck: fakeEl, tix: fakeEl, face: fakeEl, hand: fakeEl, ticketRow: fakeEl, status: fakeEl, cars: id => cars(G.index(map).routeById[id].len), sheet: fakeEl, longestCell: fakeEl });

// ---- a scripted short game: You (seat 0) v one computer ----
function script() {
  let s = T.newGame(map, { seed: 42, seats: [{ name: 'You' }, { name: 'Bot', kind: 'cpu', level: 'easy' }] });
  const steps = [];
  const step = a => { const prev = s; s = T.apply(s, a); steps.push({ a, prev, next: s }); };
  step({ type: 'keepTickets', seat: 0, keep: s.players[0].pending.tickets.slice(0, 2) });
  step({ type: 'keepTickets', seat: 1, keep: s.players[1].pending.tickets.slice(0, 2) });
  // make the order fixed: seat 0 to move, with a ticket one route from done and 3 trains left after a 6-train claim
  s = T.clone(s); s.turn = 0;
  const deck = T.deckFor(map, s).tickets, ti = deck.findIndex(t => t.a === 'duluth' && t.b === 'houston');
  const sp = G.shortest(map, 'duluth', 'helena', r => r.len); // Duluth–Helena is one 6-train route
  assert.equal(sp.path.length, 1);
  const last = sp.path[0];
  // we already own Helena–Houston, so claiming Duluth–Helena finishes the Duluth–Houston ticket
  G.shortest(map, 'helena', 'houston', r => r.len).path.forEach(id => { s.owner[id] = 0; s.players[0].routes.push(id); });
  s.players[0].tickets = [ti];
  s.players[0].trains = 8; s.players[0].hand.loco = 6;
  step({ type: 'draw', seat: 0, from: 'deck' });
  step({ type: 'draw', seat: 0, from: 'deck' });
  step({ type: 'draw', seat: 1, from: 0 });
  step({ type: 'draw', seat: 1, from: 'deck' });
  step({ type: 'claim', seat: 0, route: last, pay: { color: null, n: 0, locos: 6 } }); // 6 cars, ticket done, last round
  step({ type: 'draw', seat: 1, from: 'deck' });
  step({ type: 'draw', seat: 1, from: 'deck' });
  step({ type: 'draw', seat: 0, from: 'deck' });
  step({ type: 'draw', seat: 0, from: 'deck' }); // game over
  assert.equal(s.phase, 'over');
  return steps;
}

async function playAll(steps, me) {
  for (const x of steps) await Sfx.fire(Sfx.diff(x.prev, x.next, me, map), ctx(me));
}

test('events → sounds for a scripted short game', async () => {
  const steps = script();
  const types = steps.map(x => Sfx.diff(x.prev, x.next, 0, map).map(e => e.type).join(','));
  assert.deepEqual(types.slice(2), [
    'draw', 'draw', 'draw', 'draw,yourTurn',
    'claim,ticketDone,lastRound', 'draw', 'draw,yourTurn', 'draw', 'draw,over',
  ]);
  reset(); FX.set('sound', true); FX.set('animations', true);
  await playAll(steps.slice(2), 0);
  const names = heard.filter(h => h.ok).map(h => h.name);
  const count = n => names.filter(x => x === n).length;
  assert.equal(count('cardDeal'), 8, 'one card sound per card drawn (yours and the computer\'s)');
  assert.equal(count('place'), 6, 'six train cars clack into place for a 6-train route');
  assert.equal(count('train'), 1, 'a whistle for the long route');
  assert.equal(count('ding'), 1, 'ticket finished');
  assert.equal(count('alarm'), 1, 'last round');
  assert.equal(count('turn'), 2, 'your-turn chime only when it becomes your turn');
  assert.ok(count('drumroll') === 1 && celebrated.filter(k => k === 'win' || k === 'lose').length === 1, 'game over: count-up then win or lose');
  assert.ok(names.indexOf('cardDeal') < names.indexOf('place') && names.indexOf('place') < names.indexOf('ding'), 'in the order things happened');
  assert.ok(helpers.includes('flyTo') && helpers.includes('floatText') && helpers.includes('countUp'), 'animations run when on');
  assert.ok(dom.animated >= 6, 'route cars animate one by one');
});

test('Sound off: no sound at all; Game sounds off keeps alerts', async () => {
  const steps = script().slice(2);
  reset(); FX.set('sound', false);
  const before = FX.stats.plays;
  await playAll(steps, 0);
  assert.ok(heard.length > 10, 'the game still asked for sounds');
  assert.equal(heard.filter(h => h.ok).length, 0, 'none played');
  assert.equal(FX.stats.plays, before);
  FX.set('sound', true); FX.set('moves', false); reset();
  await playAll(steps, 0);
  const ok = heard.filter(h => h.ok).map(h => h.name);
  assert.ok(!ok.includes('cardDeal') && !ok.includes('place'), 'no game sounds');
  assert.ok(ok.includes('turn') && ok.includes('alarm'), 'alerts still play');
  FX.set('moves', true);
});

test('Animations off: nothing animates, nothing is added to the page', async () => {
  const steps = script().slice(2);
  FX.set('animations', false); reset();
  await playAll(steps, 0);
  assert.deepEqual(helpers.filter(h => h !== 'countUp'), [], 'no animation helper called');
  assert.equal(dom.animated, 0, 'no element animated');
  assert.equal(dom.made, 0, 'no overlay or ghost made');
  FX.set('animations', true);
});

test('game over celebrates win for the winner and lose for the others', async () => {
  const steps = script();
  const end = steps[steps.length - 1];
  const winner = end.next.result.winner;
  for (const me of [0, 1]) {
    reset();
    await Sfx.fire(Sfx.diff(end.prev, end.next, me, map), ctx(me));
    const kinds = celebrated.filter(k => k !== 'big');
    assert.deepEqual(kinds, [me === winner ? 'win' : 'lose'], 'seat ' + me);
  }
  // the fanfare is played inside FX.celebrate, so count all sounds made against the ones the game asked for
  const hidden = async () => { reset(); const b = FX.stats.plays; await Sfx.fire(Sfx.diff(end.prev, end.next, winner, map), ctx(winner)); return FX.stats.plays - b - heard.filter(h => h.ok).length; };
  assert.ok(await hidden() >= 1, 'Celebrations on: the fanfare plays');
  FX.set('celebrations', false);
  assert.equal(await hidden(), 0, 'Celebrations off: no fanfare');
  FX.set('celebrations', true);
});

test('online snapshot diffs (views, hidden hands) give the same events', () => {
  const steps = script().slice(2);
  const OG = require('../js/online-game.js');
  const asView = (s, seat) => OG.asState(OG.merge(OG.game.publicView(s), OG.game.privateView(s, seat), seat));
  const local = steps.map(x => Sfx.diff(x.prev, x.next, 0, map).map(e => e.type + ':' + e.seat).join());
  const online = steps.map(x => Sfx.diff(asView(x.prev, 0), asView(x.next, 0), 0, map).map(e => e.type + ':' + e.seat).join());
  assert.deepEqual(online, local);
});
