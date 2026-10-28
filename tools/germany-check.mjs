// Browser check of Germany's own screens (Safari's engine, Playwright WebKit from ~/.claude/tools).
//   node tools/germany-check.mjs [baseUrl] [shotDir]
// Per size (393x659, 320x568, 659x393, 1280x800, 1440x900):
//  - a new game asks how many long tickets first (0–4), then shows 4 tickets in that mix
//  - passengers are drawn on the board (60 at the start)
//  - claiming a route offers a passenger colour at each end; the one picked is the one taken
//  - Notes list every player's passengers; the final scores have a Passengers column
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
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL ' + msg); } };
const map = T.register(rq('./maps/germany.json'));
const seats = [{ name: 'You', kind: 'human' }, { name: 'Ruby', kind: 'cpu', level: 'medium' }, { name: 'Blue', kind: 'cpu', level: 'hard' }];

// 1. a fresh game: my starting tickets not drawn yet
const fresh = T.newGame(map, { seed: 21, seats });
// 2. my turn early on, with locomotives to claim Berlin–Leipzig (Berlin has 5 passengers, Leipzig 3)
let mid = T.newGame(map, { seed: 21, seats });
for (let i = 0; i < 3; i++) { mid = T.apply(mid, { type: 'ticketMix', seat: i, long: 1 }); mid = T.apply(mid, { type: 'keepTickets', seat: i, keep: mid.players[i].pending.tickets.slice(0, 2) }); }
mid.turn = 0; mid.players[0].hand = Object.assign(T.emptyHand(), { loco: 8, red: 2 });
const route = map.routes.find(r => [r.a, r.b].sort().join() === 'berlin,leipzig');
// 3. a finished game for the score sheet
let over = T.newGame(map, { seed: 5, seats });
const rand = (() => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; })();
while (over.phase !== 'over') { const seat = over.phase === 'setup' ? over.players.findIndex(p => p.pending) : over.turn; over = T.apply(over, AI.choose(T.view(over, seat), seat, 'medium', rand)); }

