# Ticket to Ride — companion, computers, online rooms and a route lab

Live: https://timothyhadfield.github.io/ticket-to-ride/

An unofficial fan site for the board game, with five maps: USA (Classic, 1910, Big Cities and Mega Game tickets), Europe, Nordic Countries, India and Switzerland.

- **Table:** a companion for a real game. Tap each route as it's claimed to get live scores, trains left and the chance of finishing each of your tickets.
- **Play:** play against Easy, Medium or Hard computers, whose strength is measured by self-play (`data/strength.json`). It has hints and a study mode. You can also play online in a room with a 5-letter code, where each seat is a friend or a computer.
- **Lab:** cheapest paths, ticket points per train, the busiest routes, and what blocking a route costs.

To run the tests: `node --test tests/*.test.js`. To measure the computers: `node tools/strength.js 1000 usa,europe,nordic,india,switzerland`.

The board drawings, cards and icon are original. Coastlines, lakes and borders: Natural Earth (public domain), drawn at build time by `tools/geo-art.js`. Ticket to Ride is a Days of Wonder game. Rules sources are listed in `docs/rules-check.md`.
