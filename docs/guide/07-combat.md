# Combat: Weapons, NPCs, and Player Death

Combat in folklore is not a separate system. It is the `on-*` dispatcher applied to health values. The schema provides the data; the client resolves each round. Different worlds can define entirely different combat feels purely through tag values.

This guide covers weapons, NPC combat stats, the attack round sequence, player health, death consequences, and NPC death rewards.

> ▶ **Try it:** Import [tides-end-07-combat.json](tutorials/tides-end-07-combat.json) to explore these concepts in a working world.

---

## The Attack Command

`attack` is a built-in command. Players type:

```
attack <npc>
attack <npc> with <weapon>
```

The client resolves the weapon from inventory (if omitted, it picks the first item with a `damage` tag) and runs the combat round. You do **not** add `attack` to verb tags — it is always available.

---

## Weapons

A weapon is an item with a `damage` tag and an `on-interact` trigger for the `attack` verb.

```json
{
  "tags": [
    ["d",            "my-world:item:rusty-sword"],
    ["type",         "item"],
    ["title",        "Rusty Sword"],
    ["noun",         "sword", "rusty sword", "blade"],
    ["damage",       "3"],
    ["on-interact",  "attack", "deal-damage-npc", ""]
  ],
  "content": "A battered sword. Rusty but still sharp."
}
```

Key tags:

- **`damage`** — integer string. The amount of damage dealt per hit.
- **`hit-chance`** — optional float string `0.0–1.0`. Probability of hitting. Defaults to `1.0` if omitted.
- **`on-interact attack deal-damage-npc ""`** — fires when the player attacks. The empty target means it hits whatever NPC the player targeted.

Do **not** add a `verb` tag for `attack`. It is built-in. You can still add other verbs like `light` or `throw` to a weapon if needed.

---

## NPCs in Combat

An NPC becomes a combat target when it has a `health` tag. Add `damage`, `hit-chance`, and `on-attacked` tags to control how it fights back.

```json
{
  "tags": [
    ["d",            "my-world:npc:giant-rat"],
    ["type",         "npc"],
    ["title",        "Giant Rat"],
    ["noun",         "rat", "giant rat"],
    ["health",       "8"],
    ["damage",       "2"],
    ["hit-chance",   "0.6"],
    ["state",        "hostile"],
    ["on-attacked",  "", "deal-damage", "2"]
  ],
  "content": "An enormous rat baring yellowed fangs."
}
```

NPC combat tags:

| Tag | Value | Meaning |
|-----|-------|---------|
| `health` | Integer string | NPC hit points |
| `damage` | Integer string | Damage dealt per hit |
| `hit-chance` | Float `0.0–1.0` | Probability of hitting (default `1.0`) |

The `on-attacked` tag fires after the player attacks. Its shape:

```
["on-attacked", "<item-ref-or-blank>", "<action-type>", "<action-arg?>", "<external-target?>"]
```

- Empty first argument means "fires on any attack."
- An item ref means it only fires when attacked with that specific weapon.
- The most common action is `deal-damage` to counterattack the player.

---

## Combat Round Sequence

Each round follows this order:

1. Player issues `attack` — fires `deal-damage-npc` on the target NPC.
2. If the NPC is still alive, `on-attacked` fires — typically `deal-damage` against the player.
3. Check all `on-health` tags on the NPC — fire any whose threshold is crossed.
4. Check all `on-player-health` tags — fire any whose threshold is crossed.

The client handles all of this automatically based on the tags. Authors define the data; the engine runs the sequence.

---

## Player Health

Player health is declared on the **world event** with two tags:

```json
["health",     "10"],
["max-health", "10"]
```

- `health` — starting hit points.
- `max-health` — ceiling. Healing cannot exceed this value.

These values are tracked in local player state and persist across sessions.

---

## Death and Consequences

When the player's health reaches zero, you need two things: an `on-player-health` trigger on the world event, and a consequence event that defines what happens.

### The trigger (on the world event)

```json
["on-player-health", "down", "0", "consequence", "30078:<PUBKEY>:my-world:consequence:death"]
```

This fires globally — no matter where the player dies, this consequence runs. You can also place `on-player-health` on individual NPCs for NPC-specific reactions.

### The consequence event

```json
{
  "tags": [
    ["d",       "my-world:consequence:death"],
    ["type",    "consequence"],
    ["respawn", "30078:<PUBKEY>:my-world:place:the-tavern"]
  ],
  "content": "Everything goes dark. You wake up bruised but alive."
}
```

Consequence tags:

