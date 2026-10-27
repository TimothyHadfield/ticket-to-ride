// Browser test: leaving a game against the computers after your first move counts as a loss in My stats;
// a game you haven't moved in yet and the guided first game never count.
//   node tests/quit.test.mjs        (needs Playwright in ~/.claude/tools; WebKit)
//   TTR_ROOT=<other checkout> runs it against older code.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
const require = createRequire(join(homedir(), '.claude/tools/') + 'x.js');
const pw = require('playwright');
const ROOT = process.env.TTR_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');

const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(d); } });
});
await new Promise(ok => srv.listen(0, ok));
const url = 'http://localhost:' + srv.address().port + '/?nosw#play';
let failed = 0;
const check = (ok, msg) => { console.log((ok ? '  PASS  ' : '  FAIL  ') + msg); if (!ok) failed++; };

const browser = await pw.webkit.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 659 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('coach-offer:ttr-first', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.TTRApp && window.Profile);
  const stats = () => page.evaluate(() => Profile.stats());
  const start = async () => {
    await page.waitForSelector('#p-start', { state: 'visible' });
    await page.waitForTimeout(400);
    await page.click('#p-start');
    await page.waitForFunction(() => TTRApp.S.play && TTRApp.S.play.state);
  };
  // your first move: keep all the starting tickets
  const move = async () => {
    await page.waitForFunction(() => { const p = TTRApp.S.play; return p && p.state.players[p.me].pending; }, null, { timeout: 30000 });
    await page.evaluate(() => { const p = TTRApp.S.play; TTRApp.Play.act({ type: 'keepTickets', keep: p.state.players[p.me].pending.tickets.slice() }); });
    check(await page.evaluate(() => !TTRApp.S.play.state.players[TTRApp.S.play.me].pending), 'you kept your tickets');
  };
  // New game sits in the Notes sheet on a phone; the ticket choice may be open on top, so tap by script
  const leave = async () => {
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('#p-notes').click());
    await page.waitForSelector('.notes-sheet #p-new');
    await page.evaluate(() => document.querySelector('.notes-sheet #p-new').click());
    await page.waitForFunction(() => [...document.querySelectorAll('[data-ok]')].some(b => /New game/.test(b.textContent)));
    await page.evaluate(() => [...document.querySelectorAll('[data-ok]')].find(b => /New game/.test(b.textContent)).click());
    await page.waitForFunction(() => !TTRApp.S.play);
  };

  await start();
  await leave();
  let s = await stats();
  check(s.games === 0, 'a game left before your first move is not counted (' + s.games + ' games)');

  await start();
  await move();
  check((await stats()).games === 0, 'nothing counted while the game is on');
  await leave();
  s = await stats();
  check(s.games === 1 && s.losses === 1, 'leaving a game after a move counts as a loss (' + s.games + ' games, ' + s.losses + ' lost)');

  // the guided first game, left after a move: never counts
  await page.evaluate(() => TTRApp.Play.startTutorial());
  await page.waitForFunction(() => TTRApp.S.play && TTRApp.S.play.tutorial);
  await page.addStyleTag({ content: '.coach-layer{display:none!important}' });   // the guide's bubbles sit over the buttons
  await move();
  await leave();
  s = await stats();
  check(s.games === 1 && s.losses === 1, 'leaving the guided game is not counted (' + s.games + ' games, ' + s.losses + ' lost)');
  check(!errs.length, 'no page errors ' + errs.join(' | '));
  await ctx.close();
} finally {
  await browser.close();
  srv.close();
}
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
