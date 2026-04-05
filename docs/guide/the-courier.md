# The Courier

A logistics puzzle in five rooms. One pair of hands. A thief in the shadows. A clock that won't stop.

> ▶ **Try it:** Import [the-courier-events.json](tutorials/the-courier-events.json) to play the world.

---

## Concept

The Courier strips folklore down to pure puzzle. No combat, no dialogue trees, no branching narrative. Five rooms in a line, four items to deliver, and a carry limit of one.

Every move is a decision. Pick up the package or the letter? Go east toward the tower or west to find the coin? The thief roams the street and market — if you're carrying something when you cross paths, it's gone. You'll find it at the dock eventually, but that costs moves. And the temple gates close at move 30.

---

## Mechanics Showcased

**Inventory cap** — `max-inventory: 1` forces every pickup to be a choice. The `drop` command returns items to the current room. The entire puzzle is built around this constraint.

**World counters + HUD** — `moves` increments on every room entry. `deliveries` increments on each successful handoff. The HUD shows both in real time: `Moves: 12 | Deliveries: 2/4`.

**State-guarded interactions** — Each delivery point uses `on-interact` with a state guard. The tower slot only accepts the package when `empty`. Once `delivered`, the same verb does nothing. No double-counting, no exploits.

**Chained dependencies** — The brass coin doesn't exist until you deliver the letter to the temple offering bowl. The `on-interact place` action sets the coin's state to `visible`. You can't plan all four deliveries from the start — the fourth reveals itself mid-game.

**Roaming NPC with steal + stash** — The Shadow moves randomly between dock, street, and market. `on-encounter steals-item` takes whatever you're carrying. `stash` on the dock means stolen items eventually appear there — but retrieving them costs moves.

**Counter threshold** — `on-counter up moves 30` sets the temple gates to `closed`, blocking the tower path. The timer creates urgency without a literal clock.

**Named exits** — Rooms use place names as exit slots (`street`, `market`, `temple`) instead of compass directions. The player types where they want to go, not which direction.

---

## The Puzzle

The optimal route requires thinking about:
- Which items to deliver first (the letter must come before the coin)
- When to cross the street (the thief's position is pseudo-random)
- Whether to deliver the far item (package to tower) early or late
- What to do if the thief steals your item (chase to dock, or continue?)

There is no single solution. The thief's random movement means every playthrough has different risks. But 30 moves is generous if you plan ahead — tight if you don't.

---

## Design Notes

The Courier demonstrates that folklore's tag system can build pure puzzle games, not just narrative adventures. The same mechanics that power a sprawling open world (state, counters, NPCs, items) create a tight five-room brain teaser when constrained.

The Game Boy colour palette and CRT effects reinforce the retro puzzle aesthetic. The terse prose — "Grey water. Rotting pilings." — keeps the focus on decisions, not atmosphere.

The world is `closed` collaboration — it's a designed puzzle, not an open canvas. But the same pattern could be extended: more rooms, more items, carry limit of 2, multiple thieves, branching routes.
