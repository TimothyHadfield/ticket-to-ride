// Builds maps/<id>.json from the plain-text route/ticket lists in tools/src/.
// Source lists: fernandomsilva/Ticket-to-Ride-Engine (gameContent), cross-checked
// against independent lists (see docs/rules-check.md). Corrections made here are
// listed in docs/rules-check.md too.
// City positions are OUR OWN: real latitude/longitude, projected, then nudged apart
// so labels and routes stay readable. Nothing is traced from the printed board.
//   node tools/build-maps.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'src');

// ---------------------------------------------------------------- city tables
// [display name, lat, lon]. Keys are the upper-case names used in the source lists.
const CITY = {
  usa: {
    'VANCOUVER': ['Vancouver', 49.28, -123.12], 'SEATTLE': ['Seattle', 47.61, -122.33],
    'PORTLAND': ['Portland', 45.52, -122.68], 'SAN FRANCISCO': ['San Francisco', 37.77, -122.42],
    'LOS ANGELES': ['Los Angeles', 34.05, -118.24], 'LAS VEGAS': ['Las Vegas', 36.17, -115.14],
    'SALT LAKE CITY': ['Salt Lake City', 40.76, -111.89], 'PHOENIX': ['Phoenix', 33.45, -112.07],
    'CALGARY': ['Calgary', 51.05, -114.07], 'HELENA': ['Helena', 46.59, -112.04],
    'DENVER': ['Denver', 39.74, -104.99], 'SANTA FE': ['Santa Fe', 35.69, -105.94],
    'EL PASO': ['El Paso', 31.76, -106.49], 'WINNIPEG': ['Winnipeg', 49.9, -97.14],
    'DULUTH': ['Duluth', 46.79, -92.1], 'OMAHA': ['Omaha', 41.26, -95.93],
    'KANSAS CITY': ['Kansas City', 39.1, -94.58], 'OKLAHOMA CITY': ['Oklahoma City', 35.47, -97.52],
    'DALLAS': ['Dallas', 32.78, -96.8], 'HOUSTON': ['Houston', 29.76, -95.37],
    'SAULT ST. MARIE': ['Sault St. Marie', 46.5, -84.35], 'CHICAGO': ['Chicago', 41.88, -87.63],
    'SAINT LOUIS': ['Saint Louis', 38.63, -90.2], 'LITTLE ROCK': ['Little Rock', 34.75, -92.29],
    'NEW ORLEANS': ['New Orleans', 29.95, -90.07], 'NASHVILLE': ['Nashville', 36.16, -86.78],
    'ATLANTA': ['Atlanta', 33.75, -84.39], 'MIAMI': ['Miami', 25.76, -80.19],
    'CHARLESTON': ['Charleston', 32.78, -79.93], 'RALEIGH': ['Raleigh', 35.78, -78.64],
    'WASHINGTON': ['Washington', 38.91, -77.04], 'PITTSBURGH': ['Pittsburgh', 40.44, -79.99],
    'TORONTO': ['Toronto', 43.65, -79.38], 'MONTREAL': ['Montréal', 45.5, -73.57],
    'NEW YORK': ['New York', 40.71, -74.01], 'BOSTON': ['Boston', 42.36, -71.06],
  },
  europe: {
    'LISBOA': ['Lisboa', 38.72, -9.14], 'CADIZ': ['Cádiz', 36.53, -6.29], 'MADRID': ['Madrid', 40.42, -3.7],
    'BARCELONA': ['Barcelona', 41.39, 2.17], 'PAMPLONA': ['Pamplona', 42.81, -1.64],
    'MARSEILLE': ['Marseille', 43.3, 5.37], 'BREST': ['Brest', 48.39, -4.49], 'DIEPPE': ['Dieppe', 49.92, 1.08],
    'PARIS': ['Paris', 48.86, 2.35], 'BRUXELLES': ['Bruxelles', 50.85, 4.35], 'AMSTERDAM': ['Amsterdam', 52.37, 4.9],
    'LONDON': ['London', 51.51, -0.13], 'EDINBURGH': ['Edinburgh', 55.95, -3.19], 'ESSEN': ['Essen', 51.46, 7.01],
    'FRANKFURT': ['Frankfurt', 50.11, 8.68], 'ZURICH': ['Zürich', 47.38, 8.54], 'MUNCHEN': ['München', 48.14, 11.58],
    'VENEZIA': ['Venezia', 45.44, 12.33], 'ROMA': ['Roma', 41.9, 12.5], 'BRINDISI': ['Brindisi', 40.63, 17.94],
    'PALERMO': ['Palermo', 38.12, 13.36], 'KOBENHAVN': ['København', 55.68, 12.57],
    'STOCKHOLM': ['Stockholm', 59.33, 18.07], 'BERLIN': ['Berlin', 52.52, 13.4], 'DANZIG': ['Danzig', 54.35, 18.65],
    'WARSZAWA': ['Warszawa', 52.23, 21.01], 'WIEN': ['Wien', 48.21, 16.37], 'BUDAPEST': ['Budapest', 47.5, 19.04],
    'ZAGRAB': ['Zagrab', 45.81, 15.98], 'SARAJEVO': ['Sarajevo', 43.86, 18.41], 'ATHINA': ['Athina', 37.98, 23.73],
    'SOFIA': ['Sofia', 42.7, 23.32], 'BUCURESTI': ['Bucuresti', 44.43, 26.1],
    'CONSTANTINOPLE': ['Constantinople', 41.01, 28.98], 'SMYRNA': ['Smyrna', 38.42, 27.14],
    'ANGORA': ['Angora', 39.93, 32.86], 'ERZURUM': ['Erzurum', 39.9, 41.27], 'SEVASTOPOL': ['Sevastopol', 44.62, 33.52],
    'SOCHI': ['Sochi', 43.6, 39.73], 'ROSTOV': ['Rostov', 47.24, 39.71], 'KHARKOV': ['Kharkov', 49.99, 36.23],
    'KYIV': ['Kyiv', 50.45, 30.52], 'MOSKVA': ['Moskva', 55.76, 37.62], 'SMOLENSK': ['Smolensk', 54.78, 32.05],
    'WILNO': ['Wilno', 54.69, 25.28], 'RIGA': ['Riga', 56.95, 24.11], 'PETROGRAD': ['Petrograd', 59.93, 30.34],
  },
  nordic: {
    'HONNINGSVAG': ['Honningsvåg', 70.98, 25.97], 'MURMANSK': ['Murmansk', 68.97, 33.08],
    'KIRKENES': ['Kirkenes', 69.73, 30.05], 'TROMSO': ['Tromsø', 69.65, 18.96], 'NARVIK': ['Narvik', 68.44, 17.43],
    'KIRUNA': ['Kiruna', 67.86, 20.23], 'ROVANIEMI': ['Rovaniemi', 66.5, 25.73], 'TORNIO': ['Tornio', 65.85, 24.15],
    'BODEN': ['Boden', 65.83, 21.69], 'KAJAANI': ['Kajaani', 64.23, 27.73], 'OULU': ['Oulu', 65.01, 25.47],
    'LIEKSA': ['Lieksa', 63.32, 30.03], 'KUOPIO': ['Kuopio', 62.89, 27.68], 'MO I RANA': ['Mo i Rana', 66.31, 14.14],
    'UMEA': ['Umeå', 63.83, 20.26], 'IMATRA': ['Imatra', 61.17, 28.77], 'VAASA': ['Vaasa', 63.1, 21.62],
    'LAHTI': ['Lahti', 60.98, 25.66], 'TAMPERE': ['Tampere', 61.5, 23.76], 'OSTERSUND': ['Östersund', 63.18, 14.64],
    'SUNDSVALL': ['Sundsvall', 62.39, 17.31], 'TURKU': ['Turku', 60.45, 22.27], 'HELSINKI': ['Helsinki', 60.17, 24.94],
    'TRONDHEIM': ['Trondheim', 63.43, 10.4], 'ANDALSNES': ['Åndalsnes', 62.57, 7.69], 'TALLINN': ['Tallinn', 59.44, 24.75],
    'STOCKHOLM': ['Stockholm', 59.33, 18.07], 'OREBRO': ['Örebro', 59.27, 15.21],
    'LILLEHAMMER': ['Lillehammer', 61.12, 10.47], 'NORRKOPING': ['Norrköping', 58.59, 16.19],
    'OSLO': ['Oslo', 59.91, 10.75], 'BERGEN': ['Bergen', 60.39, 5.32], 'STAVANGER': ['Stavanger', 58.97, 5.73],
    'KRISTIANSAND': ['Kristiansand', 58.15, 8.0], 'ALBORG': ['Ålborg', 57.05, 9.92], 'ARHUS': ['Århus', 56.16, 10.2],
    'GOTEBORG': ['Göteborg', 57.71, 11.97], 'KOBENHAVN': ['København', 55.68, 12.57],
    'KARLSKRONA': ['Karlskrona', 56.16, 15.59],
  },
  india: {
    'PESHAWAR': ['Peshawar', 34.01, 71.58], 'LAHORE': ['Lahore', 31.55, 74.34], 'JACOBABAD': ['Jacobabad', 28.28, 68.44],
    'BHATINDA': ['Bhatinda', 30.21, 74.95], 'AMBALA': ['Ambala', 30.38, 76.78], 'ROHRI': ['Rohri', 27.69, 68.9],
    'DELHI': ['Delhi', 28.61, 77.21], 'BAREILLY': ['Bareilly', 28.37, 79.43], 'KARACHI': ['Karachi', 24.86, 67.01],
    'JODHPUR': ['Jodhpur', 26.24, 73.02], 'JAIPUR': ['Jaipur', 26.91, 75.79], 'AGRA': ['Agra', 27.18, 78.01],
    'LUCKNOW': ['Lucknow', 26.85, 80.95], 'KATNI': ['Katni', 23.83, 80.39], 'PATNA': ['Patna', 25.59, 85.14],
    'DHUBRI': ['Dhubri', 26.02, 89.98], 'JARHAT': ['Jorhat', 26.75, 94.2], 'CHITTAGONG': ['Chittagong', 22.36, 91.78],
    'CALCUTTA': ['Calcutta', 22.57, 88.36], 'BILASPUR': ['Bilaspur', 22.08, 82.14], 'BHOPAL': ['Bhopal', 23.26, 77.41],
    'RATIAM': ['Ratlam', 23.33, 75.04], 'AHMADABAD': ['Ahmadabad', 23.02, 72.57], 'KHANDWA': ['Khandwa', 21.82, 76.35],
    'RAIPUR': ['Raipur', 21.25, 81.63], 'BOMBAY': ['Bombay', 19.08, 72.88], 'MANMAD': ['Manmad', 20.25, 74.44],
    'INDUR': ['Indur', 18.67, 78.09], 'WALTAIN': ['Waltair', 17.69, 83.22], 'BEZWADA': ['Bezwada', 16.51, 80.65],
    'WADI': ['Wadi', 17.06, 76.99], 'POONA': ['Poona', 18.52, 73.86], 'MORMUGAU': ['Mormugao', 15.41, 73.8],
    'GUNTAKAL': ['Guntakal', 15.17, 77.37], 'MADRAS': ['Madras', 13.08, 80.27], 'MANGALORE': ['Mangalore', 12.91, 74.86],
    'ERODE': ['Erode', 11.34, 77.72], 'CALICUT': ['Calicut', 11.26, 75.78], 'QUILON': ['Quilon', 8.89, 76.61],
  },
};
const ALIAS = { 'SEVESTOPOL': 'SEVASTOPOL', 'KIRSTIANSAND': 'KRISTIANSAND', 'HONNINGVAG': 'HONNINGSVAG' };

