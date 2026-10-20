// Ticket to Ride site: Table (real-table companion), Play (vs computers), Lab (route lab), Settings.
// One saved object in localStorage ('ttr:v1'); every change saves at once.
(function () {
  'use strict';
  const T = window.TTR, G = window.TTRGraph, AI = window.TTRAI, O = window.TTROdds, B = window.Board;
  const VERSION = '1.0';
  const MAP_IDS = ['usa', 'europe', 'nordic', 'india'];
  const MAP_NAMES = { usa: 'USA', europe: 'Europe', nordic: 'Nordic Countries', india: 'India' };
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
    d.tab = d.tab || 'table';
    d.settings = Object.assign({ speed: 'normal', study: false, privacy: 'mine', labMap: 'usa', labDeck: null }, d.settings || {});
    d.table = d.table || null;
    d.play = d.play || null;
    d.lab = Object.assign({ mode: 'path', a: null, b: null, blocked: [], sort: 'ppt' }, d.lab || {});
    return d;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full or blocked: keep going */ } }

  // ---------------------------------------------------------------- maps
  const mapCache = {};
  function getMap(id) {
    if (mapCache[id]) return Promise.resolve(mapCache[id]);
    return fetch('maps/' + id + '.json?v=' + VERSION).then(r => { if (!r.ok) throw new Error('map ' + id); return r.json(); })
      .then(m => { mapCache[id] = T.register(m); return m; });
  }
  const cityName = (map, id) => G.index(map).cityById[id].name;
  const ticketName = (map, t) => cityName(map, t.a) + ' – ' + cityName(map, t.b);

  // ---------------------------------------------------------------- shell: tabs, sheets, toasts
  const TABS = [['table', 'Table', 'i-table'], ['play', 'Play', 'i-play'], ['lab', 'Lab', 'i-lab'], ['settings', 'Settings', 'i-gear']];
  function buildTabs() {
    const html = TABS.map(([id, label, icon]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="false"><svg aria-hidden="true"><use href="#${icon}"/></svg><span>${label}</span></button>`).join('');
    $('#tabbar').innerHTML = html; $('#toptabs').innerHTML = html;
    document.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab, true); });
    window.addEventListener('popstate', e => { const t = (e.state && e.state.tab) || 'table'; showTab(t, false); });
  }
  function showTab(id, push) {
    if (!TABS.some(t => t[0] === id)) id = 'table';
    S.tab = id; save();
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + id));
    if (push) history.pushState({ tab: id }, '', '#' + id); // Back returns to the previous tab
    closeSheet(true);
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
      if (wide) { wrap.style.height = ''; b.ready(); continue; }
      if (!wrap.style.height) wrap.style.height = '200px'; // on screen so it can be measured
      const box = b.ready();
      const W = v.clientWidth || window.innerWidth;
      const maxH = Math.round((v.clientHeight || window.innerHeight) * (id === 'lab' ? 0.56 : 0.52));
      wrap.style.height = Math.min(Math.round(W * box.h / box.w), maxH) + 'px';
    }
  }
  window.addEventListener('resize', sizeBoards);
  function makeBoard(id, map, handlers) {
    if (boards[id]) { boards[id].setMap(map); Object.assign(boards[id].handlers, handlers); return boards[id]; }
    const wrap = $('#v-' + id + ' .board-wrap');
    const h = Object.assign({}, handlers);
    const b = B.create(wrap, map, { onRoute: r => h.onRoute && h.onRoute(r), onCity: c => h.onCity && h.onCity(c), onEmpty: () => h.onEmpty && h.onEmpty() });
    b.handlers = h;
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
    return `<div class="tcard ${cls || ''}${n === 0 ? ' zero' : ''}" data-color="${color}" title="${color === 'loco' ? 'Locomotive' : color}">${window.Cards.svg(color)}${n != null ? `<span class="n">${n}</span>` : ''}</div>`;
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
    return `<button type="button" class="${cls}" ${extra || ''}><span class="cities">${esc(ticketName(map, t))}</span><span class="pts">${t.pts}</span><span class="info">${status}</span>${bar}</button>`;
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
      Table.board = makeBoard('table', map, { onRoute: Table.onRoute, onCity: Table.onCity, onEmpty: () => { Table.sel = null; Table.render(); } });
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
      const myTickets = (tb.tickets[viewer] || []).map(i => deck[i]);
      const pos = {
        owner: tb.claims, me: viewer, bothDoubles, myTrains: trainsLeft[viewer],
        rivalTrains: trainsLeft.filter((_, s) => s !== viewer), tickets: myTickets, deckTickets: deck,
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
      panel.querySelector('[name=map]').onchange = async e => { Table.setupMap = e.target.value; Table.setupDeck = null; await Table.show(); };
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
        save(); Table.render();
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
        save(); Table.render();
        toast('Removed ' + cityName(map, r.a) + '–' + cityName(map, r.b), Table.undo);
        return;
      }
      const why = T.routeOpen({ owner: tb.claims, players: tb.players, mapId: map.id, deckId: tb.deckId }, r, seat);
      if (why === 'own twin') return toast(tb.players[seat].name + ' already has the other track');
      if (why === 'double closed') return toast('With ' + tb.players.length + ' players only one of the two tracks is used');
      const trains = map.trains - Object.entries(tb.claims).filter(([, o]) => o === seat).reduce((a, [rid]) => a + G.index(map).routeById[rid].len, 0);
      if (trains < r.len) return toast(tb.players[seat].name + ' has only ' + trains + ' trains');
      tb.claims[id] = seat;
      tb.history.push({ type: 'claim', id, seat });
      save(); Table.render();
      toast(tb.players[seat].name + ' +' + T.routePoints(map, r.len) + ' · ' + cityName(map, r.a) + '–' + cityName(map, r.b), Table.undo);
    },
    onCity(id) {
      const tb = S.table, map = Table.map;
      if (!tb || tb.mapId !== map.id || tb.mode !== 'station') return;
      tb.stations = tb.stations || {};
      if (tb.stations[id] != null) { tb.history.push({ type: 'unstation', id, seat: tb.stations[id] }); delete tb.stations[id]; save(); Table.render(); return; }
      const used = Object.values(tb.stations).filter(o => o === tb.active).length;
      if (used >= map.stations) return toast('No stations left');
      tb.stations[id] = tb.active;
      tb.history.push({ type: 'station', id, seat: tb.active });
      save(); Table.render();
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
      save(); Table.render();
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
      const R = deck.findIndex(() => true) >= 0 ? (T.deckFor(map, { deckId: tb.deckId }).draw || map.draw) : map.draw;
      const max = advise ? R.deal : 99;
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
      save(); Table.render();
    },
    advise(seat, drawnIdx) {
      const tb = S.table, map = Table.map, deck = T.deckFor(map, { deckId: tb.deckId }).tickets;
      const n = tb.players.length;
      const trainsLeft = tb.players.map((_, s) => map.trains - Object.entries(tb.claims).filter(([, o]) => o === s).reduce((a, [id]) => a + G.index(map).routeById[id].len, 0));
      const pos = { owner: tb.claims, me: seat, bothDoubles: n >= map.bothDoublesFrom, myTrains: trainsLeft[seat], rivalTrains: trainsLeft.filter((_, s) => s !== seat), tickets: (tb.tickets[seat] || []).map(i => deck[i]), deckTickets: deck };
      const first = !(tb.tickets[seat] || []).length;
      const R = T.deckFor(map, { deckId: tb.deckId });
      const min = Math.min(drawnIdx.length, first ? (R.setup || map.setup).keep : (R.draw || map.draw).keep);
      const adv = O.keepAdvice(map, pos, drawnIdx.map(i => deck[i]), min);
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
        mapId: map.id, deckId: tb.deckId, options: {}, owner: tb.claims, stationAt: tb.stations || {},
        players: tb.players.map((p, seat) => ({
          name: p.name, routes: Object.keys(tb.claims).filter(id => tb.claims[id] === seat), tickets: tb.tickets[seat] || [],
          stationCities: Object.keys(tb.stations || {}).filter(c => tb.stations[c] === seat),
          stations: map.stations - Object.values(tb.stations || {}).filter(o => o === seat).length,
        })),
      };
      const res = T.score(s);
      const R = T.rules(s);
      const rows = res.order.map(seat => res.rows[seat]);
      const cols = [['Routes', 'routePts'], ['Tickets', 'ticketPts']];
      if (R.stations) cols.push(['Stations', 'stationPts']);
      if (R.longest) cols.push([map.id === 'europe' ? 'Express' : 'Longest', 'longestPts']);
      if (R.globetrotter) cols.push(['Globe', 'globePts']);
      if (R.mandala) cols.push(['Mandala', 'mandalaPts']);
      const missing = S.settings.privacy === 'mine' ? '<p class="note">Only your tickets are in the app, so rivals\' ticket points are missing. Use "Pass the phone" in Settings to count everyone.</p>' : '';
      const sh = openSheet(`<h2>Final score</h2>
        <table class="scores"><tr><th>Player</th>${cols.map(c => `<th>${c[0]}</th>`).join('')}<th>Total</th></tr>
        ${rows.map((r, i) => `<tr class="${i === 0 ? 'win' : ''}"><td>${esc(r.name)}</td>${cols.map(c => `<td>${r[c[1]]}</td>`).join('')}<td><b>${r.total}</b></td></tr>`).join('')}</table>
        <p class="note">${map.id === 'europe' ? 'European Express' : 'Longest route'}: ${rows.map(r => esc(r.name) + ' ' + r.longest).join(' · ')}</p>${missing}
        <div class="acts"><button class="btn" data-x>Close</button></div>`);
      sh.querySelector('[data-x]').onclick = () => closeSheet();
    },
  };

  // ======================================================================= PLAY (vs computer)
  const Play = {
    map: null, board: null, busy: false, gen: 0, hint: null, stationMode: false,
    me() { return S.play ? S.play.me : 0; },
    async show() {
      const p = S.play;
      const mapId = p ? p.state.mapId : (Play.setupMap || 'usa');
      const map = await getMap(mapId);
      Play.map = map;
      Play.board = makeBoard('play', map, { onRoute: Play.onRoute, onCity: Play.onCity });
      $('#sub').textContent = map.name;
      Play.render();
      sizeBoards();
      Play.pump();
    },
    render() {
      const panel = $('#v-play .panel'), map = Play.map;
      const p = S.play;
      if (!p || p.state.mapId !== map.id) return Play.renderSetup(panel);
      const s = p.state, me = p.me;
      const v = T.view(s, me);
      const study = S.settings.study;
      const legal = T.legal(s, me);
      const myTurn = s.turn === me && s.phase === 'main';
      const deck = T.deckFor(map, s).tickets;
      const pl = s.players[me];
      // chips
      const chips = s.players.map((q, i) => chip(i, q.name, T.liveRoutePoints(s, i),
        `${q.trains} trains · ${T.handSize(q.hand)} cards`, false, s.turn === i && s.phase !== 'over')).join('');
      // status
      let status = '';
      if (s.phase === 'over') status = 'Game over';
      else if (s.phase === 'setup') status = pl.pending ? 'Choose your starting tickets' : 'Waiting for the others…';
      else if (s.pendingTunnel && s.turn === me) status = 'Tunnel: pay ' + s.pendingTunnel.extra + ' more?';
      else if (myTurn && pl.pending) status = 'Choose tickets to keep';
      else if (myTurn && s.drew) status = 'Take your second card';
      else if (myTurn) status = Play.stationMode ? 'Tap a city for your station' : 'Your turn';
      else status = esc(s.players[s.turn].name) + ' is playing…';
      if (s.lastRound != null && s.phase !== 'over') status += ' · last round';
      // odds for my tickets
      const pos = Play.pos(s, me);
      const odds = pl.tickets.length ? O.ticketChances(map, Object.assign(pos, { tickets: pl.tickets.map(i => deck[i]), myCards: T.handSize(pl.hand) })) : { tickets: [] };
      Play.lastOdds = odds;
      const market = s.faceUp.map((c, i) => c ? `<button type="button" class="tcard face" data-face="${i}" aria-label="Take ${c === 'loco' ? 'locomotive' : c}">${window.Cards.svg(c)}</button>` : '<div class="tdeck">—</div>').join('');
      const hand = T.COLORS.concat('loco').map(c => cardHTML(c, pl.hand[c])).join('');
      const studyHTML = study ? s.players.map((q, i) => i === me ? '' : `<div class="small" style="margin-top:6px"><b style="color:${B.PLAYER[i]}">${esc(q.name)}</b> <span class="muted">${LEVEL_NAME[q.level] || ''}</span> · ${T.COLORS.concat('loco').filter(c => q.hand[c]).map(c => `<span class="pip" style="background:${B.COLOR[c]};vertical-align:middle"></span>${q.hand[c]}`).join(' ')}<br>${q.tickets.map(t => esc(ticketName(map, deck[t])) + ' ' + deck[t].pts + (G.connected(map, q.routes, deck[t].a, deck[t].b) ? ' ✓' : '')).join(' · ') || 'no tickets'}</div>`).join('') : '';
      const logLines = s.log.slice(-4).reverse().map(l => `<div>${esc(l.text)}</div>`).join('');
      panel.innerHTML = `
        <div class="players">${chips}</div>
        <div class="status" style="margin-top:8px"><span class="dot" style="background:${B.PLAYER[s.turn]}"></span><span class="grow">${status}</span>
          ${s.phase === 'main' && myTurn ? '<button class="btn small" id="p-hint">Hint</button>' : ''}
          ${s.phase === 'over' ? '<button class="btn small primary" id="p-score">Scores</button>' : ''}</div>
        ${Play.hint ? `<div class="hint" style="margin-top:6px">${esc(Play.hint)}</div>` : ''}
        <div class="sec" style="margin-top:10px">Cards</div>
        <div class="market">${market}
          <button type="button" class="tdeck" id="p-deck" ${legal.includes('draw') ? '' : 'disabled'}><b>${s.trainDeck.length}</b>deck</button>
          <button type="button" class="tdeck" id="p-tix" ${legal.includes('drawTickets') ? '' : 'disabled'}><b>${s.ticketDeck.length}</b>tickets</button></div>
        <div class="sec">My hand · ${pl.trains} trains${map.stations ? ' · ' + pl.stations + ' stations' : ''}</div>
        <div class="hand">${hand}</div>
        <div class="small muted" style="margin-top:6px">${Play.unseenHTML(s, me)} <button class="q" data-help="unseen" aria-label="About unseen cards">?</button></div>
        <div class="small muted" style="margin-top:4px">Longest: ${s.players.map((q, i) => `<b style="color:${B.PLAYER[i]}">${G.longestTrail(map, q.routes).len}</b>`).join(' · ')} <button class="q" data-help="longest" aria-label="About longest route">?</button></div>
        ${map.stations && myTurn && !s.drew && pl.stations > 0 ? `<div class="row" style="margin-top:8px"><button class="btn small${Play.stationMode ? ' warm' : ''}" id="p-station">${Play.stationMode ? 'Cancel station' : 'Build a station (' + T.stationCost(s, me) + ' cards)'}</button><button class="q" data-help="stations" aria-label="About stations">?</button></div>` : ''}
        <div class="sec">My tickets <button class="q" data-help="chance" aria-label="About chance">?</button></div>
        <div class="tlist">${odds.tickets.map((x, i) => ticketRow(map, x.t, x, `data-tix="${i}"`)).join('') || '<div class="empty">None yet.</div>'}</div>
        ${study ? `<div class="sec">Study: computers' hands</div>${studyHTML}` : ''}
        <div class="sec">Log</div><div class="log">${logLines}</div>
        <div class="row" style="margin-top:10px"><button class="btn small" id="p-new">New game</button></div>`;
      const tix = Play.sel != null && odds.tickets[Play.sel];
      Play.board.render({
        owner: s.owner, stations: s.stationAt,
        path: new Set(tix ? tix.path : Play.hintRoute ? [Play.hintRoute] : []),
        endCities: tix ? [tix.t.a, tix.t.b] : [], sel: Play.hintRoute,
        highlight: new Set(Play.flash ? [Play.flash] : []),
      });
      // events
      panel.querySelectorAll('[data-face]').forEach(b => b.onclick = () => Play.act({ type: 'draw', from: +b.dataset.face }));
      panel.querySelectorAll('.players [data-seat]').forEach(b => b.onclick = () => { const i = +b.dataset.seat; if (i !== me) Play.guess(i); });
      const on = (id, f) => { const e = panel.querySelector(id); if (e) e.onclick = f; };
      on('#p-deck', () => Play.act({ type: 'draw', from: 'deck' }));
      on('#p-tix', () => Play.act({ type: 'drawTickets' }));
      on('#p-hint', Play.showHint);
      on('#p-score', Play.scores);
      on('#p-new', () => { if (S.play && S.play.state.phase !== 'over') { Play.confirmNew(); } else { S.play = null; save(); Play.render(); } });
      on('#p-station', () => { Play.stationMode = !Play.stationMode; Play.render(); });
      panel.querySelectorAll('[data-tix]').forEach(b => b.onclick = () => { Play.sel = Play.sel === +b.dataset.tix ? null : +b.dataset.tix; Play.render(); });
      // sheets that the state demands
      if (pl.pending && (s.phase === 'setup' || myTurn) && !sheetEl) Play.ticketSheet();
      if (s.pendingTunnel && s.turn === me && !sheetEl) Play.tunnelSheet();
      if (s.phase === 'over' && !p.shownScores && !sheetEl) { p.shownScores = true; save(); Play.scores(); }
    },
    // score race: route points after every turn
    record() {
      const p = S.play; if (!p) return;
      const s = p.state; p.race = p.race || [];
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
      const deck = T.deckFor(map, s).tickets, mine = new Set(s.players[me].tickets);
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
      const real = S.settings.study ? new Set(q.tickets) : null;
      const sh = openSheet(`<h2>${esc(q.name)}'s likely tickets <button class="q" data-help="guess" aria-label="About the guess">?</button></h2>
        <p class="note">${q.tickets.length} ticket${q.tickets.length === 1 ? '' : 's'} held · ${q.routes.length} routes claimed</p>
        ${top.length ? `<table class="lab-table" style="margin-top:8px"><tr><th>Ticket</th><th>Pts</th><th>Built</th></tr>${top.map(r => `<tr><td>${esc(ticketName(map, r.t))}${real && real.has(r.i) ? ' <span style="color:var(--good)">holds</span>' : ''}</td><td>${r.t.pts}</td><td style="color:${r.share >= 0.75 ? 'var(--bad)' : r.share >= 0.4 ? 'var(--accent-warm)' : 'var(--muted)'}">${r.done ? 'done' : pct(r.share)}</td></tr>`).join('')}</table>` : '<p class="empty">No track yet, so no clues.</p>'}
        <div class="acts"><button class="btn" data-x>Close</button></div>`);
      sh.querySelector('[data-x]').onclick = () => closeSheet();
    },
    pos(s, me) {
      const map = Play.map;
      return {
        owner: s.owner, me, bothDoubles: T.rules(s).bothDoubles, myTrains: s.players[me].trains,
        rivalTrains: s.players.filter((_, i) => i !== me).map(q => q.trains), deckTickets: T.deckFor(map, s).tickets,
        stationCities: s.players[me].stationCities, tickets: [],
      };
    },
    confirmNew() {
      const sh = openSheet(`<h2>Leave this game?</h2><p class="note">It can't be resumed.</p><div class="acts"><button class="btn" data-x>Keep playing</button><button class="btn primary" data-ok>New game</button></div>`);
      sh.querySelector('[data-x]').onclick = () => closeSheet();
      sh.querySelector('[data-ok]').onclick = () => { closeSheet(true); Play.gen++; S.play = null; save(); Play.render(); };
    },
    renderSetup(panel) {
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
        <div class="row" style="margin-top:12px"><button class="btn primary grow" id="p-start">Start</button></div>`;
      Play.board.render({});
      Strength.note($('#p-strength'), map.id);
      panel.querySelector('[name=map]').onchange = async e => { Play.setupMap = e.target.value; Play.setupDeck = null; await Play.show(); };
      const dk = panel.querySelector('[name=deck]'); if (dk) dk.onchange = e => { Play.setupDeck = e.target.value; };
      panel.querySelectorAll('[data-opp]').forEach(b => b.onclick = () => { Play.setupOpp = +b.dataset.opp; Play.renderSetup(panel); });
      panel.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { levels[+b.dataset.lv] = b.dataset.l; Play.setupLevels = levels; Play.renderSetup(panel); });
      panel.querySelector('#p-start').onclick = () => {
        const seats = [{ name: 'You', kind: 'human' }].concat(Array.from({ length: k }, (_, i) => ({ name: PNAME[i + 1], kind: 'cpu', level: levels[i] })));
        const state = T.newGame(map, { seed: (Math.random() * 2 ** 31) >>> 0, deckId: Play.setupDeck || map.ticketDecks[0].id, seats });
        S.play = { me: 0, state };
        Play.gen++; Play.hint = null; Play.sel = null; Play.stationMode = false;
        save(); Play.render(); Play.pump();
      };
    },
    act(a) {
      const p = S.play; if (!p) return;
      const s = p.state, me = p.me;
      a.seat = me;
      try {
        const before = s;
        p.state = T.apply(s, a); Play.record();
        Play.hint = null; Play.hintRoute = null;
        if (a.type === 'claim' || a.type === 'station') Play.stationMode = false;
        if (a.type === 'claim' && p.state.owner[a.route] === me) Play.flashRoute(a.route);
        if (a.type === 'draw' && typeof a.from === 'number') Play.flyCard(before.faceUp[a.from], a.from);
        save(); Play.render(); Play.pump();
      } catch (e) {
        if (e.rule) toast(e.message.charAt(0).toUpperCase() + e.message.slice(1)); else { console.error(e); toast('Something went wrong'); }
      }
    },
    flashRoute(id) { Play.flash = id; clearTimeout(Play.flashT); Play.flashT = setTimeout(() => { Play.flash = null; if (S.tab === 'play') Play.render(); }, 1400); },
    flyCard(color, idx) {
      // a face-up card glides down into the hand
      const from = document.querySelector(`[data-face="${idx}"]`), to = document.querySelector(`.hand [data-color="${color}"]`);
      if (!from || !to) return;
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      const f = document.createElement('div'); f.className = 'tcard fly'; f.innerHTML = window.Cards.svg(color);
      Object.assign(f.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
      document.body.appendChild(f);
      requestAnimationFrame(() => { f.style.transform = `translate(${b.left - a.left}px,${b.top - a.top}px) scale(${b.width / a.width})`; f.style.opacity = '.2'; });
      setTimeout(() => f.remove(), 480);
    },
    // computers move one action at a time, with a pause so you can follow
    pump() {
      const p = S.play; if (!p || Play.busy) return;
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
        if (S.tab === 'play') Play.render();
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
      if (s.drew) return toast('Take your second card first');
      const why = T.canClaim(s, me, id);
      if (why) return toast(label + ': ' + why);
      const opts = T.payOptions(s, me, id);
      if (opts.length === 1) return Play.confirmClaim(id, opts);
      Play.confirmClaim(id, opts);
    },
    confirmClaim(id, opts) {
      const map = Play.map, r = G.index(map).routeById[id];
      const sh = openSheet(`<h2>${esc(cityName(map, r.a))} – ${esc(cityName(map, r.b))}</h2>
        <p class="note">${r.len} trains · +${T.routePoints(map, r.len)} points${r.kind === 'tunnel' ? ' · tunnel: 3 cards are turned over and each match costs one more' : ''}${r.locos ? ' · needs ' + r.locos + ' locomotive' + (r.locos > 1 ? 's' : '') : ''}</p>
        <div class="paylist">${opts.map((o, i) => `<button type="button" class="payopt" data-o="${i}">${o.n ? `<span class="pip" style="background:${B.COLOR[o.color]}"></span>${o.n} ${o.color}` : ''}${o.n && o.locos ? ' + ' : ''}${o.locos ? `<span class="pip" style="background:${B.COLOR.loco}"></span>${o.locos} locomotive${o.locos > 1 ? 's' : ''}` : ''}</button>`).join('')}</div>
        <div class="acts"><button class="btn" data-x>Cancel</button></div>`);
      sh.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { closeSheet(true); Play.act({ type: 'claim', route: id, pay: opts[+b.dataset.o] }); });
      sh.querySelector('[data-x]').onclick = () => closeSheet();
    },
    onCity(id) {
      const p = S.play; if (!p || !Play.stationMode) return;
      const s = p.state, me = p.me, map = Play.map;
      const cost = T.stationCost(s, me), h = s.players[me].hand;
      if (s.stationAt[id] != null) return toast('That city already has a station');
      const opts = [];
      for (const c of T.COLORS) if (h[c]) { const n = Math.min(h[c], cost); if (cost - n <= h.loco) opts.push({ color: c, n, locos: cost - n }); }
      if (h.loco >= cost) opts.push({ color: null, n: 0, locos: cost });
      if (!opts.length) return toast('A station costs ' + cost + ' cards of one colour');
      const sh = openSheet(`<h2>Station in ${esc(cityName(map, id))}</h2><p class="note">Lets you use one rival route into this city for your tickets.</p>
        <div class="paylist">${opts.map((o, i) => `<button type="button" class="payopt" data-o="${i}">${o.n ? `<span class="pip" style="background:${B.COLOR[o.color]}"></span>${o.n} ${o.color}` : ''}${o.n && o.locos ? ' + ' : ''}${o.locos ? `<span class="pip" style="background:${B.COLOR.loco}"></span>${o.locos} loco` : ''}</button>`).join('')}</div>
        <div class="acts"><button class="btn" data-x>Cancel</button></div>`);
      sh.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { closeSheet(true); Play.act({ type: 'station', city: id, pay: opts[+b.dataset.o] }); });
      sh.querySelector('[data-x]').onclick = () => closeSheet();
    },
    ticketSheet() {
      const p = S.play, s = p.state, me = p.me, map = Play.map, pl = s.players[me];
      const deck = T.deckFor(map, s).tickets;
      const drawn = pl.pending.tickets, min = Math.min(pl.pending.min, drawn.length);
      const pos = Object.assign(Play.pos(s, me), { tickets: pl.tickets.map(i => deck[i]), myCards: T.handSize(pl.hand) });
      const adv = O.keepAdvice(map, pos, drawn.map(i => deck[i]), min);
      let keep = S.settings.study || Play.wantHint ? adv.best.map(k => drawn[k]) : [];
      const sh = openSheet(`<h2>Choose tickets <button class="q" data-help="keep" aria-label="About keep or toss">?</button></h2>
        <p class="note">Keep at least ${min}. Numbers: trains more, chance, value.</p>
        <div class="tlist" id="pk" style="margin-top:8px"></div>
        <div class="acts"><button class="btn" data-best>Best set</button><button class="btn primary" data-ok>Keep</button></div>`, null);
      sh.dataset.modal = '1';
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
      const a = AI.choose(T.view(s, me), me, 'hard');
      Play.hint = 'Hint: ' + AI.explain(T.view(s, me), me, a) + (a && a.why ? ' — ' + a.why : '');
      Play.hintRoute = a && a.type === 'claim' ? a.route : null;
      Play.render();
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
      const rows = res.order.map(i => res.rows[i]);
      const won = res.winner === p.me;
      const sh = openSheet(`<h2>${won ? 'You win!' : esc(s.players[res.winner].name) + ' wins'}</h2>
        <table class="scores"><tr><th>Player</th>${cols.map(c => `<th>${c[0]}</th>`).join('')}<th>Total</th></tr>
        ${rows.map((r, i) => `<tr class="${i === 0 ? 'win' : ''}"><td>${esc(r.name)}${s.players[r.seat].level ? ' <span class="muted small">' + LEVEL_NAME[s.players[r.seat].level] + '</span>' : ''}</td>${cols.map(c => `<td>${r[c[1]]}</td>`).join('')}<td><b>${r.total}</b></td></tr>`).join('')}</table>
        <div class="sec">Score race</div>${Play.raceSVG(s, res)}
        <div class="sec">Tickets</div>
        ${rows.map(r => `<div class="small" style="margin-bottom:4px"><b style="color:${B.PLAYER[r.seat]}">${esc(r.name)}</b> ${r.tickets.map(x => `<span style="color:${x.ok ? 'var(--good)' : 'var(--bad)'}">${esc(ticketName(map, deck[x.t]))} ${x.ok ? '+' : '−'}${deck[x.t].pts}</span>`).join(' · ')}</div>`).join('')}
        <div class="acts"><button class="btn" data-x>Close</button><button class="btn primary" data-again>Play again</button></div>`);
      sh.querySelector('[data-x]').onclick = () => closeSheet();
      sh.querySelector('[data-again]').onclick = () => { closeSheet(true); Play.gen++; Play.setupMap = map.id; Play.setupDeck = s.deckId; Play.setupOpp = s.players.length - 1; Play.setupLevels = s.players.slice(1).map(q => q.level); S.play = null; save(); Play.render(); };
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
    render() {
      const map = Lab.map, L = S.lab, panel = $('#v-lab .panel');
      const deck = Lab.deck().tickets;
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
          ${rows.map(r => `<tr data-t="${r.i}"${r.i === L.ticket ? ' style="background:var(--card)"' : ''}><td>${esc(ticketName(map, r.t))}${r.t.long ? ' <span style="color:var(--accent-warm)">long</span>' : ''}</td><td>${r.t.pts}</td><td>${r.trains === Infinity ? '—' : r.trains}</td><td style="color:${r.ppt >= 2.2 ? 'var(--good)' : r.ppt >= 1.7 ? 'var(--accent-warm)' : 'var(--bad)'}">${r.ppt.toFixed(2)}</td></tr>`).join('')}</table>`;
        if (sel) { boardOpts.path = new Set(sel.path); boardOpts.endCities = [sel.t.a, sel.t.b]; boardOpts.dimOthers = true; }
      } else {
        const list = map.routes.slice().filter(r => !r.twin || r.lane === -1).sort((x, y) => H.raw[y.id] - H.raw[x.id]).slice(0, 15);
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
    async note(el, mapId) {
      if (!el) return;
      const d = await Strength.load();
      const m = d && d.maps && d.maps[mapId];
      if (!m) { el.innerHTML = ''; return; }
      const rows = Object.entries(m).filter(([k]) => k.split(' v ').length === 2);
      el.innerHTML = `<table class="scores" style="margin-top:8px"><tr><th>Match-up</th><th>Stronger wins</th><th>Games</th></tr>${rows.map(([k, r]) => {
        const [x, y] = k.split(' v ');
        const strong = (r.winPct[x] || 0) >= (r.winPct[y] || 0) ? x : y;
        return `<tr><td>${LEVEL_NAME[x] || x} v ${LEVEL_NAME[y] || y}</td><td>${LEVEL_NAME[strong] || strong} ${Math.round(r.winPct[strong])}%</td><td>${r.games}</td></tr>`;
      }).join('')}</table>`;
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
        <div class="sec">Table</div>
        <div class="setting"><span class="label">Ticket privacy <button class="q" data-help="privacy" aria-label="About ticket privacy">?</button></span><span class="seg" role="group"><button type="button" data-priv="mine" aria-pressed="${st.privacy === 'mine'}">Just mine</button><button type="button" data-priv="pass" aria-pressed="${st.privacy === 'pass'}">Pass the phone</button></span></div>
        <div class="sec">How strong are the computers? <button class="q" data-help="strength" aria-label="How strong">?</button></div>
        <div class="row"><span class="seg" role="group">${MAP_IDS.map(id => `<button type="button" data-sm="${id}" aria-pressed="${(Settings.sm || 'usa') === id}">${MAP_NAMES[id].split(' ')[0]}</button>`).join('')}</span></div>
        <div id="s-strength"></div>
        <div class="sec">About</div>
        <p class="note">Maps: USA (Classic, 1910, Big Cities, Mega Game tickets), Europe, Nordic Countries, India. Board drawings are our own. Every route, ticket and rule is checked in <a href="https://github.com/TimothyHadfield/ticket-to-ride/blob/main/docs/rules-check.md" target="_blank" rel="noopener">rules-check</a>. Ticket to Ride is a Days of Wonder game; this is an unofficial fan tool.</p>
        <div class="row" style="margin-top:10px"><button class="btn small" id="s-reset">Clear saved games</button><span class="grow"></span><span class="small muted">v${VERSION}</span></div>`;
      Strength.note($('#s-strength'), Settings.sm || 'usa');
      panel.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { st.speed = b.dataset.speed; save(); Settings.show(); });
      panel.querySelectorAll('[data-priv]').forEach(b => b.onclick = () => { st.privacy = b.dataset.priv; save(); Settings.show(); });
      panel.querySelectorAll('[data-sm]').forEach(b => b.onclick = () => { Settings.sm = b.dataset.sm; Settings.show(); });
      $('#s-study').onchange = e => { st.study = e.target.checked; save(); };
      $('#s-reset').onclick = () => {
        const sh = openSheet(`<h2>Clear saved games?</h2><p class="note">The table game and the game against the computers are deleted.</p><div class="acts"><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>Clear</button></div>`);
        sh.querySelector('[data-x]').onclick = () => closeSheet();
        sh.querySelector('[data-ok]').onclick = () => { Play.gen++; S.table = null; S.play = null; save(); closeSheet(); toast('Cleared'); };
      };
    },
  };

  const VIEWS = { table: Table, play: Play, lab: Lab, settings: Settings };

  // ---------------------------------------------------------------- boot
  buildTabs();
  const start = (location.hash || '').slice(1);
  history.replaceState({ tab: TABS.some(t => t[0] === start) ? start : S.tab }, '', location.hash || '#' + S.tab);
  showTab(TABS.some(t => t[0] === start) ? start : S.tab, false);
  window.TTRApp = { S, Table, Play, Lab, save, closeSheet }; // for tests / debugging
})();
