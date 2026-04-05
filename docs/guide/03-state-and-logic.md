# State, Transitions, Requires, and Counters

This guide covers the four mechanisms that make folklore worlds interactive: **state** (how things change), **transitions** (feedback when they change), **requires** (gating access), and **counters** (tracking numbers and thresholds). Together, these let you build locked doors, item puzzles, multi-step mechanisms, and progression gates.

> ▶ **Try it:** Import [tides-end-03-state.json](tutorials/tides-end-03-state.json) to explore these concepts in a working world.

---

## State

Every event — item, feature, NPC, place, portal — can have a **state**: a string value that represents its current condition. State is declared with the `state` tag:

```json
["state", "unlit"]
```

This sets the initial state when the player first encounters the event. The client tracks state changes in local player storage, so they persist between sessions.

State values are arbitrary strings chosen by the author. Common patterns:

| Event type | Example states |
|-----------|---------------|
| Item | `unlit` / `lit`, `empty` / `full`, `broken` / `repaired` |
| Feature | `closed` / `open`, `default` / `raised`, `locked` / `unlocked` |
| NPC | `present` / `gone`, `hostile` / `friendly` |
| Place | `dark` / `lit`, `flooded` / `drained` |

State changes happen through the `set-state` action, typically fired by `on-interact`:

```json
["on-interact", "light", "", "set-state", "lit"]
```

When the player types `light lantern`, the engine finds the `on-interact` tag matching the verb `light`, executes the `set-state` action, and the lantern's state becomes `lit`.

You can also target another event's state from an interaction:

```json
["on-interact", "press", "", "set-state", "open", "30078:<PUBKEY>:my-world:feature:gate"]
```

Here, pressing a button changes the gate's state to `open` — the state change happens on the gate, not on the button.

---

## Transitions

A **transition** tag defines the legal edges of a state graph and provides player feedback when a state change occurs:

```json
["transition", "<from-state>", "<to-state>", "<text>"]
```

The text in the fourth position is shown to the player when this transition fires. This is where you put the prose that describes the moment of change.

Example — a lantern that can be lit:

```json
["state",      "unlit"],
["transition", "unlit", "lit",   "You strike the flint. The lantern flares to life."],
["transition", "lit",   "lit",   "The lantern is already burning."]
```

The second transition is a **terminal guard**: same from and to state. When the player tries to light an already-lit lantern, they see the message but nothing changes. This prevents confusion.

If an event has transition tags, the client only allows state changes that match a declared transition. If no transitions are declared, any state change is permitted. Use transitions when you want to control the state graph and provide feedback.

**Ordering matters:** the client shows the transition text from the first matching transition. If you have multiple `set-state` actions that could fire (e.g. from different triggers), make sure each path has a corresponding transition.

---

## Requires and Requires-Not

The `requires` tag gates access to an event based on player state. It checks whether the player holds an item, whether a feature is in a particular state, whether a puzzle is solved, and so on.

```json
["requires",     "<event-ref>", "<state-or-blank>", "<description>"]
["requires-not", "<event-ref>", "<state-or-blank>", "<description>"]
```

The shape is always **4 elements**: the tag name, an event reference (in `30078:<pubkey>:<d-tag>` format), a state to check (or blank), and a description shown when the check fails.

### What requires checks

The client resolves the event reference, looks at its `type` tag, then checks state:

| Event type | Blank state means | Non-blank state means |
|-----------|-------------------|----------------------|
| `item` | Player holds the item (any state) | Player holds it in that specific state |
| `feature` | Feature exists (any state) | Feature is in that state |
| `npc` | NPC exists (any state) | NPC is in that state (e.g. `gone`) |
| `puzzle` | Puzzle exists | Puzzle is in that state (typically `solved`) |
| `place` | Place exists | Place is in that state |

### Where requires is used

You can put `requires` on any event:

- **Portal** — gates traversal. The player cannot pass unless the condition is met. This is the most common use: locked doors, dark passages, blocked routes.
- **Item** — gates interaction (e.g. lighting a lantern requires holding a matchbox).
- **Feature** — gates interaction with the feature.
- **Place** — gates entry entirely (shown in place of the room description).

### Examples

Gate a portal on holding an item in a specific state:

```json
["requires", "30078:<PUBKEY>:my-world:item:lantern", "lit",
  "It is pitch black down there. You need a light."]
```

Gate an item interaction on holding another item (any state):

```json
["requires", "30078:<PUBKEY>:my-world:item:matchbox", "",
  "You have nothing to light it with."]
```

Gate on a feature's state:

```json
["requires", "30078:<PUBKEY>:my-world:feature:well", "raised",
  "The rope is still attached to the bucket deep in the well."]
```

`requires-not` inverts the check — the condition passes when the state does NOT match:

```json
["requires-not", "30078:<PUBKEY>:my-world:feature:dam", "open",
  "The reservoir has already drained."]
```

Multiple `requires` tags use AND logic — all must pass. The client renders the first failed description.

### Common mistake: bare strings

Requires always uses **event references** (`30078:<pubkey>:<d-tag>`), never bare strings like `"has-key"` or `"lantern-lit"`. The engine resolves the reference to find the event, checks its type, then evaluates the condition. There is no flag system — all state lives on events.

---

## Counters

A **counter** is a named numeric value tracked in player state. Counters let you build multi-step interactions: cranking a well, counting attack hits, tracking fuel consumption.

Declare a counter on any event:

```json
["counter", "cranks", "0"]
```

The first value is the counter name, the second is the initial value. An event can have multiple counters.

### Changing counters

Counter values change through actions fired by `on-*` triggers:

```json
["on-interact", "crank", "", "increment", "cranks"]
```

Three counter actions exist:

| Action | Effect |
|--------|--------|
| `increment` | Adds 1 to the counter |
| `decrement` | Subtracts 1 from the counter |
| `set-counter` | Sets the counter to an exact value |

### Thresholds with on-counter

The `on-counter` trigger fires when a counter crosses a threshold in a declared direction:

```json
["on-counter", "<direction>", "<counter-name>", "<threshold>", "<action-type>", "<action-target>"]
```

- **direction**: `up` (fires when counter reaches or exceeds threshold) or `down` (fires when counter drops to or below threshold).
- **threshold**: an integer string.
- The trigger fires **once** per crossing. The client tracks this to prevent repeated firing.

Example — a well that raises its bucket after 3 cranks:

```json
["counter",    "cranks", "0"],
["on-counter", "up", "cranks", "3", "set-state", "raised"],
["transition", "default", "raised",
  "The bucket rises from the depths, water sloshing."]
```

Each `crank well` command fires `increment cranks`. When the counter reaches 3, `on-counter` fires `set-state raised`, and the transition text plays. The message comes from the transition, not from the `on-counter` tag — this keeps all player-facing text in one consistent place.

### Counter design patterns

**Fuel/battery drain:** decrement a counter on each move, trigger warnings at thresholds:

```json
["counter",    "battery", "300"],
["on-counter", "down", "battery", "50",  "set-state", "flickering"],
["on-counter", "down", "battery", "0",   "set-state", "dead"]
```

**Multi-step mechanism:** increment on interaction, trigger at a threshold:

```json
["counter",    "cranks", "0"],
["on-counter", "up", "cranks", "3", "set-state", "raised"]
```

**Hit counter:** increment on attack, trigger a consequence at a threshold:

```json
["counter",    "hits", "0"],
["on-counter", "up", "hits", "5", "set-state", "broken"]
```

---

## Builder Walkthrough: Setting Up a Gated Door

Here is a step-by-step example of building a locked cellar door that requires a lit lantern to pass through.

### 1. Create the item with state

Create a lantern item with an initial state of `unlit`, a verb to light it, and the state transition:

- **Type:** item
- **d-tag:** `my-world:item:lantern`
- **Tags:**
  - `["state", "unlit"]`
  - `["verb", "light", "ignite"]`
  - `["on-interact", "light", "", "set-state", "lit"]`
  - `["transition", "unlit", "lit", "The lantern flares to life."]`

### 2. Add a prerequisite

If lighting the lantern should require another item (e.g. matches), add a `requires` tag to the lantern:

- `["requires", "30078:<PUBKEY>:my-world:item:matchbox", "", "You have nothing to light it with."]`

The blank state means the player just needs to hold the matchbox — it does not need to be in any particular state.

### 3. Create the two places

Create the tavern (with exit slot `down`) and the cellar (with exit slot `up`).

### 4. Create the gated portal

Create a portal connecting the tavern's `down` slot to the cellar's `up` slot. Add a `requires` tag that checks the lantern's state:

- `["requires", "30078:<PUBKEY>:my-world:item:lantern", "lit", "It is pitch black down there. You need a light."]`

Now the player must hold the lantern **in the `lit` state** to pass through. If they have an unlit lantern, or no lantern at all, they see the failure description.

### 5. Place the items

Add `["item", "30078:<PUBKEY>:my-world:item:lantern"]` to the place where the lantern should appear. Add the matchbox to another place. The player must visit both locations and collect both items before they can light the lantern and enter the cellar.

---

## on-interact on Places: Room-Scoped Verbs

Items and features use `on-interact` to respond when a player targets them by name. Places use `on-interact` differently — to respond to **bare verbs** (no noun) typed while the player is in that room.

```json
["on-interact", "<verb>", "<state-guard-or-blank>", "<action-type>", "<action-target?>"]
```