// ---------------------------------------------------------------- map rules
// Facts per map; each is checked in docs/rules-check.md.
const STD_DECK = { colors: { pink: 12, white: 12, blue: 12, yellow: 12, orange: 12, black: 12, red: 12, green: 12 }, loco: 14 };
const STD_POINTS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15, 7: 18, 8: 21 };
const MAPS = [
  {
    id: 'usa', key: 'usa', name: 'USA', routes: 'usa.routes.txt',
    players: [2, 5], trains: 45, stations: 0, deck: STD_DECK, points: STD_POINTS,
    bothDoublesFrom: 4, startHand: 4,
    setup: { deal: 3, keep: 2 }, draw: { deal: 3, keep: 1 },
    bonuses: { longest: 10 },
    ticketDecks: [
      { id: 'classic', name: 'Classic (30)', file: 'usa.classic.txt' },
      { id: '1910', name: '1910 (35)', file: 'usa.1910.txt', globetrotter: 15 },
      { id: 'bigcities', name: 'Big Cities (35)', file: 'usa.bigcities.txt' },
      { id: 'mega', name: 'Mega Game (69)', file: 'usa.mega.txt', setup: { deal: 5, keep: 3 }, draw: { deal: 4, keep: 1 }, globetrotter: 15 },
    ],
    view: { w: 1000, lat0: 38 },
  },
  {
    id: 'europe', key: 'europe', name: 'Europe', routes: 'europe.routes.txt',
    players: [2, 5], trains: 45, stations: 3, stationPoints: 4, deck: STD_DECK, points: STD_POINTS,
    bothDoublesFrom: 4, startHand: 4,
    setup: { deal: 3, keep: 2, long: 1 }, draw: { deal: 3, keep: 1 },
    bonuses: { longest: 10 }, longestName: 'European Express',
    ticketDecks: [{ id: 'standard', name: 'Standard (46)', file: 'europe.tickets.txt', longFrom: 20 }],
    view: { w: 1000, lat0: 48 },
  },
  {
    id: 'nordic', key: 'nordic', name: 'Nordic Countries', routes: 'nordic_countries.routes.txt',
    players: [2, 3], trains: 40, stations: 0, deck: { colors: { pink: 12, white: 12, blue: 12, yellow: 12, orange: 12, black: 12, red: 12, green: 12 }, loco: 61 },
    points: Object.assign({}, STD_POINTS, { 9: 27 }),
    bothDoublesFrom: 3, startHand: 4,
    setup: { deal: 5, keep: 2 }, draw: { deal: 3, keep: 1 },
    bonuses: { globetrotter: 10 },
    nordicLocos: true,
    ticketDecks: [{ id: 'standard', name: 'Standard (46)', file: 'nordic_countries.tickets.txt' }],
    view: { w: 1000, lat0: 63 },
  },
  {
    id: 'india', key: 'india', name: 'India', routes: 'india.routes.txt',
    players: [2, 4], trains: 45, stations: 0, deck: STD_DECK, points: STD_POINTS,
    bothDoublesFrom: 4, startHand: 4,
    setup: { deal: 4, keep: 2 }, draw: { deal: 4, keep: 1 },
    bonuses: { mandala: [0, 5, 10, 20, 30, 40, 50] },
    ticketDecks: [{ id: 'standard', name: 'Standard (58)', file: 'india.tickets.txt' }],
    view: { w: 1000, lat0: 22 },
  },
];

