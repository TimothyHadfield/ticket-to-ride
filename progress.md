# Ticket to Ride — progress

## START HERE
Read order: this file → `CLAUDE.md` → `docs/rules-check.md` → `docs/ideas.md`. Last updated: 2026-10-20 (sounds & effects).

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
- "some games have maps and whatnot you can zoom in and out of often. Make it so that there is only an auto zoom that automatically fits the whole board in sight and then you can zoom if you want with easily reseting back to auto mode." (2026-10-20, same in Risk/Pandemic/Carcassonne): auto is the default on load, new game, map change, tab return and rotation; no other zoom modes or saved zoom.
- "add opptional sounds you can add to the games that reflect what's happening in the game accurately as well as win celebrations, and other fun annimations to go along with everything. Just make sure everything is customizable in the settings so the user can play as preffered." (2026-10-20, all games)
- "the map of the US in TTR looks nothing like the US. Fix this and any other similar problems accross the games" (2026-10-20): every board must read as the real place at a glance; land clearly stands out from sea and lakes.

## Traps
- `js/online.js` is a verbatim copy of `../_online/online.js`. Don't edit it here. Same for `js/fx.js` (copy of `../_fx/fx.js`); game-specific sound logic lives in `js/sfx.js`.
- fx.js's switch colour beats the game's (same specificity, injected later): style.css re-sets `.fx-set .switch` to the app's blue. FX.celebrate plays its fanfare internally, so a spy on FX.play doesn't see it (tests count `FX.stats.plays`).
- Settings: fx's Normal/Fast buttons also use `data-speed`; `FX.renderSettings` must run after the computer-speed buttons are wired.
- Views hold deck **sizes** (numbers); `T.legal()` wants arrays. ai.js wraps this (`legalIn`). The online screen uses `TTROnlineGame.asState(view)`, which fills hidden decks with stand-in cards. Null fillers made the pre-send check refuse every deck draw, which stalled online games (fixed, with a test).
- Medium used to pick tickets by raw points, which made it no better than Easy on Switzerland. It now uses the same expected-points ticket choice as Hard.
- phone-view takes its screenshot before `--eval`. For after-eval screenshots use a Playwright script.
- Headless WebKit logs "firestore ... access control checks" page errors when a page reloads mid-listen. This is noise from the aborted channel.
- `git worktree remove` hit "Permission denied" on OneDrive. The weekly sweep cleans up leftovers.
- Map art: `node tools/build-maps.js [ids]` needs Node 22+ and `npm install` (dev deps world-atlas, us-atlas, d3-geo, topojson); Natural Earth lakes are fetched once into `tools/cache/` (gitignored). It prints per map: art size, how far cities were nudged, the warp's min area ratio (must stay > 0, else it folds) and cities whose real spot is in water. `tests/art.test.js` checks every city is on drawn land.
- Douglas-Peucker on a closed ring (start = end) has no base line and drops the whole ring; `toPath` splits at the farthest point first. That bug silently erased the Nordic mainland once.

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

## Real maps (2026-10-20)
- Every board draws Natural Earth (public domain) coastlines, lakes and country borders (USA also faint states), projected Lambert conic per map; cities sit on their real projected spots, nudged apart a little (mean 1–19 units), and the same thin-plate-spline warp bends the land. Art is `maps/<id>.art.json` (19–84 KB), loaded beside the map JSON; without it the old smooth blob draws.
- Colours: land #2f3a52, coast #5a6d94, sea #070a11, lakes #080c15, Switzerland's neighbours #1a2130. Swiss lakes widened 7 units (routes run on their shores); Neuchâtel's spot moved ~1.5 km inland for that.
- Measured: 80/80 tests; route taps 477/478 at 393 px (same as before); screenshots scratchpad `design/ticket-to-ride-maps/before|after|review` (session acb6c2a0); blind reviewer named all 5 maps, no major errors (Kathiawar and parts of Lake Geneva sit under track beds).

## Auto zoom (2026-10-20)
- board.js: one mode. **Auto** = whole board (routes + names at the size they're drawn + 6 px margin) centred and as big as fits, 48 px kept clear on the right for the buttons; re-fits with a glide when the board area resizes; one-finger drag does nothing in auto. Pinch / wheel / + zoom by hand (max 6× the fit); drag pans clamped to the board; zooming out to the fit, the ⤢ button (dimmed in auto, lit warm when zoomed) or a double tap on empty board = back to auto. Rotation, tab show, map change and Start reset to auto (app.js `makeBoard` / start handlers call `toAuto`). Unused `focus()` removed.
- Check: `node tools/zoom-check.mjs [url]` (Playwright WebKit from ~/.claude/tools; serve the folder first) — 201 checks over 5 maps × 393×659 / 659×393 / 1280×800; old build failed 51. Screenshots scratchpad `design/ticket-to-ride-zoom/before|after` (session acb6c2a0).

## Sounds & effects (2026-10-20)
- `js/fx.js` (shared, unchanged copy) + `js/sfx.js`: `diff(prev, next, me, map)` turns any two states into events (local move, computer move, online snapshot alike), `fire()` plays them paced with animations. Settings → "Sound & effects" (FX.renderSettings). v1.7, cache ?v=8.
- Event → sound map: train card drawn (deck or face-up, anyone) = `cardDeal` + card flies to your hand slot / rival's chip · route claimed = one wood `place` clack per car (75 ms apart, cars drop in one by one) + `train` whistle for 5+ · tunnel = 3 `cardFlip` · tickets drawn = `cardSlide` (rival: ticket pile flies to chip) · tickets kept = `cardFlip` · station = `place` (low) · three locos flushed = `shuffle` · new game = `shuffle` · your ticket finished = `ding` + "+N" float · last round = `alarm` + warm flash · becomes your turn = `turn` chime + flash · refused move = `error` · Table: claim as above, remove/undo = `slide`, tickets added = `cardSlide`. Rivals/computers same sounds at 0.75 volume.
- Game over: `drumroll` while Totals count up, longest-route bonus = 'big' sparkle at your Longest cell, then win (confetti in winner's colour) / lose. Table final: count-up; confetti for the winner only with "Pass the phone".
- Verified: `tests/fx.test.js` (5 tests, failed first on the old build) + 85/85 suite; Playwright WebKit run (scratchpad `fx-check.mjs`, session acb6c2a0): no console errors, no overflow, no page scroll, Animations off = 0 overlays and no canvas. Screenshots scratchpad `design/ticket-to-ride-fx/`.

## NOT verified
- Sounds by ear (Playwright WebKit on Windows has no Web Audio; sound gating measured in node with a fake AudioContext). Car-by-car clack seen only as running animations, not caught mid-drop in a screenshot. Online sounds from snapshots tested in node only (view diffs = local diffs), not with two phones.
- Auto zoom with real fingers on an iPhone (synthetic pointer events only); route-tap sweep (477/478) not re-run after the auto fit got slightly bigger.
- Real maps on a real iPhone screen (land/sea contrast judged in headless WebKit screenshots only); Tim's eye on the new land/sea colours.
- Design pass 2 on a real iPhone: the flick/pinch feel was measured with synthetic pointer events in WebKit, not real fingers.
- Online play with a real second iPhone (verified only with two headless WebKit iPhones against the real Firebase project).
- Online rooms of 3–5 people (only 2 tested end-to-end; the game object is tested for every count in node).
- How the hint `why` wording reads to Tim.
- Design pass on a real iPhone (checked only in headless WebKit at 393px); the land image's soft edge at high zoom.

## Rejected / parked
- Ideas 12–17 in docs/ideas.md (parked, reasons there).
