// Browser check for the wave-3 leftovers (Safari's engine, Playwright WebKit from ~/.claude/tools).
//   node tools/w3-check.mjs [baseUrl] [shotDir] [mapId]
// A late game (you hold 4+ tickets with long city names) is loaded into Play, then per size:
//  - every ticket name in my seat is shown whole (no "…" cut-off)
//  - phone sideways (659x393): the board's printed frame fills its column (no empty wood strip beside it)
//  - after the game, the replay can be paused (the route count stops) and stepped back / forward
//  - everywhere: no page scroll, no sideways overflow, no page errors
import { createRequire } from 'node:module';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(path.join(os.homedir(), '.claude/tools/package.json'));
const { webkit, devices } = require('playwright');
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rq = createRequire(path.join(repo, 'package.json'));
const T = rq('./js/engine.js'), AI = rq('./js/ai.js');

const BASE = process.argv[2] || 'http://127.0.0.1:8772/';
const SHOTS = process.argv[3] || null;
const MAP = process.argv[4] || 'usa';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL ' + msg); } };

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const map = T.register(rq('./maps/' + MAP + '.json'));
const rand = rng(42);
const seats = [{ name: 'You', kind: 'human' }, { name: 'Ruby', kind: 'cpu', level: 'medium' }, { name: 'Blue', kind: 'cpu', level: 'hard' }].slice(0, Math.min(3, map.players[1]));
let s = T.newGame(map, { seed: 7, deckId: map.ticketDecks[0].id, seats }), late = null;
const claims = [];
while (s.phase !== 'over') {
  const seat = s.phase === 'setup' ? s.players.findIndex(p => p.pending) : s.turn;
  const before = Object.keys(s.owner).length;
  s = T.apply(s, AI.choose(T.view(s, seat), seat, seat === 0 ? 'hard' : s.players[seat].level, rand));
  const ids = Object.keys(s.owner);
  if (ids.length > before) for (const id of ids) if (!claims.some(c => c.r === id)) claims.push({ r: id, s: s.owner[id], t: s.turnNo });
  if (!late && s.turn === 0 && s.phase === 'main' && !s.drew && !s.players[0].pending && !s.pendingTunnel && Math.min(...s.players.map(p => p.trains)) <= 12) late = JSON.parse(JSON.stringify(s));
}
// my seat holds the longest-named tickets of the deck (the cut-off case)
const deck = T.deckFor(map, late).tickets, ix = Object.fromEntries(map.cities.map(c => [c.id, c.name]));
const nameLen = t => (ix[t.a] || '').length + (ix[t.b] || (t.opts ? 12 : 0)).toString().length;
late.players[0].tickets = deck.map((t, i) => i).sort((x, y) => nameLen(deck[y]) - nameLen(deck[x])).slice(0, 4);
const LATE = { tab: 'play', settings: { speed: 'slow', privacy: 'mine' }, play: { me: 0, state: late, race: [] } };
const OVER = { tab: 'play', settings: { speed: 'slow', privacy: 'mine' }, play: { me: 0, state: s, race: [], claims, shownScores: true } };

const browser = await webkit.launch();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIZES = [{ w: 393, h: 659, phone: true }, { w: 320, h: 568, phone: true }, { w: 659, h: 393, phone: true, land: true }, { w: 1280, h: 800 }, { w: 1440, h: 900 }];
async function open(size, save) {
  const ctx = await browser.newContext(size.phone ? Object.assign({}, devices['iPhone 15'], { viewport: { width: size.w, height: size.h } }) : { viewport: { width: size.w, height: size.h } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ttr:v1', JSON.stringify(d)); sessionStorage.setItem('seeded', '1'); } }, save);
  await page.goto(BASE + '#play'); await page.waitForSelector('#v-play svg.board g.route'); await sleep(1800);
  return { ctx, page, errs };
}
for (const size of SIZES) {
  const tag = `${MAP} ${size.w}x${size.h}`;
  {
    const { ctx, page, errs } = await open(size, LATE);
    const m = await page.evaluate(() => {
      const v = document.querySelector('#v-play');
      const cut = [...v.querySelectorAll('.mytix .tkt .tk-c')].filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map(e => e.textContent);
      const frame = v.querySelector('.board-wrap');
      const fb = frame.getBoundingClientRect(), vs = getComputedStyle(v);
      const freeV = v.clientHeight - parseFloat(vs.paddingTop) - parseFloat(vs.paddingBottom) - fb.height;
      const tk = [...v.querySelectorAll('.mytix .tkt')].map(e => { const b = e.getBoundingClientRect(); return { r: b.right, b: b.bottom }; });
      return {
        cut, n: v.querySelectorAll('.mytix .tkt').length, freeV, fw: fb.width,
        scrollY: document.scrollingElement.scrollHeight - innerHeight, scrollX: document.scrollingElement.scrollWidth - innerWidth,
        tixOff: tk.some(t => t.b > innerHeight + 1),
      };
    });
    ok(m.n >= 3, `${tag}: only ${m.n} tickets shown`);
    ok(!m.cut.length, `${tag}: ticket names cut off: ${m.cut.join(' | ')}`);
    ok(m.scrollY <= 1 && m.scrollX <= 1, `${tag}: page scrolls (${m.scrollX}, ${m.scrollY})`);
    if (size.land) ok(m.freeV <= 24, `${tag}: ${m.freeV.toFixed(0)} px of empty wood above and below the board (frame ${m.fw.toFixed(0)} px wide)`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${MAP}-late-${size.w}x${size.h}.png`) });
    ok(!errs.length, `${tag}: page errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await open(size, OVER);
    const btn = await page.$('#p-replay');
    ok(!!btn, `${tag}: no Replay button after the game`);
    if (btn) {
      await page.click('#p-replay'); await sleep(1500);
      const txt = () => page.$eval('#v-play .st-text', e => e.textContent);
      const pause = await page.$('#p-rpause');
      ok(!!pause, `${tag}: replay has no pause button`);
      if (pause) {
        await page.click('#p-rpause'); const a = await txt(); await sleep(1500); const b = await txt();
        ok(a === b, `${tag}: replay keeps going while paused (${a} → ${b})`);
        await page.click('#p-rnext'); const c = await txt();
        ok(c !== b, `${tag}: next does not step the replay`);
        await page.click('#p-rback'); const d = await txt();
        ok(d === b, `${tag}: back does not step the replay back (${b} vs ${d})`);
        const sc = await page.evaluate(() => [document.scrollingElement.scrollWidth - innerWidth, Math.max(0, ...[...document.querySelectorAll('#v-play .status > *')].map(e => e.getBoundingClientRect().right - innerWidth))]);
        ok(sc[0] <= 1 && sc[1] <= 1, `${tag}: replay controls overflow (${sc})`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${MAP}-replay-${size.w}x${size.h}.png`) });
      }
    }
    ok(!errs.length, `${tag}: page errors ${errs.join(' | ')}`);
    await ctx.close();
  }
}
await browser.close();
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
