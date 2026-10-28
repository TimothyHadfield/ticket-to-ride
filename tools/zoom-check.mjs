// Browser check of the board's auto-fit zoom (Safari's engine, Playwright WebKit).
//   node tools/zoom-check.mjs [baseUrl]        (default http://127.0.0.1:8772/)
// Needs Playwright; it is taken from ~/.claude/tools/node_modules (Tim's phone-view tool).
// For every map, at 393x659 and 659x393 (phone) and 1280x800 (laptop), it measures:
//  - on load the whole board (routes + city names) sits inside the board area and fills it in one direction
//  - in auto mode a one-finger drag doesn't move the board, and the fit button is dimmed
//  - after a pinch / the + button the fit button is lit; after tapping fit the board is back in the auto box (±2 px)
//  - zoomed in, then the screen rotates or the tab changes: back in auto
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(path.join(os.homedir(), '.claude/tools/package.json'));
const { webkit, devices } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8772/';
const MAPS = ['usa', 'europe', 'nordic', 'india', 'switzerland', 'germany'];
const SIZES = [{ w: 393, h: 659, phone: true }, { w: 659, h: 393, phone: true }, { w: 1280, h: 800, phone: false }];
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL ' + msg); } };

const browser = await webkit.launch();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// what the page reports: board area, drawn board box (routes + cities with names), fit button state
const probe = view => `(() => {
  const v = document.querySelector('#v-${view}'), wrap = v.querySelector('.board-wrap'), svg = wrap.querySelector('svg.board');
  const gs = svg.querySelectorAll(':scope > g');
  const rs = [gs[2].getBoundingClientRect(), gs[4].getBoundingClientRect()];
  const b = { l: Math.min(...rs.map(r => r.left)), t: Math.min(...rs.map(r => r.top)), r: Math.max(...rs.map(r => r.right)), b: Math.max(...rs.map(r => r.bottom)) };
  // the board area is the map inside the board's printed frame (the score track round the edge), not the whole wrap (2026-10-20)
  const a = svg.getBoundingClientRect();
  const fitB = wrap.querySelector('.zoom [data-z=fit]');
  return { a: { l: a.left, t: a.top, r: a.right, b: a.bottom }, b, vb: svg.getAttribute('viewBox'),
    lit: !!(fitB && fitB.classList.contains('lit')), scroll: document.scrollingElement.scrollHeight - innerHeight };
})()`;

