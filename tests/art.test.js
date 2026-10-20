// Board art (maps/<id>.art.json, made by tools/geo-art.js): every map has real coastlines, and every city
// is drawn on land - not in the sea, not in a lake (a coastal city may sit on the shore, within its dot's radius).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const MAPS = ['usa', 'europe', 'nordic', 'india', 'switzerland'];

// the art paths use only M (absolute), l (relative) and z
function rings(d) {
  const t = (d || '').match(/[Mlz]|-?(?:\d+\.?\d*|\.\d+)/g) || [];
  const out = []; let cur = null, x = 0, y = 0;
  for (let i = 0; i < t.length;) {
    if (t[i] === 'M') { x = +t[i + 1]; y = +t[i + 2]; cur = [[x, y]]; out.push(cur); i += 3; }
    else if (t[i] === 'l' || t[i] === 'z') i++;
    else { x += +t[i]; y += +t[i + 1]; cur.push([x, y]); i += 2; }
  }
  return out;
}
// nonzero winding, the SVG default fill rule
const inside = (rs, p) => {
  let w = 0;
  for (const r of rs) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xa, ya] = r[j], [xb, yb] = r[i];
    const side = (xb - xa) * (p[1] - ya) - (p[0] - xa) * (yb - ya);
    if (ya <= p[1] && yb > p[1] && side > 0) w++;
    else if (ya > p[1] && yb <= p[1] && side < 0) w--;
  }
  return w !== 0;
};
const edgeDist = (rs, p) => {
  let best = Infinity;
  for (const r of rs) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, ay] = r[j], [bx, by] = r[i], vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-9;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * vx + (p[1] - ay) * vy) / L2));
    best = Math.min(best, Math.hypot(p[0] - ax - t * vx, p[1] - ay - t * vy));
  }
  return best;
};

for (const id of MAPS) {
  test(id + ': real coastlines, and every city is on land', () => {
    const file = path.join(__dirname, '..', 'maps', id + '.art.json');
    assert.ok(fs.existsSync(file), 'no board art for ' + id);
    const art = JSON.parse(fs.readFileSync(file, 'utf8'));
    const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'maps', id + '.json'), 'utf8'));
    const land = rings(art.land), lakes = rings(art.lakes);
    // real outlines, not a blob: the coast (or, for land-locked Switzerland, its border) has many points
    const outline = art.home ? rings(art.home) : land;
    assert.ok(outline.reduce((a, r) => a + r.length, 0) > (art.home ? 300 : 1500), 'outline too coarse');
    const wet = [];
    for (const c of m.cities) {
      const p = [c.x, c.y];
      const dry = inside(land, p) && !inside(lakes, p);
      // on the shore: within the city dot (radius 10) of a coast or lake edge
      if (!dry && Math.min(edgeDist(land, p), lakes.length ? edgeDist(lakes, p) : Infinity) > 10) wet.push(c.id);
    }
    assert.deepStrictEqual(wet, [], 'cities in the water');
  });
}
