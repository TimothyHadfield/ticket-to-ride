# Ticket to Ride — session log

## 2026-10-19 — first build + phase 2 (builder agent under the manager)
- **Asked:**
  - Build a TtR site with a companion, play against computers (Easy, Medium and Hard, measured; hint and study modes) and a route lab.
  - Phase 2 adds: exact rules and variants, online play, ideas, polished art, and QA.
- **Built:**
  - The engine and 5 maps, generated from `tools/src`.
  - The Table, Play, Lab and Settings tabs, with 11 ideas built (docs/ideas.md).
  - Nordic, India and Switzerland rules, sourced in docs/rules-check.md.
  - A rebuilt Hard computer (from the ai-strength branch). Medium now uses expected-points ticket choice.
  - Online rooms through the shared `_online` module.
  - A Settings switch to turn off the longest route bonus.
- **Verified:**
  - `node --test tests/*.test.js` passes. New tests were each seen failing first (odds, online, asState pre-check, house rule).
  - Strength measured over 22,000 games.
  - Full online game played between two headless WebKit iPhones against the real Firebase project, including a reload mid-game.
  - Screenshots at 393px and desktop width.
- **Open:** a real two-phone online test by Tim, and rooms of 3–5 people.

## 2026-10-20 — visual design pass (builder under the manager)
- **Asked:** Tim: "review them again for design improvements especially visually. I know the ticket to ride needs quite a lot to work".
- **Built:** readable phone labels, smooth land, solid claimed routes, compact phone panel (chips, cards, tickets), card-back piles, claim route glow, laptop sheets over the side panel, "Just mine" final score fix.
- **Verified:** 75/75 tests; before/after screenshots of 13 states at 393px and 1280px (no page scroll, no overflow, no console errors); 478 route taps at 393px, 0 missed.
- **Open:** Tim's eye on the new look; real iPhone check.

## 2026-10-20 — design pass 2 (builder under the manager)
- **Asked:** a deeper round on TtR: board-like map on a phone, readable tunnels/ferries/doubles, colour-blind help where cheap, real-looking cards, two-tap claim, physical pan/zoom, all 5 maps.
- **Built:** track beds, claimed trains on a casing, tunnel ties, ferry bands + loco badges, lake fill, label cap; pinch-pan, flick coast, gliding zoom buttons; card faces/piles/backs, mini cards in the claim sheet; Settings "Colour-blind marks".
- **Verified:** 75/75 tests; 30 before/after screenshots (393 px + 1280 px, all 5 maps); physics script (pinch anchor 0.05 units, flick glides on, no jump when a finger lifts); 477/478 route taps.
- **Open:** real-finger feel on Tim's iPhone; Tim's call on the new look and the colour-blind switch wording.

## 2026-10-20 — real maps (builder under the manager)
- **Asked:** Tim: "the map of the US in TTR looks nothing like the US. Fix this and any other similar problems accross the games".
- **Built:** Natural Earth coastlines, lakes and borders for all 5 maps (build-time `tools/geo-art.js`, one thin-plate-spline warp so coasts bend with nudged cities, `maps/<id>.art.json`); faint US state lines; Swiss neighbours darker and lakes widened; land lighter, sea/lakes darker (manager: land must stand out); label keep-out around other cities.
- **Verified:** 80/80 tests (new art test failed on the old build first); 393 px + 1280 px screenshots of 15 states, no overflow, no console errors; route taps 477/478 before and after; two blind reviewer passes named all 5 maps, second found no major errors.
- **Open:** Tim's eye on the colours; real iPhone.

## 2026-10-20 — auto zoom (builder under the manager)
- **Asked:** Tim: "only an auto zoom that automatically fits the whole board in sight and then you can zoom if you want with easily reseting back to auto mode" (all zoomable boards).
- **Built:** board.js auto mode (fit whole board incl. names, re-fit on resize with a glide, no drag in auto), hand zoom by pinch/wheel/+/−, clamped pan, fit button dimmed/lit, double tap on empty board resets; auto on tab show, map change, Start and rotation. v1.6.
- **Verified:** `tools/zoom-check.mjs` 201/201 (old build 150/201); 80/80 unit tests; 393 px + 1280 px screenshots, no overflow, no console errors.
- **Open:** real fingers on iPhone; route-tap sweep not re-run.