This is useful for classic magic words, room-specific commands, or environmental interactions that only make sense in one location:

```json
// A ritual chamber — "pray" only works here
["on-interact", "pray",  "",       "set-state",  "blessed", "30078:<PUBKEY>:my-world:place:shrine"]

// A hidden teleport — "xyzzy" takes you somewhere
["on-interact", "xyzzy", "",       "traverse",   "30078:<PUBKEY>:my-world:portal:escape-route"]

// State-gated — only works when room is "lit"
["on-interact", "read",  "lit",    "consequence","30078:<PUBKEY>:my-world:consequence:inscription-reveals"]

// A sound cue when the player knocks
["on-interact", "knock", "",       "sound",      "30078:<PUBKEY>:my-world:sound:hollow-knock"]
```

**How it works:**
- The verb must match exactly (position 1) — no noun is required or expected.
- The state guard (position 2) gates on the **place's own state** — blank fires in any state.
- Place handlers are checked **before** world-level `on-interact`, so a room can override a global verb for that location.
- Supports the same action types as world-level `on-interact`: `traverse`, `set-state`, `give-item`, `consequence`, `sound`, etc.

**Registering the verb:** Add a `["verb", "<word>"]` tag to the place so the parser recognises it while the player is in the room. Without it, the verb still fires if the player guesses it, but they'll get "I don't understand that" in any other room — which may be intentional for a secret command, or may be confusing.

```json
// Declare the verb so the room's parser recognises it
["verb", "xyzzy"]
["on-interact", "xyzzy", "", "traverse", "30078:<PUBKEY>:my-world:portal:escape-route"]
```

---

## on-drop: Reacting to Dropped Items

The `on-drop` trigger fires when an item is dropped. Its shape is the same on both places and features:

```json
["on-drop", "<item-ref-or-blank>", "<state-guard-or-blank>", "<action-type>", "<action-target?>", "<ext-ref?>"]
```

**On a place** — fires on plain `drop X` anywhere in the room:

```json
// Any item dropped here triggers a sound
["on-drop", "", "", "sound", "30078:<PUBKEY>:my-world:sound:thud"]

// Only fires when a specific item is dropped
["on-drop", "30078:<PUBKEY>:my-world:item:ancient-coin", "", "set-state", "visible", "30078:<PUBKEY>:my-world:clue:inscription"]
```

**On a feature** — fires only when the player explicitly targets the feature with `drop X in/on/into Y`:

```json
// Well reacts to receiving the coin
["on-drop", "30078:<PUBKEY>:my-world:item:ancient-coin", "", "set-state", "fulfilled"]
```

Plain `drop X` (no feature named) does not trigger feature `on-drop` handlers — the item goes to the floor silently.

The `set-state` action with an ext-ref can target the dropped item itself:

```json
// Mark the coin as deposited
["on-drop", "30078:<PUBKEY>:my-world:item:ancient-coin", "", "set-state", "deposited", "30078:<PUBKEY>:my-world:item:ancient-coin"]
```

See [Tutorial 2 — Items and Features](./02-items-and-features.md) for a full worked example.

---

## Tips

- **Requires uses event refs, not strings** — Always use the full `30078:<pubkey>:<d-tag>` format. There is no flag system — the engine resolves the reference to check the event's actual state.
- **Transition text order matters** — The client shows text from the first matching transition. Make sure each state change path has a corresponding `transition` tag.
- **Terminal transitions prevent confusion** — A transition like `["transition", "lit", "lit", "The lantern is already burning."]` tells the player their action had no effect, rather than silently doing nothing.
- **Counter thresholds fire once** — The `on-counter` trigger fires when the counter crosses the threshold, not every time the counter changes while above/below it. The client tracks crossings to prevent repeat firing.
- **Counter messages come from transitions** — Put your player-facing text in `transition` tags, not in `on-counter` tags. The counter trigger fires the `set-state` action, and the transition provides the prose.
- **Multiple requires = AND logic** — If an event has three `requires` tags, all three must pass. The first failure description is shown to the player.
- **Blank state on items = held in any state** — Use blank state when you just need the player to have the item. Use a specific state (like `lit`) when the item must be in a particular condition.

---

## Tutorial World

> ▶ **Try it:** Import [tides-end-03-state.json](tutorials/tides-end-03-state.json) to play through everything covered in this guide.

The world features:

- A **lantern** that starts `unlit` and transitions to `lit` (requires a matchbox)
- A **cellar portal** gated by `requires` — the lantern must be `lit` to descend
- A **well** with a counter that tracks cranks and transitions to `raised` at 3
- A **wet rope** gated by the well's `raised` state

Walkthrough: get lantern, get matchbox, light lantern, go down to cellar, get map, crank well three times, get rope.
