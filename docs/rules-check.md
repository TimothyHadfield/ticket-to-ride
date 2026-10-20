# Rules check: every number the engine uses, with its source

Last checked 2026-10-19. The engine reads these numbers from `maps/<id>.json`, which `tools/build-maps.js` builds.
Tests: `tests/rules.test.js` (one test per rule below), `tests/maps.test.js` (counts), `tests/sim.test.js` (whole computer games).

**Sources** (text extracts kept with the research notes)
- [USA] Official Days of Wonder rules 2015: https://ncdn0.daysofwonder.com/tickettoride/en/img/tt_rules_2015_en.pdf
- [EU] Official Days of Wonder Europe rules 2015: https://ncdn0.daysofwonder.com/tickettoride/en/img/te_rules_2015_en.pdf
- [NOR] Nordic Countries rulebook (2015 printing): https://lot.ahml.info/Ticket_To_ride_Nordic.pdf
- [NOR-edp] Condensed Nordic rules by Eric Postpischil: https://edp.org/Games/TicketToRideNordicCountries.pdf
- [NOR-board] Nordic board photo: https://boardgamegeek.com/image/419030
- [NOR-dh] Second Nordic data set (dhurley14): https://raw.githubusercontent.com/dhurley14/random/master/ticketToRide/edges.txt and .../DestinationCards.java
- [IND] India rules (Map Collection 2): https://lot.ahml.info/Ticket_To_Ride_India.pdf
- [IND-board] India board photo: https://boardgamegeek.com/image/1243344
- [SUI] Switzerland rules (Map Collection 2): https://lot.ahml.info/Ticket_To_Ride_Switzerland.pdf, and the 2007 sheet: https://www.spellenlab.be/media/files/10ffebf28f65d2fc2dedd8227ecde665b3b9934c.pdf
- [SUI-board] Switzerland board photo: https://boardgamegeek.com/image/1243343 ; tickets photo: https://boardgamegeek.com/image/1077592
- [SUI-tchu] EPFL "tCHu" Swiss map data: https://github.com/David-Kyrat/CS108_Project-tCHu/blob/main/src/ch/epfl/tchu/game/ChMap.java
- [FMS] Route/ticket lists: https://github.com/fernandomsilva/Ticket-to-Ride-Engine
- [BGA-maps] https://en.doc.boardgamearena.com/Gamehelptickettoridemaps
- [EOG] https://www.orderofgamers.com/downloads/TicketToRide_v1.1.pdf · [SLY] https://www.steveandamysly.com/2010/07/20/thoughts-on-ticket-to-ride-usa-1910-expansion/

## USA
| Fact | Value | Sources |
|---|---|---|
| Players / trains | 2–5 / 45 | [USA] |
| Train deck | 110 = 12 × 8 colours + 14 locos | [USA] |
| Tickets | Classic 30; 1910 35; Big Cities 35; Mega 69 | [USA], [SLY] [EOG] |
| Start / mid-game tickets | deal 3 keep 2 / draw 3 keep 1 (Big Cities 4/4, Mega 5 keep 3 / 4 keep 1), returned to bottom | [USA], [EOG] [SLY] |
| Face-up loco | only card that turn; 3 face up → redeal | [USA] |
| Doubles | 2–3 players: one side only | [USA] |
| Longest route | 10 (1910 deck: Globetrotter 15 instead; Mega both) | [USA], [EOG] [SLY] |

## Europe
| Fact | Value | Sources |
|---|---|---|
| Players / trains | 2–5 / 45 | [EU] |
| Deck | 110 (14 locos) | [EU] |
| Tickets | 46 = 6 long + 40 regular; start 1 long + 3 regular, keep 2; unkept long ones leave the game | [EU] |
| Stations | 3, cost 1/2/3, +4 each unused | [EU] |
| Ferries / tunnels | 1 loco per symbol / 3 revealed cards, matches pay extra | [EU] |
| European Express | 10 | [EU] |

## Nordic Countries
| Fact | Value | Sources |
|---|---|---|
| Players / trains | 2–3 / 40 | [NOR] |
| Train deck | **110 = 12 × 8 colours + 14 locos** (was wrongly 61 locos; fixed) | [NOR], [NOR-edp], [NOR-dh] code |
| Routes / tickets | 81 / 46 | [FMS] and [NOR-dh] agree (script compare) |
| Start tickets | deal 5, keep ≥2; **returned ones leave the game** | [NOR] |
| Mid-game tickets | draw 3, keep ≥1; **returned ones leave the game** | [NOR] |
| Locomotives | wild **only on ferries and tunnels**; never on ordinary routes | [NOR], [NOR-edp], [BGA-maps] |
| Face-up locos | drawn like any card, two per turn OK | [NOR] ("no restriction on the number of Locomotive cards you may draw") |
| Ferries | 1 loco per symbol, **or any 3 cards per loco**; extra locos may replace colour cards | [NOR], [NOR-edp] |
| Murmansk–Lieksa (9, grey) | **any 4 cards (locos included) stand in for 1 card** of the chosen colour, as often as wanted | [NOR], [NOR-edp] |
| Tunnels | as Europe | [NOR] |
| Doubles | 2 players one side; 3 players both | [NOR] |
| Route points | 1,2,3,4,5,6,9 → 1,2,4,7,10,15,27 | [NOR] |
| Bonus | **Globetrotter 10** (most completed tickets, ties all); **no longest-route bonus** | [NOR] |
| Tie-break | most completed tickets, then longest route | [NOR] |
| Helsinki–Tallinn | ferry 2 with 1 loco | [FMS] + [NOR-board] photo (dhurley14 says plain) |