for (const size of SIZES) {
  for (const id of MAPS) {
    const ctx = await browser.newContext(size.phone
      ? Object.assign({}, devices['iPhone 15'], { viewport: { width: size.w, height: size.h } })
      : { viewport: { width: size.w, height: size.h } });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.addInitScript(m => { try { localStorage.setItem('ttr:v1', JSON.stringify({ tab: 'lab', settings: { labMap: m } })); } catch (e) {} }, id);
    await page.goto(BASE + '#lab'); await page.waitForSelector('#v-lab svg.board g.route'); await sleep(700);
    const tag = `${id} ${size.w}x${size.h}`;
    // wait until a glide has finished (the viewBox stops changing), so a busy machine doesn't measure mid-glide
    const P = async () => { let a = null, same = 0; for (let k = 0; k < 40 && same < 3; k++) { const b = await page.evaluate(() => document.querySelector('#v-lab svg.board').getAttribute('viewBox')); same = b === a ? same + 1 : 0; a = b; await sleep(150); } return page.evaluate(probe('lab')); };
    const p0 = await P();
    const inside = (p) => p.b.l >= p.a.l - 1 && p.b.t >= p.a.t - 1 && p.b.r <= p.a.r + 1 && p.b.b <= p.a.b + 1;
    ok(inside(p0), `${tag}: board not inside its area on load ${JSON.stringify(p0)}`);
    const fill = Math.max((p0.b.r - p0.b.l) / (p0.a.r - p0.a.l), (p0.b.b - p0.b.t) / (p0.a.b - p0.a.t));
    ok(fill > 0.8, `${tag}: board fills only ${(fill * 100).toFixed(0)}% of its area`);
    // the board's frame has the map's own shape when there is room to choose it (landscape, laptop): no wide empty
    // bands inside the frame (2026-10-20, "filling the screen with the board view")
    const areaFill = (p0.b.r - p0.b.l) * (p0.b.b - p0.b.t) / ((p0.a.r - p0.a.l) * (p0.a.b - p0.a.t));
    if (size.w > size.h) ok(areaFill > 0.8, `${tag}: board covers only ${(areaFill * 100).toFixed(0)}% of its frame`);
    ok(!p0.lit, `${tag}: fit button lit in auto mode`);
    ok(p0.scroll <= 1, `${tag}: page scrolls ${p0.scroll}px`);
    // one-finger drag in auto: nothing moves
    const cx = (p0.a.l + p0.a.r) / 2, cy = (p0.a.t + p0.a.b) / 2;
    const drag = (pts) => page.evaluate(([pts, cx, cy]) => {
      const svg = document.querySelector('#v-lab svg.board');
      const ev = (type, id, x, y) => svg.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 }));
      for (const [type, id, x, y] of pts) ev(type, id, cx + x, cy + y);
    }, [pts, cx, cy]);
    await drag([['pointerdown', 1, 0, 0], ['pointermove', 1, 30, 20], ['pointermove', 1, 80, 50], ['pointerup', 1, 80, 50]]);
    await sleep(400);
    const p1 = await P();
    ok(Math.abs(p1.b.l - p0.b.l) < 0.5 && Math.abs(p1.b.t - p0.b.t) < 0.5, `${tag}: drag moved the board in auto mode`);
    // pinch out: fit button lit, board bigger
    await drag([['pointerdown', 1, -20, 0], ['pointerdown', 2, 20, 0], ['pointermove', 1, -50, 0], ['pointermove', 2, 50, 0], ['pointermove', 1, -80, 0], ['pointermove', 2, 80, 0], ['pointerup', 1, -80, 0], ['pointerup', 2, 80, 0]]);
    await sleep(400);
    const p2 = await P();
    ok(p2.lit, `${tag}: fit button not lit after pinch`);
    ok(p2.b.r - p2.b.l > (p0.b.r - p0.b.l) * 1.5, `${tag}: pinch did not zoom in`);
    // zoomed in, a drag pans, but the board can't leave the screen
    await drag([['pointerdown', 1, 0, 0], ['pointermove', 1, 20, 0], ['pointermove', 1, 2000, 2000], ['pointerup', 1, 2000, 2000]]);
    await sleep(900);
    const p3 = await P();
    // dragged far right/down: the board's left/top edge stops near the screen's edge (its small margin, at most
    // ~30 px when zoomed), or, if the board is narrower than the screen that way, it stays inside
    const edgeOk = (lo, hi, alo, ahi) => (hi - lo > ahi - alo) ? lo <= alo + 30 && hi >= ahi : lo >= alo - 1 && hi <= ahi + 1;
    ok(edgeOk(p3.b.l, p3.b.r, p3.a.l, p3.a.r) && edgeOk(p3.b.t, p3.b.b, p3.a.t, p3.a.b), `${tag}: board dragged off its area (${JSON.stringify(p3)})`);
    // fit button: glide back to the auto box
    await page.click('#v-lab .zoom [data-z=fit]'); await sleep(1000);
    const p4 = await P();
    ok(['l', 't', 'r', 'b'].every(k => Math.abs(p4.b[k] - p0.b[k]) <= 2), `${tag}: fit did not return to the auto box ${JSON.stringify(p4.b)} vs ${JSON.stringify(p0.b)}`);
    ok(!p4.lit, `${tag}: fit button still lit after fit`);
    // + button lights it; − back to the fit puts it back in auto
    await page.click('#v-lab .zoom [data-z=in]'); await sleep(500);
    ok((await P()).lit, `${tag}: fit button not lit after +`);
    // in auto only + shows (− and fit are hidden, 2026-10-20), so press − while it is there
    for (let k = 0; k < 2; k++) if (await page.isVisible('#v-lab .zoom [data-z=out]')) { await page.click('#v-lab .zoom [data-z=out]'); await sleep(500); }
    ok(!(await page.isVisible('#v-lab .zoom [data-z=out]')) && !(await page.isVisible('#v-lab .zoom [data-z=fit]')), `${tag}: − or fit still shown in auto`);
    const p5 = await P();
    ok(!p5.lit && ['l', 't', 'r', 'b'].every(k => Math.abs(p5.b[k] - p0.b[k]) <= 2), `${tag}: zooming out past the fit did not land in auto ${JSON.stringify(p5.b)}`);
    if (id === 'usa') {
      // zoomed in, then rotate: auto again, and fits the new area
      await page.click('#v-lab .zoom [data-z=in]'); await sleep(400);
      await page.setViewportSize({ width: size.h, height: size.w }); await sleep(900);
      const p6 = await P();
      ok(!p6.lit && inside(p6), `${tag}: after rotation not back in auto / not fitting ${JSON.stringify(p6)}`);
      await page.setViewportSize({ width: size.w, height: size.h }); await sleep(900);
      // zoomed in, switch tab and back: auto
      await page.click('#v-lab .zoom [data-z=in]'); await sleep(400);
      await page.click('[data-tab=settings]:visible'); await sleep(300);
      await page.click('[data-tab=lab]:visible'); await sleep(700);
      const p7 = await P();
      ok(!p7.lit && ['l', 't', 'r', 'b'].every(k => Math.abs(p7.b[k] - p0.b[k]) <= 2), `${tag}: after tab return not in auto ${JSON.stringify(p7.b)}`);
    }
    ok(!errs.length, `${tag}: page errors ${errs.join(' | ')}`);
    await ctx.close();
  }
}
await browser.close();
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
