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
