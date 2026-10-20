# Ideas: data, exploration and theory for Ticket to Ride

Brainstorm for Tim's phase-2 ask ("Brainstorm what additions you can do to the game with data, exploration, theory"). Each idea is marked **Build** or **Skip** with the reason. "Built" means it's in the site now.

| # | Idea | Call | Why |
|---|------|------|-----|
| 1 | **Ticket chance bars**: for each of my tickets, the chance I still finish it (Monte Carlo: rivals take busy routes, the game ends a few turns after someone runs low) | Build (built) | The core question at the table: "can I still make this?" |
| 2 | **Keep/toss advisor**: expected points for every set of drawn tickets, using shared track (a ticket that rides on track I already need costs few extra trains) | Build (built) | Ticket choice is the biggest decision in the game and the easiest to get wrong |
| 3 | **Busy-route heatmap**: how many tickets' cheapest paths use each route | Build (built) | Shows which routes go early and are worth blocking |
| 4 | **Detour cost**: if a route is taken, how many more trains the way around costs | Build (built) | Turns "should I grab this now?" into a number |
| 5 | **Points per train** for every ticket (ticket + route points ÷ trains) | Build (built) | Shows which tickets are efficient on each map and deck |
| 6 | **Hint with a reason** from the Hard computer | Build (built) | Learn by seeing why, not only what |
| 7 | **Study mode**: show computers' hands and tickets | Build (built) | Lets you check how the computer thinks |
| 8 | **Score race chart** after a game: each player's score turn by turn | Build | Cheap and shows where the game was won |
| 9 | **Live longest route** for each player during play and at the table | Build | The 10-point bonus decides close games; players lose track of it |
| 10 | **Card counter**: how many of each colour are still unseen (not in my hand, the face-up row or the discard) | Build | Real players count cards; the app can do it exactly |
| 11 | **Rival ticket guess**: which tickets each rival most likely holds, inferred from the routes they've claimed | Build | Pure theory from data: their track gives their destinations away |
| 12 | **Ticket overlap**: which tickets share track | Skip (covered) | Already inside the keep/toss "trains more" number |
| 13 | Live win-probability meter from thousands of self-play rollouts | Skip | Too slow on a phone for every move; the chance bars cover most of it |
| 14 | Map facts page (choke points, average ticket length per map) | Skip | Lab's busy routes and ticket table already show this per map |
| 15 | Daily seed challenge / leaderboards | Skip | Not asked for; needs accounts |
| 16 | Full game replays | Skip | Log + score chart give most of the value |
| 17 | Route-value table (points per train by route length) | Skip | One line of arithmetic; the "?" on points per train explains it |
