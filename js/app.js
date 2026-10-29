// Ticket to Ride site: Table (real-table companion), Play (vs computers), Lab (route lab), Settings.
// One saved object in localStorage ('ttr:v1'); every change saves at once.
(function () {
  'use strict';
  const T = window.TTR, G = window.TTRGraph, AI = window.TTRAI, O = window.TTROdds, B = window.Board;
  const FX = window.FX, SFX = window.TTRSfx; // sounds + animations (js/fx.js is the shared library, js/sfx.js maps game events to it)
  const TABLE = window.TABLE, TT = window.TTRTable; // the real-table kit (js/table.js, shared) + this game's board frame and cards
  const VERSION = '1.18';
  const MAP_IDS = ['usa', 'europe', 'nordic', 'india', 'switzerland', 'germany'];
  const MAP_NAMES = { usa: 'USA', europe: 'Europe', nordic: 'Nordic Countries', india: 'India', switzerland: 'Switzerland', germany: 'Germany' };
  // Germany's passenger colours, as on the board
  const PAX_COL = { red: '#e2504c', black: '#2b2f3a', green: '#4fbf6a', yellow: '#f2cf45', blue: '#4f8ff0', white: '#f4f1e8' };
  const paxPip = c => `<span class="pip" style="background:${PAX_COL[c]}" title="${c}"></span>`;
  const LEVELS = ['easy', 'medium', 'hard'];
  const LEVEL_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const PNAME = B.PLAYER_NAME;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = x => Math.round(x * 100) + '%';
  // red -> amber -> green for chances
  const chanceColor = p => p >= 0.75 ? 'var(--good)' : p >= 0.45 ? 'var(--accent-warm)' : 'var(--bad)';

  // ---------------------------------------------------------------- saved data
  const KEY = 'ttr:v1';
  let S = load();
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { d = null; }
    d = d && typeof d === 'object' ? d : {};
    d.tab = d.tab || 'play'; // a first visit opens on Play (2026-10-27: it used to open on the Table companion)
    d.settings = Object.assign({ speed: 'normal', study: false, longest: true, privacy: 'mine', labMap: 'usa', labDeck: null, cb: false }, d.settings || {});
    d.table = d.table || null;
    d.play = d.play || null;
    d.mapWins = d.mapWins && typeof d.mapWins === 'object' ? d.mapWins : {}; // wins per map against the computers (for My stats)
    d.lab = Object.assign({ mode: 'path', a: null, b: null, blocked: [], sort: 'ppt' }, d.lab || {});
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S.play && S.play.online ? Object.assign({}, S, { play: null }) : S)); } catch (e) { /* storage full or blocked: keep going */ } }

  // ---------------------------------------------------------------- maps
  const mapCache = {};
  function getMap(id) {
    if (mapCache[id]) return Promise.resolve(mapCache[id]);
    // the board art (real coastlines, lakes, borders) is a separate file; without it the board draws the plain land
    const art = fetch('maps/' + id + '.art.json?v=' + VERSION).then(r => r.ok ? r.json() : null).catch(() => null);
    return Promise.all([fetch('maps/' + id + '.json?v=' + VERSION).then(r => { if (!r.ok) throw new Error('map ' + id); return r.json(); }), art])
      .then(([m, a]) => { if (a) Object.defineProperty(m, 'art', { value: a }); mapCache[id] = T.register(m); return m; });
  }
  const cityName = (map, id) => G.index(map).cityById[id].name;
  // place = a city, or a country (Switzerland's border tickets)
  const placeName = (map, id) => map.countries && map.countries[id] ? map.countries[id].name : cityName(map, id);
  const ticketName = (map, t) => {
    t = t.orig || t;
    if (t.opts) return placeName(map, t.a) + ' → ' + (t.opts.length > 3 ? 'a country' : t.opts.map(o => placeName(map, o.to)).join(' / '));
    return placeName(map, t.a) + ' – ' + placeName(map, t.b);
  };
  const ticketPts = t => { t = t.orig || t; if (!t.opts) return String(t.pts); const v = t.opts.map(o => o.pts); return Math.min(...v) + '–' + Math.max(...v); };
  // tickets as plain city pairs for the numbers (country tickets become their best pair); .orig keeps the card for display
  function plainDeck(map, deckId) {
    const d = (map.ticketDecks.find(x => x.id === deckId) || map.ticketDecks[0]).tickets, P = T.plainTickets(map, deckId || map.ticketDecks[0].id);
    P.forEach((t, i) => { if (t !== d[i]) t.orig = d[i]; });
    return P;
  }
  // the cards a payment uses, drawn as small cards (a little pile when there are two or more)
  const payLabel = o => Object.entries(T.cardsOf(o)).map(([c, k]) => `<span class="mini${k > 1 ? ' pile' : ''}">${window.Cards.svg(c)}</span>${k} ${c === 'loco' ? 'locomotive' + (k > 1 ? 's' : '') : c}`).join(' + ') + '<span class="go" aria-hidden="true">›</span>';

  // ---------------------------------------------------------------- shell: tabs, sheets, toasts
  const TABS = [['table', 'Table', 'i-table'], ['play', 'Play', 'i-play'], ['lab', 'Lab', 'i-lab'], ['settings', 'Settings', 'i-gear']];
  function buildTabs() {
    const html = TABS.map(([id, label, icon]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="false"><svg aria-hidden="true"><use href="#${icon}"/></svg><span>${label}</span></button>`).join('');
    $('#tabbar').innerHTML = html; $('#toptabs').innerHTML = html;
    document.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab, true); });
    window.addEventListener('popstate', e => {
      // Back with the rules open only closes the rules
      if (window.COACH && COACH.rulesOpen()) { COACH.closeRules(); history.pushState({ tab: S.tab }, '', '#' + S.tab); return; }
      const t = (e.state && e.state.tab) || 'play'; showTab(t, false);
    });
  }
  // the rules sheet (shared js/coach.js; the text is in js/tutorial.js)
  // the rule switches in Settings → Rules, as engine game options (house rules are off unless switched on)
  function houseRules() {
    const st = S.settings, o = {};
    if (st.longest === false) o.noLongest = true;
    if (st.globe) o.globe = true;
    if (st.freeLocos) o.freeLocos = true;
    if (st.doubles) o.doubles = true;
    return o;
  }
  function openRules(open) { if (window.COACH && window.TTRTutorial) { closeSheet(true); COACH.rules(Object.assign(window.TTRTutorial.rules(), { open })); } }
  function showTab(id, push) {
    if (!TABS.some(t => t[0] === id)) id = 'play';
    S.tab = id; save();
    document.body.dataset.view = id; // not data-tab: that marks the tab buttons
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + id));
    if (push) history.pushState({ tab: id }, '', '#' + id); // Back returns to the previous tab
    closeSheet(true);
    if (window.COACH && id !== 'play') COACH.closeOffer();
    VIEWS[id].show();
    sizeBoards();
  }

  let sheetEl = null, scrimEl = null, sheetOnClose = null;
  function openSheet(html, onClose) {
    closeSheet(true);
    scrimEl = document.createElement('div'); scrimEl.className = 'scrim';
    sheetEl = document.createElement('div'); sheetEl.className = 'sheet'; sheetEl.setAttribute('role', 'dialog');
    sheetEl.innerHTML = html;
    document.body.append(scrimEl, sheetEl);
    sheetOnClose = onClose || null;
    scrimEl.addEventListener('click', () => { if (!sheetEl.dataset.modal) closeSheet(); });
    // force a layout so the slide-in transition runs, without waiting on an animation frame
    void sheetEl.offsetHeight;
    scrimEl.classList.add('show'); sheetEl.classList.add('show');
    if (window.COACH) setTimeout(() => COACH.update(), 0); // the guided game steps aside under a sheet at once
    return sheetEl;
  }
  function closeSheet(instant) {
    if (!sheetEl) return;
    const s = sheetEl, c = scrimEl, cb = sheetOnClose;
    sheetEl = scrimEl = sheetOnClose = null;
    if (instant) { s.remove(); c.remove(); }
    else { s.classList.remove('show'); c.classList.remove('show'); setTimeout(() => { s.remove(); c.remove(); }, 260); }
    if (cb) cb();
  }
  let toastTimer = null;
  function toast(text, undo) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.innerHTML = `<span>${esc(text)}</span>` + (undo ? '<button type="button">Undo</button>' : '');
    if (undo) t.querySelector('button').onclick = () => { undo(); t.classList.remove('show'); };
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 4500 : 2600);
  }
  // a move the rules refuse: the message plus a soft error sound
  function refuse(text) { toast(text); FX.play('error'); }
  // sounds and animations for one board: where the chips, cards and route cars are on screen
  const fxColors = B.PLAYER.map(c => c === '#2b2f3a' ? '#e8eaf0' : c); // the black player's colour can't be read on the dark page
  function fxCtx(view, me) {
    const v = $('#v-' + view), panel = v.querySelector('.panel'), wrap = v.querySelector('.board-wrap');
    const stack = sel => { const e = v.querySelector(sel); return e && (e.querySelector('.tbl-back') || e); };
    return {
      me, colors: fxColors,
      chip: i => v.querySelector(`[data-seat="${i}"]`),
      score: i => v.querySelector(`[data-seat="${i}"] .sc`),
      deck: () => stack('#p-deck'), tix: () => stack('#p-tix'),
      face: i => v.querySelector(`[data-face="${i}"] .ttr-card`) || v.querySelector(`[data-face="${i}"]`),
      hand: c => (c && v.querySelector(`.hand [data-color="${c}"]`)) || v.querySelector('.hand'),
      ticketRow: i => v.querySelector(`[data-tix="${i}"]`),
      discard: () => v.querySelector('.disc'),
      cardFace: c => TT.trainCard(c),
      status: () => panel.querySelector('.status'),
      cars: id => Array.from(wrap.querySelectorAll(`[data-route="${id}"] rect.car`)),
      sheet: () => document.querySelector('.sheet'),
      longestCell: () => document.querySelector(`.sheet tr[data-seat="${me}"] td[data-k="longestPts"]`),
    };
  }
  // "?" explanations say WHY
  function help(title, body) {
    openSheet(`<h2>${esc(title)}</h2><div class="note" style="font-size:14px;color:var(--text)">${body}</div><div class="acts"><button class="btn" data-close>Close</button></div>`);
    sheetEl.querySelector('[data-close]').onclick = () => closeSheet();
  }
  document.addEventListener('click', e => {
    const q = e.target.closest('[data-help]');
    if (q) { e.stopPropagation(); const h = HELP[q.dataset.help]; if (h) help(h[0], h[1]); }
  });
  const HELP = {
    unseen: ['Unseen cards', 'Every train card not in your hand, the face-up row or the discard pile. They are in the deck or in rivals\' hands. When a colour runs low, routes of that colour get harder for everyone.'],
    longest: ['Longest route', 'The longest unbroken line of each player\'s trains (cities may repeat, routes may not). The longest gets the bonus at the end; ties all get it.'],
    guess: ['Likely tickets', 'For every ticket you don\'t hold, how much of its cheapest path this player\'s track already covers. Players build toward their tickets, so a high share is a strong clue.'],
    table: ['Real-table game', 'For playing the board game at a real table. The first player is you. Tap each route on the map as a player claims it: scores, trains left and your ticket chances update live. Add your tickets with "+ Ticket" so the app can track them.'],
    chance: ['Chance', 'How often you would still finish this ticket in 200 simulated futures. Rivals keep claiming routes (busy routes more often), and the game ends a few turns after someone runs low on trains. It uses the cheapest open path, so a blocked route lowers it at once.'],
    keep: ['Keep or toss', 'Value = points × (2 × chance − 1): a finished ticket adds its points, an unfinished one takes them away. The best set also checks that all your tickets together fit in your trains and the turns likely left.'],
    heat: ['Busy routes', 'For every ticket in the deck we find its cheapest path. A route\'s heat is how many of those paths use it. Hot routes are the ones rivals are most likely to need, so they go early and blocking them hurts most.'],
    ppt: ['Points per train', '(Ticket points + the points of the routes on its cheapest path) ÷ trains on that path. High numbers are efficient uses of your 45 trains.'],
    detour: ['If it\'s taken', 'How many more trains the cheapest way between the two cities costs if this route (and its twin) is gone.'],
    strength: ['How strong?', 'Each level played thousands of games against the others with seats rotated. The numbers show how often the stronger side won.'],
    privacy: ['Ticket privacy', '"Just mine" shows only your tickets. "Pass the phone" lets every player keep tickets in the app behind a cover screen, so final scores count everyone.'],
    online: ['Online', 'One phone creates the room and gets a 5-letter code. Friends open this page, tap Join and type the code. Seats left empty play as computers, run on the host\'s phone. Your cards and tickets are sent only to you. If you reload, the game picks up where it was.'],
    stations: ['Stations', 'Europe only. Each player has 3. A station lets you use one rival route into that city for your tickets. Each unused station is worth 4 points at the end.'],
  };

  // ---------------------------------------------------------------- board sizing (phone: board on top, panel below)
  const boards = {};
  function sizeBoards() {
    const wide = window.innerWidth >= 900;
    for (const id of ['table', 'play', 'lab']) {
      const v = $('#v-' + id), wrap = v.querySelector('.board-wrap'), b = boards[id];
      if (!b) continue;
      if (!v.classList.contains('active')) continue;
      // laptop, or a phone on its side during a game: the board takes its grid cell
      const game = v.classList.contains('game');
      const F0 = parseFloat(getComputedStyle(wrap).getPropertyValue('--frame')) || 0;
      if (id === 'play' && !(game && !wide && window.innerWidth > window.innerHeight)) { v.style.gridTemplateColumns = ''; const sup = v.querySelector('.supply'); if (sup) sup.style.removeProperty('--card-w'); }
      if (wide || window.innerWidth > window.innerHeight) {
        // laptop or phone on its side: the board is the real board's shape (the drawn map's own width : height), as big
        // as its space allows, centred; it is never stretched to the space's shape (2026-10-21)
        const wm = getComputedStyle(wrap), mx = parseFloat(wm.marginLeft) + parseFloat(wm.marginRight), my = parseFloat(wm.marginTop) + parseFloat(wm.marginBottom);
        let aw, ah;
        if (game) {
          // a grid cell: let the board fill it to read its size
          wrap.style.width = wrap.style.height = ''; wrap.style.justifySelf = wrap.style.alignSelf = 'stretch';
          aw = wrap.offsetWidth; ah = wrap.offsetHeight;
          // phone on its side (Play): the side column gives the board the width its shape needs to fill the height,
          // so no empty wood strip is left above and below it (column kept 250–340 px)
          if (!wide && id === 'play') {
            v.style.gridTemplateColumns = ''; const sup0 = v.querySelector('.supply'); if (sup0) sup0.style.removeProperty('--card-w');
            aw = wrap.offsetWidth; ah = wrap.offsetHeight;
            const col0 = parseFloat(getComputedStyle(v).gridTemplateColumns.split(' ').pop()) || 300;
            const ideal = (ah - 2 * F0) * b.ratio(aw - 2 * F0) + 2 * F0;
            const col = Math.round(Math.max(250, Math.min(340, col0 + aw - ideal)));
            if (Math.abs(col - col0) > 2) {
              v.style.gridTemplateColumns = `minmax(0, 1fr) ${col}px`;
              // the supply row (ticket deck, 5 face-up cards, deck, discard) shrinks with the column
              const sup = v.querySelector('.supply'); if (sup) sup.style.setProperty('--card-w', Math.min(30, Math.floor((col - 26) / 8.7)) + 'px');
              aw = wrap.offsetWidth; ah = wrap.offsetHeight;
            }
          }
        } else {
          // board beside the panel: the panel keeps at least its basis, the board takes the rest
          const panel = v.querySelector('.panel'), pb = parseFloat(getComputedStyle(panel).flexBasis) || panel.offsetWidth;
          aw = v.clientWidth - pb - mx; ah = v.clientHeight - my;
        }
        if (!aw || !ah) { b.ready(); continue; }
        const r = b.ratio(aw - 2 * F0), iw = aw - 2 * F0, ih = ah - 2 * F0;
        let w = aw, h = ah;
        if (iw / ih > r) w = Math.round(ih * r + 2 * F0); else h = Math.round(iw / r + 2 * F0);
        wrap.style.width = w + 'px'; wrap.style.height = h + 'px'; wrap.style.justifySelf = wrap.style.alignSelf = 'center';
        b.ready(); continue;
      }
      wrap.style.width = ''; wrap.style.justifySelf = wrap.style.alignSelf = '';
      if (!wrap.style.height) wrap.style.height = '200px'; // on screen so it can be measured
      const box = b.ready();
      // the map sits inside the board's printed frame (the score track)
      const F = parseFloat(getComputedStyle(wrap).getPropertyValue('--frame')) || 0;
      const W = wrap.clientWidth || v.clientWidth || window.innerWidth;
      let maxH = Math.round((v.clientHeight || window.innerHeight) * (id === 'lab' ? 0.56 : 0.52));
      if (game) {
        // the rest of the table (rivals, supply, my seat, status) keeps its size; the board gets what is left
        const cs = getComputedStyle(v), gap = parseFloat(cs.rowGap) || 0;
        let rest = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), n = 0;
        // (a wrapper shown as display: contents, like Play's .deal on a phone, counts by its children)
        const kids = [...v.children].flatMap(e => getComputedStyle(e).display === 'contents' ? [...e.children] : [e]);
        for (const e of kids) if (e !== wrap && e.offsetParent) { const m = getComputedStyle(e); rest += e.offsetHeight + parseFloat(m.marginTop) + parseFloat(m.marginBottom); n++; }
        const wm = getComputedStyle(wrap);
        maxH = Math.floor(v.clientHeight - rest - gap * n - parseFloat(wm.marginTop) - parseFloat(wm.marginBottom));
      }
      // a board whose default view is zoomed in (Play on a phone: names at least 9 px) takes all the height left, up to
      // the map's height at that zoom; others stop at the whole map's height at the full width
      const tall = b.homeBox && b.homeBox(W - 2 * F);
      const want = tall ? tall.h + 2 * F : (W - 2 * F) * box.h / box.w + 2 * F;
      wrap.style.height = Math.max(120, Math.min(Math.round(want), maxH)) + 'px';
    }
  }
  window.addEventListener('resize', sizeBoards);
  window.addEventListener('resize', () => { const m = $('#v-play .mine'); if (m) fitTickets(m); });
  function makeBoard(id, map, handlers) {
    // tab shown, map changed or game started: the board goes back to auto (the whole board in view)
    if (boards[id]) { boards[id].setMap(map); boards[id].toAuto(); Object.assign(boards[id].handlers, handlers); return boards[id]; }
    const wrap = $('#v-' + id + ' .board-wrap');
    const h = Object.assign({}, handlers);
    const b = B.create(wrap, map, { onRoute: r => h.onRoute && h.onRoute(r), onCity: c => h.onCity && h.onCity(c), onEmpty: () => h.onEmpty && h.onEmpty(), cityActive: () => !h.cityActive || h.cityActive(),
      homeLabelPx: () => h.homeLabelPx ? h.homeLabelPx() : 0, focus: () => h.focus ? h.focus() : null });
    b.handlers = h;
    b.frame = TT.frame(wrap); // the board's printed edge with the score track and the players' markers
    boards[id] = b;
    return b;
  }

  // ---------------------------------------------------------------- shared bits
  function mapSelect(name, value) {
    return `<select name="${name}">${MAP_IDS.map(id => `<option value="${id}"${id === value ? ' selected' : ''}>${MAP_NAMES[id]}</option>`).join('')}</select>`;
  }
  function deckSelect(map, name, value) {
    if (map.ticketDecks.length < 2) return '';
    return `<select name="${name}">${map.ticketDecks.map(d => `<option value="${d.id}"${d.id === value ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select>`;
  }
  function cardHTML(color, n, cls) {
    return `<div class="tcard ${cls || ''}${n === 0 ? ' zero' : ''}${n > 1 ? ' pile' : ''}" data-color="${color}" title="${color === 'loco' ? 'Locomotive' : color}">${window.Cards.svg(color)}${n != null ? `<span class="n">${n}</span>` : ''}</div>`;
  }
  // ---- real-table pieces (js/table.js is the shared kit, js/tabletop.js the board frame + cards)
  // a rival's seat: one chip with the name, the score and the counts folded in (cards held, tickets, trains left), so the
  // map gets the height a second strip of card fans and train heaps took (2026-10-20, visibility round 2)
  function seatHTML(q, i, score, turn) {
    const n = q.handCount != null ? q.handCount : T.handSize(q.hand);
    const nt = typeof q.tickets === 'number' ? q.tickets : (q.tickets || []).length;
    return `<div class="seat chip${turn ? ' turn' : ''}" data-seat="${i}" role="button" tabindex="0" aria-label="${esc(q.name)}: ${score} points, ${q.trains} trains, ${n} cards, ${nt} tickets">
      <div class="tbl-plate"><i style="background:${B.PLAYER[i]}"></i><span class="nm">${esc(q.name)}</span><b class="sc">${score}</b><span class="cnt"><span class="ic ic-c" title="cards"></span>${n}<span class="ic ic-t" title="tickets"></span>${nt}<span class="ic ic-r" style="background:${B.PLAYER[i]}" title="trains"></span>${q.trains}</span></div></div>`;
  }
  // a destination ticket lying in front of me: the two places, the points, a little map with the line, and the chance
  function landDefs(map) {
    if (!map.art || !map.art.land || document.getElementById('tkland-' + map.id)) return;
    const d = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    d.setAttribute('width', '0'); d.setAttribute('height', '0'); d.style.position = 'absolute'; d.setAttribute('aria-hidden', 'true');
    d.innerHTML = `<defs><path id="tkland-${map.id}" d="${map.art.land}"/></defs>`;
    document.body.appendChild(d);
  }
  function ticketCard(map, t, c, i, sel) {
    c = c || {};
    landDefs(map);
    const ix = G.index(map).cityById, ends = [t.a, t.b].map(id => ix[id]).filter(Boolean), [w, h] = map.size;
    let cls = 'tkt', st = '';
    if (c.done) { st = '<span class="tk-ch ok">✓</span>'; cls += ' done'; }
    else if (c.need === Infinity || c.chance === 0) { st = '<span class="tk-ch bad">✗</span>'; cls += ' dead'; }
    else if (c.need != null) st = `<span class="tk-ch" style="color:${c.chance >= 0.75 ? '#1d7a45' : c.chance >= 0.45 ? '#a2660c' : '#b3261e'}">${pct(c.chance)}</span>`;
    const nm = ticketName(map, t).split(/ [–→] /);
    const r = Math.max(w, h) * 0.03;
    return `<button type="button" class="${cls}${sel ? ' sel' : ''}${(t.orig || t).long ? ' long' : ''}" data-tix="${i}" aria-label="${esc(ticketName(map, t))}, ${ticketPts(t)} points">
      <svg class="tk-map" viewBox="0 0 ${w} ${h}" aria-hidden="true"><use href="#tkland-${map.id}"/>${ends.length === 2 ? `<line x1="${ends[0].x}" y1="${ends[0].y}" x2="${ends[1].x}" y2="${ends[1].y}" stroke-width="${(r * 0.8).toFixed(1)}"/>` : ''}${ends.map(e => `<circle cx="${e.x}" cy="${e.y}" r="${r.toFixed(1)}"/>`).join('')}</svg>
      <span class="tk-c">${nm.map(x => '<span>' + esc(x) + '</span>').join('')}</span><span class="tk-p">${ticketPts(t)}</span>${st}</button>`;
  }
  // ticket cards show both place names whole: the type shrinks (down to 7.5 px) until the names fit the card
  function fitTickets(root) {
    root.querySelectorAll('.tkt .tk-c').forEach(e => {
      e.style.fontSize = '';
      let px = parseFloat(getComputedStyle(e).fontSize);
      const over = () => e.scrollWidth > e.clientWidth + 0.5 || e.scrollHeight > e.clientHeight + 0.5;
      while (over() && px > 7.5) { px -= 0.5; e.style.fontSize = px + 'px'; }
    });
  }
  function chip(seat, name, score, meta, on, turn) {
    return `<button type="button" class="pchip${on ? ' on' : ''}${turn ? ' turn' : ''}" data-seat="${seat}"><span class="nm"><i style="background:${B.PLAYER[seat]}"></i>${esc(name)}</span><span class="sc">${score}</span><span class="mt">${meta}</span></button>`;
  }
  function ticketRow(map, t, info, extra) {
    const c = info || {};
    let status = '', bar = '', cls = 'ticket';
    if (c.done) { status = '<span style="color:var(--good)">Done</span>'; cls += ' done'; }
    else if (c.need === Infinity || c.need === undefined && c.chance === 0) { status = '<span style="color:var(--bad)">Blocked</span>'; cls += ' dead'; }
    else if (c.need != null) {
      status = `<span>${c.need} train${c.need === 1 ? '' : 's'} to go</span><span class="chance" style="color:${chanceColor(c.chance)}">${pct(c.chance)}</span>`;
      bar = `<span class="bar"><i style="width:${Math.round(c.chance * 100)}%;background:${chanceColor(c.chance)}"></i></span>`;
      if (c.chance === 0) cls += ' dead';
    }
    if (t.long) cls += ' long';
    return `<button type="button" class="${cls}" ${extra || ''}><span class="cities">${esc(ticketName(map, t))}</span><span class="pts">${ticketPts(t)}</span><span class="info">${status}</span>${bar}</button>`;
  }
  function delay() { return { slow: 1100, normal: 650, fast: 250 }[S.settings.speed] || 650; }

  // ======================================================================= TABLE (companion)
  const Table = {
    map: null, board: null, sel: null,
    async show() {
      const tb = S.table;
      const mapId = tb ? tb.mapId : (Table.setupMap || 'usa');
      const map = await getMap(mapId);
      Table.map = map;
      Table.board = makeBoard('table', map, { onRoute: Table.onRoute, onCity: Table.onCity, cityActive: () => !!(S.table && S.table.mode === 'station'), onEmpty: () => { Table.sel = null; Table.render(); } });
      $('#sub').textContent = map.name;
      Table.render();
      sizeBoards();
    },
    render() {
      const tb = S.table, map = Table.map, panel = $('#v-table .panel');
      if (!tb || tb.mapId !== map.id) return Table.renderSetup(panel);
      const deck = T.deckFor(map, { deckId: tb.deckId }).tickets;
      const n = tb.players.length;
      const bothDoubles = n >= map.bothDoublesFrom;
      // live numbers
      const trainsLeft = tb.players.map((_, s) => map.trains - Object.entries(tb.claims).filter(([, o]) => o === s).reduce((a, [id]) => a + G.index(map).routeById[id].len, 0));
      const routePts = tb.players.map((_, s) => Object.entries(tb.claims).filter(([, o]) => o === s).reduce((a, [id]) => a + T.routePoints(map, G.index(map).routeById[id].len), 0));
      const stationsLeft = tb.players.map((_, s) => map.stations - Object.values(tb.stations || {}).filter(o => o === s).length);
      const viewer = Table.viewer != null ? Table.viewer : tb.me;
      const P = plainDeck(map, tb.deckId);
      const myTickets = (tb.tickets[viewer] || []).map(i => P[i]);
      const pos = {
        owner: tb.claims, me: viewer, bothDoubles, myTrains: trainsLeft[viewer],
        rivalTrains: trainsLeft.filter((_, s) => s !== viewer), tickets: myTickets, deckTickets: P,
        stationCities: Object.entries(tb.stations || {}).filter(([, o]) => o === viewer).map(([c]) => c),
      };
      const odds = myTickets.length ? O.ticketChances(map, pos) : { tickets: [] };
      Table.lastOdds = odds;
      const longest = tb.players.map((_, s) => G.longestTrail(map, Object.keys(tb.claims).filter(id => tb.claims[id] === s)).len);
      const chips = tb.players.map((p, s) => chip(s, p.name, routePts[s], `${trainsLeft[s]} trains · long ${longest[s]}${map.stations ? ' · ' + stationsLeft[s] + ' st' : ''}`, s === tb.active, false)).join('');
      const last = tb.history[tb.history.length - 1];
      const station = tb.mode === 'station';
      const showTickets = S.settings.privacy === 'mine' || Table.viewer != null;
      panel.innerHTML = `
        <div class="players" id="t-players">${chips}</div>
        <div class="status" style="margin-top:8px"><span class="dot" style="background:${B.PLAYER[tb.active]}"></span>
          <span class="grow">${station ? 'Tap a city for ' : 'Tap a route for '}${esc(tb.players[tb.active].name)}</span>
          ${map.stations ? `<span class="seg" role="group"><button type="button" data-mode="claim" aria-pressed="${!station}">Routes</button><button type="button" data-mode="station" aria-pressed="${station}">Stations</button></span><button class="q" data-help="stations" aria-label="About stations">?</button>` : ''}
          <button class="btn small" id="t-undo" ${last ? '' : 'disabled'}>Undo</button>
        </div>
        <div class="sec">${showTickets ? (S.settings.privacy === 'mine' ? 'My tickets' : esc(tb.players[viewer].name) + '\'s tickets') : 'Tickets'} <button class="q" data-help="chance" aria-label="About chance">?</button></div>
        ${showTickets ? `<div class="tlist">${myTickets.length ? odds.tickets.map((x, i) => ticketRow(map, x.t, x, `data-tix="${i}"`)).join('') : '<div class="empty">No tickets yet.</div>'}</div>
        <div class="row wrap" style="margin-top:8px">
          <button class="btn small" id="t-add">+ Ticket</button>
          <button class="btn small warm" id="t-drew">Drew tickets</button>
          ${S.settings.privacy === 'pass' ? '<button class="btn small" id="t-hide">Hide</button>' : ''}
        </div>` : `<div class="row wrap">${tb.players.map((p, s) => `<button class="btn small" data-show="${s}">${esc(p.name)} · ${(tb.tickets[s] || []).length}</button>`).join('')}</div><p class="note">Each player taps their name to see their own tickets.</p>`}
        <div class="sec">Game</div>
        <div class="row wrap"><button class="btn small primary" id="t-final">Final score</button><button class="btn small" id="t-new">New game</button></div>`;
      // board
      const tix = Table.sel != null && odds.tickets[Table.sel];
      Table.board.render({
        owner: tb.claims, stations: tb.stations,
        path: new Set(tix ? tix.path : []), endCities: tix ? [tix.t.a, tix.t.b] : [],
      });
      if (Table.board.frame) Table.board.frame.scores(routePts, B.PLAYER); // markers on the board's score track
      // events
      panel.querySelectorAll('[data-seat]').forEach(b => b.onclick = () => { tb.active = +b.dataset.seat; save(); Table.render(); });
      panel.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { tb.mode = b.dataset.mode; save(); Table.render(); });
      panel.querySelectorAll('[data-tix]').forEach(b => b.onclick = () => { Table.sel = Table.sel === +b.dataset.tix ? null : +b.dataset.tix; Table.render(); });
      panel.querySelectorAll('[data-show]').forEach(b => b.onclick = () => Table.cover(+b.dataset.show));
      const on = (id, f) => { const e = panel.querySelector(id); if (e) e.onclick = f; };
      on('#t-undo', Table.undo);
      on('#t-add', () => Table.pickTickets(viewer, false));
      on('#t-drew', () => Table.pickTickets(viewer, true));
      on('#t-hide', () => { Table.viewer = null; Table.sel = null; Table.render(); });
      on('#t-final', Table.final);
      on('#t-new', () => { S.table = null; save(); Table.render(); });
    },
    renderSetup(panel) {
      const map = Table.map;
      const n = Table.setupN || 2;
      const names = Table.setupNames || [];
      const k0 = Math.min(Math.max(n, map.players[0]), map.players[1]);
      panel.innerHTML = `
        <div class="sec">Real-table game <button class="q" data-help="table" aria-label="About the table">?</button></div>
        <div class="row">${mapSelect('map', map.id).replace('<select', '<select class="grow"')}${deckSelect(map, 'deck', Table.setupDeck).replace('<select', '<select class="grow"')}</div>
        <div class="row" style="margin-top:8px"><span class="muted small grow">Players</span><span class="seg" role="group">${Array.from({ length: map.players[1] - map.players[0] + 1 }, (_, i) => map.players[0] + i).map(k => `<button type="button" data-n="${k}" aria-pressed="${k === k0}">${k}</button>`).join('')}</span></div>
        <div class="names" style="margin-top:8px">${Array.from({ length: k0 }, (_, s) => `<div class="row"><i style="background:${B.PLAYER[s]}"></i><input type="text" data-name="${s}" value="${esc(names[s] || (s === 0 ? 'Me' : PNAME[s]))}" maxlength="14" class="grow" aria-label="Player ${s + 1} name"></div>`).join('')}</div>
        <div class="row" style="margin-top:10px"><button class="btn primary grow" id="t-start">Start</button></div>`;
      Table.board.render({});
      if (Table.board.frame) Table.board.frame.scores([]);
      panel.querySelector('[name=map]').onchange = async e => { panel.querySelectorAll('button').forEach(b => { b.disabled = true; }); Table.setupMap = e.target.value; Table.setupDeck = null; await Table.show(); };
      const dk = panel.querySelector('[name=deck]'); if (dk) dk.onchange = e => { Table.setupDeck = e.target.value; };
      panel.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { Table.saveNames(panel); Table.setupN = +b.dataset.n; Table.renderSetup(panel); });
      panel.querySelector('#t-start').onclick = () => {
        Table.saveNames(panel);
        const k = Math.min(Math.max(Table.setupN || 2, map.players[0]), map.players[1]);
        S.table = {
          mapId: map.id, deckId: Table.setupDeck || map.ticketDecks[0].id,
          players: Array.from({ length: k }, (_, s) => ({ name: (Table.setupNames[s] || '').trim() || PNAME[s] })),
          me: 0, active: 0, claims: {}, stations: {}, tickets: {}, history: [], mode: 'claim',
        };
        save(); Table.board.toAuto(); Table.render(); FX.play('shuffle');
      };
    },
    saveNames(panel) { Table.setupNames = Table.setupNames || []; panel.querySelectorAll('[data-name]').forEach(i => { Table.setupNames[+i.dataset.name] = i.value; }); },
    onRoute(id) {
      const tb = S.table, map = Table.map;
      if (!tb || tb.mapId !== map.id || tb.mode === 'station') return;
      const r = G.index(map).routeById[id], seat = tb.active;
      if (tb.claims[id] != null) {
        const who = tb.claims[id];
        delete tb.claims[id];
        tb.history.push({ type: 'unclaim', id, seat: who });
        save(); Table.render(); FX.play('slide');
        toast('Removed ' + cityName(map, r.a) + '–' + cityName(map, r.b), Table.undo);
        return;
      }
      const why = T.routeOpen({ owner: tb.claims, players: tb.players, mapId: map.id, deckId: tb.deckId, options: houseRules() }, r, seat);
      if (why === 'own twin') return refuse(tb.players[seat].name + ' already has the other track');
      if (why === 'double closed') return refuse('With ' + tb.players.length + ' players only one of the two tracks is used');
      const trains = map.trains - Object.entries(tb.claims).filter(([, o]) => o === seat).reduce((a, [rid]) => a + G.index(map).routeById[rid].len, 0);
      if (trains < r.len) return refuse(tb.players[seat].name + ' has only ' + trains + ' trains');
      const ptsBefore = Object.entries(tb.claims).filter(([, o]) => o === seat).reduce((a, [rid]) => a + T.routePoints(map, G.index(map).routeById[rid].len), 0);
      tb.claims[id] = seat;
      tb.history.push({ type: 'claim', id, seat });
      save(); Table.render();
      const pts = T.routePoints(map, r.len);
      SFX.fire([{ type: 'claim', seat, route: id, len: r.len, pts, before: ptsBefore, after: ptsBefore + pts }], fxCtx('table', tb.me));
      toast(tb.players[seat].name + ' +' + T.routePoints(map, r.len) + ' · ' + cityName(map, r.a) + '–' + cityName(map, r.b), Table.undo);
    },
    onCity(id) {
      const tb = S.table, map = Table.map;
      if (!tb || tb.mapId !== map.id || tb.mode !== 'station') return;
      tb.stations = tb.stations || {};
      if (tb.stations[id] != null) { tb.history.push({ type: 'unstation', id, seat: tb.stations[id] }); delete tb.stations[id]; save(); Table.render(); FX.play('slide'); return; }
      const used = Object.values(tb.stations).filter(o => o === tb.active).length;
      if (used >= map.stations) return refuse('No stations left');
      tb.stations[id] = tb.active;
      tb.history.push({ type: 'station', id, seat: tb.active });
      save(); Table.render();
      SFX.fire([{ type: 'station', seat: tb.active, city: id }], fxCtx('table', tb.me));
      toast('Station in ' + cityName(map, id), Table.undo);
    },
    undo() {
      const tb = S.table; if (!tb) return;
      const h = tb.history.pop(); if (!h) return;
      if (h.type === 'claim') delete tb.claims[h.id];
      if (h.type === 'unclaim') tb.claims[h.id] = h.seat;
      if (h.type === 'station') delete tb.stations[h.id];
      if (h.type === 'unstation') tb.stations[h.id] = h.seat;
      if (h.type === 'tickets') tb.tickets[h.seat] = tb.tickets[h.seat].filter(t => !h.ids.includes(t));
      save(); Table.render(); FX.play('slide');
    },
    cover(seat) {
      const tb = S.table;
      const c = document.createElement('div'); c.className = 'cover';
      c.innerHTML = `<h2>Pass the phone to ${esc(tb.players[seat].name)}</h2><p class="muted">Only they should look.</p><button class="btn primary">Show my tickets</button><button class="btn ghost">Cancel</button>`;
      document.body.appendChild(c);
      c.querySelector('.primary').onclick = () => { Table.viewer = seat; Table.sel = null; c.remove(); Table.render(); };
      c.querySelector('.ghost').onclick = () => c.remove();
    },
    // pick tickets you hold (add) or the ones you just drew (advisor)
    pickTickets(seat, advise) {
      const tb = S.table, map = Table.map, deck = T.deckFor(map, { deckId: tb.deckId }).tickets;
      const held = new Set(Object.values(tb.tickets).flat());
      // first draw = the starting tickets (Nordic and Switzerland deal 5, Europe 3 + 1 long); later draws use the draw rule
      const D = T.deckFor(map, { deckId: tb.deckId }), first = !(tb.tickets[seat] || []).length;
      const R = first ? (D.setup || map.setup) : (D.draw || map.draw);
      const max = advise ? R.deal + (first ? R.long || 0 : 0) : 99;
      let chosen = [];
      const sh = openSheet(`<h2>${advise ? 'Which tickets did you draw?' : 'Add a ticket'}</h2>
        <input type="text" placeholder="Search a city" aria-label="Search" style="width:100%;margin:8px 0">
        <div class="tlist" style="max-height:44dvh;overflow-y:auto" id="pick"></div>
        <div class="acts"><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok disabled>${advise ? 'Advise' : 'Add'}</button></div>`);
      const list = sh.querySelector('#pick'), input = sh.querySelector('input'), ok = sh.querySelector('[data-ok]');
      const draw = () => {
        const q = input.value.trim().toLowerCase();
        const idx = deck.map((t, i) => i).filter(i => !held.has(i) && (!q || ticketName(map, deck[i]).toLowerCase().includes(q)));
        idx.sort((x, y) => ticketName(map, deck[x]).localeCompare(ticketName(map, deck[y])));
        list.innerHTML = idx.map(i => ticketRow(map, deck[i], null, `data-i="${i}" aria-pressed="${chosen.includes(i)}"`).replace('class="ticket', 'class="ticket pick')).join('') || '<div class="empty">No match.</div>';
        ok.disabled = !chosen.length;
        ok.textContent = (advise ? 'Advise' : 'Add') + (chosen.length ? ' (' + chosen.length + ')' : '');
      };
      list.onclick = e => {
        const b = e.target.closest('[data-i]'); if (!b) return;
        const i = +b.dataset.i;
        if (chosen.includes(i)) chosen = chosen.filter(x => x !== i); else if (chosen.length < max) chosen.push(i);
        draw();
      };
      input.oninput = draw;
      sh.querySelector('[data-x]').onclick = () => closeSheet();
      ok.onclick = () => {
        if (!advise) { Table.addTickets(seat, chosen); closeSheet(); return; }
        Table.advise(seat, chosen);
      };
      draw();
    },
    addTickets(seat, ids) {
      const tb = S.table;
      tb.tickets[seat] = (tb.tickets[seat] || []).concat(ids);
      tb.history.push({ type: 'tickets', seat, ids });
      save(); Table.render(); FX.play('cardSlide');
    },
    advise(seat, drawnIdx) {
      const tb = S.table, map = Table.map, deck = T.deckFor(map, { deckId: tb.deckId }).tickets;
      const n = tb.players.length;
      const trainsLeft = tb.players.map((_, s) => map.trains - Object.entries(tb.claims).filter(([, o]) => o === s).reduce((a, [id]) => a + G.index(map).routeById[id].len, 0));
      const P = plainDeck(map, tb.deckId);
      const pos = { owner: tb.claims, me: seat, bothDoubles: n >= map.bothDoublesFrom, myTrains: trainsLeft[seat], rivalTrains: trainsLeft.filter((_, s) => s !== seat), tickets: (tb.tickets[seat] || []).map(i => P[i]), deckTickets: P };
      const first = !(tb.tickets[seat] || []).length;
      const R = T.deckFor(map, { deckId: tb.deckId });
      const min = Math.min(drawnIdx.length, first ? (R.setup || map.setup).keep : (R.draw || map.draw).keep);
      const adv = O.keepAdvice(map, pos, drawnIdx.map(i => P[i]), min);
      let keep = adv.best.map(k => drawnIdx[k]);
      const sh = openSheet(`<h2>Keep or toss <button class="q" data-help="keep" aria-label="About keep or toss">?</button></h2>
        <p class="note">Keep at least ${min}. Best set is selected.</p>
        <div class="tlist" id="adv" style="margin-top:8px"></div>
        <div class="kv" style="margin-top:10px"><span>Expected points</span><b id="adv-ev"></b><span>Trains for all tickets</span><b id="adv-cost"></b></div>
        <div class="acts"><button class="btn" data-x>Back</button><button class="btn primary" data-ok>Keep</button></div>`);
      const draw = () => {
        sh.querySelector('#adv').innerHTML = adv.rows.map((r, k) => {
          const i = drawnIdx[k];
          const ev = Math.round(r.ev);
          return ticketRow(map, r.t, { done: r.done, need: r.extra, chance: r.chance }, `data-i="${i}" aria-pressed="${keep.includes(i)}"`).replace('class="ticket', 'class="ticket pick').replace('</span><span class="info">', `</span><span class="info"><span style="color:${ev >= 0 ? 'var(--good)' : 'var(--bad)'}">${ev >= 0 ? '+' : ''}${ev} pts</span>`).replace('to go', 'more');
        }).join('');
        const opt = adv.options.find(o => o.keep.map(k => drawnIdx[k]).sort().join() === keep.slice().sort().join());
        sh.querySelector('#adv-ev').textContent = opt ? (opt.ev >= 0 ? '+' : '') + Math.round(opt.ev) : '—';
        sh.querySelector('#adv-cost').textContent = opt ? opt.cost + ' of ' + pos.myTrains : '—';
        sh.querySelector('[data-ok]').disabled = keep.length < min;
      };
      sh.querySelector('#adv').onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; const i = +b.dataset.i; keep = keep.includes(i) ? keep.filter(x => x !== i) : keep.concat(i); draw(); };
      sh.querySelector('[data-x]').onclick = () => Table.pickTickets(seat, true);
      sh.querySelector('[data-ok]').onclick = () => { Table.addTickets(seat, keep); closeSheet(); };
      draw();
    },
    final() {
      const tb = S.table, map = Table.map;
      // build an engine state from the table and score it
      const s = {
        mapId: map.id, deckId: tb.deckId, options: houseRules(), owner: tb.claims, stationAt: tb.stations || {},
        players: tb.players.map((p, seat) => ({
          name: p.name, routes: Object.keys(tb.claims).filter(id => tb.claims[id] === seat), tickets: tb.tickets[seat] || [],
          stationCities: Object.keys(tb.stations || {}).filter(c => tb.stations[c] === seat),
          stations: map.stations - Object.values(tb.stations || {}).filter(o => o === seat).length,
        })),
      };
      const res = T.score(s);
      const R = T.rules(s);
      // "Just mine": rivals' tickets aren't in the app, so their totals are incomplete and can't be ranked
      // against yours. Show you first, then the rivals in seat order, and crown nobody.
      const partial = S.settings.privacy === 'mine';
      const rows = partial ? [tb.me].concat(tb.players.map((_, i) => i).filter(i => i !== tb.me)).map(seat => res.rows[seat]) : res.order.map(seat => res.rows[seat]);
      const cols = [['Routes', 'routePts'], ['Tickets', 'ticketPts']];
      if (R.stations) cols.push(['Stations', 'stationPts']);
      if (R.longest) cols.push([map.id === 'europe' ? 'Express' : 'Longest', 'longestPts']);
      if (R.globetrotter) cols.push(['Globe', 'globePts']);
      if (R.mandala) cols.push(['Mandala', 'mandalaPts']);
      const missing = S.settings.privacy === 'mine' ? '<p class="note">Only your tickets are in the app, so rivals\' ticket points are missing. Use "Pass the phone" in Settings to count everyone.</p>' : '';
      const tie = !partial && (res.tied || []).length > 1;
      const sh = openSheet(`<h2>Final score${tie ? ' · tie' : ''}</h2>
        <table class="scores"><tr><th>Player</th>${cols.map(c => `<th>${c[0]}</th>`).join('')}<th>Total</th></tr>
        ${rows.map((r, i) => `<tr class="${!partial && (i === 0 || (res.tied || []).includes(r.seat)) ? 'win' : ''}"><td>${esc(r.name)}</td>${cols.map(c => `<td>${r[c[1]]}</td>`).join('')}<td><b>${r.total}</b></td></tr>`).join('')}</table>
        <p class="note">${map.id === 'europe' ? 'European Express' : 'Longest route'}: ${rows.map(r => esc(r.name) + ' ' + r.longest).join(' · ')}</p>${missing}${map.passengers ? '<p class="note">Passengers are not counted here: add 20 for most and 10 for second in each colour yourself.</p>' : ''}
        <div class="acts"><button class="btn" data-x>Close</button></div>`);
      sh.querySelector('[data-x]').onclick = () => closeSheet();
      // totals count up; with every ticket known ("Pass the phone") the winner gets the confetti in their colour
      FX.play('drumroll', { vol: 0.7 });
      SFX.countTotals(sh).then(() => { if (!partial) { const w = fxColors[rows[0].seat]; FX.celebrate({ kind: 'win', colors: [w, '#f0b354', '#f4efe4', w, '#6ee7a8'] }); } });
    },
  };

  // ======================================================================= PLAY (vs computer)
  const Play = {
    map: null, board: null, busy: false, gen: 0, hint: null, stationMode: false,
    me() { return S.play ? S.play.me : 0; },
    // phone held upright, in a game: the map's default view keeps city names at least 9 px (zoomed in, centred on
    // my tickets); the fit button shows the whole map (2026-10-20, visibility round 2)
    homeLabelPx() { return S.play && window.innerWidth < 900 && window.innerHeight > window.innerWidth ? 9 : 0; },
    focus() {
      const p = S.play, map = Play.map;
      if (!p || !map || p.state.mapId !== map.id) return null;
      const pl = p.state.players[p.me], deck = T.deckFor(map, p.state).tickets, ix = G.index(map).cityById;
      const tix = (Array.isArray(pl.tickets) ? pl.tickets : []).map(t => deck[t]).filter(Boolean);
      const open = tix.filter(t => !T.ticketOutcome(map, pl.routes, t).ok);
      const pts = (open.length ? open : tix).flatMap(t => [ix[t.a], ix[t.b]]).filter(Boolean);
      if (!pts.length) return null;
      const xs = pts.map(c => c.x), ys = pts.map(c => c.y);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    },
    async show() {
      const p = S.play;
      const mapId = p ? p.state.mapId : (Play.setupMap || 'usa');
      const map = await getMap(mapId);
      Play.map = map;
      Play.board = makeBoard('play', map, { onRoute: Play.onRoute, onCity: Play.onCity, cityActive: () => !!Play.stationMode, homeLabelPx: Play.homeLabelPx, focus: Play.focus });
      $('#sub').textContent = map.name;
      Play.render();
      sizeBoards();
      Play.pump();
      if (!Play.net && !S.play && Play.netFlag()) Play.netRoom().then(r => r.resume()).then(ok => { if (!ok) Play.netEnd(); }).catch(() => Play.netEnd());
    },
    render() {
      const panel = $('#v-play .panel'), map = Play.map;
      const p = S.play;
      if (Play.net && (!p || !p.online || (Play.net.snap && Play.net.snap.status === 'lobby'))) return Play.renderLobby(panel);
      if (!p || p.state.mapId !== map.id) return Play.renderSetup(panel);
      const s = p.state, me = p.me;
      const study = S.settings.study && !p.online;
      if (study && !p.study) { p.study = true; save(); } // seeing the computers' cards: not a rated game
      const legal = T.legal(s, me);
      const myTurn = s.turn === me && s.phase === 'main';
      // no train cards or tickets left to draw: the only moves are a claim, a station or passing
      const stuck = myTurn && !s.drew && !s.players[me].pending && !s.pendingTunnel && !legal.some(t => t === 'draw' || t === 'drawTickets');
      const deck = T.deckFor(map, s).tickets;
      const pl = s.players[me];
      // status
      let status = '';
      if (s.phase === 'over') status = 'Game over';
      else if (s.phase === 'setup') status = pl.pending ? 'Choose your starting tickets' : 'Waiting for the others…';
      else if (s.pendingTunnel && s.turn === me) status = 'Tunnel: pay ' + s.pendingTunnel.extra + ' more?';
      else if (myTurn && pl.pending) status = 'Choose tickets to keep';
      else if (myTurn && s.drew) status = 'Take your second card';
      else if (myTurn && stuck) status = 'Nothing left to draw';
      else if (myTurn) status = Play.stationMode ? 'Tap a city for your station' : 'Your turn';
      else status = esc(s.players[s.turn].name) + ' is playing…';
      if (s.lastRound != null && s.phase !== 'over') status += ' · last round';
      if (Play.replay) status = Play.replayText();
      // odds for my tickets
      const pos = Play.pos(s, me);
      const odds = pl.tickets.length ? O.ticketChances(map, Object.assign(pos, { tickets: pl.tickets.map(i => pos.deckTickets[i]), myCards: T.handSize(pl.hand) })) : { tickets: [] };
      Play.lastOdds = odds;
      const studyHTML = study ? s.players.map((q, i) => i === me ? '' : `<div class="small" style="margin-top:6px"><b style="color:${B.PLAYER[i]}">${esc(q.name)}</b> <span class="muted">${LEVEL_NAME[q.level] || ''}</span> · ${T.COLORS.concat('loco').filter(c => q.hand[c]).map(c => `<span class="pip" style="background:${B.COLOR[c]};vertical-align:middle"></span>${q.hand[c]}`).join(' ')}<br>${q.tickets.map(t => esc(ticketName(map, deck[t])) + ' ' + ticketPts(deck[t]) + (T.ticketOutcome(map, q.routes, deck[t]).ok ? ' ✓' : '')).join(' · ') || 'no tickets'}</div>`).join('') : '';
      const logLines = s.log.slice(-4).reverse().map(l => `<div>${esc(l.text)}</div>`).join('');
      const view = $('#v-play'), wide = window.innerWidth >= 900;
      view.classList.add('game');
      const scores = s.players.map((_, i) => s.phase === 'over' && s.result ? s.result.rows[i].total : T.liveRoutePoints(s, i));
      const turnOf = i => s.turn === i && s.phase !== 'over';
      // ---- the far side of the table: each rival's seat (name plate, held card backs, face-down tickets, train heap)
      // four rivals on a phone: smaller card fans and train heaps so every seat fits across
      const tight = !wide && s.players.length >= 5;
      view.querySelector('.rivals').classList.toggle('tight', tight);
      view.querySelector('.rivals').innerHTML = s.players.map((q, i) => i === me ? '' : seatHTML(q, i, scores[i], turnOf(i))).join('');
      // ---- beside the board: ticket deck, the five face-up cards, the train deck, the discard pile
      const sup = view.querySelector('.supply');
      sup.innerHTML = `
        <button type="button" class="stk-btn" id="p-tix" aria-label="Draw tickets (${s.ticketDeck.length} left)" ${legal.includes('drawTickets') ? '' : 'disabled'}><span class="stk"></span></button>
        <div class="row5">${s.faceUp.map((c, i) => c ? `<button type="button" class="slot" data-face="${i}" aria-label="Take ${c === 'loco' ? 'locomotive' : c}">${TT.trainCard(c)}</button>` : '<span class="tbl-spot"></span>').join('')}</div>
        <button type="button" class="stk-btn" id="p-deck" aria-label="Draw from the deck (${s.trainDeck.length} left)" ${legal.includes('draw') && (s.trainDeck.length || s.discard.length) ? '' : 'disabled'}><span class="stk"></span></button>
        <div class="disc" aria-label="Discard pile"></div>`;
      const thick = { perCard: wide ? 0.12 : 0.1, max: wide ? 10 : 8 };
      TABLE.deck(sup.querySelector('#p-tix .stk'), s.ticketDeck.length, Object.assign({ pattern: 'lattice', cls: 'tbl-mini ttr-tback' }, thick));
      TABLE.deck(sup.querySelector('#p-deck .stk'), s.trainDeck.length, Object.assign({ pattern: 'sunburst', cls: 'tbl-mini ttr-back' }, thick));
      const disc = Array.isArray(s.discard) ? s.discard : [];
      TABLE.pile(sup.querySelector('.disc'), disc.slice(-5).map(c => TT.trainCard(c)), { seed: 'disc' + (disc.length - Math.min(5, disc.length)), max: 5, rot: 11, off: 3 });
      // ---- my seat: plate + train heap, my tickets laid in front of me, my hand of cards held in a fan
      const mine = view.querySelector('.mine');
      const tix = odds.tickets.map((x, i) => ticketCard(map, x.t, x, i, Play.sel === i)).join('');
      mine.innerHTML = `
        <div class="me-seat${turnOf(me) ? ' turn' : ''}" data-seat="${me}">
          <div class="tbl-plate"><i style="background:${B.PLAYER[me]}"></i><span class="nm">${esc(pl.name)}</span><b class="sc">${scores[me]}</b></div>
          <div class="me-stuff">${TT.heap(B.PLAYER[me], pl.trains, 'me', wide)}${map.stations ? `<button type="button" class="st-btn${Play.stationMode ? ' on' : ''}" id="p-station" ${myTurn && !s.drew && pl.stations > 0 ? '' : 'disabled'} aria-pressed="${Play.stationMode}" title="Build a station (${T.stationCost(s, me)} cards)"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 9l7-7 7 7v7H2z" fill="${B.PLAYER[me]}"/></svg>${pl.stations}</button><button class="q" data-help="stations" aria-label="About stations">?</button>` : ''}</div>
        </div>
        <div class="mytix">${tix || '<span class="empty">No tickets yet</span>'}${tix ? '<button class="q" data-help="chance" aria-label="About chance">?</button>' : ''}</div>
        <div class="hand" aria-label="My hand"></div>`;
      if (Play.fan && Play.fan.disconnect) Play.fan.disconnect();
      const groups = T.COLORS.concat('loco').filter(c => pl.hand[c] > 0);
      Play.fan = TABLE.fan(mine.querySelector('.hand'), groups.map(c => TT.trainCard(c, 'held' + (pl.hand[c] > 2 ? ' p3' : pl.hand[c] > 1 ? ' p2' : ''), `title="${pl.hand[c]} ${c === 'loco' ? 'locomotive' : c}"`).replace('</div>', `<span class="idx">${pl.hand[c]}</span></div>`)), { pick: false, spread: 0.66, maxRot: 10, lift: 0, minHeight: 40 });
      const notes = `
        <div class="small muted">${Play.unseenHTML(s, me)} <button class="q" data-help="unseen" aria-label="About unseen cards">?</button></div>
        ${s.pax ? `<div class="sec">Passengers</div>${s.players.map((q, i) => `<div class="small pax-row"><b style="color:${fxColors[i]}">${esc(q.name)}</b>${map.passengers.colors.map(c => `${paxPip(c)}${q.pax[c]}`).join(' ')}</div>`).join('')}<p class="note">Each colour: most 20, second 10.</p>`
          : `<div class="small muted" style="margin-top:4px">Longest: ${s.players.map((q, i) => `<b style="color:${fxColors[i]}">${G.longestTrail(map, q.routes).len}</b>`).join(' · ')} <button class="q" data-help="longest" aria-label="About longest route">?</button></div>`}
        ${study ? `<div class="sec">Study: computers' hands</div>${studyHTML}` : ''}
        <div class="sec">Log</div><div class="log">${logLines}</div>
        <div class="row" style="margin-top:10px"><button class="btn small" id="p-new">${p.online ? 'Leave room' : 'New game'}</button>${p.online ? `<span class="grow small muted">Room ${esc(Play.net && Play.net.snap ? Play.net.snap.code : '')}</span>` : ''}</div>`;
      panel.innerHTML = `
        <div class="status"><span class="dot" style="background:${fxColors[s.turn]}"></span><span class="grow st-text">${status}</span>
          ${stuck ? '<button class="btn small primary" id="p-pass">Pass</button>' : ''}
          ${Play.replay ? `<span class="rp-ctl"><button class="btn small" id="p-rback" aria-label="Previous route" ${Play.replay.i > 0 ? '' : 'disabled'}>‹</button><button class="btn small" id="p-rpause" aria-label="${Play.replay.paused ? 'Play the replay' : 'Pause the replay'}">${Play.replay.paused ? 'Play' : 'Pause'}</button><button class="btn small" id="p-rnext" aria-label="Next route" ${Play.replay.i < p.claims.length ? '' : 'disabled'}>›</button></span><button class="btn small primary" id="p-rstop">Stop</button>` : ''}
          ${Play.canUndo() ? '<button class="btn small" id="p-undo" aria-label="Undo my last move">Undo</button>' : ''}
          ${s.phase === 'main' && myTurn ? '<button class="btn small" id="p-hint">Hint</button>' : ''}
          ${s.phase === 'over' && !Play.replay ? (p.claims && p.claims.length ? '<button class="btn small" id="p-replay">Replay</button>' : '') + '<button class="btn small primary" id="p-score">Scores</button>' : ''}
          ${Play.replay ? '' : '<button class="btn small notes-btn" id="p-notes" aria-label="Notes: unseen cards, longest, log">Notes</button>'}</div>
        <div class="notes">${notes}</div>`;
      // the hint is written on a note laid on the board, so nothing below it moves
      let note = Play.board && view.querySelector('.board-wrap .board-note');
      if (!note) { note = document.createElement('div'); note.className = 'board-note'; view.querySelector('.board-wrap').appendChild(note); }
      note.textContent = Play.hint || ''; note.classList.toggle('show', !!Play.hint);
      if (boards.play && boards.play.frame) boards.play.frame.scores(scores, B.PLAYER);
      Play.renderBoard();
      // events
      const newGame = () => { if (S.play && S.play.online) Play.confirmLeave(); else if (S.play && S.play.state.phase !== 'over') { Play.confirmNew(); } else { S.play = null; save(); Play.render(); } };
      view.querySelectorAll('[data-face]').forEach(b => b.onclick = () => Play.act({ type: 'draw', from: +b.dataset.face }));
      view.querySelectorAll('.rivals [data-seat]').forEach(b => b.onclick = () => Play.guess(+b.dataset.seat));
      const on = (id, f) => { const e = view.querySelector(id); if (e) e.onclick = f; };
      on('#p-deck', () => Play.act({ type: 'draw', from: 'deck' }));
      on('#p-tix', () => T.rules(s).draw.mix ? Play.mixSheet(false) : Play.act({ type: 'drawTickets' }));
      on('#p-hint', Play.showHint);
      on('#p-undo', Play.undo);
      on('#p-replay', Play.startReplay);
      on('#p-rstop', Play.stopReplay);
      on('#p-rpause', Play.pauseReplay);
      on('#p-rback', () => Play.stepReplay(-1));
      on('#p-rnext', () => Play.stepReplay(1));
      on('#p-pass', () => Play.act({ type: 'pass' }));
      on('#p-score', Play.scores);
      on('#p-new', newGame);
      on('#p-notes', () => {
        const sh = openSheet(`<h2>Notes</h2><div class="notes-sheet">${notes}</div><div class="acts"><button class="btn" data-x>Close</button></div>`);
        sh.querySelector('[data-x]').onclick = () => closeSheet();
        sh.querySelector('#p-new').onclick = () => { closeSheet(true); newGame(); };
      });
      on('#p-station', () => { Play.stationMode = !Play.stationMode; Play.render(); });
      view.querySelectorAll('[data-tix]').forEach(b => b.onclick = () => { Play.sel = Play.sel === +b.dataset.tix ? null : +b.dataset.tix; Play.render(); });
      sizeBoards();
      fitTickets(view.querySelector('.mine'));
      // sheets that the state demands
      if (pl.pending && (s.phase === 'setup' || myTurn) && !sheetEl) { if (pl.pending.mix) Play.mixSheet(true); else Play.ticketSheet(); }
      if (s.pendingTunnel && s.turn === me && !sheetEl) Play.tunnelSheet();
      if (s.phase === 'over') Play.recordProfile();
      if (s.phase === 'over' && !p.shownScores && !sheetEl) { p.shownScores = true; save(); Play.scores(); }
    },
    renderBoard() {
      const p = S.play; if (!p || !Play.board) return;
      const s = p.state, odds = Play.lastOdds || { tickets: [] };
      const tix = Play.sel != null && odds.tickets[Play.sel];
      if (Play.replay) {
        // the end-of-game replay: the routes appear in the order they were claimed
        const owner = {}, R = Play.replay, last = p.claims[R.i - 1];
        p.claims.slice(0, R.i).forEach(x => { owner[x.r] = x.s; });
        return Play.board.render({ owner, stations: R.i >= p.claims.length ? s.stationAt : {}, path: new Set(), endCities: [], highlight: new Set(last ? [last.r] : []) });
      }
      Play.board.render({
        owner: s.owner, stations: s.stationAt, pax: s.pax,
        path: new Set(tix ? tix.path : Play.hintRoute ? [Play.hintRoute] : []),
        endCities: tix ? [tix.t.a, tix.t.b] : [], sel: Play.claiming || Play.hintRoute,
        highlight: new Set(Play.flash ? [Play.flash] : []),
      });
    },
    // score race: route points after every turn
    record() {
      const p = S.play; if (!p) return;
      const s = p.state; p.race = p.race || [];
      // every claim in order, for the end-of-game replay
      if (!p.claims) p.claims = Object.keys(s.owner).length ? null : [];
      if (p.claims && Object.keys(s.owner).length > p.claims.length) {
        const had = new Set(p.claims.map(x => x.r));
        for (const r in s.owner) if (!had.has(r)) p.claims.push({ r, s: s.owner[r], t: s.turnNo });
      }
      const last = p.race[p.race.length - 1];
      if (last && last.t === s.turnNo) return;
      p.race.push({ t: s.turnNo, pts: s.players.map((_, i) => T.liveRoutePoints(s, i)) });
    },
    raceSVG(s, res) {
      const race = (S.play.race || []).filter(x => x.t > 0);
      if (race.length < 2) return '<p class="note">No turns recorded.</p>';
      const W = 420, H = 150, pad = 6, n = s.players.length;
      const finals = s.players.map((_, i) => res.rows[i].total);
      const maxY = Math.max(10, ...finals, ...race.flatMap(x => x.pts));
      const minY = Math.min(0, ...finals);
      const X = i => pad + i / race.length * (W - 2 * pad - 30), Y = v => H - pad - (v - minY) / (maxY - minY) * (H - 2 * pad);
      let out = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Score race chart">`;
      out += `<line x1="${pad}" x2="${W - pad}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line)"/>`;
      for (let k = 0; k < n; k++) {
        const pts = race.map((x, i) => `${X(i).toFixed(1)},${Y(x.pts[k]).toFixed(1)}`);
        // final jump: tickets and bonuses are added at the end
        pts.push(`${(W - pad - 22).toFixed(1)},${Y(finals[k]).toFixed(1)}`);
        out += `<polyline points="${pts.join(' ')}" fill="none" stroke="${B.PLAYER[k]}" stroke-width="2.5" stroke-linejoin="round"/>`;
        out += `<circle cx="${W - pad - 22}" cy="${Y(finals[k]).toFixed(1)}" r="4" fill="${B.PLAYER[k]}"/>`;
      }
      return out + '</svg><p class="note">Route points turn by turn; the last step adds tickets and bonuses.</p>';
    },
    // cards I haven't seen: the whole deck minus my hand, the face-up row and the discard pile
    unseenHTML(s, me) {
      const map = Play.map, h = s.players[me].hand;
      return 'Unseen: ' + T.COLORS.concat('loco').map(c => {
        const total = c === 'loco' ? map.deck.loco : map.deck.colors[c];
        const seen = h[c] + s.faceUp.filter(x => x === c).length + s.discard.filter(x => x === c).length;
        return `<span style="white-space:nowrap"><span class="pip" style="width:9px;height:12px;vertical-align:-1px;background:${B.COLOR[c]}"></span>${Math.max(0, total - seen)}</span>`;
      }).join(' ');
    },
    // which tickets a rival probably holds: tickets whose cheapest path their track already covers most
    guess(seat) {
      const p = S.play, s = p.state, map = Play.map, me = p.me, q = s.players[seat];
      const deck = plainDeck(map, s.deckId), mine = new Set(s.players[me].tickets);
      const theirs = new Set(q.routes);
      const rows = [];
      deck.forEach((t, i) => {
        if (mine.has(i) || t.a == null || t.b == null) return;
        const base = G.shortest(map, t.a, t.b, r => r.len);
        const withThem = G.shortest(map, t.a, t.b, r => theirs.has(r.id) ? 0 : r.len);
        if (!base || !withThem || !base.dist) return;
        const share = (base.dist - withThem.dist) / base.dist;
        if (share > 0) rows.push({ t, i, share, done: withThem.dist === 0 });
      });
      rows.sort((x, y) => y.share - x.share || y.t.pts - x.t.pts);
      const top = rows.slice(0, 6);
      const real = S.settings.study && !p.online ? new Set(q.tickets) : null;
      const sh = openSheet(`<h2>${esc(q.name)}'s likely tickets <button class="q" data-help="guess" aria-label="About the guess">?</button></h2>
        <p class="note">${q.tickets.length} ticket${q.tickets.length === 1 ? '' : 's'} held · ${q.routes.length} routes claimed</p>
        ${top.length ? `<table class="lab-table" style="margin-top:8px"><tr><th>Ticket</th><th>Pts</th><th>Built</th></tr>${top.map(r => `<tr><td>${esc(ticketName(map, r.t))}${real && real.has(r.i) ? ' <span style="color:var(--good)">holds</span>' : ''}</td><td>${ticketPts(r.t)}</td><td style="color:${r.share >= 0.75 ? 'var(--bad)' : r.share >= 0.4 ? 'var(--accent-warm)' : 'var(--muted)'}">${r.done ? 'done' : pct(r.share)}</td></tr>`).join('')}</table>` : '<p class="empty">No track yet, so no clues.</p>'}
        <div class="acts"><button class="btn" data-x>Close</button></div>`);
      sh.querySelector('[data-x]').onclick = () => closeSheet();
    },
    pos(s, me) {
      const map = Play.map;
      return {
        owner: s.owner, me, bothDoubles: T.rules(s).bothDoubles, myTrains: s.players[me].trains,
        rivalTrains: s.players.filter((_, i) => i !== me).map(q => q.trains), deckTickets: plainDeck(map, s.deckId),
        stationCities: s.players[me].stationCities, tickets: [],
      };
    },
    confirmNew() {
      const p = S.play, counts = !!(window.Profile && p && !p.online && !p.recorded && !p.tutorial && (p.moved || p.daily));
      const sh = openSheet(`<h2>Leave this game?</h2><p class="note">It can't be resumed${counts ? ' and counts as a loss' : ''}.</p><div class="acts"><button class="btn" data-x>Keep playing</button><button class="btn primary" data-ok>New game</button></div>`);
      sh.querySelector('[data-x]').onclick = () => closeSheet();
      sh.querySelector('[data-ok]').onclick = () => { closeSheet(true); Play.abandonGame(); Play.gen++; S.play = null; save(); Play.render(); };
    },
    // no game on the table (setup, online lobby): just the board, the rest of the table is cleared
    idle() {
      const v = $('#v-play'), was = v.classList.contains('game');
      v.classList.remove('game');
      ['.rivals', '.supply', '.mine'].forEach(s => { v.querySelector(s).innerHTML = ''; });
      const n = v.querySelector('.board-note'); if (n) n.classList.remove('show');
      if (boards.play && boards.play.frame) boards.play.frame.scores([]);
      if (Play.fan && Play.fan.disconnect) { Play.fan.disconnect(); Play.fan = null; }
      if (was) setTimeout(sizeBoards, 0);
    },
    renderSetup(panel) {
      Play.idle();
      const map = Play.map;
      const maxOpp = map.players[1] - 1;
      const k = Math.min(Play.setupOpp || 1, maxOpp);
      const levels = Play.setupLevels || ['medium', 'medium', 'medium', 'medium'];
      panel.innerHTML = `
        <div class="sec">New game</div>
        <div class="row wrap">${mapSelect('map', map.id)}${deckSelect(map, 'deck', Play.setupDeck)}</div>
        <div class="sec">Computers <button class="q" data-help="strength" aria-label="How strong">?</button></div>
        <div class="row"><span class="seg" role="group">${Array.from({ length: maxOpp }, (_, i) => i + 1).map(n => `<button type="button" data-opp="${n}" aria-pressed="${n === k}">${n}</button>`).join('')}</span></div>
        <div class="tlist" style="margin-top:8px">${Array.from({ length: k }, (_, i) => `<div class="row"><i style="width:14px;height:14px;border-radius:4px;background:${B.PLAYER[i + 1]};flex:none"></i><span class="grow">${PNAME[i + 1]}</span><span class="seg" role="group">${LEVELS.map(l => `<button type="button" data-lv="${i}" data-l="${l}" aria-pressed="${levels[i] === l}">${LEVEL_NAME[l]}</button>`).join('')}</span></div>`).join('')}</div>
        <div id="p-strength"></div>
        <div class="row" style="margin-top:12px"><button class="btn primary grow" id="p-start">Start</button><button class="btn" id="p-online">Online</button></div>
        ${window.COACH ? '<div class="row" style="margin-top:8px"><button class="btn small" id="p-learn">Guided first game</button><button class="btn small" id="p-rules">Rules</button></div>' : ''}`;
      Play.board.render({});
      panel.querySelector('#p-online').onclick = () => Play.onlineSheet();
      if (window.COACH) {
        panel.querySelector('#p-learn').onclick = () => Play.startTutorial();
        panel.querySelector('#p-rules').onclick = () => openRules();
        // first visit: offer the guided game once
        if (Play.tour && !Play.tour.seen() && !Play.tour.saved() && !COACH.offered('ttr-first')) {
          COACH.offer({ id: 'ttr-first', title: 'New to Ticket to Ride?', text: 'Play a guided first game against one easy computer.', yes: 'Teach me', no: 'No thanks', onYes: () => Play.startTutorial(), place: 'auto', avoid: ['#p-start'] });
        }
      }
      Strength.note($('#p-strength'), map.id, true);
      panel.querySelector('[name=map]').onchange = async e => { panel.querySelectorAll('button').forEach(b => { b.disabled = true; }); Play.setupMap = e.target.value; Play.setupDeck = null; await Play.show(); };
      const dk = panel.querySelector('[name=deck]'); if (dk) dk.onchange = e => { Play.setupDeck = e.target.value; };
      panel.querySelectorAll('[data-opp]').forEach(b => b.onclick = () => { Play.setupOpp = +b.dataset.opp; Play.renderSetup(panel); });
      panel.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { levels[+b.dataset.lv] = b.dataset.l; Play.setupLevels = levels; Play.renderSetup(panel); });
      panel.querySelector('#p-start').onclick = () => {
        const seats = [{ name: 'You', kind: 'human' }].concat(Array.from({ length: k }, (_, i) => ({ name: PNAME[i + 1], kind: 'cpu', level: levels[i] })));
        const state = T.newGame(map, { seed: (Math.random() * 2 ** 31) >>> 0, deckId: Play.setupDeck || map.ticketDecks[0].id, seats, options: houseRules() });
        S.play = { me: 0, state };
        Play.gen++; Play.hint = null; Play.sel = null; Play.stationMode = false;
        save(); Play.board.toAuto(); Play.render(); FX.play('shuffle'); Play.pump();
      };
    },
    // sounds and animations for everything that changed between two states (my move, a computer's, an online snapshot)
    fx(prev, next) {
      if (!prev || !next || S.tab !== 'play' || !Play.map || next.mapId !== Play.map.id) return;
      const ev = SFX.diff(prev, next, S.play.me, Play.map);
      // face-up slots refilled from the deck turn over (a 3-D flip) — set before the next render
      if (FX.settings.animations) {
        const slots = []; for (let i = 0; i < 5; i++) if (next.faceUp[i] && next.faceUp[i] !== prev.faceUp[i]) slots.push(i);
        if (slots.length) { $('#v-play').querySelectorAll('.supply [data-face]').forEach(b => { if (slots.includes(+b.dataset.face)) { const c = b.querySelector('.ttr-card'); if (c) { c.classList.remove('turn-up'); void c.offsetWidth; c.classList.add('turn-up'); } } }); }
      }
      if (ev.length) SFX.fire(ev, fxCtx('play', S.play.me));
    },
    act(a) {
      const p = S.play; if (!p) return;
      const s = p.state, me = p.me;
      a.seat = me;
      if (p.online) {
        try { T.apply(T.clone(s), Object.assign({}, a)); } catch (e) { if (e.rule) return refuse(e.message.charAt(0).toUpperCase() + e.message.slice(1)); }
        Play.hint = null; Play.hintRoute = null;
        if (a.type !== 'keepTickets') Play.stationMode = false;
        Play.net.room.act(a); // a refusal arrives as an 'error' event (toast); sounds come with the snapshot
        return;
      }
      try {
        const before = s;
        const snap = { state: s, race: (p.race || []).slice(), claims: p.claims ? p.claims.slice() : p.claims };
        p.state = T.apply(s, a);
        if (Play.undoOwner !== p) { Play.undoStack = []; Play.undoOwner = p; } // a new game (or one adopted from another tab) starts a fresh list
        Play.undoStack.push(snap); if (Play.undoStack.length > 60) Play.undoStack.shift();
        p.moved = true;   // from your first move, leaving counts as a loss
        Play.record();
        Play.hint = null; Play.hintRoute = null;
        if (a.type !== 'keepTickets') Play.stationMode = false;
        if (a.type === 'claim' && p.state.owner[a.route] === me) Play.flashRoute(a.route);
        save(); Play.render(); Play.fx(before, p.state); Play.pump();
      } catch (e) {
        if (e.rule) refuse(e.message.charAt(0).toUpperCase() + e.message.slice(1)); else { console.error(e); toast('Something went wrong'); }
      }
    },
    // Undo (games against the computers only): back to just before my last move; the computers' moves after it
    // are taken back too. The deck order is part of the game, so a redrawn card is the same card. Undo or Hint
    // makes the game count as "with help" in My stats (not rated).
    undoStack: [],
    canUndo() { const p = S.play; return !!(p && !p.online && !Play.replay && p.state.phase !== 'over' && Play.undoOwner === p && Play.undoStack.length); },
    undo() {
      const p = S.play; if (!Play.canUndo()) return;
      const u = Play.undoStack.pop();
      Play.gen++; Play.busy = false;
      p.state = u.state; p.race = u.race; p.claims = u.claims; p.helped = true;
      Play.hint = null; Play.hintRoute = null; Play.stationMode = false; Play.claiming = null;
      closeSheet(true); save(); Play.render(); FX.play('slide'); Play.pump();
      if (window.COACH) COACH.emit('undo');
    },
    // My stats (shared _profile kit): a finished game against the computers is recorded once. Rated unless
    // Hint, Undo or Study mode was used ("with help"); the guided first game is not recorded.
    recordProfile() {
      const p = S.play; if (!window.Profile || !p || p.online || p.recorded || p.tutorial || p.state.phase !== 'over' || !p.state.result) return;
      p.recorded = true;
      const s = p.state, helped = !!(p.helped || p.study);
      const r = window.TTRProfile.result(s, p.me, { helped, daily: !!p.daily, map: Play.map && Play.map.id === s.mapId ? Play.map : null });
      if (r.won) { S.mapWins[s.mapId] = (S.mapWins[s.mapId] || 0) + 1; }
      save();
      Profile.recordResult(p.daily ? Object.assign(r, { date: p.daily }) : r);
    },
    // Daily game: the same map, deck and deal for everyone today, against one Hard computer
    async startDaily() {
      if (!window.Profile) return;
      const day = Profile.daily.date();
      if (S.play && S.play.daily === day && S.play.state.phase !== 'over') { Profile.closePanel(); showTab('play', true); return toast('Your Daily game is on the table'); }
      if (Profile.daily.played(day)) return Profile.openPanel({ tab: 'daily' });
      if (S.play && S.play.online) { Profile.closePanel(); return toast('Leave the online room first'); }
      Play.abandonGame();
      Profile.closePanel();
      const d = window.TTRProfile.dailyGame(Profile.daily.seed(day));
      const map = await getMap(d.mapId);
      const seats = [{ name: 'You', kind: 'human' }].concat(d.levels.map((l, i) => ({ name: PNAME[i + 1], kind: 'cpu', level: l })));
      Play.gen++;
      S.play = { me: 0, daily: day, state: T.newGame(map, { seed: d.seed, deckId: map.ticketDecks[0].id, seats, options: {} }) };
      Play.hint = null; Play.sel = null; Play.stationMode = false;
      save();
      if (S.tab !== 'play') showTab('play', true); else await Play.show();
      FX.play('shuffle'); toast('Daily game: ' + map.name + ' against Hard');
    },
    // the guided first game (js/tutorial.js + shared js/coach.js): a fixed deal, you against one Easy computer.
    // Not recorded in My stats.
    tour: null,
    async startTutorial() {
      if (!window.COACH || !Play.tour) return;
      COACH.closeOffer(); closeSheet(true);
      if (S.play && S.play.online) return toast('Leave the online room first');
      Play.abandonGame();
      const g = window.TTRTutorial.GAME, map = await getMap(g.mapId);
      const seats = [{ name: 'You', kind: 'human' }].concat(g.levels.map((l, i) => ({ name: PNAME[i + 1], kind: 'cpu', level: l })));
      Play.gen++; Play.stopReplay(true);
      S.play = { me: 0, tutorial: true, state: T.newGame(map, { seed: g.seed, deckId: map.ticketDecks[0].id, seats, options: {} }) };
      Play.hint = null; Play.sel = null; Play.stationMode = false;
      save();
      Play.tour.reset();
      if (S.tab !== 'play') showTab('play', true); else await Play.show();
      if (Play.board) Play.board.toAuto();
      FX.play('shuffle');
      Play.tour.start();
    },
    // leaving an unfinished game against the computers (New game, another Daily, the guided game, Clear) counts it
    // as lost, so a bad game can't be dropped (and a Daily can't be retried). Not the guided game, not online, and
    // not a game you haven't made a move in yet (a Daily counts from the start, as before).
    abandonGame() {
      const p = S.play;
      if (!window.Profile || !p || p.online || p.recorded || p.tutorial || p.state.phase === 'over') return;
      if (!p.moved && !p.daily) return;
      p.recorded = true;
      const s = p.state, helped = !!(p.helped || p.study);
      const levels = s.players.filter((_, i) => i !== p.me).map(q => q.level).filter(l => LEVELS.includes(l));
      const level = levels.length ? levels.reduce((a, b) => (LEVELS.indexOf(b) > LEVELS.indexOf(a) ? b : a)) : null; // the strongest computer at the table
      const r = { mode: helped ? 'help' : 'computer', level: helped ? null : level, won: false, daily: !!p.daily, extra: { map: s.mapId, players: s.players.length, quit: true } };
      save();
      Profile.recordResult(p.daily ? Object.assign(r, { date: p.daily }) : r);
      toast((p.daily ? 'Daily game' : 'Game') + ' left: counted as a loss');
    },
    // after the game: every claimed route appears again on the board in the order it was claimed
    replay: null,
    startReplay() {
      const p = S.play; if (!p || p.state.phase !== 'over') return;
      if (!p.claims || p.claims.length !== Object.keys(p.state.owner).length || !p.claims.length) return toast('No replay for this game');
      closeSheet(true); Play.stopReplay(true);
      Play.replay = { i: 0, hold: 0 };
      const step = Math.max(180, Math.round(delay() * 0.55));
      Play.replay.timer = setInterval(() => {
        const R = Play.replay; if (!R || S.play !== p || S.tab !== 'play') return Play.stopReplay();
        if (R.paused) return;
        if (R.i >= p.claims.length) { if (++R.hold > 3) Play.stopReplay(); return; }
        R.i++; R.hold = 0; Play.replayRefresh(); FX.play('place');
      }, step);
      Play.render();
    },
    replayText() { const R = Play.replay, p = S.play, x = p.claims[R.i - 1]; return 'Replay ' + R.i + '/' + p.claims.length + ' · turn ' + (x ? x.t : 0); },
    // a replay step redraws only the board and the status words: the buttons stay put, so a tap is never lost
    replayRefresh() {
      const R = Play.replay, p = S.play; if (!R || !p) return;
      const v = $('#v-play'), t = v.querySelector('.st-text'); if (t) t.textContent = Play.replayText();
      const set = (id, off) => { const b = v.querySelector(id); if (b) b.disabled = off; };
      set('#p-rback', R.i <= 0); set('#p-rnext', R.i >= p.claims.length);
      const pb = v.querySelector('#p-rpause'); if (pb) { pb.textContent = R.paused ? 'Play' : 'Pause'; pb.setAttribute('aria-label', R.paused ? 'Play the replay' : 'Pause the replay'); }
      Play.renderBoard();
    },
    // pause / play, and step one route back or forward (stepping pauses)
    pauseReplay() { const R = Play.replay; if (!R) return; R.paused = !R.paused; R.hold = 0; if (!R.paused && R.i >= S.play.claims.length) R.i = 0; Play.replayRefresh(); },
    stepReplay(d) {
      const R = Play.replay, p = S.play; if (!R || !p) return;
      R.paused = true; R.hold = 0;
      const i = Math.max(0, Math.min(p.claims.length, R.i + d));
      if (i !== R.i) { R.i = i; if (d > 0) FX.play('place'); }
      Play.replayRefresh();
    },
    stopReplay(quiet) {
      if (!Play.replay) return;
      clearInterval(Play.replay.timer); Play.replay = null;
      if (!quiet && S.tab === 'play') Play.render();
    },
    flashRoute(id) { Play.flash = id; clearTimeout(Play.flashT); Play.flashT = setTimeout(() => { Play.flash = null; if (S.tab === 'play') Play.render(); }, 1400); },
    // computers move one action at a time, with a pause so you can follow
    pump() {
      const p = S.play; if (!p || p.online || Play.busy) return;
      if (document.hidden) return; // a tab in the background waits; the computers carry on when it is shown again
      const s = p.state;
      if (s.phase === 'over') return;
      let seat = null;
      if (s.phase === 'setup') seat = s.players.findIndex((q, i) => i !== p.me && q.pending && q.kind === 'cpu');
      else if (s.players[s.turn].kind === 'cpu') seat = s.turn;
      if (seat == null || seat < 0) return;
      Play.busy = true;
      const gen = Play.gen;
      setTimeout(() => {
        Play.busy = false;
        if (gen !== Play.gen || !S.play) return; // a new game started meanwhile
        const st = S.play.state;
        const a = AI.choose(T.view(st, seat), seat, st.players[seat].level);
        try { S.play.state = T.apply(st, a); } catch (e) { console.error('computer move refused', a, e); S.play.state = T.apply(st, { type: st.drew ? 'draw' : 'pass', seat, from: 'deck' }); }
        Play.record();
        if (a.type === 'claim' && S.play.state.owner[a.route] === seat) Play.flashRoute(a.route);
        save();
        if (S.tab === 'play') { Play.render(); Play.fx(st, S.play.state); }
        Play.pump();
      }, s.phase === 'setup' ? 150 : delay());
    },
    onRoute(id) {
      const p = S.play; if (!p) return;
      const s = p.state, me = p.me, map = Play.map;
      const r = G.index(map).routeById[id];
      const label = cityName(map, r.a) + '–' + cityName(map, r.b);
      if (s.phase !== 'main' || s.turn !== me) return toast(label + ': ' + r.len + ' ' + (r.color === 'gray' ? 'any colour' : r.color) + (r.kind === 'tunnel' ? ', tunnel' : '') + (r.locos ? ', ' + r.locos + ' loco' : ''));
      if (s.players[me].pending || s.pendingTunnel) return;
      if (s.drew) return refuse('Take your second card first');
      const why = T.canClaim(s, me, id);
      if (why) return refuse(label + ': ' + why);
      const opts = T.payOptions(s, me, id);
      if (opts.length === 1) return Play.confirmClaim(id, opts);
      Play.confirmClaim(id, opts);
    },
    confirmClaim(id, opts) {
      const map = Play.map, r = G.index(map).routeById[id], s = S.play.state;
      // Germany: pick one passenger at each end (the best colour for you is picked to start with)
      const pax = {}, ends = s.pax ? T.paxPlaces(map, r).filter(k => s.pax[k] && s.pax[k].length) : [];
      for (const k of ends) pax[k] = T.bestPax(T.clone(s), S.play.me, s.pax[k]);
      const paxHTML = ends.map(k => `<div class="pax-pick" data-place="${k}"><span class="small grow">${esc(cityName(map, k))}</span>${[...new Set(s.pax[k])].map(c => `<button type="button" class="pp" data-c="${c}" style="background:${PAX_COL[c]}" aria-label="${c} passenger" aria-pressed="${pax[k] === c}"></button>`).join('')}</div>`).join('');
      const sh = openSheet(`<h2>${esc(cityName(map, r.a))} – ${esc(cityName(map, r.b))}</h2>
        <p class="note">${r.len} trains · +${T.routePoints(map, r.len)} points${r.kind === 'tunnel' ? ' · tunnel: 3 cards are turned over and each match costs one more' : ''}${r.locos ? ' · needs ' + r.locos + ' locomotive' + (r.locos > 1 ? 's' : '') : ''}</p>
        ${paxHTML ? `<div class="sec">Passenger to take</div>${paxHTML}` : ''}
        <div class="paylist">${opts.map((o, i) => `<button type="button" class="payopt" data-o="${i}">${payLabel(o)}${o.any ? ' <span class="muted small">(swap)</span>' : ''}</button>`).join('')}</div>
        <div class="acts"><button class="btn" data-x>Cancel</button></div>`, () => { Play.claiming = null; if (S.tab === 'play') Play.render(); });
      sh.querySelectorAll('.pax-pick [data-c]').forEach(b => b.onclick = () => {
        const k = b.closest('[data-place]').dataset.place; pax[k] = b.dataset.c;
        b.parentNode.querySelectorAll('[data-c]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      });
      // show which route is being claimed: it glows on the map, which stays visible behind a light scrim
      scrimEl.classList.add('light');
      Play.claiming = id; Play.renderBoard();
      sh.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { closeSheet(true); Play.act(Object.assign({ type: 'claim', route: id, pay: opts[+b.dataset.o] }, ends.length ? { pax } : {})); });
      sh.querySelector('[data-x]').onclick = () => closeSheet();
    },
    // Germany: say how many of the 4 tickets come from the long deck (setup: keep 2 or more; later: keep 1 or more)
    mixSheet(setup) {
      const s = S.play.state, R = T.rules(s), rule = setup ? R.setup : R.draw;
      let k = setup ? 1 : 0;
      const longLeft = typeof s.longDeck === 'number' ? s.longDeck : s.longDeck.length;
      const sh = openSheet(`<h2>${setup ? 'Starting tickets' : 'Draw tickets'}</h2>
        <p class="note">You draw ${rule.deal} and keep at least ${rule.keep}. Long tickets are worth 12–22 points. How many long ones?</p>
        <div class="row" style="margin-top:8px"><span class="seg" role="group" id="mx">${Array.from({ length: rule.deal + 1 }, (_, i) => `<button type="button" data-k="${i}" ${i > longLeft ? 'disabled' : ''}>${i}</button>`).join('')}</span></div>
        <p class="note" id="mx-say"></p>
        <div class="acts">${setup ? '' : '<button class="btn" data-x>Cancel</button>'}<button class="btn primary" data-ok>Draw</button></div>`, null);
      if (setup) sh.dataset.modal = '1';
      const draw = () => {
        sh.querySelectorAll('#mx [data-k]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.k === k)));
        sh.querySelector('#mx-say').textContent = (rule.deal - k) + ' short, ' + k + ' long';
      };
      sh.querySelectorAll('#mx [data-k]').forEach(b => b.onclick = () => { k = +b.dataset.k; draw(); });
      const x = sh.querySelector('[data-x]'); if (x) x.onclick = () => closeSheet();
      sh.querySelector('[data-ok]').onclick = () => { closeSheet(true); Play.act({ type: setup ? 'ticketMix' : 'drawTickets', long: k }); };
      draw();
    },
    onCity(id) {
      const p = S.play; if (!p || !Play.stationMode) return;
      const s = p.state, me = p.me, map = Play.map;
      const cost = T.stationCost(s, me), h = s.players[me].hand;
      if (s.stationAt[id] != null) return refuse('That city already has a station');
      const opts = [];
      for (const c of T.COLORS) if (h[c]) { const n = Math.min(h[c], cost); if (cost - n <= h.loco) opts.push({ color: c, n, locos: cost - n }); }
      if (h.loco >= cost) opts.push({ color: null, n: 0, locos: cost });
      if (!opts.length) return refuse('A station costs ' + cost + ' card' + (cost === 1 ? '' : 's') + (cost > 1 ? ' of one colour' : ''));
      const sh = openSheet(`<h2>Station in ${esc(cityName(map, id))}</h2><p class="note">Lets you use one rival route into this city for your tickets.</p>
        <div class="paylist">${opts.map((o, i) => `<button type="button" class="payopt" data-o="${i}">${payLabel(o)}</button>`).join('')}</div>
        <div class="acts"><button class="btn" data-x>Cancel</button></div>`);
      sh.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { closeSheet(true); Play.act({ type: 'station', city: id, pay: opts[+b.dataset.o] }); });
      sh.querySelector('[data-x]').onclick = () => closeSheet();
    },
    ticketSheet() {
      const p = S.play, s = p.state, me = p.me, map = Play.map, pl = s.players[me];
      const deck = T.deckFor(map, s).tickets;
      const drawn = pl.pending.tickets, min = Math.min(pl.pending.min, drawn.length);
      const pos = Object.assign(Play.pos(s, me), { myCards: T.handSize(pl.hand) });
      pos.tickets = pl.tickets.map(i => pos.deckTickets[i]);
      const adv = O.keepAdvice(map, pos, drawn.map(i => pos.deckTickets[i]), min);
      let keep = S.settings.study || Play.wantHint ? adv.best.map(k => drawn[k]) : [];
      const sh = openSheet(`<h2>Choose tickets <button class="q" data-help="keep" aria-label="About keep or toss">?</button></h2>
        <p class="note">Keep at least ${min}. Numbers: trains more, chance, value.</p>
        <div class="tlist" id="pk" style="margin-top:8px"></div>
        <div class="acts"><button class="btn" data-best>Best set</button><button class="btn primary" data-ok>Keep</button></div>`, null);
      sh.dataset.modal = '1'; sh.dataset.kind = 'tickets';
      const draw = () => {
        sh.querySelector('#pk').innerHTML = adv.rows.map((r, k) => {
          const ev = Math.round(r.ev);
          return ticketRow(map, r.t, { done: r.done, need: r.extra, chance: r.chance }, `data-i="${drawn[k]}" aria-pressed="${keep.includes(drawn[k])}"`).replace('class="ticket', 'class="ticket pick').replace('</span><span class="info">', `</span><span class="info"><span style="color:${ev >= 0 ? 'var(--good)' : 'var(--bad)'}">${ev >= 0 ? '+' : ''}${ev} pts</span>`).replace('to go', 'more');
        }).join('');
        sh.querySelector('[data-ok]').disabled = keep.length < min;
        sh.querySelector('[data-ok]').textContent = 'Keep ' + (keep.length || '');
      };
      sh.querySelector('#pk').onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; const i = +b.dataset.i; keep = keep.includes(i) ? keep.filter(x => x !== i) : keep.concat(i); draw(); };
      sh.querySelector('[data-best]').onclick = () => { keep = adv.best.map(k => drawn[k]); draw(); };
      sh.querySelector('[data-ok]').onclick = () => { closeSheet(true); Play.act({ type: 'keepTickets', keep }); };
      draw();
    },
    tunnelSheet() {
      const p = S.play, s = p.state, me = p.me, t = s.pendingTunnel, h = s.players[me].hand, map = Play.map;
      const r = G.index(map).routeById[t.route];
      const colorLeft = t.color ? h[t.color] - t.n : 0, locoLeft = h.loco - t.locos;
      const can = (t.color ? colorLeft : 0) + locoLeft >= t.extra;
      const useColor = Math.min(colorLeft, t.extra);
      const sh = openSheet(`<h2>Tunnel: ${esc(cityName(map, r.a))} – ${esc(cityName(map, r.b))}</h2>
        <div class="row" style="margin:10px 0;max-width:220px">${t.shown.map(c => `<div class="tcard" style="flex:1">${window.Cards.svg(c)}</div>`).join('')}</div>
        <p>${t.extra} extra card${t.extra > 1 ? 's' : ''} needed${can ? ': ' + (useColor ? useColor + ' ' + t.color : '') + (useColor && t.extra - useColor ? ' + ' : '') + (t.extra - useColor ? (t.extra - useColor) + ' locomotive' : '') : ' — you don\'t have them.'}</p>
        <div class="acts"><button class="btn" data-no>Give up</button><button class="btn primary" data-yes ${can ? '' : 'disabled'}>Pay</button></div>`);
      sh.dataset.modal = '1';
      sh.querySelector('[data-no]').onclick = () => { closeSheet(true); Play.act({ type: 'tunnelPay', pay: false }); };
      sh.querySelector('[data-yes]').onclick = () => { closeSheet(true); Play.act({ type: 'tunnelPay', pay: true, extraLocos: t.extra - useColor }); };
    },
    showHint() {
      const p = S.play, s = p.state, me = p.me;
      const v = p.online ? p.view : T.view(s, me);
      const a = AI.choose(v, me, 'hard');
      Play.hint = 'Hint: ' + AI.explain(v, me, a) + (a && a.why ? ' — ' + a.why : '');
      Play.hintRoute = a && a.type === 'claim' ? a.route : null;
      if (!p.online && !p.helped) { p.helped = true; save(); } // a game with hints counts as "with help" in My stats
      Play.render();
    },
    // ---------------------------------------------------------------- online rooms (js/online.js, shared by Tim's game sites)
    net: null, // { room, snap }
    netFlag(v) {
      try { if (v === undefined) return localStorage.getItem('ttr:online') === '1'; if (v) localStorage.setItem('ttr:online', '1'); else localStorage.removeItem('ttr:online'); } catch (e) { return false; }
    },
    async netRoom() {
      if (Play.net) return Play.net.room;
      const mod = await import(new URL('js/online.js?v=a3d0418b', location.href).href);
      const room = mod.createOnline({ game: window.TTROnlineGame.game, gameId: 'ticket-to-ride', botDelayMs: delay() });
      Play.net = { room, snap: null };
      room.on('change', snap => Play.onSnap(snap));
      room.on('error', msg => refuse(msg));
      Play.netFlag(true);
      return room;
    },
    async onSnap(snap) {
      const net = Play.net; if (!net) return;
      net.snap = snap;
      if (snap.status === 'closed' || snap.status === 'left' || snap.status === 'none') return Play.netEnd(snap.status === 'closed' ? 'The room was closed' : null);
      const mapId = snap.options && snap.options.mapId;
      if (mapId && (!Play.map || Play.map.id !== mapId)) {
        const map = await getMap(mapId);
        if (Play.net !== net) return;
        Play.map = map;
        Play.board = makeBoard('play', map, { onRoute: Play.onRoute, onCity: Play.onCity, cityActive: () => !!Play.stationMode, homeLabelPx: Play.homeLabelPx, focus: Play.focus });
        if (S.tab === 'play') { $('#sub').textContent = map.name; sizeBoards(); }
      }
      if (snap.pub && snap.mySeat >= 0) {
        const v = window.TTROnlineGame.merge(snap.pub, snap.mine, snap.mySeat);
        const prev = S.play && S.play.online ? S.play : null;
        S.play = { me: snap.mySeat, state: Play.asState(v), view: v, online: true, race: prev ? prev.race : [], shownScores: prev ? prev.shownScores : false };
        Play.record();
        if (prev) for (const id in v.owner) if (prev.state.owner[id] == null && v.owner[id] !== snap.mySeat) Play.flashRoute(id);
        net.fxPrev = prev ? prev.state : null;
      } else if (S.play && S.play.online) S.play = null;
      if (S.tab === 'play') Play.render();
      // every player hears every move, from the difference between snapshots
      if (S.play && S.play.online) {
        if (net.fxPrev) Play.fx(net.fxPrev, S.play.state);
        else if (S.play.state.phase === 'setup' && S.tab === 'play' && !net.fxDealt) FX.play('shuffle');
        net.fxDealt = true; net.fxPrev = null;
      }
    },
    asState(v) { return window.TTROnlineGame.asState(v); },
    netEnd(msg) {
      if (!Play.net) return;
      Play.net = null; Play.netFlag(false); Play.gen++;
      if (S.play && S.play.online) S.play = null;
      closeSheet(true);
      if (msg) toast(msg);
      if (S.tab === 'play') Play.show();
    },
    async netLeave() {
      const net = Play.net; if (!net) return;
      toast('Leaving…');
      await net.room.leave();
      Play.netEnd();
    },
    confirmLeave() {
      const sh = openSheet(`<h2>Leave the room?</h2><p class="note">${Play.net && Play.net.snap && Play.net.snap.isHost ? 'Another player takes over as host, or the room closes.' : 'A computer takes your seat.'}</p><div class="acts"><button class="btn" data-x>Stay</button><button class="btn primary" data-ok>Leave</button></div>`);
      sh.querySelector('[data-x]').onclick = () => closeSheet();
      sh.querySelector('[data-ok]').onclick = () => { closeSheet(true); Play.netLeave(); };
    },
    renderLobby(panel) {
      Play.idle();
      const snap = Play.net.snap, map = Play.map;
      if (!snap || !snap.code || snap.status === 'joining') {
        panel.innerHTML = `<div class="sec">Online</div><p class="note">Connecting…</p><div class="row" style="margin-top:12px"><button class="btn" id="n-leave">Cancel</button></div>`;
        panel.querySelector('#n-leave').onclick = () => Play.netLeave();
        return;
      }
      const deck = map.ticketDecks.find(d => d.id === (snap.options || {}).deckId);
      const seats = snap.seats.map((x, i) => `<div class="row"><i style="width:14px;height:14px;border-radius:4px;background:${B.PLAYER[i]};flex:none"></i>
          <span class="grow">${x.kind === 'empty' ? '<span class="muted">Open seat</span>' : esc(x.name || (x.kind === 'computer' ? 'Computer' : 'Player'))}${i === snap.mySeat ? ' <span class="muted small">you</span>' : ''}</span>
          ${snap.isHost && i !== snap.mySeat && x.kind !== 'human' ? `<span class="seg" role="group"><button type="button" data-seat-k="${i}" data-k="empty" aria-pressed="${x.kind === 'empty'}">Friend</button><button type="button" data-seat-k="${i}" data-k="computer" aria-pressed="${x.kind === 'computer'}">Computer</button></span>`
            : `<span class="small muted">${x.kind === 'computer' ? 'computer' : x.kind === 'human' ? (x.online || i === snap.mySeat ? 'here' : 'away') : ''}</span>`}</div>`).join('');
      panel.innerHTML = `
        <div class="sec">Online room <button class="q" data-help="online" aria-label="About online play">?</button></div>
        <div class="code-big" aria-label="Room code">${esc(snap.code)}</div>
        <p class="note" style="text-align:center">${esc(map.name)}${deck && map.ticketDecks.length > 1 ? ' · ' + esc(deck.name) : ''} · friends tap Join and type this code</p>
        <div class="tlist" style="margin-top:10px">${seats}</div>
        <div class="row" style="margin-top:12px"><button class="btn" id="n-leave">Leave</button>${snap.isHost ? '<button class="btn primary grow" id="n-start">Start</button>' : '<span class="grow note">The host starts the game.</span>'}</div>
        ${snap.isHost ? '<p class="note">Open seats play as computers.</p>' : ''}`;
      Play.board.render({});
      panel.querySelector('#n-leave').onclick = () => Play.netLeave();
      const st = panel.querySelector('#n-start'); if (st) st.onclick = () => Play.net.room.start();
      panel.querySelectorAll('[data-seat-k]').forEach(b => b.onclick = () => Play.net.room.setSeat(+b.dataset.seatK, b.dataset.k));
    },
    nameField(id) {
      return `<input type="text" id="${id}" class="text" maxlength="16" autocomplete="nickname" placeholder="Your name" value="${esc(S.settings.netName || '')}">`;
    },
    takeName(sh, id) {
      const name = (sh.querySelector('#' + id).value || '').trim().slice(0, 16) || 'Player';
      S.settings.netName = name; save();
      return name;
    },
    onlineSheet() {
      const sh = openSheet(`<h2>Online</h2>
        <p class="note">Play ${esc(Play.map.name)} with friends on their own phones. Seats can be friends or computers.</p>
        <div class="acts"><button class="btn" data-x>Cancel</button><button class="btn" data-join>Join</button><button class="btn primary" data-host>Create room</button></div>`);
      sh.querySelector('[data-x]').onclick = () => closeSheet();
      sh.querySelector('[data-join]').onclick = () => Play.joinSheet();
      sh.querySelector('[data-host]').onclick = () => Play.hostSheet();
    },
    hostSheet() {
      const map = Play.map;
      let n = Math.min(map.players[1], 2), level = 'medium';
      const kinds = ['friend', 'friend', 'friend', 'friend'];
      const sh = openSheet(`<h2>Online room</h2><div class="sec">Name</div>${Play.nameField('n-name')}<div id="n-body"></div>
        <div class="acts"><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>Create</button></div>`);
      const draw = () => {
        sh.querySelector('#n-body').innerHTML = `
          <div class="sec">Players</div><span class="seg" role="group">${Array.from({ length: map.players[1] - 1 }, (_, i) => i + 2).map(k => `<button type="button" data-n="${k}" aria-pressed="${k === n}">${k}</button>`).join('')}</span>
          <div class="tlist" style="margin-top:8px">${Array.from({ length: n - 1 }, (_, i) => `<div class="row"><i style="width:14px;height:14px;border-radius:4px;background:${B.PLAYER[i + 1]};flex:none"></i><span class="grow">Seat ${i + 2}</span><span class="seg" role="group"><button type="button" data-s="${i}" data-k="friend" aria-pressed="${kinds[i] === 'friend'}">Friend</button><button type="button" data-s="${i}" data-k="computer" aria-pressed="${kinds[i] === 'computer'}">Computer</button></span></div>`).join('')}</div>
          ${kinds.slice(0, n - 1).includes('computer') ? `<div class="sec">Computers</div><span class="seg" role="group">${LEVELS.map(l => `<button type="button" data-l="${l}" aria-pressed="${level === l}">${LEVEL_NAME[l]}</button>`).join('')}</span>` : ''}`;
        sh.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { n = +b.dataset.n; draw(); });
        sh.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { kinds[+b.dataset.s] = b.dataset.k; draw(); });
        sh.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { level = b.dataset.l; draw(); });
      };
      draw();
      sh.querySelector('[data-x]').onclick = () => closeSheet();
      sh.querySelector('[data-ok]').onclick = async () => {
        const name = Play.takeName(sh, 'n-name');
        closeSheet(true);
        const room = await Play.netRoom();
        Play.render();
        const r = await room.createRoom({ name, seats: ['human'].concat(kinds.slice(0, n - 1).map(k => k === 'friend' ? 'empty' : 'computer')), options: { mapId: map.id, deckId: Play.setupDeck || map.ticketDecks[0].id, level, house: houseRules() } });
        if (!r.ok) Play.netEnd();
      };
    },
    joinSheet(code0) {
      const sh = openSheet(`<h2>Join a room</h2><div class="sec">Code</div><input type="text" id="n-code" class="text code-in" maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCDE" value="${esc(code0 || '')}">
        <div class="sec">Name</div>${Play.nameField('n-name')}
        <div class="acts"><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>Join</button></div>`);
      sh.querySelector('[data-x]').onclick = () => closeSheet();
      sh.querySelector('[data-ok]').onclick = async () => {
        const code = (sh.querySelector('#n-code').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length !== 5) return refuse('The code has 5 characters');
        const name = Play.takeName(sh, 'n-name');
        closeSheet(true);
        const room = await Play.netRoom();
        Play.render();
        const r = await room.joinRoom(code, name);
        if (!r.ok) { Play.netEnd(); Play.joinSheet(code); } // keep the code so a typo is easy to fix
      };
    },
    scores() {
      const p = S.play, s = p.state, map = Play.map, res = s.result;
      if (!res) return;
      const R = T.rules(s), deck = T.deckFor(map, s).tickets;
      const cols = [['Routes', 'routePts'], ['Tickets', 'ticketPts']];
      if (R.stations) cols.push(['Stations', 'stationPts']);
      if (R.longest) cols.push([map.id === 'europe' ? 'Express' : 'Longest', 'longestPts']);
      if (R.globetrotter) cols.push(['Globe', 'globePts']);
      if (R.mandala) cols.push(['Mandala', 'mandalaPts']);
      if (map.passengers) cols.push(['Passengers', 'paxPts']);
      const rows = res.order.map(i => res.rows[i]);
      const won = res.winner === p.me;
      const tied = (res.tied || [res.winner]).length > 1 ? res.tied : null; // level after every tie-break: a shared win
      const names = list => list.map(i => i === p.me ? 'you' : esc(s.players[i].name)).join(', ').replace(/, ([^,]*)$/, ' and $1');
      const head = tied ? 'Tie: ' + names(tied).replace(/^you/, 'You') : won ? 'You win!' : esc(s.players[res.winner].name) + ' wins';
      const sh = openSheet(`<h2>${head}</h2>
        <table class="scores"><tr><th>Player</th>${cols.map(c => `<th>${c[0]}</th>`).join('')}<th>Total</th></tr>
        ${rows.map((r, i) => `<tr class="${i === 0 || (tied && tied.includes(r.seat)) ? 'win' : ''}" data-seat="${r.seat}"><td>${esc(r.name)}${s.players[r.seat].level ? ' <span class="muted small">' + LEVEL_NAME[s.players[r.seat].level] + '</span>' : ''}</td>${cols.map(c => `<td data-k="${c[1]}">${r[c[1]]}</td>`).join('')}<td><b>${r.total}</b></td></tr>`).join('')}</table>
        <div class="sec">Score race</div>${Play.raceSVG(s, res)}
        <div class="sec">Tickets</div>
        ${rows.map(r => `<div class="small" style="margin-bottom:4px"><b style="color:${B.PLAYER[r.seat]}">${esc(r.name)}</b> ${r.tickets.map(x => `<span style="color:${x.ok ? 'var(--good)' : 'var(--bad)'}">${esc(ticketName(map, deck[x.t]))} ${x.pts >= 0 ? '+' : '−'}${Math.abs(x.pts)}</span>`).join(' · ')}</div>`).join('')}
        <div class="acts"><button class="btn" data-x>Close</button>${p.claims && p.claims.length ? '<button class="btn" data-replay>Replay</button>' : ''}<button class="btn primary" data-again>Play again</button></div>`);
      sh.querySelector('[data-x]').onclick = () => closeSheet();
      const rp = sh.querySelector('[data-replay]'); if (rp) rp.onclick = Play.startReplay;
      sh.querySelector('[data-again]').onclick = () => { closeSheet(true); if (p.online) return Play.netLeave(); Play.gen++; Play.setupMap = map.id; Play.setupDeck = s.deckId; Play.setupOpp = s.players.length - 1; Play.setupLevels = s.players.slice(1).map(q => q.level); S.play = null; save(); Play.render(); };
    },
  };

  // ======================================================================= LAB
  const Lab = {
    map: null, board: null,
    async show() {
      const map = await getMap(S.settings.labMap || 'usa');
      Lab.map = map;
      Lab.board = makeBoard('lab', map, { onRoute: Lab.onRoute, onCity: Lab.onCity, onEmpty: () => {} });
      $('#sub').textContent = map.name + ' · Route Lab';
      Lab.render();
      sizeBoards();
    },
    deck() { const m = Lab.map; return (m.ticketDecks.find(d => d.id === S.settings.labDeck) || m.ticketDecks[0]); },
    plain() { return plainDeck(Lab.map, Lab.deck().id); },
    render() {
      const map = Lab.map, L = S.lab, panel = $('#v-lab .panel');
      const deck = Lab.plain();
      const blocked = new Set((L.blocked || []).filter(id => G.index(map).routeById[id]));
      const cost = r => blocked.has(r.id) ? Infinity : r.len;
      const H = O.heat(map, deck);
      let body = '', boardOpts = { blocked };
      const top = `<div class="row wrap">${mapSelect('map', map.id)}${deckSelect(map, 'deck', Lab.deck().id)}</div>
        <div class="row" style="margin-top:8px"><span class="seg" role="group">${[['path', 'Path'], ['tickets', 'Tickets'], ['heat', 'Busy routes']].map(([k, t]) => `<button type="button" data-m="${k}" aria-pressed="${L.mode === k}">${t}</button>`).join('')}</span></div>`;
      if (L.mode === 'path') {
        const a = L.a && G.index(map).cityById[L.a] ? L.a : null, b = L.b && G.index(map).cityById[L.b] ? L.b : null;
        let res = '';
        if (a && b) {
          const sp = G.shortest(map, a, b, cost);
          if (sp) {
            const pts = sp.path.reduce((x, id) => x + T.routePoints(map, G.index(map).routeById[id].len), 0);
            // next-best paths: block one route of the best path at a time
            const alts = [];
            for (const id of sp.path) {
              const r = G.index(map).routeById[id];
              const alt = G.shortest(map, a, b, x => (x.id === id || x.id === r.twin) ? Infinity : cost(x));
              if (alt) alts.push({ via: id, dist: alt.dist, path: alt.path });
            }
            alts.sort((x, y) => x.dist - y.dist);
            const tk = deck.find(t => (t.a === a && t.b === b) || (t.a === b && t.b === a));
            res = `<div class="kv" style="margin-top:10px"><span>Trains</span><b>${sp.dist}</b><span>Route points</span><b>${pts}</b>${tk ? `<span>Ticket</span><b>${tk.pts}</b>` : ''}<span>Routes</span><b>${sp.path.length}</b></div>
              <div class="sec">If a route on it is taken <button class="q" data-help="detour" aria-label="About detours">?</button></div>
              <table class="lab-table"><tr><th>Taken</th><th>New total</th><th>Extra</th></tr>${sp.path.map(id => { const r = G.index(map).routeById[id]; const al = alts.find(x => x.via === id); return `<tr data-hl="${id}"><td>${esc(cityName(map, r.a))}–${esc(cityName(map, r.b))}</td><td>${al ? al.dist : '—'}</td><td style="color:${al ? (al.dist - sp.dist >= 4 ? 'var(--bad)' : al.dist - sp.dist >= 2 ? 'var(--accent-warm)' : 'var(--good)') : 'var(--bad)'}">${al ? '+' + (al.dist - sp.dist) : 'cut off'}</td></tr>`; }).join('')}</table>
              <p class="note">Tap a route on the map to block it and see the way around.</p>`;
            boardOpts.path = new Set(sp.path);
          } else res = '<p class="empty">No way through — unblock a route.</p>';
        }
        body = `<div class="sec">Shortest path</div>
          <div class="row"><select name="a" class="grow" aria-label="From">${cityOpts(map, a, 'From')}</select><select name="b" class="grow" aria-label="To">${cityOpts(map, b, 'To')}</select></div>
          <p class="note">${!a ? 'Tap a city on the map.' : !b ? 'Now tap the second city.' : ''}</p>${res}
          ${blocked.size ? `<div class="row" style="margin-top:8px"><span class="grow small muted">${blocked.size} blocked</span><button class="btn small" id="l-clear">Clear blocks</button></div>` : ''}`;
        boardOpts.selCities = [a, b].filter(Boolean);
        boardOpts.dimOthers = !!(a && b);
      } else if (L.mode === 'tickets') {
        const rows = deck.map((t, i) => {
          const sp = G.shortest(map, t.a, t.b, cost);
          const trains = sp ? sp.dist : Infinity;
          const rp = sp ? sp.path.reduce((x, id) => x + T.routePoints(map, G.index(map).routeById[id].len), 0) : 0;
          return { i, t, trains, rp, ppt: sp ? (t.pts + rp) / trains : 0, path: sp ? sp.path : [] };
        });
        const key = L.sort || 'ppt';
        rows.sort((x, y) => key === 'name' ? ticketName(map, x.t).localeCompare(ticketName(map, y.t)) : key === 'pts' ? y.t.pts - x.t.pts : key === 'trains' ? x.trains - y.trains : y.ppt - x.ppt);
        const sel = rows.find(r => r.i === L.ticket);
        body = `<div class="sec">${deck.length} tickets <button class="q" data-help="ppt" aria-label="About points per train">?</button></div>
          <table class="lab-table"><tr><th data-s="name">Ticket</th><th data-s="pts">Pts</th><th data-s="trains">Trains</th><th data-s="ppt">Per train</th></tr>
          ${rows.map(r => `<tr data-t="${r.i}"${r.i === L.ticket ? ' style="background:var(--card)"' : ''}><td>${esc(ticketName(map, r.t))}${r.t.long ? ' <span style="color:var(--accent-warm)">long</span>' : ''}</td><td>${ticketPts(r.t)}</td><td>${r.trains === Infinity ? '—' : r.trains}</td><td style="color:${r.ppt >= 2.2 ? 'var(--good)' : r.ppt >= 1.7 ? 'var(--accent-warm)' : 'var(--bad)'}">${r.ppt.toFixed(2)}</td></tr>`).join('')}</table>`;
        if (sel) { boardOpts.path = new Set(sel.path); boardOpts.endCities = [sel.t.a, sel.t.b]; boardOpts.dimOthers = true; }
      } else {
        const list = map.routes.slice().filter(r => !r.twin || r.lane === -1 || r.lane === -2).sort((x, y) => H.raw[y.id] - H.raw[x.id]).slice(0, 15);
        const selR = L.route && G.index(map).routeById[L.route];
        let detail = '';
        if (selR) {
          const d = O.detour(map, selR.id, blocked);
          const users = deck.filter(t => { const sp = G.shortest(map, t.a, t.b, r => r.len); return sp && sp.path.some(id => id === selR.id || id === selR.twin); });
          detail = `<div class="hint" style="margin-top:8px"><b>${esc(cityName(map, selR.a))}–${esc(cityName(map, selR.b))}</b> · ${selR.len} ${selR.color}${selR.twin ? ' (double)' : ''}<br>
            On the cheapest path of ${users.length} of ${deck.length} tickets. If taken: ${d ? '+' + d.extra + ' trains around' : 'the two cities are cut off'}.</div>`;
          if (d) boardOpts.path = new Set(d.path);
        }
        body = `<div class="sec">Most contested <button class="q" data-help="heat" aria-label="About busy routes">?</button></div>
          <div class="legend"><span>quiet</span><span class="grad"></span><span>busy</span></div>${detail}
          <table class="lab-table" style="margin-top:6px"><tr><th>Route</th><th>Tickets</th><th>If taken</th></tr>
          ${list.map(r => { const d = O.detour(map, r.id); return `<tr data-r="${r.id}"><td>${esc(cityName(map, r.a))}–${esc(cityName(map, r.b))}${r.twin ? ' ×2' : ''}</td><td>${Math.round(H.raw[r.id] * 10) / 10}</td><td style="color:${!d || d.extra >= 4 ? 'var(--bad)' : d.extra >= 2 ? 'var(--accent-warm)' : 'var(--good)'}">${d ? '+' + d.extra : 'cut off'}</td></tr>`; }).join('')}</table>`;
        boardOpts.heat = H.norm;
        boardOpts.sel = L.route;
      }
      panel.innerHTML = top + body;
      Lab.board.render(boardOpts);
      // events
      panel.querySelector('[name=map]').onchange = async e => { S.settings.labMap = e.target.value; S.settings.labDeck = null; S.lab.a = S.lab.b = null; S.lab.blocked = []; S.lab.route = null; S.lab.ticket = null; save(); await Lab.show(); };
      const dk = panel.querySelector('[name=deck]'); if (dk) dk.onchange = e => { S.settings.labDeck = e.target.value; save(); Lab.render(); };
      panel.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { L.mode = b.dataset.m; save(); Lab.render(); });
      const sa = panel.querySelector('[name=a]'); if (sa) sa.onchange = e => { L.a = e.target.value || null; save(); Lab.render(); };
      const sb = panel.querySelector('[name=b]'); if (sb) sb.onchange = e => { L.b = e.target.value || null; save(); Lab.render(); };
      const cl = panel.querySelector('#l-clear'); if (cl) cl.onclick = () => { L.blocked = []; save(); Lab.render(); };
      panel.querySelectorAll('[data-s]').forEach(th => th.onclick = () => { L.sort = th.dataset.s; save(); Lab.render(); });
      panel.querySelectorAll('[data-t]').forEach(tr => tr.onclick = () => { L.ticket = L.ticket === +tr.dataset.t ? null : +tr.dataset.t; save(); Lab.render(); });
      panel.querySelectorAll('[data-r]').forEach(tr => tr.onclick = () => { L.route = L.route === tr.dataset.r ? null : tr.dataset.r; save(); Lab.render(); });
      panel.querySelectorAll('[data-hl]').forEach(tr => tr.onclick = () => { Lab.toggleBlock(tr.dataset.hl); });
    },
    toggleBlock(id) {
      const L = S.lab; L.blocked = L.blocked || [];
      L.blocked = L.blocked.includes(id) ? L.blocked.filter(x => x !== id) : L.blocked.concat(id);
      save(); Lab.render();
    },
    onCity(id) {
      const L = S.lab;
      if (L.mode !== 'path') { L.mode = 'path'; L.a = id; L.b = null; }
      else if (!L.a || (L.a && L.b)) { L.a = id; L.b = null; }
      else if (id !== L.a) L.b = id;
      save(); Lab.render();
    },
    onRoute(id) {
      const L = S.lab;
      if (L.mode === 'heat') { L.route = L.route === id ? null : id; save(); Lab.render(); return; }
      if (L.mode === 'path') Lab.toggleBlock(id);
    },
  };
  function cityOpts(map, sel, label) {
    return `<option value="">${label}</option>` + map.cities.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  }

  // ======================================================================= strength note
  const Strength = {
    data: undefined,
    load() {
      if (Strength.data !== undefined) return Promise.resolve(Strength.data);
      return fetch('data/strength.json?v=' + VERSION).then(r => r.ok ? r.json() : null).catch(() => null).then(d => (Strength.data = d));
    },
    // head-to-head (2-player) results; compact = one line for the Play setup
    async note(el, mapId, compact) {
      if (!el) return;
      const d = await Strength.load();
      const m = d && d.maps && d.maps[mapId];
      if (!m) { el.innerHTML = ''; return; }
      const rows = Object.entries(m).filter(([k, r]) => r.players === 2 && k.split('-').length === 2).map(([k, r]) => {
        const [x, y] = k.split('-'), strong = (r.winPct[x] || 0) >= (r.winPct[y] || 0) ? x : y, weak = strong === x ? y : x;
        return { strong, weak, pct: Math.round(r.winPct[strong]), games: r.games };
      });
      if (compact) {
        el.innerHTML = `<p class="note">${rows.filter(r => r.strong !== 'hard' || r.weak !== 'easy').map(r => `${LEVEL_NAME[r.strong]} beats ${LEVEL_NAME[r.weak]} ${r.pct}%`).join(' · ')}</p>`;
        return;
      }
      el.innerHTML = `<table class="scores" style="margin-top:8px"><tr><th>Match-up</th><th>Stronger wins</th><th>Games</th></tr>${rows.map(r =>
        `<tr><td>${LEVEL_NAME[r.weak]} v ${LEVEL_NAME[r.strong]}</td><td>${LEVEL_NAME[r.strong]} ${r.pct}%</td><td>${r.games}</td></tr>`).join('')}</table>`;
    },
  };

  // ======================================================================= SETTINGS
  const Settings = {
    show() {
      $('#sub').textContent = 'Settings';
      const st = S.settings, panel = $('#v-settings .panel');
      panel.style.maxWidth = '640px'; panel.style.margin = '0 auto'; panel.style.width = '100%';
      panel.innerHTML = `
        <div class="sec">Play</div>
        <div class="setting"><span class="label">Computer speed</span><span class="seg" role="group">${['slow', 'normal', 'fast'].map(k => `<button type="button" data-speed="${k}" aria-pressed="${st.speed === k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</span></div>
        <div class="setting"><span class="label">Study mode<div class="note">Show computers' cards and tickets</div></span><label class="switch"><input type="checkbox" id="s-study" ${st.study ? 'checked' : ''}><span></span></label></div>
        <div class="setting"><span class="label">Colour-blind marks<div class="note">A shape for each colour on cards and map spaces</div></span><label class="switch"><input type="checkbox" id="s-cb" ${st.cb ? 'checked' : ''}><span></span></label></div>
        <div class="sec">Rules</div>
        ${window.COACH ? '<div class="row" style="margin:4px 0 8px"><button class="btn small" id="s-rules">Read the rules</button><button class="btn small" id="s-tour">Replay the guided game</button></div>' : ''}
        <div class="setting"><span class="label">Longest route bonus<div class="note">Off is a common house rule. Nordic and USA 1910 never use it.</div></span><label class="switch"><input type="checkbox" id="s-longest" ${st.longest !== false ? 'checked' : ''}><span></span></label></div>
        <div class="setting"><span class="label">Globetrotter bonus<div class="note">House rule: 15 for the most finished tickets (ties all), on maps without one.</div></span><label class="switch"><input type="checkbox" id="s-globe" ${st.globe ? 'checked' : ''}><span></span></label></div>
        <div class="setting"><span class="label">Face-up locomotive = 1 card<div class="note">House rule: take it and still draw a second card.</div></span><label class="switch"><input type="checkbox" id="s-freeloco" ${st.freeLocos ? 'checked' : ''}><span></span></label></div>
        <div class="setting"><span class="label">Both double tracks open<div class="note">House rule: with 2–3 players the second track of a double can be claimed too.</div></span><label class="switch"><input type="checkbox" id="s-doubles" ${st.doubles ? 'checked' : ''}><span></span></label></div>
        <p class="note" style="margin:2px 0 0">Rules switches apply to the next new game. The computers play by them too.</p>
        <div class="sec">Table</div>
        <div class="setting"><span class="label">Ticket privacy <button class="q" data-help="privacy" aria-label="About ticket privacy">?</button></span><span class="seg" role="group"><button type="button" data-priv="mine" aria-pressed="${st.privacy === 'mine'}">Just mine</button><button type="button" data-priv="pass" aria-pressed="${st.privacy === 'pass'}">Pass the phone</button></span></div>
        <div class="sec">Sound &amp; effects</div>
        <div id="s-fx"></div>
        <div class="sec">How strong are the computers? <button class="q" data-help="strength" aria-label="How strong">?</button></div>
        <div class="row"><span class="seg" role="group" style="flex-wrap:wrap;max-width:100%">${MAP_IDS.map(id => `<button type="button" data-sm="${id}" aria-pressed="${(Settings.sm || 'usa') === id}">${MAP_NAMES[id].split(' ')[0]}</button>`).join('')}</span></div>
        <div id="s-strength"></div>
        <div class="sec">About</div>
        <p class="note">Maps: USA (Classic, 1910, Big Cities, Mega Game tickets), Europe, Nordic Countries, India, Switzerland, Germany. Board drawings are our own; coastlines, lakes and borders come from Natural Earth (public domain). Every route, ticket and rule is checked in <a href="https://github.com/TimothyHadfield/ticket-to-ride/blob/main/docs/rules-check.md" target="_blank" rel="noopener">rules-check</a>. Ticket to Ride is a Days of Wonder game; this is an unofficial fan tool.</p>
        <div class="row" style="margin-top:10px"><button class="btn small" id="s-reset">Clear saved games</button><span class="grow"></span><span class="small muted">v${VERSION}</span></div>`;
      Strength.note($('#s-strength'), Settings.sm || 'usa');
      panel.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { st.speed = b.dataset.speed; save(); Settings.show(); });
      panel.querySelectorAll('[data-priv]').forEach(b => b.onclick = () => { st.privacy = b.dataset.priv; save(); Settings.show(); });
      panel.querySelectorAll('[data-sm]').forEach(b => b.onclick = () => { Settings.sm = b.dataset.sm; Settings.show(); });
      $('#s-study').onchange = e => { st.study = e.target.checked; save(); };
      $('#s-cb').onchange = e => { st.cb = e.target.checked; save(); applyCb(); };
      $('#s-longest').onchange = e => { st.longest = e.target.checked; save(); };
      $('#s-globe').onchange = e => { st.globe = e.target.checked; save(); };
      $('#s-freeloco').onchange = e => { st.freeLocos = e.target.checked; save(); };
      $('#s-doubles').onchange = e => { st.doubles = e.target.checked; save(); };
      if (window.COACH) { $('#s-rules').onclick = () => openRules(); $('#s-tour').onclick = () => Play.startTutorial(); }
      FX.renderSettings($('#s-fx')); // its Effects speed buttons use data-fxspeed, so they never touch Computer speed
      $('#s-reset').onclick = () => {
        const sh = openSheet(`<h2>Clear saved games?</h2><p class="note">The table game and the game against the computers are deleted.</p><div class="acts"><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>Clear</button></div>`);
        sh.querySelector('[data-x]').onclick = () => closeSheet();
        sh.querySelector('[data-ok]').onclick = () => { if (S.play && !S.play.online) Play.abandonGame(); Play.gen++; S.table = null; S.play = null; save(); closeSheet(); toast('Cleared'); };
      };
    },
  };

  const VIEWS = { table: Table, play: Play, lab: Lab, settings: Settings };

  // the same game open in two tabs: when one saves, the other takes that game instead of overwriting it later
  window.addEventListener('storage', e => {
    if (e.key !== KEY || !e.newValue) return;
    let d; try { d = JSON.parse(e.newValue); } catch (err) { return; }
    if (!d || typeof d !== 'object') return;
    S.table = d.table || null;
    if (!(S.play && S.play.online)) { S.play = d.play || null; Play.gen++; Play.busy = false; }
    if (d.settings) Object.assign(S.settings, d.settings);
    if (d.lab) Object.assign(S.lab, d.lab);
    if (S.tab === 'play' || S.tab === 'table') { closeSheet(true); VIEWS[S.tab].show(); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.tab === 'play') Play.pump(); });

  // ---------------------------------------------------------------- boot
  function applyCb() { B.cbMarks = !!S.settings.cb; document.body.classList.toggle('cb', B.cbMarks); }
  applyCb();
  // Animations off also stops the board's own claim pop
  const applyStill = () => document.body.classList.toggle('fx-still', !FX.settings.animations);
  FX.init({ game: 'ticket-to-ride', accent: '#6ea8fe', onChange: applyStill });
  applyStill();
  // My stats (shared _profile kit, everything stays on this device)
  if (window.Profile && window.TTRProfile) {
    const paintMe = () => { $('#me-btn').innerHTML = Profile.avatarSVG(Profile.avatar, 26) + '<span>My stats</span>'; };
    Profile.init({
      game: 'ticket-to-ride', levels: window.TTRProfile.LEVELS, achievements: window.TTRProfile.achievements(() => S.mapWins),
      modes: { help: { name: 'Computers, with help' }, online: { hide: true } },
      daily: { title: 'Daily game', onPlay: () => Play.startDaily() },
      onChange: what => { if (what === 'me' || what === 'import') paintMe(); },
    });
    paintMe();
    $('#me-btn').onclick = () => Profile.openPanel();
  } else { const b = $('#me-btn'); if (b) b.remove(); }
  // the guided first game: steps follow the game's own state; it steps aside on other tabs and under sheets
  if (window.COACH && window.TTRTutorial) {
    const tut = () => !!(S.play && S.play.tutorial);
    Play.tour = COACH.tour({
      id: 'ttr-first',
      steps: window.TTRTutorial.steps({
        state: () => (tut() ? S.play.state : null), me: () => (S.play ? S.play.me : 0),
        // the route the claim step points at: one I can pay for now, on the cheapest way of a kept ticket if there is one
        route: () => {
          if (!tut() || !Play.map || Play.map.id !== S.play.state.mapId) return null;
          const s = S.play.state, me = S.play.me, map = Play.map, deck = T.deckFor(map, s).tickets;
          const ok = map.routes.filter(r => s.owner[r.id] == null && T.canClaim(s, me, r.id) === null);
          const way = new Set();
          for (const i of s.players[me].tickets) { const t = deck[i], p = t && t.a && G.shortest(map, t.a, t.b, r => r.len); if (p) p.path.forEach(id => way.add(id)); }
          const green = ok.filter(x => x.color === 'green');
          const r = green.find(x => way.has(x.id)) || green[0] || ok.find(x => way.has(x.id)) || ok[0];
          return r ? r.id : null;
        },
      }),
      pauseIf: () => S.tab !== 'play' || !tut() || !!Play.replay || (!!sheetEl && sheetEl.dataset.kind !== 'tickets'),
    });
  }
  buildTabs();
  const start = (location.hash || '').slice(1);
  history.replaceState({ tab: TABS.some(t => t[0] === start) ? start : S.tab }, '', location.hash || '#' + S.tab);
  showTab(TABS.some(t => t[0] === start) ? start : S.tab, false);
  if (Play.tour && S.play && S.play.tutorial && S.play.state.phase !== 'over') Play.tour.resume(); // carry on after a reload
  // home-screen app (js/pwa.js, shared _pwa kit): a new deploy reloads by itself only when nothing would be lost
  if (window.PWA) window.PWA.safeToReload = () => {
    const ae = document.activeElement;
    if (Play.net || (S.play && S.play.online) || sheetEl || Play.busy) return false;
    if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return false;
    return S.tab === 'settings' || S.tab === 'lab' || !S.play || S.play.state.phase === 'over';
  };
  window.TTRApp = { S, Table, Play, Lab, save, closeSheet }; // for tests / debugging
})();
