# Saturday

A Saturday morning. Chores to do. Things to buy. Not enough money for everything.

> ▶ **Try it:** Import [saturday.json](tutorials/saturday.json) to play the world.

---

## Concept

Saturday is a showcase for folklore's counter system — specifically how world-scoped counters create legible resource economics. The player earns coins by doing chores, then spends them at the toy shop at the end of the road. There is just enough money for the best toy if you do everything. There is not enough if you spend on sweets.

No combat. No puzzles. No locked doors. Just a Saturday morning and a set of choices about what to do and in what order.

---

## Mechanics Showcased

**World counter as currency** — A single `coins` counter on the world event tracks the player's money. Every chore adds to it via `add-counter`. Every purchase subtracts via `sub-counter`. The HUD shows the current total at all times: `Coins: 4`.

**`requires-counter` as price gate** — Each item in the toy shop uses `requires-counter coins >= N` to block purchase when funds are insufficient. The error message names the price. Players always know exactly what they need.

**Budget decisions** — Total earnable coins: 9 (3 chores at 2+3+2, sofa search +1, talking to Dad +1). The RC car costs 7. Sweets cost 1. Buying sweets early means you need to find every other coin source to afford the car. The tension is real because the numbers are visible.

**One-time actions via state** — Chores transition from their initial state to `done` and cannot be repeated. The sofa search transitions to `searched`. Dad's dialogue fires the coin on first conversation only, routing to a different node thereafter via NPC state guard. None of these need special engine logic — state is the lock.

**Quest log as progress tracker** — "Mum's List" uses `involves` tags on all three chores. The quest log shows a checklist: ticked chores, unticked ones still to do. Completing the list changes Mum's dialogue.

**NPC dialogue with `on-enter` actions** — Dad's first conversation fires `add-counter coins 1` and sets his state to `chatted` via `on-enter` on the dialogue node. The second visit routes to a different node that does nothing. All data-driven, no code.

**Endgame on purchase** — Buying the RC car satisfies the `best-saturday` endgame quest's `requires`. The closing prose fires immediately. No separate trigger needed.

---

## The Map

```
        [Bedroom]
            |
         upstairs
            |
[Garden]--[Front Room]--[Kitchen]
  east       |    north
           south
             |
        [Corner Shop]
             |
           south
             |
        [Patel's Toys]
```

Five places. Four portals. One linear street with the house branching off the top.

---

## The Numbers

| Source | Amount | Repeatable |
|--------|--------|------------|
| Wash up | +2 | No |
| Mow lawn | +3 | No |
| Tidy bedroom | +2 | No |
| Search sofa | +1 | No |
| Talk to Dad | +1 | No |
| **Total earnable** | **9** | |

| Item | Cost |
|------|------|
| Sweets | 1 |
| Yo-yo | 3 |
| Action figure | 5 |
| RC car | 7 |

Buying sweets + RC car costs 8. You need all five sources. Buying sweets + action figure costs 6. Doable with three chores and one secret coin. The yo-yo is always reachable after a single chore. These numbers create a natural difficulty curve depending on what the player wants.

---

## Design Notes

The counter system earns its place when the number is always meaningful to the player. Short descriptions, price tags in examine text, and the HUD showing the current total mean the player is never guessing. Every interaction either adds or subtracts a visible amount from a visible number.

The sofa and Dad are both optional — they exist to reward exploration and curiosity rather than thoroughness. A player who ignores them entirely can still afford the yo-yo or the action figure. Only the RC car (the best outcome) requires finding both.

The corner shop is a temptation, not an obstacle. Sweets cost 1 coin and give a carry-able item but no mechanical advantage. Buying them is a small, real decision: slightly fewer options at the toy shop. That trade-off — immediate small pleasure vs. deferred larger reward — is the whole game in miniature.