## 2026-10-20 — sounds & effects (builder under the manager)
- **Asked:** Tim: optional sounds that match what happens, win celebrations, fun animations, all switchable in Settings.
- **Built:** shared `js/fx.js` + `js/sfx.js` (state diff → events → sounds/animations) for vs computer, online and Table; Settings "Sound & effects"; score count-up, longest-route sparkle, win/lose. v1.7.
- **Verified:** tests/fx.test.js (fail-first) + 85/85; WebKit 393 px + 1280 px screenshots of settings, mid-game, win (confetti), no console errors/overflow.
- **Open:** Tim's ear on the sounds; real iPhone.

## 2026-10-20 — real-table look (builder under the manager)
- **Asked:** Tim: make every game look like the real board/cards laid out on a real table, "like you're looking through a camera that is connected to a user's glasses" (full quote in progress.md Standing instructions).
- **Built:** wooden table, framed board with 0–100 score track + markers, parchment map, rival seats (backs fan, tickets, train heaps), supply (decks with thickness, 5 face-up, messy discard), my seat (tickets as cards, hand fanned by colour); deal / pay-to-discard / flip animations; fx.js 1.0.3 re-copied; `_table` kit copied. v1.8, cache ?v=9.
- **Verified:** 85/85 tests; zoom-check 196/201 under load (main 193/201 same run), 201/201 with 4× waits; WebKit shots at 320/393/659-landscape/1280, no scroll/overflow/errors; Effects speed taps leave Computer speed alone; deck draw + face-up take in WebKit, no errors; two reviewer passes.
- **Open:** real iPhone; route-points chart; ticket stack past 3.

## 2026-10-20 — edge pass (builder under the manager)
- **Asked:** Tim: "Could you focus on making each game perfect especially in scenarios that the game doesn't expect or are a little weird."
- **Built:** Pass when nothing can be drawn + game ends when everyone passes; shared-win ties; station payment check; compact seats for 5 players on phones; two-tab sync and computers pause in hidden tabs; empty deck disabled; station mode reset; Table chips/status at 320. v1.9, cache ?v=10.
- **Verified:** 69 scenarios (scratchpad `edge/ticket-to-ride/`, session acb6c2a0), 14 failed before, 0 after; tests/edge.test.js failed first on old code; 90/90.
- **Open:** two tabs and Pass online on a real phone.

## 2026-10-20 — visibility pass (builder under the manager)
- **Asked:** Tim: "for a lot of the games the cards or board layout is too small to easily see what's going on ... some have severe errors like TTR. Fix this so the view of what's happening and where everything is is very clear."
- **Built:** board frame sized to the map's shape (laptop, sideways); sideways Table/Lab board-left layout; + only in auto, in a free map corner; measured label widths, labels kept in the board and off cars; crowded taps magnify first; city taps only where cities are used. v1.10, cache ?v=11.
- **Verified:** 90/90 tests; zoom-check 226/226 (old build 202/226); route tap sweep 478/478 WebKit + Chrome; WebKit shots at 320/393/659-sideways/1280/1440 × 8 states, no scroll/overflow/errors; one reviewer pass (fixed: sideways chips and status line, stacked-label overlaps).
- **Open:** NE USA names sit inland (New York beside Pittsburgh); 320 px Play map still small; real iPhone fingers.

## 2026-10-21 — visibility round 2 (builder under the manager)
- **Asked:** manager for Tim: "the after-shots still waste space": laptop supply into the right panel and a taller map (~60%); phone rival counts into the seat chips, shorter face-up row, map bigger with a slight pan and a fit button, names ≥ 9 px; fix 320 the same way.
- **Built:** `.deal` right column on laptop; rival count chips; phone home view zoomed to 9 px names around my tickets (fit toggles whole map); smaller face-up cards; bottom row plate · hand · tickets. v1.11, cache ?v=12.
- **Verified:** tools/play-layout-check.mjs 24/24 (old code failed 10); 90/90; zoom-check 226/226; tap sweep 478/478; 40 WebKit shots; one reviewer pass (fixed: laptop tickets cut off, chip names clipped at 320 and sideways).
- **Open:** real iPhone; edge names cut in the zoomed phone view.