// ---------------------------------------------------------------- parsing
const COLOR = { GRAY: 'gray', PINK: 'pink', WHITE: 'white', BLUE: 'blue', YELLOW: 'yellow', ORANGE: 'orange', BLACK: 'black', RED: 'red', GREEN: 'green' };
function canon(name) { name = name.trim().toUpperCase(); return ALIAS[name] || name; }

function parseRoutes(file) {
  const lines = fs.readFileSync(path.join(SRC, file), 'utf8').split(/\r?\n/);
  const cities = []; const routes = [];
  let i = 0;
  for (; i < lines.length && lines[i].trim(); i++) cities.push(canon(lines[i]));
  for (; i < lines.length; i++) {
    const m = lines[i].trim().match(/^(.+?) (-?[\d.]+) ([A-Z]+) (.+)$/);
    if (!m) continue;
    const [, a, n, c, b] = m;
    let kind = 'train', len, locos = 0;
    if (n.startsWith('-')) { kind = 'tunnel'; len = +n.slice(1); }
    else if (n.includes('.')) { kind = 'ferry'; [len, locos] = n.split('.').map(Number); }
    else len = +n;
    if (!COLOR[c]) throw new Error('bad colour ' + c);
    routes.push({ a: canon(a), b: canon(b), len, color: COLOR[c], kind, locos });
  }
  return { cities, routes };
}
function parseTickets(file) {
  return fs.readFileSync(path.join(SRC, file), 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(.+?) (\d+) (.+)$/);
    return { a: canon(m[1]), b: canon(m[3]), pts: +m[2] };
  });
}

