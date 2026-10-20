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