| Tag | Value | Effect |
|-----|-------|--------|
| `respawn` | Place a-tag | Moves the player to this place (fires last) |
| `clears` | State key | Wipes part of player state: `inventory`, `states`, `counters`, `cryptoKeys`, `dialogueVisited`, `paymentAttempts`, `visited` |
| `give-item` | Item a-tag | Adds an item to inventory |
| `consume-item` | Item a-tag | Removes an item from inventory |
| `deal-damage` | Integer string | Reduces player health |
| `set-state` | State string + optional event a-tag | Transitions an event to a new state |

A gentle death consequence uses only `respawn` — the player keeps their inventory and progress. A harsh one adds `clears inventory` or `clears states` to strip progress. When `clears inventory` fires, items are dropped at the death location, not destroyed.

---

## NPC Death and Drops

When an NPC's health reaches zero, use `on-health` triggers to change its state and optionally drop items.

```json
["on-health",   "down", "0", "set-state",  "dead"],
["on-health",   "down", "0", "give-item",  "30078:<PUBKEY>:my-world:item:cellar-key"],
["transition",  "hostile", "dead", "The rat collapses. A rusty key glints on the ground."]
```

The `on-health` tag shape:

```
["on-health", "<direction>", "<threshold>", "<action-type>", "<action-target?>"]
```

- `direction` — `down` or `up`. `down` fires when health crosses at-or-below the threshold.
- `threshold` — integer or percentage string (e.g. `"0"`, `"50%"`).
- The transition text provides the narrative when the NPC changes state.

You can use multiple `on-health` tags at different thresholds for staged reactions:

```json
["on-health", "down", "50%", "set-state", "wounded"],
["on-health", "down", "0",   "set-state", "defeated"],
["on-health", "down", "0",   "give-item", "30078:<PUBKEY>:my-world:item:loot"]
```

---

## Builder Walkthrough: Setting Up Combat

Here is the step-by-step process for adding combat to a world:

1. **Add health to the world event.** Add `["health", "10"]` and `["max-health", "10"]` tags. These set the player's starting and maximum health.

2. **Create a death consequence.** Add an event with `type: consequence`, a `respawn` tag pointing to a safe place, and content describing the death. Optionally add `clears` tags.

3. **Wire the world event to the consequence.** Add `["on-player-health", "down", "0", "consequence", "<death-ref>"]` to the world event.

4. **Create a weapon.** Make an item with `damage`, `noun` tags, and `["on-interact", "attack", "", "deal-damage-npc", ""]`. Do not add `attack` as a verb.

5. **Create a combat NPC.** Add `health`, `damage`, `hit-chance` (optional), a `state` tag (e.g. `hostile`), and `["on-attacked", "", "deal-damage", "<amount>"]`.

6. **Handle NPC death.** Add `["on-health", "down", "0", "set-state", "dead"]` and a transition from the initial state to `dead`. Optionally add `give-item` on the same threshold for loot drops.

7. **Place the NPC.** Add an `["npc", "<npc-ref>"]` tag to the place event.

8. **Test the flow.** Attack the NPC, verify damage and counterattack, verify death drops, and verify player death respawn.

---

## Tips

- **Weapon selection** — If the player types `attack rat` without specifying a weapon, the client picks the first inventory item with a `damage` tag. Players can be explicit: `attack rat with sword`.
- **Hit chance** — Use `hit-chance` on both weapons and NPCs for miss/dodge mechanics. Omit it for guaranteed hits (Zork-style).
- **Scaling difficulty** — Adjust NPC `health`, `damage`, and `hit-chance` to tune difficulty. High health + high damage = souls-like. Low health + fixed damage = Zork-simple.
- **Multiple NPCs** — A room can have multiple NPCs. Players target by noun. The client prompts for disambiguation if needed.
- **Healing** — Add a healing item with `["on-interact", "drink", "", "heal", "6"]` and `["on-interact", "drink", "", "consume-item", ""]` to let players recover health.
- **Gentle deaths** — A consequence with only `respawn` is forgiving — the player keeps everything. Add `clears inventory` for stakes.
- **NPC state sync** — When an NPC's state changes via `set-state`, it writes to both `npcStates` and the player's `states` map so that `requires` tags can check NPC state elsewhere.

---

## Tutorial World

> ▶ **Try it:** Import [tides-end-07-combat.json](tutorials/tides-end-07-combat.json) to play through everything covered in this guide.

The walkthrough: pick up the lantern, light it, descend to the cellar steps, grab the rusty sword, go down to the cellar, and fight the giant rat. Defeating it drops a cellar key. If the rat kills you, you respawn in the tavern.
