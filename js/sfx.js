// Sounds and small animations for what actually happens in a game (uses the shared js/fx.js).
// diff(prev, next, me, map) compares two game states and lists the events between them (the same
// for a local game, a computer's move or an online snapshot); fire(events, ctx) plays them, paced
// with the animations. Every sound goes through FX.play (Settings → Sound & effects decides);
// every animation here first checks FX's Animations switch, so "off" means instant.
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const T = isNode ? require('./engine.js') : root.TTR;
  const G = isNode ? require('./graph.js') : root.TTRGraph;
  const FXo = () => root.FX || null;

  const size = q => q.handCount != null ? q.handCount : q.hand ? T.handSize(q.hand) : 0;

  // ---------------------------------------------------------------- what happened between two states
  function diff(prev, next, me, map) {
    const ev = [];
    if (!prev || !next || prev.mapId !== next.mapId || prev.players.length !== next.players.length) return ev;
    if ((next.turnNo || 0) < (prev.turnNo || 0)) return ev; // a different (new) game
    const ix = G.index(map);
    // face-up row: slots that changed. All five at once = three locomotives turned up, the row is replaced.
    const changed = [];
    for (let i = 0; i < 5; i++) if ((prev.faceUp[i] || null) !== (next.faceUp[i] || null)) changed.push(i);
    const flush = changed.length >= 4;
    let faceLeft = flush ? [] : changed.slice();
    next.players.forEach((q, seat) => {
      const p = prev.players[seat];
      // a tunnel attempt turned three cards over
      if (next.pendingTunnel && !prev.pendingTunnel && next.turn === seat) ev.push({ type: 'tunnel', seat, shown: next.pendingTunnel.shown || [] });
      // train cards drawn: the hand grew (face-up slots that changed say which came from the row)
      const d = size(q) - size(p);
      // with both hands known (mine), the colours that grew say what a deck card was
      const grew = [];
      if (q.hand && p.hand && q.handCount == null) for (const c of T.COLORS.concat('loco')) for (let k = (p.hand[c] || 0); k < (q.hand[c] || 0); k++) grew.push(c);
      if (d > 0) for (let k = 0; k < d; k++) {
        if (faceLeft.length) {
          const slot = faceLeft.shift(), c = prev.faceUp[slot], at = grew.indexOf(c);
          if (at >= 0) grew.splice(at, 1);
          ev.push({ type: 'draw', seat, from: slot, color: c });
        } else ev.push({ type: 'draw', seat, from: 'deck', color: grew.shift() || null });
      }
      // destination tickets drawn / kept
      if (q.pending && !p.pending && !q.pending.setup) ev.push({ type: 'tickets', seat, n: q.pending.tickets ? q.pending.tickets.length : q.pending.count });
      if (!q.pending && p.pending) ev.push({ type: 'keep', seat });
      // routes claimed (a tunnel that needed no extra cards also flipped three cards first)
      for (const id of q.routes) if (!p.routes.includes(id)) {
        const r = ix.routeById[id];
        if (r.kind === 'tunnel' && !prev.pendingTunnel) ev.push({ type: 'tunnel', seat, shown: [] });
        ev.push({ type: 'claim', seat, route: id, len: r.len, pts: T.routePoints(map, r.len), before: T.liveRoutePoints(prev, seat), after: T.liveRoutePoints(next, seat) });
      }
      for (const c of q.stationCities || []) if (!(p.stationCities || []).includes(c)) ev.push({ type: 'station', seat, city: c });
    });
    if (flush) ev.push({ type: 'flush' });
    // my tickets that just got finished (only mine: rivals' tickets are secret)
    const mine = next.players[me], was = prev.players[me];
    if (mine && mine.tickets && mine.routes.length !== was.routes.length) {
      const deck = T.deckFor(map, next).tickets;
      mine.tickets.forEach((t, i) => {
        if (t == null || !deck[t]) return;
        if (!T.ticketOutcome(map, mine.routes, deck[t]).ok) return;
        if (was.tickets && was.tickets.includes(t) && T.ticketOutcome(map, was.routes, deck[t]).ok) return;
        const o = deck[t];
        ev.push({ type: 'ticketDone', seat: me, ticket: t, index: i, pts: o.pts != null ? o.pts : Math.max(...o.opts.map(x => x.pts)) });
      });
    }
    if (prev.lastRound == null && next.lastRound != null && next.phase !== 'over') ev.push({ type: 'lastRound', seat: next.lastRound });
    if (next.phase === 'over' && prev.phase !== 'over' && next.result) {
      const row = next.result.rows[me];
      ev.push({ type: 'over', win: next.result.winner === me, winner: next.result.winner, longest: !!(row && row.longestPts > 0) });
    } else if (next.phase === 'main' && next.turn === me && !(prev.phase === 'main' && prev.turn === me)) ev.push({ type: 'yourTurn' });
    return ev;
  }

  // ---------------------------------------------------------------- playing them
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const animOn = () => { const F = FXo(); return !!(F && F.settings.animations && root.document); };
  const speed = () => { const F = FXo(); return F && F.settings.animSpeed === 'fast' ? 0.55 : 1; };
  const play = (name, o) => { const F = FXo(); return F ? F.play(name, o) : false; };
  const F = name => (...a) => { const f = FXo(); return f && animOn() ? f[name](...a) : Promise.resolve(); };
  const fly = F('flyTo'), pop = F('pop'), floatText = F('floatText'), flash = F('flash'), pulse = F('pulse');

  // a short-lived card face at a spot on screen, for flying a card whose slot was just refilled
  function ghostCard(color, from) {
    if (!animOn() || !from || !root.Cards) return null;
    const a = from.getBoundingClientRect(), g = root.document.createElement('div');
    g.className = 'tcard'; g.innerHTML = root.Cards.svg(color);
    g.style.cssText = `position:fixed;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;margin:0;pointer-events:none;z-index:2147483000`;
    root.document.body.appendChild(g);
    return g;
  }
  // train cars of a claimed route drop into place one by one (SVG rects: transform + opacity only)
  function clackCar(rect, i, gap) {
    if (!animOn() || !rect || !rect.animate) return;
    const parts = [rect, rect.shine, rect.cbm].filter(Boolean);
    parts.forEach(el => {
      try {
        el.style.transformBox = 'fill-box'; el.style.transformOrigin = 'center';
        el.animate([{ transform: 'translateY(-7px) scale(1.25)', opacity: 0 }, { transform: 'translateY(1px) scale(1)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }],
          { duration: Math.round(170 * speed()), delay: i * gap, easing: 'ease-out', fill: 'backwards' });
      } catch (e) { /* ignore */ }
    });
  }

  // ctx: { me, isMine(seat), chip(seat), score(seat), deck(), tix(), face(i), hand(color), ticketRow(i),
  //        status(), cars(routeId) → [rect], colors: [player colours] }
  async function fire(events, ctx) {
    ctx = ctx || {};
    const q = (k, ...a) => (ctx[k] ? ctx[k](...a) : null);
    for (const e of events) {
      const mine = e.seat === ctx.me;
      const vol = mine ? 1 : 0.75; // computers and other players: same sounds, a little quieter
      if (e.type === 'draw') {
        play('cardDeal', { vol });
        const src = e.from === 'deck' ? q('deck') : q('face', e.from);
        const to = mine ? q('hand', e.color || null) : q('chip', e.seat);
        if (e.from === 'deck' || !src) fly(src, to, { duration: 380, fade: !mine }).then(() => mine && pop(to));
        else { const g = ghostCard(e.color, src); if (g) fly(g, to, { clone: false, duration: 380, fade: !mine }).then(() => { g.remove(); if (mine) pop(to); }); }
        await wait(140);
      } else if (e.type === 'tunnel') {
        for (let k = 0; k < 3; k++) { play('cardFlip', { vol, pitch: 0.95 + k * 0.05 }); await wait(150); }
      } else if (e.type === 'claim') {
        const cars = q('cars', e.route) || [], gap = Math.round(75 * speed());
        cars.forEach((c, i) => clackCar(c, i, gap));
        for (let k = 0; k < e.len; k++) { play('place', { vol: vol * 0.85, pitch: 0.92 + k * 0.035 }); await wait(gap); }
        if (e.len >= 5) play('train', { vol });
        const chip = q('chip', e.seat), sc = q('score', e.seat);
        floatText(chip, '+' + e.pts, (ctx.colors && ctx.colors[e.seat]) || null);
        if (sc && e.after != null && animOn()) FXo().countUp(sc, e.before, e.after, { duration: 500 });
        pop(chip);
      } else if (e.type === 'tickets') {
        play('cardSlide', { vol });
        if (!mine) fly(q('tix'), q('chip', e.seat), { duration: 380, fade: true });
        await wait(120);
      } else if (e.type === 'keep') {
        play('cardFlip', { vol: vol * 0.8 });
      } else if (e.type === 'station') {
        play('place', { vol, pitch: 0.8 });
        pop(q('chip', e.seat));
      } else if (e.type === 'flush') {
        play('shuffle', { vol: 0.8 });
      } else if (e.type === 'ticketDone') {
        await wait(120);
        play('ding');
        const row = q('ticketRow', e.index);
        floatText(row, '+' + e.pts, 'var(--good)'); pop(row);
      } else if (e.type === 'lastRound') {
        play('alarm');
        flash(q('status'), 'var(--accent-warm)');
      } else if (e.type === 'yourTurn') {
        play('turn');
        const st = q('status'); flash(st, 'var(--accent-warm)'); pulse(st && st.querySelector ? st.querySelector('.dot') : null);
      } else if (e.type === 'over') {
        await gameOver(e, ctx);
      }
    }
  }

  // end of the game: the score table counts up, the longest-route bonus sparkles, then win or lose
  async function gameOver(e, ctx) {
    const Fx = FXo(); if (!Fx) return;
    play('drumroll', { vol: 0.7 });
    await Promise.all([countTotals(ctx.sheet ? ctx.sheet() : null), wait(950)]); // the roll ends with a hit as the totals land
    if (e.longest) {
      const cell = ctx.longestCell ? ctx.longestCell() : null;
      await Fx.celebrate({ kind: 'big', at: cell, colors: ['#f0b354', '#ffffff', (ctx.colors || [])[ctx.me] || '#6ea8fe'] });
    }
    const w = (ctx.colors || [])[e.winner];
    Fx.celebrate({ kind: e.win ? 'win' : 'lose', colors: e.win && w ? [w, '#f0b354', '#f4efe4', w, '#6ee7a8'] : undefined });
  }
  // every number in the score table's Total column counts up from 0
  function countTotals(sheet) {
    const Fx = FXo();
    if (!sheet || !Fx) return Promise.resolve();
    const cells = Array.from(sheet.querySelectorAll('table.scores tr td:last-child b'));
    return Promise.all(cells.map(b => { const v = parseInt(b.textContent, 10); return isFinite(v) ? Fx.countUp(b, 0, v, { duration: 900 }) : null; }));
  }

  const api = { diff, fire, countTotals };
  if (isNode) module.exports = api; else root.TTRSfx = api;
})(typeof window !== 'undefined' ? window : globalThis);