// ---------------------------------------------------------------- layout
function layout(cfg, cityKeys, routes, table) {
  const lat0 = cfg.view.lat0 * Math.PI / 180;
  let pts = cityKeys.map(k => { const [, lat, lon] = table[k]; return { k, x: lon * Math.cos(lat0), y: -lat }; });
  const idx = Object.fromEntries(pts.map((p, i) => [p.k, i]));
  // normalise to width 1000
  const norm = () => {
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const s = 900 / (maxX - minX);
    pts.forEach(p => { p.x = 50 + (p.x - minX) * s; p.y = 50 + (p.y - minY) * s; });
  };
  norm();
  const pairs = [...new Set(routes.map(r => [idx[r.a], idx[r.b]].sort((x, y) => x - y).join(',')))].map(s => s.split(',').map(Number));
  // relax: keep cities >= MIN apart and >= EDGE away from routes that don't touch them,
  // with a weak spring back to the geographic spot.
  const home = pts.map(p => ({ x: p.x, y: p.y }));
  const MIN = cfg.view.min || 62, EDGE = cfg.view.edge || 22;
  for (let it = 0; it < 600; it++) {
    const f = pts.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y, d = Math.hypot(dx, dy) || 0.01;
      if (d < MIN) { const push = (MIN - d) / 2 / d; f[i].x -= dx * push; f[i].y -= dy * push; f[j].x += dx * push; f[j].y += dy * push; }
    }
    for (const [a, b] of pairs) {
      const A = pts[a], B = pts[b], vx = B.x - A.x, vy = B.y - A.y, L2 = vx * vx + vy * vy;
      for (let c = 0; c < pts.length; c++) {
        if (c === a || c === b) continue;
        const C = pts[c]; const t = ((C.x - A.x) * vx + (C.y - A.y) * vy) / L2;
        if (t <= 0.05 || t >= 0.95) continue;
        const px = A.x + t * vx, py = A.y + t * vy, dx = C.x - px, dy = C.y - py, d = Math.hypot(dx, dy) || 0.01;
        if (d < EDGE) { const push = (EDGE - d) / d * 0.5; f[c].x += dx * push; f[c].y += dy * push; f[a].x -= dx * push * 0.25; f[a].y -= dy * push * 0.25; f[b].x -= dx * push * 0.25; f[b].y -= dy * push * 0.25; }
      }
    }
    pts.forEach((p, i) => { p.x += f[i].x * 0.5 + (home[i].x - p.x) * 0.004; p.y += f[i].y * 0.5 + (home[i].y - p.y) * 0.004; });
  }
  norm();
  const H = Math.ceil(Math.max(...pts.map(p => p.y)) + 50);
  return { pos: Object.fromEntries(pts.map(p => [p.k, [Math.round(p.x), Math.round(p.y)]])), h: H };
}

