# Ticket to Ride — progress

## START HERE
Read order: this file → `CLAUDE.md` → `docs/rules-check.md` → `docs/ideas.md`. Last updated: 2026-10-19 (phase 2 build).

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

## NOT verified
- Online play with a real second iPhone (verified only with two headless WebKit iPhones against the real Firebase project).
- Online rooms of 3–5 people (only 2 tested end-to-end; the game object is tested for every count in node).
- How the hint `why` wording reads to Tim.

## Rejected / parked
- Ideas 12–17 in docs/ideas.md (parked, reasons there).
