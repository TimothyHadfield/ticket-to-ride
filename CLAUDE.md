# Ticket to Ride site — project rules

Tim's global rules and the Code Projects root CLAUDE.md apply. Read `progress.md` first.

- **What it is:** a static GitHub Pages site (https://timothyhadfield.github.io/ticket-to-ride/), repo `TimothyHadfield/ticket-to-ride` (public). Four tabs: **Table** (companion for a real game), **Play** (vs computers, or an online room), **Lab** (route numbers), **Settings**.
- **Maps:** USA (Classic, 1910, Big Cities, Mega Game decks), Europe, Nordic Countries, India, Switzerland. The map JSON in `maps/` is generated: edit `tools/src/*.txt` and run `node tools/build-maps.js`. Every rule and number is sourced in `docs/rules-check.md`.
- **Engine is pure:** `TTR.newGame / apply(state, action) / view(state, seat)` in `js/engine.js`, seeded RNG, JSON-safe state. The UI and the computers never touch hidden info except through `view`.
- **Online:** `js/online.js` is a copy of `../_online/online.js` — **never edit it here**; re-copy it unchanged when the shared module changes. `js/online-game.js` wraps the engine for it (gameId `ticket-to-ride`, Firebase project `th-board-games`, free Spark plan). No Firebase config or rules live in this repo.
- **Computers:** `js/ai.js`, levels easy/medium/hard. After changing them, re-measure with `node tools/strength.js 1000 usa,europe,nordic,india,switzerland` (about 10 min) — it rewrites `data/strength.json`, which the app shows. Keep Easy < Medium < Hard on every map.
- **Tests:** `node --test tests/*.test.js` (Windows needs the glob). A new test must be seen failing first.
- **Cache strings:** bump `?v=` in `index.html` and `VERSION` in `js/app.js` on each release.
- No copyrighted art or rules text: the board drawings, cards and icon are our own SVG.