const save = st => ({ tab: 'play', settings: { speed: 'slow', privacy: 'mine' }, play: { me: 0, state: st, race: [] } });
const browser = await webkit.launch();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIZES = [{ w: 393, h: 659, phone: true }, { w: 320, h: 568, phone: true }, { w: 659, h: 393, phone: true }, { w: 1280, h: 800 }, { w: 1440, h: 900 }];
async function open(size, data) {
  const ctx = await browser.newContext(size.phone ? Object.assign({}, devices['iPhone 15'], { viewport: { width: size.w, height: size.h } }) : { viewport: { width: size.w, height: size.h } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ttr:v1', JSON.stringify(d)); sessionStorage.setItem('seeded', '1'); } }, data);
  await page.goto(BASE + '#play'); await page.waitForSelector('#v-play svg.board g.route'); await sleep(1500);
  return { ctx, page, errs };
}
const flat = page => page.evaluate(() => [document.scrollingElement.scrollWidth - innerWidth, document.scrollingElement.scrollHeight - innerHeight]);
const sheetFits = page => page.evaluate(() => { const s = document.querySelector('.sheet'); if (!s) return null; const b = s.getBoundingClientRect(); return { r: b.right - innerWidth, l: b.left, sw: s.scrollWidth - s.clientWidth }; });
for (const size of SIZES) {
  const tag = `${size.w}x${size.h}`, shot = n => SHOTS ? page => page.screenshot({ path: path.join(SHOTS, `germany-${n}-${tag}.png`) }) : async () => {};
  {
    const { ctx, page, errs } = await open(size, save(fresh));
    const ks = await page.$$('.sheet #mx [data-k]');
    ok(ks.length === 5, `${tag}: the mix chooser has ${ks.length} choices (want 0–4)`);
    ok(await page.$$eval('svg.board .pax', e => e.length) === 60, `${tag}: 60 passengers on the board`);
    const f = await sheetFits(page); ok(f && f.r <= 1 && f.l >= -1 && f.sw <= 1, `${tag}: mix sheet does not fit (${JSON.stringify(f)})`);
    await shot('mix')(page);
    if (ks.length === 5) {
      await page.click('.sheet #mx [data-k="2"]'); await page.click('.sheet [data-ok]'); await sleep(500);
      const n = await page.$$eval('.sheet #pk [data-i]', e => e.length);
      ok(n === 4, `${tag}: ${n} tickets to choose from after the mix (want 4)`);
      const st = await page.evaluate(() => JSON.parse(localStorage.getItem('ttr:v1')).play.state);
      const deck = T.deckFor(map, st).tickets;
      ok(st.players[0].pending && st.players[0].pending.tickets.filter(i => deck[i].long).length === 2, `${tag}: the 4 tickets are not 2 short + 2 long`);
      await shot('keep')(page);
    }
    const [sx, sy] = await flat(page); ok(sx <= 1 && sy <= 1, `${tag}: page scrolls (${sx}, ${sy})`);
    ok(!errs.length, `${tag}: page errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await open(size, save(mid));
    // tap the route's middle car on the board
    const box = await page.evaluate(id => { const g = document.querySelector(`#v-play svg.board g.route[data-route="${id}"]`); const cars = g.querySelectorAll('rect.car'); const b = cars[Math.floor(cars.length / 2)].getBoundingClientRect(), s = document.querySelector('#v-play svg.board').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, s }; }, route.id);
    const inView = box.x > box.s.left + 10 && box.y > box.s.top + 10 && box.x < box.s.right - 10 && box.y < box.s.bottom - 10;
    if (!inView) { await page.click('#v-play .zoom [data-z=fit]').catch(() => {}); await sleep(900); }
    const box2 = await page.evaluate(id => { const g = document.querySelector(`#v-play svg.board g.route[data-route="${id}"]`); const cars = g.querySelectorAll('rect.car'); const b = cars[Math.floor(cars.length / 2)].getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, route.id);
    // a crowded spot glides in first (the board's magnifier): tap the route again where it now is
    for (let k = 0, b = box2; k < 3 && !(await page.$('.sheet .paylist')); k++) {
      if (size.phone) await page.evaluate(([x, y]) => { const svg = document.querySelector('#v-play svg.board'); for (const t of ['pointerdown', 'pointerup']) svg.dispatchEvent(new PointerEvent(t, { pointerId: 1, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true })); }, [b.x, b.y]);
      else await page.mouse.click(b.x, b.y);
      await sleep(700);
      b = await page.evaluate(id => { const g = document.querySelector(`#v-play svg.board g.route[data-route="${id}"]`); const cars = g.querySelectorAll('rect.car'); const r = cars[Math.floor(cars.length / 2)].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, route.id);
    }
    if (process.env.DBG) console.log(tag, JSON.stringify(box), await page.evaluate(() => [...document.querySelectorAll('.toast, [class*=toast]')].map(e => e.textContent).join('|')));
    const picks = await page.$$eval('.sheet .pax-pick', e => e.map(x => ({ place: x.dataset.place, n: x.querySelectorAll('[data-c]').length, on: x.querySelectorAll('[aria-pressed="true"]').length })));
    ok(picks.length === 2 && picks.every(p => p.n >= 1 && p.on === 1), `${tag}: claim sheet passenger choice ${JSON.stringify(picks)}`);
    const f = await sheetFits(page); ok(f && f.r <= 1 && f.l >= -1 && f.sw <= 1, `${tag}: claim sheet does not fit (${JSON.stringify(f)})`);
    await shot('claim')(page);
    if (picks.length === 2) {
      // pick the last colour offered in Berlin, then pay
      const want = await page.$eval('.sheet .pax-pick[data-place="berlin"] [data-c]:last-child', b => { b.click(); return b.dataset.c; });
      await page.click('.sheet [data-o="0"]'); await sleep(700);
      const st = await page.evaluate(() => JSON.parse(localStorage.getItem('ttr:v1')).play.state);
      ok(st.owner[route.id] === 0, `${tag}: route not claimed`);
      ok(st.players[0].pax[want] === 1, `${tag}: picked ${want} in Berlin but got ${JSON.stringify(st.players[0].pax)}`);
      // Notes: everyone's passengers
      if (await page.isVisible('#p-notes')) { await page.evaluate(() => document.querySelector('#p-notes').click()); await sleep(400); }
      const rows = await page.$$eval('.pax-row', e => e.filter(x => x.offsetParent).length);
      ok(rows >= 3, `${tag}: Notes show ${rows} passenger rows (want 3)`);
      await shot('notes')(page);
    }
    const [sx, sy] = await flat(page); ok(sx <= 1 && sy <= 1, `${tag}: page scrolls (${sx}, ${sy})`);
    ok(!errs.length, `${tag}: page errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await open(size, Object.assign(save(over), {}));
    await sleep(500);
    if (!(await page.$('.sheet table.scores'))) { await page.click('#p-score').catch(() => {}); await sleep(500); }
    const head = await page.$$eval('.sheet table.scores th', e => e.map(x => x.textContent));
    ok(head.includes('Passengers'), `${tag}: score sheet columns ${head.join(', ')}`);
    const f = await sheetFits(page); ok(f && f.r <= 1 && f.l >= -1 && f.sw <= 1, `${tag}: score sheet does not fit (${JSON.stringify(f)})`);
    await shot('scores')(page);
    ok(!errs.length, `${tag}: page errors ${errs.join(' | ')}`);
    await ctx.close();
  }
}
await browser.close();
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
