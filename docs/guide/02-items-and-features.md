# Tutorial 2: Items and Features

This tutorial introduces the two kinds of "things" that populate a folklore world: **items** (portable objects the player can pick up and carry) and **features** (fixed parts of a place that can be examined and interacted with but never picked up). It also covers **nouns** and **verbs** — the tags that make things referenceable and interactive.

> ▶ **Try it:** Import [tides-end-02-things.json](tutorials/tides-end-02-things.json) to explore these concepts in a working world.

---

## Items vs Features

| | Item | Feature |
|---|---|---|
| Type tag | `"type", "item"` | `"type", "feature"` |
| Portable | Yes — `take`, `drop` | No — fixed in place |
| Placed by | `["item", "<ref>"]` on a place | `["feature", "<ref>"]` on a place |
| Inventory | Moves between place/player/NPC | Always stays in its place |
| Examine | Built-in `examine` command | Built-in `examine` command |
| Custom verbs | Optional `verb` + `on-interact` | Optional `verb` + `on-interact` |

Both items and features are **placed by the place author** — the place event references them with `["item", "<ref>"]` or `["feature", "<ref>"]` tags. The item or feature event itself does not declare its location.

---

## Nouns

The `noun` tag makes a thing referenceable in player commands. The first value is the **canonical noun** used internally; additional values are **aliases** the parser also accepts.

```json
["noun", "lantern", "old lantern"]
["noun", "coin", "sand coin"]
["noun", "notice board", "board", "notice"]
```

### Article stripping

The parser strips leading articles (`the`, `a`, `an`) from player input before matching. Noun tags should never include articles — bare nouns only. This means a single tag covers all natural phrasings:

```
["noun", "lantern", "old lantern"]

matches: lantern, the lantern, a lantern, the old lantern, an old lantern
```

### Disambiguation

When multiple things in scope share a noun value (e.g. two items both called "key"), the client prompts the player to choose using their `title` tags:

```
Which key?
1. Rusty Key
2. Golden Key
```

### Who gets nouns?

Places, items, features, and NPCs can all carry `noun` tags. Exit slot names (`north`, `east`, etc.) serve as nouns for movement — you don't need noun tags for directions.

---

## Verbs

Verbs define what a player can **do** to a thing beyond the built-in commands.

### Built-in commands (no verb tag needed)

These commands are always available and do not need verb tags:

- `examine` / `x` / `inspect` / `look at` — shows the thing's `content` field
- `take` / `pick up` / `get` / `grab` — picks up items
- `drop` — drops a carried item
- `look` / `l` — describes the current place
- `inventory` / `i` — lists carried items
- `attack` — combat (covered in a later tutorial)

### Custom verb tags

For interactions beyond the built-ins, add a `verb` tag. The first value is the **canonical verb** — used in `on-interact` tags. Additional values are aliases.

```json
["verb", "read"]
["verb", "open", "pull", "push"]
["verb", "turn on", "switch on", "on"]
```

**Do not add `examine` as a verb tag** — it is built-in and always available. Adding it would create a duplicate. You CAN (and often should) use `["on-interact", "examine", "", ...]` to fire side effects when an item or feature is examined — just omit the `verb` tag for it.

### on-interact

The `on-interact` tag fires an action when the player uses a verb. It always references the canonical verb, never an alias.

```json
["on-interact", "<verb>", "<state-guard-or-blank>", "<action-type>", "<action-target>"]
```

For example, the notice board in this tutorial has:

```json
["verb", "read"],
["state", "unread"],
["transition", "unread", "read", "You lean in and squint at the faded ink..."],
["transition", "read", "read", "You have already read the notice..."],
["on-interact", "read", "", "set-state", "read"]
```

When the player types `read board`, the engine fires `on-interact` for the `read` verb, which triggers `set-state` to transition from `unread` to `read`. The `transition` tag provides the message shown to the player.

---

## Building Items: Step by Step

### 1. Create the item event

Every item needs at minimum: `d`, `t`, `type`, `title`, `noun`, and a `content` description.

```json
{
  "kind": 30078,
  "tags": [
    ["d", "my-world:item:rusty-key"],
    ["t", "my-world"],
    ["type", "item"],
    ["title", "A Rusty Key"],
    ["noun", "key", "rusty key"]
  ],
  "content": "A short iron key covered in orange rust."
}
```

### 2. Place it in a room

Add an `["item", "<ref>"]` tag to the place event where the item should appear:

```json
["item", "30078:<PUBKEY>:my-world:item:rusty-key"]
```

### 3. (Optional) Add custom verbs

If the item should respond to verbs beyond `examine`, add `verb` and `on-interact` tags to the item event. Items with state need `state` and `transition` tags too.

---

## Building Features: Step by Step

### 1. Create the feature event

Same minimum tags as items, but with `type: feature`:

