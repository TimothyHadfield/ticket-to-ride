// Ticket to Ride: the guided first game and the rules sheet (uses the shared js/coach.js).
// - GAME: a fixed first game (found once by search, tests/tutorial.test.js checks it still holds): USA, you and one
//   Easy computer, you play first, and your four starting cards (3 green) already pay for a short route.
// - steps(ctx): the coach's script, driven by the game's own state.
// - rules(): the base rules in our own words, with what changes on the other maps.
(function (root) {
  'use strict';
  const GAME = { mapId: 'usa', seed: 69, levels: ['easy'] };

  // ctx: { state() -> the game state or null, me() -> my seat }
  function steps(ctx) {
    const st = () => ctx.state();
    const me = () => ctx.me();
    const pl = () => { const s = st(); return s ? s.players[me()] : null; };
    const myTurn = () => { const s = st(); return !!s && s.phase === 'main' && s.turn === me() && !(pl() && pl().pending); };
    const routes = () => (pl() ? pl().routes.length : 0);
    const turnNo = () => { const s = st(); return s ? s.turnNo : 0; };
    return [
      { title: 'Your first game', text: 'You against one computer on the USA map. Build train routes between cities to finish your tickets. I’ll walk you through the first turns.' },
      { target: '.sheet[data-kind="tickets"]', title: 'Destination tickets', html: 'Each ticket names two cities. Join them with your own trains by the end to <b>score its points</b>; miss and you <b>lose them</b>. Tap at least 2 to keep (the +pts is what each is likely worth to you, and <b>Best set</b> picks for you), then <b>Keep</b>.',
        when: () => { const p = pl(); return !!(p && p.pending); }, until: () => { const p = pl(); return !!p && !p.pending && p.tickets.length > 0; }, skipIf: () => { const p = pl(); return !!p && !p.pending && p.tickets.length > 0; } },
      { target: '#v-play .mytix', text: 'Your tickets lie in front of you. Tap one to light up its cheapest way on the map.', when: () => { const s = st(); return !!s && s.phase === 'main'; } },
      { target: '#v-play .hand', text: 'Your train cards, grouped by colour. A route takes as many cards of its colour as it has spaces. Grey routes take any one colour, and locomotives are wild.', when: () => { const s = st(); return !!s && s.phase === 'main'; } },
      { target: () => { const id = ctx.route ? ctx.route() : null, e = id && root.document && root.document.querySelector(`#v-play .board-wrap [data-route="${id}"]`); return e || '#v-play .board-wrap'; }, pad: 10,
        title: 'Claim a route', html: 'Your 3 green cards already pay for the green route in the ring, on your tickets’ way. <b>Tap it</b> to claim it: you pay the cards and your trains go on it. Longer routes score far more: 1, 2, 4, 7, 10 and 15 points.',
        when: myTurn, until: () => routes() > 0, skipIf: () => routes() > 0 || turnNo() > 2 },
      { target: '#v-play .rivals', text: 'After you, the computer takes its turn. Its seat is across the table: score, cards, tickets and trains left.', next: true, skipIf: () => turnNo() > 3 },
      { target: '#v-play .supply', title: 'Draw 2 cards', html: 'Another kind of turn: take <b>2 train cards</b>, each one face up or from the deck. A face-up locomotive counts as both.',
        when: myTurn, until: () => turnNo() > 3, skipIf: () => turnNo() > 4 },
      { target: '#v-play .status', text: 'Each turn is one of three: draw 2 cards, claim one route, or draw more tickets (the ticket deck). Hint suggests a move and Undo takes yours back.', next: true },
      { title: 'How it ends', text: 'When anyone is down to 2 trains or fewer, everyone gets one last turn. Finished tickets add, unfinished ones subtract, and the longest continuous line of trains earns 10. The full rules are in Settings → Rules.' },
    ];
  }

  function rules() {
    return {
      title: 'How to play Ticket to Ride',
      intro: '2 to 5 players build train routes across a map. These are the rules this site plays, with the USA map as the base game.',
      sections: [
        { id: 'goal', short: 'Goal', title: 'Goal', html: `<p>Score the most points. Points come from <b>routes</b> you claim, <b>tickets</b> you finish (minus the ones you don’t) and the <b>longest route</b> bonus.</p>` },
        { id: 'setup', short: 'Setup', title: 'Setup', html: `<ul><li>Each player takes <b>45 trains</b> and <b>4 train cards</b>.</li>
          <li>Five train cards are laid face up beside the deck.</li>
          <li>Each player is dealt <b>3 tickets</b> and keeps at least <b>2</b>. The rest go to the bottom of the ticket deck.</li></ul>` },
        { id: 'turn', short: 'Turn', title: 'Your turn', html: `<p>Do exactly <b>one</b> of these:</p><ol><li><b>Draw train cards</b>: take 2, each one either face up or from the deck.</li>
          <li><b>Claim a route</b>: pay cards for one route and put your trains on it.</li>
          <li><b>Draw tickets</b>: take 3 and keep at least 1.</li></ol>
          <p class="tip">On this site, a player who can’t draw anything may pass. If everyone passes in a row, the game ends.</p>` },
        { id: 'cards', short: 'Cards', title: 'Train cards', html: `<ul><li>8 colours of 12 cards, plus 14 <b>locomotives</b> that are wild.</li>
          <li>A face-up card you take is replaced at once from the deck.</li>
          <li>A <b>face-up locomotive</b> is the only card you take that turn, and you can’t take one as your second card. A blind locomotive from the deck is fine.</li>
          <li>If 3 locomotives are face up, all five are discarded and five new ones dealt.</li>
          <li>When the deck runs out, the discards are shuffled into a new deck.</li></ul>` },
        { id: 'routes', short: 'Routes', title: 'Claiming routes', html: `<ul><li>Pay as many cards as the route has spaces, all of the route’s colour (locomotives fill in). A <b>grey</b> route takes any one colour.</li>
          <li>One route per turn, anywhere on the map; it doesn’t have to join your others.</li>
          <li><b>Double routes</b>: one player can’t take both. With 2 or 3 players only one of the two can be used.</li></ul>
          <table><tr><td>Length</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td></tr><tr><td>Points</td><td>1</td><td>2</td><td>4</td><td>7</td><td>10</td><td>15</td></tr></table>` },
        { id: 'tickets', short: 'Tickets', title: 'Tickets', html: `<ul><li>A ticket is finished when <b>your own</b> routes join its two cities in one unbroken line.</li>
          <li>At the end, each finished ticket adds its points and each unfinished one <b>subtracts</b> them.</li>
          <li>Keep your tickets secret until the end.</li></ul>` },
        { id: 'end', short: 'End', title: 'End of the game', html: `<ul><li>When a player ends a turn with <b>2 trains or fewer</b>, everyone (that player too) gets <b>one last turn</b>.</li>
          <li>Then add tickets and the <b>longest route</b> bonus: 10 points for the longest continuous line of your own trains (ties all score it).</li>
          <li>Most points wins. Ties: most finished tickets, then longest route. Still level: a shared win.</li></ul>` },
        { id: 'maps', short: 'Maps', title: 'Other maps', html: `<h4>Europe</h4><ul><li><b>Stations</b> (3 each, cost 1, 2, 3 cards): use one rival route into that city for your tickets. Each one unused is worth 4.</li>
          <li><b>Tunnels</b>: 3 cards are turned over; each matching one costs one more card, or give up. <b>Ferries</b> need a locomotive for each loco space.</li>
          <li>You start with 1 long and 3 regular tickets, keep 2. The longest route bonus is the European Express (10).</li></ul>
          <h4>Nordic Countries (2–3 players, 40 trains)</h4><ul><li>Locomotives are wild only on ferries and tunnels, and face-up ones can be taken two at a time. On ferries, any 3 cards can stand in for a locomotive.</li>
          <li>Start with 5 tickets, keep 2; returned tickets leave the game. The 9-long route scores 27. Most finished tickets earns the Globetrotter (10), and there is no longest route bonus.</li></ul>
          <h4>India</h4><ul><li>Start with 4 tickets, keep 2. <b>Mandala</b>: a finished ticket joined by two separate paths scores a bonus (1 → 5, 2 → 10, 3 → 20, 4 → 30, 5+ → 40). Indian Express: 10.</li></ul>
          <h4>Switzerland (2–3 players, 40 trains)</h4><ul><li>Locomotives are wild only on tunnels. Some tickets lead to a <b>country</b>: score the best one you reach, or lose the lowest if none.</li>
          <li>Start with 5 tickets, keep 2; returned tickets leave the game.</li></ul>` },
        { id: 'site', short: 'This site', title: 'Options on this site', html: `<ul><li><b>Ticket decks</b> for USA: Classic, 1910 (Globetrotter instead of longest route), Big Cities and Mega Game.</li>
          <li><b>House rules</b> in Settings → Rules, all off unless you switch them on (the computers play by them too):
            <b>no longest route bonus</b>; a <b>Globetrotter</b> bonus (15 for the most finished tickets, ties all) on maps without one;
            a <b>face-up locomotive counts as 1 card</b> (you still draw a second); <b>both double tracks open</b> with 2–3 players.</li>
          <li><b>Undo</b> and <b>Hint</b> work against the computers; a game where you used them counts as “with help” in My stats.</li></ul>` },
        { id: 'videos', short: 'Videos', title: 'Learn by watching', html: `<p>Videos by other people on YouTube (they open in a new tab).</p><ul class="vids">
          <li><a href="https://www.youtube.com/watch?v=4JhFhyvGdik" target="_blank" rel="noopener">Ticket to Ride – How To Play</a> · Watch It Played, 11 min: the full base game, step by step.</li>
          <li><a href="https://www.youtube.com/watch?v=yPGLlaGrShY" target="_blank" rel="noopener">How to Play Ticket to Ride</a> · Triple S Games, 4 min: the quick version.</li>
          <li><a href="https://www.youtube.com/watch?v=difSEK9A6f0" target="_blank" rel="noopener">How to play Ticket to Ride Europe</a> · Days of Wonder, 5 min: stations, tunnels and ferries.</li>
          <li><a href="https://www.youtube.com/watch?v=MFscuIQrCq8" target="_blank" rel="noopener">13 tips on how to win at Ticket to Ride</a> · Legendary Tactics, 7 min: strategy.</li></ul>` },
      ],
      foot: 'Fan-made summary in our own words, not the publisher’s rulebook. Every number is checked in docs/rules-check.md.',
    };
  }

  const api = { GAME, steps, rules };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TTRTutorial = api;
})(typeof window !== 'undefined' ? window : globalThis);
