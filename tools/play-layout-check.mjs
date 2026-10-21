// Browser check of the Play table's layout (Safari's engine, Playwright WebKit from ~/.claude/tools).
//   node tools/play-layout-check.mjs [baseUrl]      (serve the folder first; default http://127.0.0.1:8772/)
// A 5-player USA game is played in node (engine + computers) to its late stage and loaded into Play. Then, per size:
//  - phone 393x659 and 320x568: city names >= 9 px in the default view; the whole map is one tap away (the fit
//    button); each rival is one chip (no second strip of counts); the face-up cards a quarter shorter than before
//  - laptop 1440x900 and 1280x800: the board (with its printed frame) is >= 55% of the screen; deck, face-up cards and ticket deck sit in the
//    right-hand column, not between the board and it
//  - everywhere: no page scroll, no sideways overflow, no page errors
// (2026-10-20, visibility round 2: "the after-shots still waste space")
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(path.join(os.homedir(), '.claude/tools/package.json'));
const { webkit, devices } = require('playwright');
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rq = createRequire(path.join(repo, 'package.json'));
const T = rq('./js/engine.js'), AI = rq('./js/ai.js');

const BASE = process.argv[2] || 'http://127.0.0.1:8772/';
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL ' + msg); } };

// a late 5-player game, the same every run
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const map = T.register(rq('./maps/usa.json'));
const rand = rng(42);
const seats = [{ name: 'You', kind: 'human' }, { name: 'Ruby', kind: 'cpu', level: 'medium' }, { name: 'Blue', kind: 'cpu', level: 'hard' }, { name: 'Goldie', kind: 'cpu', level: 'easy' }, { name: 'Jade', kind: 'cpu', level: 'medium' }];
let s = T.newGame(map, { seed: 7, deckId: map.ticketDecks[0].id, seats }), late = null;
while (s.phase !== 'over' && !late) {
  const seat = s.phase === 'setup' ? s.players.findIndex(p => p.pending) : s.turn;
  s = T.apply(s, AI.choose(T.view(s, seat), seat, seat === 0 ? 'hard' : s.players[seat].level, rand));
  if (s.turn === 0 && s.phase === 'main' && !s.drew && !s.players[0].pending && !s.pendingTunnel && Math.min(...s.players.map(p => p.trains)) <= 6) late = JSON.parse(JSON.stringify(s));
}
const SAVE = { tab: 'play', settings: { speed: 'slow', privacy: 'mine' }, play: { me: 0, state: late, race: [] } };

const browser = await webkit.launch();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIZES = [{ w: 393, h: 659, phone: true }, { w: 320, h: 568, phone: true }, { w: 1440, h: 900 }, { w: 1280, h: 800 }];
for (const size of SIZES) {
  const ctx = await browser.newContext(size.phone ? Object.assign({}, devices['iPhone 15'], { viewport: { width: size.w, height: size.h } }) : { viewport: { width: size.w, height: size.h } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ttr:v1', JSON.stringify(d)); sessionStorage.setItem('seeded', '1'); } }, SAVE);
  await page.goto(BASE + '#play'); await page.waitForSelector('#v-play svg.board g.route'); await sleep(1800);
  const tag = `${size.w}x${size.h}`;
  const M = () => page.evaluate(() => {
    const v = document.querySelector('#v-play'), svg = v.querySelector('svg.board'), sr = svg.getBoundingClientRect();
    const t = [...svg.querySelectorAll('.city text')].map(e => e.getBoundingClientRect().height / 1.15).filter(h => h > 0);
    const gR = svg.querySelector('.beds').nextElementSibling.getBoundingClientRect();
    const r = sel => { const e = v.querySelector(sel); if (!e || !e.offsetParent && getComputedStyle(e).display !== 'contents') return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const vis = sel => { const e = v.querySelector(sel); return !!(e && e.offsetParent && getComputedStyle(e).display !== 'none'); };
    const seats = [...v.querySelectorAll('.rivals .seat')].map(e => e.getBoundingClientRect().height);
    const face = v.querySelector('.supply [data-face] .ttr-card');
    return {
      label: t.length ? Math.min(...t) : 0, svg: { l: sr.left, t: sr.top, r: sr.right, b: sr.bottom, w: sr.width, h: sr.height },
      routes: { l: gR.left, t: gR.top, r: gR.right, b: gR.bottom }, share: sr.width * sr.height / (innerWidth * innerHeight),
      fitShown: vis('.zoom [data-z=fit]'), rivals: r('.rivals'), seatMax: seats.length ? Math.max(...seats) : 0,
      stuffShown: [...v.querySelectorAll('.rivals .seat-stuff')].some(e => e.offsetParent && e.getBoundingClientRect().height > 0),
      boardShare: (() => { const b = v.querySelector('.board-wrap').getBoundingClientRect(); return b.width * b.height / (innerWidth * innerHeight); })(),
      faceH: face ? face.getBoundingClientRect().height : 0, supply: r('.supply'), panel: r('.panel'), board: r('.board-wrap'),
      scrollY: document.scrollingElement.scrollHeight - innerHeight, scrollX: document.scrollingElement.scrollWidth - innerWidth,
    };
  });
  const m = await M();
  ok(m.scrollY <= 1 && m.scrollX <= 1, `${tag}: page scrolls (${m.scrollX}, ${m.scrollY})`);
  if (size.phone) {
    ok(m.label >= 8.9, `${tag}: city names ${m.label.toFixed(1)} px in the default view (want >= 9)`);
    ok(!m.stuffShown && m.seatMax <= 40, `${tag}: rival seats take a second strip (seat ${m.seatMax.toFixed(0)} px tall)`);
    const faceMax = size.w < 360 ? 37 : 47; // a quarter shorter than before (49 / 62 px)
    ok(m.faceH > 0 && m.faceH <= faceMax, `${tag}: face-up cards ${m.faceH.toFixed(0)} px tall (want <= ${faceMax})`);
    const whole = q => q.routes.l >= q.svg.l - 1 && q.routes.r <= q.svg.r + 1 && q.routes.t >= q.svg.t - 1 && q.routes.b <= q.svg.b + 1;
    if (!whole(m)) {
      ok(m.fitShown, `${tag}: map is cropped but the fit button is hidden`);
      if (m.fitShown) {
        await page.click('#v-play .zoom [data-z=fit]'); await sleep(900);
        ok(whole(await M()), `${tag}: the fit button does not show the whole map`);
        await page.click('#v-play .zoom [data-z=fit]'); await sleep(900);
        const back = await M();
        ok(Math.abs(back.label - m.label) < 0.3, `${tag}: a second fit tap does not go back to the default view`);
      }
    }
  } else {
    ok(m.boardShare >= 0.55, `${tag}: board is ${(m.boardShare * 100).toFixed(0)}% of the screen (want >= 55%)`);
    ok(m.supply && m.panel && m.supply.l >= m.panel.l - 1, `${tag}: deck / face-up cards are not in the right-hand column`);
  }
  ok(!errs.length, `${tag}: page errors ${errs.join(' | ')}`);
  await ctx.close();
}
await browser.close();
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