```json
{
  "kind": 30078,
  "tags": [
    ["d", "my-world:feature:old-well"],
    ["t", "my-world"],
    ["type", "feature"],
    ["title", "Old Well"],
    ["noun", "well", "old well"]
  ],
  "content": "A circular stone well, its rim worn smooth by decades of rope."
}
```

### 2. Place it in a room

Add a `["feature", "<ref>"]` tag to the place:

```json
["feature", "30078:<PUBKEY>:my-world:feature:old-well"]
```

### 3. (Optional) Add custom verbs and state

Features often have richer interactions than items. Use `verb`, `state`, `transition`, and `on-interact` to create interactive features like the notice board.

---

## Dropping Items onto Features

The built-in `drop` command has two forms:

| Command | Behaviour |
|---------|-----------|
| `drop X` | Drops the item to the floor of the current place. Triggers `on-drop` handlers on the place (if any). |
| `drop X in/on/into Y` | Drops the item explicitly onto feature Y. Triggers `on-drop` handlers on the feature (if any). |

### on-drop on a feature

A feature can react when a specific item is dropped into or onto it. This is how you build receptacles — wells, slots, altars, bowls — where depositing an item changes world state.

```json
["on-drop", "<item-ref-or-blank>", "<state-guard-or-blank>", "<action-type>", "<action-target?>", "<ext-ref?>"]
```

Example — a wishing well that reacts when an ancient coin is dropped in:

```json
{
  "kind": 30078,
  "tags": [
    ["d", "my-world:feature:wishing-well"],
    ["t", "my-world"],
    ["type", "feature"],
    ["title", "Wishing Well"],
    ["noun", "well", "wishing well"],
    ["state", "empty"],
    ["transition", "empty", "fulfilled", "The coin glints as it falls. A low hum rises from the depths."],
    ["on-drop", "30078:<PUBKEY>:my-world:item:ancient-coin", "", "set-state", "deposited", "30078:<PUBKEY>:my-world:item:ancient-coin"],
    ["on-drop", "30078:<PUBKEY>:my-world:item:ancient-coin", "", "set-state", "fulfilled"]
  ],
  "content": "A mossy stone well. The bucket rope is frayed and useless."
}
```

The first `on-drop` changes the coin's own state to `deposited` using the ext-ref position. The second changes the well's state to `fulfilled`. Both fire when the player types `drop coin in well` — **all matching tags fire in declaration order**, the same semantics as `on-interact`. Ordering matters: put any action that depends on a prior side effect (e.g. a counter check after a `set-state`) later in the list.

**Dispatch rules:**
- Item-ref blank = any item triggers this handler; specific event ref = only that item.
- State guard blank = fires regardless of feature state; specific state = fires only when feature is in that state.
- If item-ref matches but state guard fails: "You can't do that."
- If no `on-drop` matches the dropped item: item drops to the floor silently (no error).
- Plain `drop X` (without naming a feature) does NOT trigger feature `on-drop` handlers.

### on-drop on a place

A place can also carry `on-drop` handlers. These fire on any plain `drop X` in the room — no feature targeting needed. Use this for environmental reactions: pressure-sensitive floors, scent traps, or puzzles where dropping an item in a specific room matters.

```json
["on-drop", "30078:<PUBKEY>:my-world:item:ancient-coin", "", "set-state", "visible", "30078:<PUBKEY>:my-world:clue:floor-inscription"]
["on-drop", "", "", "sound", "30078:<PUBKEY>:my-world:sound:thud"]
```

---

## Tips

- **Noun aliases matter** — Players will try many phrasings — `key`, `rusty key`, `the key`, `the rusty key`. Give your noun tag enough aliases to cover likely inputs. Articles are stripped automatically, so focus on adjective+noun forms.
- **One verb tag per canonical verb** — Don't combine unrelated verbs into one tag. `["verb", "read"]` and `["verb", "open"]` should be separate tags.
- **Do not add `examine` to verb tags** — It is built-in and always works. Same for `take`, `drop`, `look`, and `inventory`. However, `examine` IS usable as a trigger in `on-interact`: `["on-interact", "examine", "", "consequence", "<ref>"]` fires when the player examines an entity. This works for features, ground items, and inventory items.
- **on-interact references canonical verbs only** — If your verb tag is `["verb", "read", "peruse"]`, your on-interact must use `read`, not `peruse`.
- **Content is the examine text** — The `content` field on items and features is what the player sees when they `examine` something. Make it descriptive.
- **Mention things in room descriptions** — Bold the names of items and features in the place's `content` so players know they are there: `An **old lantern** sits on a crate.`
- **`title` is display, `noun` is parser** — The title `"A Rusty Key"` includes the article for display purposes. The noun tag `["noun", "key", "rusty key"]` omits articles because the parser strips them.

---

## Tutorial World

> ▶ **Try it:** Import [tides-end-02-things.json](tutorials/tides-end-02-things.json) to play through everything covered in this guide.

The world includes a walkthrough that picks up all items and examines all features.

---

Next: [Tutorial 3 — Puzzles and Locks](./03-puzzles-and-locks.md)
