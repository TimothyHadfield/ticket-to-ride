// Fit check of the Play table (Safari's engine, Playwright WebKit from ~/.claude/tools).
//   node tests/fit-ui.mjs [baseUrl] [--shots dir]      (serve the folder first; default http://127.0.0.1:8711/)
// Tim (2026-11-27): "make sure the user can actually see the full screen and everything" — spacing, sizing, fit.
// Two states of a 5-player USA game with long names, played in node by the computers:
//  - early: my first turn, a small hand
//  - crowded: late game, my hand grown to 22 cards in all 9 colours, 6 tickets
// At 393x659, 320x568, 659x393, 1280x800, 1440x900 it checks:
//  - no page scroll, no sideways overflow, no page errors
//  - every colour in my hand is on screen, its count >= 12 px and not covered by another card
//  - the 5 face-up cards are on screen and at least 28 px wide (25 on a phone on its side), nothing in the supply off screen
//  - every card in my hand lies inside the screen (a fan of 9 colours used to run off the right edge sideways)
//  - each ticket's points >= 12 px and names >= 10 px, on screen (or in a list that scrolls inside itself)
//  - each rival's name is not cut to a sliver (>= 5 letters shown or whole), score and counts >= 12 px
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

const args = process.argv.slice(2);
const si = args.indexOf('--shots'), SHOTS = si >= 0 ? args.splice(si, 2)[1] : null;
const BASE = args[0] || 'http://127.0.0.1:8711/';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL ' + msg); } };

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const map = T.register(rq('./maps/usa.json'));
const rand = rng(42);
const seats = [{ name: 'Montgomery', kind: 'human' }, { name: 'Alexandrina', kind: 'cpu', level: 'medium' }, { name: 'Bartholomew', kind: 'cpu', level: 'hard' }, { name: 'Christopher', kind: 'cpu', level: 'easy' }, { name: 'Maximiliana', kind: 'cpu', level: 'medium' }];
let s = T.newGame(map, { seed: 7, deckId: map.ticketDecks[0].id, seats }), early = null, late = null;
while (s.phase !== 'over' && !late) {
  const seat = s.phase === 'setup' ? s.players.findIndex(p => p.pending) : s.turn;
  s = T.apply(s, AI.choose(T.view(s, seat), seat, seat === 0 ? 'hard' : s.players[seat].level, rand));
  const mine = s.turn === 0 && s.phase === 'main' && !s.drew && !s.players[0].pending && !s.pendingTunnel;
  if (mine && !early) early = JSON.parse(JSON.stringify(s));
  if (mine && Math.min(...s.players.map(p => p.trains)) <= 14) late = JSON.parse(JSON.stringify(s));
}
// crowd my seat: 22 cards in all 9 colours and 6 tickets (extra tickets taken off the deck)
const me = late.players[0];
me.hand = { pink: 3, white: 2, blue: 3, yellow: 2, orange: 2, black: 3, red: 2, green: 3, loco: 2 };
while (me.tickets.length < 6 && late.ticketDeck.length) me.tickets.push(late.ticketDeck.shift());
const STATES = { early, crowded: late };