// ---------------------------------------------------------------- build
function slug(k) { return k.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''); }

for (const cfg of MAPS) {
  const table = CITY[cfg.key];
  const { cities, routes } = parseRoutes(cfg.routes);
  for (const c of cities) if (!table[c]) throw new Error(cfg.id + ': no coords for ' + c);
  for (const r of routes) for (const c of [r.a, r.b]) if (!cities.includes(c)) throw new Error(cfg.id + ': unknown city ' + c);
  const { pos, h } = layout(cfg, cities, routes, table);
  const outCities = cities.map(k => ({ id: slug(k), name: table[k][0], x: pos[k][0], y: pos[k][1] }));
  // routes: twins share a pair key; order twins so that their offsets are stable
  const outRoutes = routes.map((r, i) => {
    const [a, b] = [slug(r.a), slug(r.b)].sort();
    const o = { id: 'r' + i, a, b, len: r.len, color: r.color };
    if (r.kind !== 'train') o.kind = r.kind;
    if (r.locos) o.locos = r.locos;
    return o;
  });
  const byPair = {};
  outRoutes.forEach(r => { (byPair[r.a + '|' + r.b] = byPair[r.a + '|' + r.b] || []).push(r); });
  Object.values(byPair).forEach(list => {
    if (list.length === 2) { list[0].twin = list[1].id; list[1].twin = list[0].id; list[0].lane = -1; list[1].lane = 1; }
    if (list.length > 2) throw new Error('triple route ' + list[0].a + list[0].b);
  });
  const ticketDecks = cfg.ticketDecks.map(d => {
    const t = parseTickets(d.file).map(t => {
      for (const c of [t.a, t.b]) if (!cities.includes(c)) throw new Error(cfg.id + ' ticket city ' + c);
      const o = { a: slug(t.a), b: slug(t.b), pts: t.pts };
      if (d.longFrom && t.pts >= d.longFrom) o.long = true;
      return o;
    });
    const out = { id: d.id, name: d.name, tickets: t };
    for (const k of ['setup', 'draw', 'globetrotter']) if (d[k]) out[k] = d[k];
    return out;
  });
  const out = {
    id: cfg.id, name: cfg.name, players: cfg.players, trains: cfg.trains, stations: cfg.stations,
    stationPoints: cfg.stationPoints || 0, startHand: cfg.startHand, bothDoublesFrom: cfg.bothDoublesFrom,
    setup: cfg.setup, draw: cfg.draw, deck: cfg.deck, points: cfg.points, bonuses: cfg.bonuses,
    longestName: cfg.longestName || 'Longest Route', nordicLocos: !!cfg.nordicLocos,
    size: [1000, h], cities: outCities, routes: outRoutes, ticketDecks,
  };
  fs.writeFileSync(path.join(ROOT, 'maps', cfg.id + '.json'), JSON.stringify(out, null, 1));
  console.log(cfg.id, outCities.length, 'cities', outRoutes.length, 'routes', ticketDecks.map(d => d.id + ':' + d.tickets.length).join(' '), 'h=' + h);
}