## India
| Fact | Value | Sources |
|---|---|---|
| Players / trains | 2–4 / 45 | [IND] |
| Deck | standard 110 | [IND] |
| Routes | **108**: one Ambala–Bareilly (the list had it twice); the 8-long 2-loco ferry is **Calcutta–Madras** (list said Chittagong) | [IND-board] photo, every route checked |
| Tickets | 58 | [IND], 41 of 58 matched on ticket photos |
| Start tickets | deal 4, keep ≥2, returned to bottom | [IND] |
| Mid-game tickets | **draw 3**, keep ≥1 (was wrongly 4; fixed) | [IND] |
| Doubles | 4 players both; 2–3 one side | [IND] |
| Ferries / tunnels | 1 loco per symbol / none on the board | [IND], [IND-board] |
| Indian Express | **10** for the longest path (was missing; fixed) | [IND] (EN, FR, DE, IT, NL texts) |
| Mandala (Grand Tour) | **total** by qualifying tickets: 1→5, 2→10, 3→20, 4→30, 5+→40 (was 6→50; fixed) | [IND] text ("largest bonus … is 40") + [IND-board] table |
| City names | as printed: Jarhat, Ratiam, Waltain, Indur, Mormugau (the display "fixes" to modern spellings were removed) | [IND-board], ticket photos |

## Switzerland (new)
| Fact | Value | Sources |
|---|---|---|
| Players / trains | 2–3 / 40 | [SUI] |
| Deck | standard 110 (14 locos) | [SUI] |
| Cities | 34, plus 17 border flags: 5 Germany, 3 Austria, 5 Italy, 4 France (each track ends at its own flag; any flag counts as that country) | [SUI] ("3 routes … to Austria, 4 to France, 5 to Italy and 5 to Germany"), [SUI-board], [SUI-tchu] |
| Routes | 88 (tunnels as Europe, no ferries, lengths 1–6) | [SUI-tchu] + [SUI-board] checked route by route |
| Tickets | 46 = 34 city–city + 4 city→countries + 8 country→countries (4 kinds, 2 copies each) | [SUI] (FR text gives 4 + 8), [SUI-tchu] |
| Start / mid-game tickets | deal 5 keep ≥2 / draw 3 keep ≥1; **returned tickets leave the game** (the deck can run out) | [SUI] |
| Country tickets | score the **highest** option completed; none → **lose the lowest** value | [SUI], [BGA-maps] |
| Locomotives | drawn like any card (two OK); **3 face up → all 5 replaced**; usable **only on tunnels** | [SUI] (EN and FR) |
| Doubles | 2 players one side; 3 players both | [SUI] |
| Route points | 1–6 → 1,2,4,7,10,15 | [SUI-board] |
| Longest path | 10, named "Transalpine Express" | [SUI] (10 points), name from [SUI-board] only |
| City ticket values | all 34 equal the shortest route on our data (test) | measured |

## Not confirmed
- **Nordic Helsinki–Kirkenes ticket: 13 or 15?** [FMS] says 13, [NOR-dh] says 15, no photo found. We use **13** (it equals the shortest route, like every other Nordic ticket).
- **Nordic three face-up locomotives:** the rulebook says nothing; [NOR-edp] says the usual sweep does **not** apply; [BGA-maps] says drawing "matches Switzerland" (which sweeps). We **do not sweep**.
- **Nordic ferries, any 3 cards on non-loco spaces:** [NOR] says any 3 cards replace a locomotive (and locos may replace colours), [NOR-edp] reads it as any space. The engine accepts both; the pay list only offers swaps for the loco symbols.
- **Switzerland country tickets:** only [SUI-tchu] has the full list; three cards checked on the photo (Bern ×4 options, France→Deutschland 5, France→Österreich 14). Nine options differ from the shortest route by 1–2 (Chur→France 12, Deutschland↔Italia 13, Italia/France 11) — kept as listed.
- **Switzerland bonus name** "Transalpine Express": board photo only, not in the rule text.
- **Swiss / border flag positions** on our drawing are real places just across the border, not traced from the board.
- **17 India tickets** rest on [FMS] alone (not visible on the photos).
- **Route score for length 7** (18) is not printed on any of these five maps; no route has length 7.
