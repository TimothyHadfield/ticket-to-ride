# Ticket to Ride — progress

## START HERE
Read order: this file → `CLAUDE.md` → `docs/rules-check.md` → `docs/ideas.md`. Last updated: 2026-10-20 (visual design pass 2).

## Goal right now
Tim: "Ticket to Ride and all the variants is something that I think is great". Phase 2 (his words): "build regular play online with a computer or other online players for all the games and their common varients that match exactly the play of the in-person game ... Make sure to get everything right like rules and artwork and specific numbers of cards, routes, details, etc."

## Status
| Part | State |
|---|---|
| Table (companion for a real game) | built: tap routes, live scores, ticket chances, keep/toss advice, pass-the-phone privacy, final score |
| Play vs computers | built: Easy/Medium/Hard, hint, study mode, score race, unseen-card counter, live longest, rival ticket guess |
| Online rooms | built: Play → Online → Create room / Join (5-letter code); seats Friend or Computer; reload resumes. Uses the shared `_online` module (Firebase `th-board-games`, free) |
| Lab | built: paths, points per train, busy routes, blocking/detours |
| Maps | USA (Classic, 1910, Big Cities, Mega), Europe, Nordic, India, Switzerland — rules sourced in docs/rules-check.md |
| Variants | ticket decks per map; Settings → Rules → "Longest route bonus" switch (house rule) |

Measured computer strength (data/strength.json, 1000 games per pairing, 2 players, seats rotated, 2026-10-19):
| Map | Medium beats Easy | Hard beats Medium | Hard beats Easy |
|---|---|---|---|
| USA | 75% | 61% | 84% |
| Europe | 84% | 72% | 96% |
| Nordic | 81% | 60% | 86% |
| India | 89% | 69% | 96% |
| Switzerland | 69% | 65% | 78% |

## Authorized next steps
- (2026-10-19) none beyond the phase-2 brief; the manager merges and reports.

## Standing instructions
- "Phone layout: the map fills the screen, controls in the leftover space."
- $0, no copyrighted art or rules text, choices live in Settings, short labels, "?" explains why.

## Traps
- `js/online.js` is a verbatim copy of `../_online/online.js`. Don't edit it here.
- Views hold deck **sizes** (numbers); `T.legal()` wants arrays. ai.js wraps this (`legalIn`). The online screen uses `TTROnlineGame.asState(view)`, which fills hidden decks with stand-in cards. Null fillers made the pre-send check refuse every deck draw, which stalled online games (fixed, with a test).
- Medium used to pick tickets by raw points, which made it no better than Easy on Switzerland. It now uses the same expected-points ticket choice as Hard.
- phone-view takes its screenshot before `--eval`. For after-eval screenshots use a Playwright script.
- Headless WebKit logs "firestore ... access control checks" page errors when a page reloads mid-listen. This is noise from the aborted channel.
- `git worktree remove` hit "Permission denied" on OneDrive. The weekly sweep cleans up leftovers.

## Decisions
- Online: the host's browser holds the full state and runs the computers (shared-module design). Each player receives only the public view plus their own hand and tickets.
- Online seats that are left open become computers at the level picked when the room is created.
- Study mode is off in online games: it would show other players' cards.

## QA (fresh agent, 2026-10-20, live site)
- Fixed: phone taps on 28–59 short routes per map were swallowed by city taps (now 0 of 478 fail, measured by tapping every route's middle in WebKit); routes under the zoom buttons; Start racing a map load; Table's first "Drew tickets" capped at 3; 4–5 player chips cut off; online lobby/join polish.
- Fixed in the design pass: Table final score with "Just mine" now lists you first and crowns nobody (rivals' tickets are missing).

## Design pass (2026-10-20, Tim: "review them again for design improvements especially visually")
- Map: city names grow to ~8.5 screen px on a phone (`--lf` set in board.js `setVB`, boxes sized at LABEL_MAX so the fit view never cuts a name); land is one smooth shape (canvas blur + threshold, `smoothLand`, vector fallback); claimed routes are solid fatter trains; black spaces outlined; double-track gap 6.5 → 7.5.
- Phone panel: one-line chips, shorter cards (`preserveAspectRatio slice`, art cropped), one-line ticket rows, My tickets moved above Unseen/Longest. Deck/ticket piles look like card backs; the turn chip is outlined warm.
- Claim sheet: route glows (`Play.claiming` → `sel`) behind a light scrim; laptop sheets sit over the side panel (Settings: centred).
- Measured: every route's middle tapped at 393px on all 5 maps, 0 of 478 missed (before and after). Before/after screenshots: scratchpad `ttr-design/before|after` (session acb6c2a0).

## Design pass 2 (2026-10-20, Tim: "I know the ticket to ride needs quite a lot to work")
- Map (board.js): spaces 10.5 wide on a dark track bed (one bed per city pair, so double routes read as a pair); claimed = fat train on a dark casing with a shine; tunnels = rail ties; ferries = dashed sea-blue band + light loco badges; land lighter, sea blue-black; lakes enclosed by land are filled (flood fill in `smoothLand`, ferries keep theirs); labels stop growing past ~12.5 px when zoomed.
- Pan/zoom: pinch zooms + pans with the fingers (anchor error 0.05 map units, measured), flick coasts, zoom buttons and focus glide; one 40 px zoom group (fit view reserves 48 px for it).
- Cards: cream edges, count badge in the corner, 2+ shows a little pile, card-back deck/ticket piles (tickets warm). Claim sheet: mini cards per payment + chevron; laptop sheets sit low in the panel. Settings → "Colour-blind marks" (off by default): shapes on map spaces (zoomed) and card corners.
- Measured: 75/75 tests; 393 px + 1280 px screenshots of 15 states incl. all 5 maps (scratchpad `design/ticket-to-ride-2/before|after`, session acb6c2a0), no page scroll, no overflow, no console errors; route taps at 393 px: 477/478 (the miss is India Bombay–Calicut tapped exactly where Guntakal–Mormugao crosses it; LANE kept at 7.5 because 8+ caused New York–Washington misses).

## NOT verified
- Design pass 2 on a real iPhone: the flick/pinch feel was measured with synthetic pointer events in WebKit, not real fingers.
- Online play with a real second iPhone (verified only with two headless WebKit iPhones against the real Firebase project).
- Online rooms of 3–5 people (only 2 tested end-to-end; the game object is tested for every count in node).
- How the hint `why` wording reads to Tim.
- Design pass on a real iPhone (checked only in headless WebKit at 393px); the land image's soft edge at high zoom.

## Rejected / parked
- Ideas 12–17 in docs/ideas.md (parked, reasons there).