const browser = await webkit.launch();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIZES = [{ w: 393, h: 659, phone: true }, { w: 320, h: 568, phone: true }, { w: 659, h: 393, phone: true }, { w: 1280, h: 800 }, { w: 1440, h: 900 }];
for (const [sname, st] of Object.entries(STATES)) for (const size of SIZES) {
  const SAVE = { tab: 'play', settings: { speed: 'slow', privacy: 'mine' }, play: { me: 0, state: st, race: [] } };
  const ctx = await browser.newContext(size.phone ? Object.assign({}, devices['iPhone 15'], { viewport: { width: size.w, height: size.h } }) : { viewport: { width: size.w, height: size.h } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ttr:v1', JSON.stringify(d)); sessionStorage.setItem('seeded', '1'); } }, SAVE);
  await page.goto(BASE + '#play'); await page.waitForSelector('#v-play svg.board g.route'); await sleep(1800);
  const tag = `${sname} ${size.w}x${size.h}`;
  const m = await page.evaluate(() => {
    const v = document.querySelector('#v-play'), W = innerWidth, H = innerHeight;
    const fs = e => parseFloat(getComputedStyle(e).fontSize);
    const onScreen = b => b.width > 0 && b.left >= -1 && b.top >= -1 && b.right <= W + 1 && b.bottom <= H + 1;
    // inside a box that scrolls itself? then being clipped by it is fine
    const scroller = e => { for (let p = e.parentElement; p && p !== v; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY) && (p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1)) return p; } return null; };
    const hand = [...v.querySelectorAll('.mine .hand .idx')].map(e => {
      const b = e.getBoundingClientRect(), card = e.closest('.ttr-card, .tcard, [class*=card]');
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { px: fs(e), on: onScreen(b), covered: !(hit && (hit === e || e.contains(hit) || (card && card.contains(hit)))), color: card ? (card.dataset.color || card.getAttribute('title')) : '' };
    });
    const handOut = [...v.querySelectorAll('.mine .hand > *')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.left < -1 || b.right > W + 1 || b.bottom > H + 1); }).length;
    const face = [...v.querySelectorAll('.supply [data-face]')].map(e => { const b = e.getBoundingClientRect(); return { w: b.width, h: b.height, on: onScreen(b) }; });
    const tix = [...v.querySelectorAll('.mytix .tkt')].map(e => {
      const b = e.getBoundingClientRect(), c = e.querySelector('.tk-c'), p = e.querySelector('.tk-p');
      return { name: c ? fs(c) : 0, pts: p ? fs(p) : 0, on: onScreen(b), scroll: !!scroller(e) };
    });
    const rivals = [...v.querySelectorAll('.rivals .seat')].map(e => {
      const nm = e.querySelector('.nm'), sc = e.querySelector('.sc'), cnt = e.querySelector('.cnt');
      const full = nm.textContent.length, cut = nm.scrollWidth > nm.clientWidth + 1;
      const shown = cut ? Math.floor(full * nm.clientWidth / nm.scrollWidth) : full;
      const sb = e.getBoundingClientRect(), cb = cnt ? cnt.getBoundingClientRect() : sb;
      const cntCut = !!cnt && (cnt.scrollWidth > cnt.clientWidth + 1 || cb.left < sb.left - 1 || cb.right > sb.right + 1);
      return { shown, full, sc: fs(sc), cnt: cnt && cnt.offsetParent ? fs(cnt) : 99, cntCut, on: onScreen(sb) };
    });
    const sup = v.querySelector('.supply'), supCut = [...sup.querySelectorAll('.stk-btn, .slot, .disc')].some(e => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.left < -1 || b.right > W + 1); });
    const mySc = v.querySelector('.mine .tbl-plate .sc');
    const t = [...v.querySelectorAll('svg.board .city text')].map(e => e.getBoundingClientRect().height / 1.15).filter(h => h > 0);
    return { hand, handOut, face, tix, rivals, supCut, mySc: mySc ? fs(mySc) : 0, label: t.length ? Math.min(...t) : 0,
      boardShare: (() => { const b = v.querySelector('svg.board').getBoundingClientRect(); return b.width * b.height / (W * H); })(),
      scrollY: document.scrollingElement.scrollHeight - H, scrollX: document.scrollingElement.scrollWidth - W };
  });
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${sname}-${size.w}x${size.h}.png`) });
  const mn = (a, f) => a.length ? Math.min(...a.map(f)) : 0;
  console.log(`${tag}: hand ${m.hand.length} groups, count px ${mn(m.hand, x => x.px)}, covered ${m.hand.filter(x => x.covered).length}, off ${m.hand.filter(x => !x.on).length} | face w ${mn(m.face, x => x.w).toFixed(0)} h ${mn(m.face, x => x.h).toFixed(0)} | tix ${m.tix.length} name ${mn(m.tix, x => x.name)} pts ${mn(m.tix, x => x.pts)} off ${m.tix.filter(x => !x.on && !x.scroll).length} | rivals shown ${m.rivals.map(r => r.shown + '/' + r.full).join(',')} sc ${mn(m.rivals, x => x.sc)} cnt ${mn(m.rivals, x => x.cnt)} | my sc ${m.mySc} | names ${m.label.toFixed(1)} board ${(m.boardShare * 100).toFixed(0)}%`);
  ok(m.scrollY <= 1 && m.scrollX <= 1, `${tag}: page scrolls (${m.scrollX}, ${m.scrollY})`);
  const groups = Object.values(st.players[0].hand).filter(n => n > 0).length;
  ok(m.hand.length === groups, `${tag}: ${m.hand.length} of ${groups} colours shown in my hand`);
  m.hand.forEach(h => {
    ok(h.px >= 12, `${tag}: hand count for ${h.color} is ${h.px} px (want >= 12)`);
    ok(h.on && !h.covered, `${tag}: hand count for ${h.color} ${h.on ? 'covered by another card' : 'off screen'}`);
  });
  ok(!m.handOut, `${tag}: ${m.handOut} cards of my hand stick out of the screen`);
  // a laptop has the room: every ticket in view, none behind a sideways scroll
  if (!size.phone) ok(m.tix.every(x => x.on && !x.scroll), `${tag}: ${m.tix.filter(x => !x.on || x.scroll).length} tickets only reachable by scrolling`);
  ok(m.face.length === 5 && m.face.every(f => f.on), `${tag}: face-up cards not all on screen`);
  ok(!m.supCut, `${tag}: a deck / face-up card / discard sticks out of the screen`);
  // a phone on its side keeps 25 px: its side column is as narrow as lets the map fill the height ("the map fills the screen")
  const faceMin = size.phone && size.w > size.h ? 25 : 28;
  ok(mn(m.face, f => f.w) >= faceMin, `${tag}: face-up cards ${mn(m.face, f => f.w).toFixed(0)} px wide (want >= ${faceMin})`);
  m.tix.forEach((x, i) => {
    ok(x.pts >= 12, `${tag}: ticket ${i} points ${x.pts} px (want >= 12)`);
    ok(x.name >= 10, `${tag}: ticket ${i} names ${x.name} px (want >= 10)`);
    ok(x.on || x.scroll, `${tag}: ticket ${i} off screen and not in a scrolling list`);
  });
  m.rivals.forEach((r, i) => {
    ok(r.shown >= Math.min(5, r.full), `${tag}: rival ${i} name cut to ${r.shown} of ${r.full} letters`);
    ok(r.sc >= 12 && r.cnt >= 12, `${tag}: rival ${i} score ${r.sc} px / counts ${r.cnt} px (want >= 12)`);
    ok(r.on, `${tag}: rival ${i} seat off screen`);
    ok(!r.cntCut, `${tag}: rival ${i} counts clipped or outside the chip`);
  });
  ok(m.mySc >= 12, `${tag}: my score ${m.mySc} px (want >= 12)`);
  ok(!errs.length, `${tag}: page errors ${errs.join(' | ')}`);
  await ctx.close();
}
await browser.close();
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
