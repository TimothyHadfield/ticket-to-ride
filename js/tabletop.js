// The table around the board: the board's printed frame with the 0-100 score track and the players' wooden
// markers on it, plastic train heaps, and the HTML for real-looking cards (uses the shared js/table.js kit).
// TTRTable.frame(wrap) -> { scores(list, colours) }   list = score per seat (null = no marker)
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const CELLS = 100;

  // point at distance d along the track's centre line (clockwise from the top-left corner)
  function along(d, x0, y0, w, h) {
    const P = 2 * (w + h); d = ((d % P) + P) % P;
    if (d <= w) return { x: x0 + d, y: y0, side: 0 };
    d -= w; if (d <= h) return { x: x0 + w, y: y0 + d, side: 1 };
    d -= h; if (d <= w) return { x: x0 + w - d, y: y0 + h, side: 2 };
    d -= w; return { x: x0, y: y0 + h - d, side: 3 };
  }

  function frame(wrap) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'track'); svg.setAttribute('aria-hidden', 'true');
    const marks = document.createElement('div'); marks.className = 'track-marks';
    wrap.appendChild(svg); wrap.appendChild(marks);
    let last = { list: [], cols: [] }, size = '';

    function geom() {
      const W = wrap.clientWidth, H = wrap.clientHeight;
      const F = parseFloat(getComputedStyle(wrap).getPropertyValue('--frame')) || 10;
      const x0 = F / 2, y0 = F / 2, w = W - F, h = H - F;
      return { W, H, F, x0, y0, w, h, c: 2 * (w + h) / CELLS };
    }
    function draw() {
      const g = geom(); if (!g.W || !g.H) return;
      const key = g.W + 'x' + g.H + ':' + g.F;
      if (key === size) return place();
      size = key;
      svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
      const t = g.F - 3; // cell thickness
      let out = `<rect class="tr-edge" x=".5" y=".5" width="${g.W - 1}" height="${g.H - 1}" rx="3"/>`;
      const num = g.F >= 15 ? 5 : 10, fs = Math.max(5.5, Math.min(9, g.F * 0.56));
      for (let i = 0; i < CELLS; i++) {
        // a cell can bend round a corner: draw each straight piece of it
        const a = i * g.c, b = (i + 1) * g.c, cls = 'tr-cell' + (i % 5 === 0 ? ' five' : '') + (i % 2 ? ' odd' : '');
        const cuts = [a];
        for (const L of [g.w, g.w + g.h, 2 * g.w + g.h, 2 * (g.w + g.h)]) if (L > a && L < b) cuts.push(L);
        cuts.push(b);
        for (let k = 0; k < cuts.length - 1; k++) {
          const p = along(cuts[k], g.x0, g.y0, g.w, g.h), q = along(cuts[k + 1] - 0.001, g.x0, g.y0, g.w, g.h);
          const horiz = p.side === 0 || p.side === 2;
          const x = Math.min(p.x, q.x), y = Math.min(p.y, q.y);
          out += horiz ? `<rect class="${cls}" x="${x.toFixed(1)}" y="${(y - t / 2).toFixed(1)}" width="${Math.max(.5, Math.abs(q.x - p.x) - .6).toFixed(1)}" height="${t}"/>`
            : `<rect class="${cls}" x="${(x - t / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${t}" height="${Math.max(.5, Math.abs(q.y - p.y) - .6).toFixed(1)}"/>`;
        }
        if (i % num === 0) {
          const m = along(a + g.c / 2, g.x0, g.y0, g.w, g.h);
          out += `<text class="tr-num" x="${m.x.toFixed(1)}" y="${m.y.toFixed(1)}" font-size="${fs.toFixed(1)}">${i}</text>`;
        }
      }
      svg.innerHTML = out;
      place();
    }
    // the markers: one wooden disc per player on the space of their score (101+ goes round again);
    // discs on the same space stack up, like real ones
    function place() {
      const g = geom(); if (!g.W) return;
      const { list, cols } = last;
      const sz = Math.max(8, Math.min(15, Math.round(g.F * 0.8))); // a disc sits inside its space
      const seen = {};
      list.forEach((v, seat) => {
        let m = marks.querySelector(`[data-mk="${seat}"]`);
        if (v == null) { if (m) m.remove(); return; }
        if (!m) { m = document.createElement('span'); m.className = 'tbl-marker ttr-mk'; m.dataset.mk = seat; marks.appendChild(m); }
        const cell = ((Math.round(v) % CELLS) + CELLS) % CELLS, k = seen[cell] = (seen[cell] || 0) + 1;
        const p = along((cell + 0.5) * g.c, g.x0, g.y0, g.w, g.h);
        m.style.setProperty('--piece', cols[seat]); m.style.setProperty('--size', sz + 'px');
        m.style.transform = `translate(${(p.x - sz / 2).toFixed(1)}px, ${(p.y - sz / 2 - (k - 1) * 3).toFixed(1)}px)`;
        m.style.zIndex = k;
        m.title = v + ' points';
      });
      marks.querySelectorAll('[data-mk]').forEach(m => { if (list[+m.dataset.mk] == null) m.remove(); });
    }
    if (root.ResizeObserver) new ResizeObserver(draw).observe(wrap);
    draw();
    return {
      scores(list, cols) { last = { list: list || [], cols: cols || [] }; draw(); },
      redraw() { size = ''; draw(); },
    };
  }

  // a heap of plastic train cars in front of a player: a few loose cars (seeded, so they don't jump) + how many
  function heap(color, n, seed, big) {
    const cap = big ? 7 : 5, k = n <= 0 ? 0 : Math.max(1, Math.min(cap, Math.round(n / 45 * cap))); // the heap shrinks as trains go out
    const TB = root.TABLE;
    let cars = '';
    for (let i = 0; i < k; i++) {
      const j = TB ? TB.jitter('heap' + seed, i, { rot: 50, off: big ? 5 : 3 }) : { x: 0, y: 0, r: 0 };
      const x = (big ? 6 : 4) + (i % 3) * (big ? 9 : 6) + j.x, y = (big ? 9 : 5) + Math.floor(i / 3) * (big ? 7 : 5) + j.y;
      cars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${big ? 13 : 9}" height="${big ? 5 : 3.6}" rx="1.2" transform="rotate(${j.r} ${(x + 5).toFixed(1)} ${(y + 2).toFixed(1)})"/>`;
    }
    return `<span class="heap" title="${n} trains"><svg viewBox="0 0 ${big ? 36 : 24} ${big ? 30 : 18}" aria-hidden="true" style="--piece:${color}">${cars}</svg><b>${n}</b></span>`;
  }

  // a train car card (mini size, white border, the face drawing from js/cards.js)
  function trainCard(color, cls, attrs) {
    return `<div class="tbl-card tbl-mini ttr-card${cls ? ' ' + cls : ''}" data-color="${color}" ${attrs || ''}>${root.Cards.svg(color)}</div>`;
  }
  const trainBack = cls => root.TABLE.back({ pattern: 'sunburst', cls: 'tbl-mini ttr-back' + (cls ? ' ' + cls : '') });
  const ticketBack = cls => root.TABLE.back({ pattern: 'lattice', cls: 'tbl-mini ttr-tback' + (cls ? ' ' + cls : '') });

  root.TTRTable = { frame, heap, trainCard, trainBack, ticketBack, along };
})(window);
