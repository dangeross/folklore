# FOAKLOAR — Design Document
*Personal reference · Work in progress*

---

## Table of Contents

1. [Vision & Concept](#1-vision--concept)
2. [Core Primitives & Schema](#2-core-primitives--schema)
3. [Cryptographic Puzzle Mechanics](#3-cryptographic-puzzle-mechanics)
4. [Player State & Inventory](#4-player-state--inventory)
5. [World State Problem](#5-world-state-problem)
6. [Trust, Collaboration & Security](#6-trust-collaboration--security)
7. [NPC & Dialogue System](#7-npc--dialogue-system)
8. [Progression & Quest Design](#8-progression--quest-design)
9. [Client Architecture](#9-client-architecture)
10. [Open Questions](#10-open-questions)

---

## 1. Vision & Concept

A decentralised, permissionless text adventure built entirely on NOSTR. The world is a graph of NOSTR events. Anyone can extend it. Anyone can play it. Cryptography enforces puzzle gates natively — not simulated, actual cryptography.

**Core principles:**

- The world lives on relays, not servers. No central authority can delete it.
- Player identity = a NOSTR keypair. No accounts, no login.
- Puzzle locks are mathematically enforced. You cannot cheat by scraping relays.
- The map is a living document. Portals can be published, contested, revoked.
- The world has factions, history, unreliable cartography. That's a feature.
- Every player is also a potential builder. The distinction is a UI mode, not a role.
- Scarcity is about *knowledge and access*, not item possession. Anyone can pick up an item. Only those who've earned the key can open the chest.

**Reference:** Zork-style text adventure, but the dungeon is a decentralised graph owned by no one and everyone. The kind numbers form an open protocol — anyone can build a world, a client, or a tool against the same convention. The `t` tag separates worlds.

---

## 2. Core Primitives & Schema

The schema uses a **single kind** for all dungeon primitives:

- **`kind: 30078`** — the dungeon game kind. Signals to any client "this is a dungeon event" and that the the-lake schema applies. One kind, one protocol.
- **`type` tag** — differentiates primitives within that kind: `world`, `place`, `portal`, `item`, `feature`, `clue`, `puzzle`, `recipe`, `npc`, `dialogue`, `quest`, `vouch`, `player-state`, `sound`.
- **`t` tag** — identifies the specific game world instance. `the-lake`, `shadowrealm`, `my-dungeon` — all use the same kind and client, separated by `t` tag. Used for relay-level subscription filtering.
- **`d` tag prefix** — prefixed with the world name (e.g. `the-lake:place:clearing`) to ensure global uniqueness per author. Without the prefix, the same author publishing two worlds would have colliding `d` tags. The prefix is correctness; the `t` tag is ergonomics. Both are needed.

References between events use the `a` tag format (`30078:pubkey:d-tag`) so links always resolve to the *latest* version of an event, never a stale snapshot.

#### content field

The `content` field carries the primary prose description rendered to the player. Content is rendered as **markdown by default** — bold, italic, and line breaks are supported without any extra tags. Use `content-type` only to opt out or for sealed content:

```json
// No content-type tag needed — markdown is the default
["content-type", "text/plain"]        // opt-out: disable markdown formatting
["content-type", "application/nip44"] // NIP-44 encrypted — state: sealed
```

For supplementary content alongside the prose — ASCII art, maps, images — use a `media` tag with a type and value. The client renders what it supports and silently ignores what it doesn't. This enables progressive enhancement without breaking older clients.

```json
["media", "text/x-ansi",  "<short ansi art>"]
["media", "text/markdown", "## Rough Map\n..."]
["media", "image/url",    "https://example.com/map.png"]
```

Multiple `media` tags are allowed — one per content block. A place with ASCII art and markdown prose:

```json
{
  "kind": 30078, "tags": [
    ["d",            "the-lake:place:west-of-house"],
    ["t",            "the-lake"],
    ["type",         "place"],
    ["title",        "West of House"],
    ["media",        "text/plain", "    +--------+\n    |        |\n    | HOUSE  |\n    |        |\n    +--------+"]
  ],
  "content": "You are standing in an open field west of a **white house**, with a boarded front door. There is a small mailbox here."
}
```

Sealed places use `content-type: application/nip44` — the client detects this, attempts NIP-44 decryption with any held crypto keys, and renders the decrypted content if successful.

**Relay size constraints**

NOSTR relays impose size limits via NIP-11. The relevant limits:

| Limit | Relay field | Applies to |
|-------|-------------|-----------|
| `max_message_length` | WebSocket frame size — typically 64KB–128KB | Entire event |
| `max_content_length` | Characters in `content` field | `content` only |
| `max_event_tags` | Number of tags on a single event | Tag count |

Individual tag values have no protocol-level size limit, but contribute to `max_message_length`. Guidelines for the schema:

- **`content`** — the right home for longer prose and markdown. `max_content_length` is typically more generous than per-tag constraints.
- **`media` inline** — keep short. Small ASCII art (a few hundred characters) is fine as an inline tag value.
- **`media` large assets** — use `image/url` or a URL-based form and serve content externally. Don't embed large binary or text blobs in tag values.
- **Tag count** — events with many `requires`, `verb`, `noun`, `exit`, `route` and `on-*` tags can accumulate quickly on complex NPCs or places. Keep an eye on this for relay compatibility.

**Type reference:**

| Type tag | Primitive | Description |
|----------|-----------|-------------|
| `world` | World | Root manifest — genesis, collaboration, aesthetic config |
| `place` | Place | A location in the world |
| `portal` | Portal | Connects two place exit slots |
| `item` | Item | A portable, carryable thing |
| `feature` | Feature | A fixed, interactive part of a place |
| `clue` | Clue | A piece of information, optionally sealed |
| `puzzle` | Puzzle | A client-side verified challenge |
| `payment` | Payment | A Lightning payment gate — on confirmation gives a receipt item |
| `recipe` | Recipe | Defines item combination rules |
| `npc` | NPC | An actor placed by a place author |
| `dialogue` | Dialogue | A single dialogue node; nodes grouped by d-tag prefix |
| `quest` | Quest | Optional named quest grouping |
| `consequence` | Consequence | A reusable outcome fired by portals, NPCs, or interactions |
| `vouch` | Vouch | Delegated trust endorsement |
| `revoke` | Revoke | Revokes a previously issued vouch |
| `player-state` | PlayerState | Encrypted player progress backup |

---

### 2.0 World (`type: world`)

The manifest event for a world. One per world, authored by the genesis keypair. See [Section 6.1](#61-the-world-event) for the full specification — the world event is documented alongside the trust and collaboration model it governs.

---

### 2.1 Place (`type: place`)

The atomic unit of the world. A place the player can occupy.

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",       "the-lake:place:sunlit-clearing"],
    ["t",       "the-lake"],
    ["type",    "place"],
    ["title",   "A Sunlit Clearing"],
    ["exit", "north"],
    ["exit", "east"],
    ["exit", "west"],
    ["item",    "30078:<pubkey>:the-lake:item:iron-key"],
    ["feature", "30078:<pubkey>:the-lake:feature:bronze-altar"],
    ["npc",     "30078:<pubkey>:the-lake:npc:old-hermit"]
  ],
  "content": "You stand in a clearing. Shafts of light pierce the canopy above. To the north, a dark cave entrance looms."
}
```

**Key design decisions:**

- Exit tags on a **place** declare that a slot exists. Two valid forms:
  - `["exit", "north"]` — slot only, no hint. The portal is the sole source of destination and label.
  - `["exit", "30078:<pubkey>:place:cave", "north", "Optional label"]` — extended form, hints the destination on the place itself. Useful when authoring place and portal together. The portal still owns the canonical binding — if the two conflict, the portal wins.
- Exit tags are **named slots only** on the place — they do not create a connection. Destinations are the portal's responsibility.
- `noun` tags make places referenceable in commands like `examine place` or `look around`.
- The place is replaceable by its author (same `d` tag + pubkey = update). The author can add/remove exit slots freely.
- `content` is the prose description rendered to the player.
- Exit slot names are arbitrary strings. Any value is valid — the portal references it by name. Accepted conventions:

| Category | Values |
|----------|--------|
| Cardinal | `north`, `south`, `east`, `west` |
| Vertical | `up`, `down` |
| Diagonal | `northeast`, `northwest`, `southeast`, `southwest` |
| Contextual | `in`, `out`, `enter`, `path`, `passage`, `climb`, `jump` |
| Custom | Any string — `follow-river`, `squeeze-through`, `jump-gap` etc. |

The client renders exit slot names as available movement options. Custom exit names read naturally as player commands.

- **Per-place colour overrides:** `["colour", "<slot>", "<value>"]` — overrides theme colours for this place. The `slot` matches any colour slot defined on the world event (e.g. `bg`, `text`, `accent`, `border`). When the player enters a place with `colour` tags, those values override the world theme for that place. When the player leaves (enters a place without `colour` tags), colours reset to the world theme. This enables location-specific atmosphere — a dungeon can be darker, a forest greener.
- Rooms can carry `on-enter` handlers — fired when the player enters the place. NPCs use the same tag with a place reference as the first argument — fired when the NPC arrives at that place. Same tag, different first argument, dispatched by event `type`.

```json
["on-enter", "player", "", "consequence", "30078:<pubkey>:the-lake:consequence:trap-fires"]
["on-enter", "player", "", "set-state", "visited", "30078:<pubkey>:the-lake:place:sanctum"],
["on-enter", "player", "", "set-state", "visible", "30078:<pubkey>:the-lake:clue:ambient-note"]
```

- Places can carry `on-interact` handlers — fired when the player types a **bare verb** (no noun target) while in this room. Verb (position 1) must match. State guard (position 2) gates on place state — blank = any state. Place-level handlers are checked before world-level `on-interact` handlers, so a place can override a global verb for that room. Same action types as world-level `on-interact` are supported.

```json
["on-interact", "xyzzy", "",    "traverse", "30078:<pubkey>:the-lake:portal:escape-route"]
["on-interact", "pray",  "lit", "set-state", "blessed", "30078:<pubkey>:the-lake:place:shrine"]
["on-interact", "knock", "",    "sound",    "30078:<pubkey>:the-lake:sound:hollow-knock"]
```

Use a `["verb", "<word>", "<alias?>"]` tag alongside `on-interact` to register the verb in the parser so the player gets `"<verb> what?"` feedback in other rooms rather than "I don't understand that."

- Places can carry `on-drop` handlers — fired when the player drops any item (`drop X`) in this room. Item-ref (position 1) filters to a specific item; blank = any item. State guard (position 2) gates on place state; blank = any state.

```json
["on-drop", "", "", "sound", "30078:<pubkey>:the-lake:sound:thud"]
["on-drop", "30078:<pubkey>:the-lake:item:ancient-coin", "", "set-state", "visible", "30078:<pubkey>:the-lake:clue:floor-inscription"]
```

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",        "the-lake:place:cellar"],
    ["t",        "the-lake"],
    ["type",     "place"],
    ["title",    "Cellar"],
    ["exit", "north"],
    ["exit", "up"],
    ["requires", "30078:<pubkey>:the-lake:item:brass-lantern", "on", "It is pitch black. You are likely to be eaten by a grue."]
  ],
  "content": "A dark and damp cellar. A narrow passageway leads north."
}
```

---

### 2.2 Portal (`type: portal`)

Stitches two exit slots together. Owned and published by whoever creates the connection.

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",    "the-lake:portal:clearing-north-to-cave-south"],
    ["t",    "the-lake"],
    ["type", "portal"],
    ["exit", "30078:<pubkey>:the-lake:place:dark-cave", "north", "A dark cave entrance looms to the north"],
    ["exit", "30078:<pubkey>:the-lake:place:sunlit-clearing", "south", "Pale daylight filters through the cave mouth to the south"]
  ],
  "content": ""
}
```

**Key design decisions:**

- Portal `exit` tags bind a place's exit slot to a destination place. Shape: `["exit", "<place-ref>", "<slot-name>", "<optional-label>"]`
- This mirrors the place's exit slot declaration — same tag name, same slot name in the same position. Room declares the slot exists; portal binds it to a destination.
- Portal ownership is separate from place ownership. Anyone can publish a portal.
- Two portals claiming the same exit slot = contested territory. The client resolves by trust (see §6).
- Contested portals are not a bug — they are world-changing events. Factions can fight over portal infrastructure.
- The client renders conflicting portals as *"the passage north feels unstable — you sense two possible destinations."*
- Two-way portals have two `exit` tags, one per end. One-way walkable portals have one. A hub place could have many.
- **Exit tag place-ref semantics differ by portal type:**
  - **Walkable portals:** each exit tag's place-ref is the SOURCE — the place where the player must stand to use that direction. The destination is the "other" exit tag's place-ref.
  - **Traverse-only hidden portals** (activated via `traverse` action, not by walking a direction): the single exit tag must reference the DESTINATION. The `traverse` action resolves destination as the first exit whose place-ref differs from the player's current place. A traverse-only portal with no exit tags silently does nothing when traversed.
- `requires` tags on a portal gate traversal inline — no separate lock event needed. The optional failed description tells the player why they cannot pass.
- `sound` tags on a portal with role `effect` fire as one-shots when the player traverses the portal. Use for door creaks, footstep sounds, transition effects.
- **Transition tags** control visual effects when the player traverses the portal:
  - `["transition-effect", "<effect>"]` — CSS animation played during traversal. Available effects: `blackout`, `flash`, `fade`, `shake`, `glitch`, `invert`, `static`, `pulse`.
  - `["transition-duration", "<ms>"]` — duration of the effect in milliseconds. Defaults to `800` if omitted.
  - `["transition-clear", "true"]` — clears the game log during the transition. Useful for dramatic scene changes (e.g. teleportation, dream sequences). Omit or set to anything other than `"true"` to keep the log.

```json
// Portal with a blackout transition that clears the log
["transition-effect", "blackout"],
["transition-duration", "1200"],
["transition-clear", "true"]
```

```json
// One-way teleport trap
["exit", "30078:<pubkey>:the-lake:place:void", "north", "A strange shimmer pulls you forward."]

// Two-way passage
["exit", "30078:<pubkey>:the-lake:place:cave", "north", "A dark cave entrance looms."],
["exit", "30078:<pubkey>:the-lake:place:clearing", "south", "Daylight filters through the cave mouth."]
```

---

### 2.3 Item (`type: item`)

A portable thing. Items can be picked up, carried, used, combined, dropped, stolen, and deposited. They are placed in places by the place author via reference tags — they do not declare their own location. Place inventories are seeded from these reference tags on first visit, then mutated by player pickup, NPC theft, and deposits. Every item lives in exactly one inventory at any time — player, NPC, or place.

Items support the same `state`, `verb`, and `on-interact` tags as features — some items are interactive even when carried. State is tracked per-item in local player state.

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",           "the-lake:item:iron-key"],
    ["t",           "the-lake"],
    ["type",        "item"],
    ["title",       "An Iron Key"],
    ["noun",        "key",    "iron key"]
  ],
  "content": "Heavy and cold. The bow is shaped like a serpent."
}
```

An item with state and verbs:

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",           "the-lake:item:brass-lantern"],
    ["t",           "the-lake"],
    ["type",        "item"],
    ["title",       "Brass Lantern"],
    ["verb", "turn on", "switch on", "on"],
    ["verb", "turn off", "switch off", "off"],
    ["state",       "off"],
    ["on-interact", "turn on",  "", "set-state", "on"],
    ["on-interact", "turn off", "", "set-state", "off"]
  ],
  "content": "A battery-powered brass lantern."
}
```

Items can contain other items via `contains` tags. If an item has `contains` tags it is implicitly a container — no additional flag needed. The `contains` shape mirrors `requires`:

```json
["contains", "<item-ref>", "<state-or-blank>", "<fail-message-or-blank>"]
```

- **state** — the container must be in this state for the item to be accessible. Blank = always accessible once the container is in scope.
- **fail-message** — shown when the player tries to take the item but the state gate isn't met. Blank = generic message.

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",        "the-lake:item:brown-sack"],
    ["t",        "the-lake"],
    ["type",     "item"],
    ["title",    "A Brown Sack"],
    ["noun",     "sack", "bag", "brown sack"],
    ["contains", "30078:<pubkey>:the-lake:item:lunch",  "", ""],
    ["contains", "30078:<pubkey>:the-lake:item:garlic", "", ""]
  ],
  "content": "A brown sack, smelling of garlic."
}
```

**Scope:** contents are accessible when the container is in player inventory or on the ground in the current place. A dropped sack can still be accessed — `take lunch from sack` works whether the sack is carried or on the floor.

**Contained items are not on the ground.** The place event does NOT declare a separate `["item", "<ref>"]` for items inside a container. They exist only inside the container and appear only via `take X from Y`. If an item appears in both a place `item` tag and a `contains` tag, it exists in two places at once — that is a bug.

**Commands:**
- `take <item> from <container>` — extract one item. `from` keeps noun order: target is the item, container is the instrument.
- `take all from <container>` — extract all accessible contents in one command.
- `examine <container>` / `look in <container>` — lists accessible contents. Items gated by unmet state show their fail-message or are hidden if fail-message is blank.

#### requires / requires-not

Any event — place, feature, portal, clue — can carry `requires` or `requires-not` tags. Evaluated client-side against local player state. The second argument is always the condition **type**. An optional final argument provides a description shown to the player when the condition is *not* met — no separate locked-description tag needed.

```json
["requires",     "<event-ref>", "<state-or-blank>", "<description-or-blank>"]
["requires-not", "<event-ref>", "<state-or-blank>", "<description-or-blank>"]
```

**Condition types:**

`requires` always has exactly 3 arguments after the tag name — a reference, a state, and a description. The client resolves the referenced event from its local cache and checks its current state. No type dispatch needed — the event's own `type` tag identifies it.

```
["requires",     "<event-ref>", "<state-or-blank>", "<description-or-blank>"]
["requires-not", "<event-ref>", "<state-or-blank>", "<description-or-blank>"]
```

The same shape works for any event type:

| Event type | State check example |
|------------|---------------------|
| `item` | Blank state = player holds it in any state; non-blank = must be in that state |
| `npc` | `gone`, `present`, `blocking`, or blank for any |
| `feature` | Any authored state — `open`, `prayed`, `lit` etc. |
| `place` | Any authored state — `visited`, `bridged` etc. |
| `puzzle` | Typically `solved` |
| `portal` | `hidden`, `visible`, or any authored state |

The `item` type always has 5 elements (state and description both present, either may be blank). All other types have 4 elements. This makes parsing unambiguous — the client dispatches on type before reading remaining arguments.

`requires-not` inverts the condition. Multiple `requires` tags = all must pass (AND logic). The client renders the first failed description it encounters.

Examples:

```json
// Item with state check and description
["requires", "30078:<pubkey>:the-lake:item:brass-lantern", "on",  "It is pitch black. You are likely to be eaten by a grue."],

// Item held in any state (blank state), with description
["requires", "30078:<pubkey>:the-lake:item:iron-key", "",   "A heavy gate blocks the passage. There is a keyhole."],

// Item held, no state check, no description
["requires", "30078:<pubkey>:the-lake:item:invitation", "",   ""],

// Flag with description
["requires", "30078:<pubkey>:the-lake:feature:altar", "prayed", "The altar has not been blessed."],

// NPC must be gone
["requires", "30078:<pubkey>:the-lake:npc:cyclops", "gone", "The cyclops blocks your way."],

// requires-not with description
["requires-not", "30078:<pubkey>:the-lake:feature:control-panel", "on", "The reservoir has already drained."],

// requires-not item state
["requires-not", "30078:<pubkey>:the-lake:item:brass-lantern", "on", ""]
```

#### requires-counter

Gates an interaction (or portal traversal, or dialogue option) on a counter value comparison. Multiple tags stack with AND logic. The verb field scopes the gate to a specific verb — blank matches any.

```json
["requires-counter", "<verb-or-blank>", "<event-ref-or-blank>", "<counter>", "<op>", "<N>", "<fail-msg-or-blank>"]
```

**Operators:** `>=` (default), `<=`, `>`, `<`, `=`

**Counter resolution:** When event-ref is blank, the engine looks for the counter on the event itself first (key `<event-dtag>:<counter>`), then falls back to the world event (key `<world-dtag>:<counter>`). Specify an explicit event-ref to read a counter from another event.

Valid on: `feature`, `item`, `npc`, `place`, `portal`, `dialogue`, `world`.

```json
// Gate a purchase verb — player must have ≥ 3 coins
["requires-counter", "buy", "", "coins", ">=", "3", "You can't afford that."]

// Gate portal traversal — world-level toll
["requires-counter", "", "", "coins", ">=", "1", "The bridge toll is 1 coin."]

// Gate a dialogue option on another event's counter
["requires-counter", "", "30078:<pubkey>:the-lake:world:the-lake", "reputation", ">=", "5", "You haven't earned enough trust."]
```

Hidden portals or features start in `state: hidden` — not rendered until a `set-state visible` action targets them.

Event states are set via `set-state` in `on-interact`. The state guard (position 2) gates whether the action fires — blank means any state, a value means only when the entity is in that state. The optional final argument targets another event — omit to apply to self:

```json
// Transition self to new state (blank state guard = fires in any state)
["on-interact", "open",  "", "set-state", "open"]

// State-guarded — only fires when entity is in the specified state
["on-interact", "open",  "closed", "set-state", "open"]

// Transition another event to a new state
["on-interact", "press", "", "set-state", "on",      "30078:<pubkey>:the-lake:feature:control-panel"]
["on-interact", "pour",  "", "set-state", "watered",  "30078:<pubkey>:the-lake:feature:altar"]
["on-interact", "throw", "", "set-state", "bridged",  "30078:<pubkey>:the-lake:place:east-of-chasm"]
```

Item states (client-side only):

| State | Meaning |
|-------|---------|
| `in-place` | Referenced by place, not yet in picked-up set |
| `in-inventory` | In local picked-up set, available to use/combine |
| `consumed` | Used in combination or as one-time unlock, removed from inventory |

The place event references items it contains:

```json
["item", "30078:<pubkey>:the-lake:item:iron-key"]
```

---

### 2.4 Feature (`type: feature`)

A fixed part of a place's fabric. Features can be interacted with in place but never picked up. They respond to verbs, can have locks attached, and can contain items revealed on interaction. Like items, features are placed by the place author via reference tags.

The `verb` tag declares available interactions. The first value is the **canonical verb** — used in `on-interact` tags and the client's command parser. Additional values are **aliases** — alternative inputs the parser accepts, mapped to the canonical before dispatch.

```json
["verb", "examine", "look at", "x", "inspect", "l"]
["verb", "open", "pull", "push"]
["verb", "turn on", "switch on", "on"]
["verb", "turn off", "switch off", "off"]
```

`on-interact` always references the canonical verb (position 1) — never an alias. The state guard (position 2) is blank for unconditional firing, or a specific state value to gate the action.

The `noun` tag works the same way — the first value is the **canonical noun** used internally, additional values are aliases the input parser also accepts. `title` is always display-only; `noun` is always parser-facing.

```json
["noun", "chest",   "box",       "trunk"]
["noun", "key",     "iron key",  "rusty key"]
["noun", "lantern", "lamp",      "light"]
["noun", "altar",   "stone",     "table"]
```

**Article stripping** — the parser strips leading articles (`the`, `a`, `an`) from noun input before matching against noun tags. Noun tags should therefore never include articles — always bare nouns. This means a single tag value covers all natural phrasings automatically:

```
["noun", "lantern", "brass lantern"]

matches: lantern, the lantern, a lantern, a brass lantern, the brass lantern
```

When multiple events share the same noun value (two items both have `"key"` as a noun), the client prompts for disambiguation using their `title` tags:

```
Which key?
1. Rusty Key
2. Golden Key
```

Rooms, items, features, and NPCs can all carry `noun` tags. Exit slots serve as nouns for movement commands — `go north` resolves `north` to an exit slot directly.

**Two-noun commands** — the parser handles `<verb> <noun> [preposition] <noun>` naturally. Both nouns resolve via `noun` tags independently of order or preposition:

- `use sword on ogre` → verb `attack`, target `ogre` NPC, instrument `sword` item
- `hit ogre with sword` → same resolution
- `give potion to fairy` → verb `give`, target `fairy` NPC, instrument `potion` item
- `give bottle to Jessabell` → same, if `jessabell` is a noun alias on the NPC

`on-interact` lives on the **target** event — the thing being acted upon. The instrument is available as context. If the instrument matters (a locked door that only opens with the right key), express it as a `requires` on the target — the client checks it before firing `on-interact`. This keeps the instrument check in the schema rather than hardcoded in the parser.

The full `on-interact` shape is:

```json
["on-interact", "<verb>", "<state-guard-or-blank>", "<action>", ...action-args]
```

The state guard (position 2) gates whether the action fires based on the entity's current state. Blank (`""`) means the action fires regardless of state — this is the common case. A specific state value means the action only fires when the entity is currently in that state. This enables different behaviour per state without needing separate events.

**Firing semantics — all matching tags fire.** Every `on-interact` tag whose verb and state guard both match is dispatched, in declaration order. There is no "first match wins" — ordering controls execution sequence, not selection. Place more specific state-guarded tags before general blank-guarded fallbacks so side effects occur in the intended order.

Features can have an initial **state** — a string value declared by the author. The client tracks current state per-feature in local player state. State values are arbitrary strings defined by the feature author. The client renders descriptions and available verbs based on current state.

#### on-* event dispatcher

All reactive behaviour across features, items, NPCs, rooms, and portals uses a unified `on-*` tag pattern. The trigger type is encoded in the tag name, making the source of each behaviour immediately clear. The shape is always:

```json
["on-<trigger>", "<trigger-target>", "<action-type>", "<action-target?>"]
```

**Trigger tags:**

| Tag | Trigger target | Fires when |
|-----|---------------|------------|
| `on-interact` | Verb string + optional state guard | Player uses a verb on this feature, item, or NPC — or a bare verb while in this place (place events only). State guard (position 2) gates firing — blank fires in any state, a value fires only when the entity is in that state. |
| `on-complete` | `""` (blank) | Player satisfies all `requires` and confirms action (puzzle answered, recipe combined). Trigger-target is always blank — `["on-complete", "", "<action-type>", "<action-target?>"]` |
| `on-enter` | `player` or place `a`-tag | Player enters this place (arg: `player`), or NPC arrives at a place (arg: place ref). Client dispatches based on event `type`. |
| `on-encounter` | `""`, `player`, or NPC `a`-tag | NPC is in the same place as target. `""` = any entity. `player` = player only. NPC `a`-tag = that NPC only. Optional external action target. |
| `on-attacked` | `""` or item `a`-tag | NPC is attacked. `""` = any weapon. Item `a`-tag = that weapon only. Optional external action target. |
| `on-health` | `down`\|`up`, threshold | This NPC's health crosses threshold in declared direction. Replaces `on-health-zero`. |
| `on-player-health` | `down`\|`up`, threshold | Player health crosses threshold. Valid on world event (global) or NPC (local). Replaces `on-player-health-zero`. |
| `on-move` | State string or `—` | Every player move; optional state guard. Valid on `item` (fires while item is in inventory), `npc`, and `world` (global — fires on every move regardless of inventory). |
| `on-counter` | Direction (`down`\|`up`), counter name, threshold | Fires when counter crosses threshold in declared direction — see counter section |
| `on-fail` | `""` (blank, always) | Puzzle receives a wrong answer. Trigger-target is always blank — there is nothing to filter on. Only valid on `riddle` and `cipher` puzzle types. |
| `on-drop` | Item `a`-tag or `""` (any item), state guard | Item is dropped in this place (on `place`) or explicitly dropped on/in this feature (on `feature`). Item-ref blank = any item. State guard blank = any state. See below. |

**Trigger-target filter semantics:**

| Trigger | `""` | `"player"` | item `a`-tag | NPC `a`-tag |
|---------|------|------------|-------------|-------------|
| `on-attacked` | Any weapon | — (not applicable) | That weapon only | — |
| `on-encounter` | Any entity | Player only | — | That NPC only |
| `on-enter` | — | Player entering | — | — |

**`on-drop` shape and semantics:**

```json
["on-drop", "<item-ref-or-blank>", "<state-guard-or-blank>", "<action-type>", "<action-target?>", "<ext-ref?>"]
```

Valid on `place` and `feature` events only.

- **item-ref** (position 1): blank = any item triggers this handler; specific event ref = only that item.
- **state-guard** (position 2): blank = fires in any entity state; specific state = fires only when the entity (place or feature) is in that state.
- **action-type / action-target / ext-ref**: same as all other `on-*` dispatchers.

Dispatch rules:
- **On a place event:** fires when the player drops any item (`drop X`) in the room. No explicit feature target needed.
- **On a feature event:** fires ONLY when the player explicitly targets the feature — `drop X in/on/into Y` or `drop X on Y`. Plain `drop X` does not trigger feature `on-drop` handlers; the item drops to the floor silently.
- If item-ref matches a feature `on-drop` but the state guard fails: "You can't do that."
- If no matching `on-drop` for the dropped item on a feature: item drops to floor silently (no error).
- **Firing semantics — all matching tags fire.** Every `on-drop` tag whose item-ref and state guard both match is dispatched, in declaration order. Same semantics as `on-interact` — no "first match wins". Place more specific tags before general ones to control execution sequence.

`set-state` via ext-ref on `on-drop` can target items — use this to change the dropped item's own state (e.g. marking a coin as deposited).

Examples:

```json
// Place: any item dropped here plays a sound
["on-drop", "", "", "sound", "30078:<pk>:world:sound:splash"]

// Place: dropping a specific coin reveals a clue
["on-drop", "30078:<pk>:world:item:ancient-coin", "", "set-state", "visible", "30078:<pk>:world:clue:inscription"]

// Feature (well): dropping the coin in the well marks it as deposited and sets feature state
["on-drop", "30078:<pk>:world:item:ancient-coin", "", "set-state", "deposited", "30078:<pk>:world:item:ancient-coin"],
["on-drop", "30078:<pk>:world:item:ancient-coin", "", "set-state", "fulfilled"]
```

`on-encounter` and `on-attacked` both support an optional external action target as the final element — same convention across all `on-*` tags:

```json
// on-encounter examples
["on-encounter", "player",  "deal-damage",  "3"],                                       // player enters, damage
["on-encounter", "player",  "set-state",    "alerted", "30078:<PUBKEY>:npc:captain"],   // alert another NPC
["on-encounter", "",        "consequence",  "30078:<PUBKEY>:consequence:proximity-trap"], // any entity triggers trap
["on-encounter", "30078:<PUBKEY>:npc:thief", "steals-item", "any"],                     // NPC-on-NPC encounter

// on-attacked examples
["on-attacked",  "",                          "deal-damage", "3"],           // counter-attack, any weapon
["on-attacked",  "30078:<PUBKEY>:item:silver-sword", "deal-damage", "6"],   // extra damage from silver
["on-attacked",  "",                          "set-state", "alerted", "30078:<PUBKEY>:npc:captain"] // alert on any attack
```

**Action types** (shared across all `on-*` tags):

| Action | Target | Effect |
|--------|--------|--------|
| `set-state` | State string, optional event `a`-tag | Transitions this event (or a referenced event) to a new state. External target on `on-interact`: `["on-interact", "insert", "", "set-state", "amulet-placed", "30078:<pubkey>:the-lake:feature:mechanism"]` |
| `traverse` | Portal `a`-tag | Sends the player through a portal |
| `give-item` | Item `a`-tag | Adds an item to player inventory |
| `consume-item` | Item `a`-tag | Removes an item from player inventory |
| `deal-damage` | Integer string | Reduces player health by this amount |
| `deal-damage-npc` | NPC `a`-tag or `—` for current | Reduces target NPC health by weapon damage |
| `heal` | Integer string | Restores player health by this amount |
| `consequence` | Consequence `a`-tag | Fires a consequence event |
| `steals-item` | `any` or item `a`-tag | Takes item from player inventory into NPC's stolen list |
| `deposits` | — | NPC drops all stolen items at current place (native `inventory` is unaffected) |
| `flees` | — | Emits a departure message. Pair with `set-state` to activate roaming — see below. |
| `add-counter` | Counter name, amount | Increases named counter by `amount` |
| `sub-counter` | Counter name, amount | Decreases named counter by `amount` (floors at 0) |
| `mul-counter` | Counter name, amount | Multiplies named counter by `amount` |
| `div-counter` | Counter name, amount | Divides named counter by `amount` (integer floor, divide-by-zero ignored) |
| `set-counter` | Counter name, value | Sets named counter to a specific value |
| `increment` | Counter name | *(Deprecated — use `add-counter` with amount `1`)* Increases named counter by 1 |
| `decrement` | Counter name | *(Deprecated — use `sub-counter` with amount `1`)* Reduces named counter by 1 |
| `sound` | Pattern string, optional volume | Fires a one-shot sound effect |

**`flees` and NPC movement:** `flees` is a message-only action — it tells the player the NPC has fled. Actual NPC movement is handled by `set-state` activating the `roams-when` condition. The intended pattern:

```json
// On NPC — roams only when fleeing
["roams-when", "fleeing"],

// On attacked — state change activates roaming, flees emits the message
["on-attacked", "", "set-state", "fleeing"],
["on-attacked", "", "flees"]
```

`flees` without a matching `set-state` will emit a message but the NPC will not move. `set-state` without `flees` will silently start roaming with no player feedback. Both together give the correct behaviour.

New action types can be added without changing the tag structure — the dispatcher is intentionally open-ended.

**Trigger × Action compatibility matrix:**

✓ = valid and meaningful  —  = not applicable or nonsensical in this context

| Trigger | `set-state` | `give-item` | `consume-item` | `traverse` | `deal-damage` | `deal-damage-npc` | `heal` | `consequence` | `steals-item` | `deposits` | `flees` | `add-counter` | `sub-counter` | `mul-counter` | `div-counter` | `set-counter` | `sound` | `activate` |
|---------|-------------|-------------|----------------|------------|---------------|-------------------|--------|---------------|---------------|------------|---------|---------------|---------------|---------------|---------------|---------------|---------|------------|
| `on-interact` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `on-complete` | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `on-enter` | ✓ | ✓ | — | — | ✓ | — | — | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `on-encounter` | ✓ | — | — | — | ✓ | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `on-attacked` | ✓ | — | — | — | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `on-health` | ✓ | ✓ | — | ✓ | — | — | — | ✓ | — | ✓ | — | — | — | — | — | — | ✓ | — |
| `on-player-health` | ✓ | — | — | ✓ | — | — | — | ✓ | — | — | — | — | — | — | — | — | ✓ | — |
| `on-move` | ✓ | — | — | — | ✓ | — | — | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `on-counter` | ✓ | ✓ | — | — | ✓ | — | ✓ | ✓ | — | — | — | — | — | — | — | — | ✓ | — |
| `on-fail` | ✓ | — | — | — | ✓ | — | — | ✓ | — | — | — | ✓ | ✓ | — | — | — | ✓ | — |
| `on-drop` | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — | — | — | ✓ | ✓ | — | — | — | ✓ | — |

**Notes:**
- `steals-item`, `deposits`, `flees` are NPC-only actions — only meaningful on `on-encounter` and `on-attacked` where an NPC is the actor
- `traverse` on `on-player-health` is the respawn pattern — `["on-player-health", "down", "0", "traverse", "<respawn-portal-ref>"]`
- `deal-damage` on `on-enter` / `on-move` — damage traps and hazardous terrain
- `consume-item` on `on-interact` — single-use items consumed on use
- `give-item` on `on-health` — NPC drops loot on death
- `traverse` on `on-health` — teleport player on NPC death (reward chamber, cutscene location)
- `activate` triggers the target event's native mechanic — recipe (crafting), puzzle (prompt), or payment (invoice). Used to scope recipes/puzzles to a feature interaction.
- `add-counter`/`sub-counter`/`mul-counter`/`div-counter`/`set-counter` on `on-attacked` — track hits taken, shield durability, attack counters
- `on-fail` only fires on `riddle` and `cipher` puzzles — sequence/observe puzzles have no wrong-answer state
- The matrix reflects intent, not hard enforcement. The client should handle unexpected combinations gracefully rather than erroring.

#### counter

A named numeric value tracked in player state. Declared on any event type — item, feature, NPC, place, **world**. Modified via counter actions on `on-*` handlers. Two triggers fire based on counter value:

World-scoped counters are player-owned (stored in `player.counters` as `<world-d-tag>:<name>`). Any trigger from any event can modify them by referencing the counter name — the engine resolves world counters automatically when the name matches a counter declared on the world event.

- `on-counter` — fires when the counter reaches or crosses a threshold. `0` is just another threshold value — no special case needed.

```json
["counter", "<n>", "<initial-value>"]
```

Follows the same action shape as all `on-*` tags — they fire actions, not inline messages. Warning text comes from state transitions, keeping all player-facing text in one place:

```json
// Lantern — warning at 50, death at 0
["counter",         "battery",  "300"],
["transition",      "on",        "flickering", "The lantern flickers ominously."],
["transition",      "flickering","dead",        "The lantern dies. Darkness closes in."],
["on-counter",  "down",  "battery",  "50",  "set-state",   "flickering"],
["on-counter", "down", "battery", "0",         "set-state",   "dead"],
["on-counter", "down", "battery", "0",         "consequence", "30078:<pubkey>:the-lake:consequence:lamp-dies"]
```

**Shape:**

```json
["on-counter", "<direction>", "<counter>", "<threshold>", "<action-type>", "<action-target?>"]
```

| Element | Values | Meaning |
|---------|--------|---------|
| direction | `down` \| `up` | Which crossing direction triggers the action |
| counter | string | Counter name — must match a `counter` tag on this event |
| threshold | integer string | The value at which to fire |
| action-type | any action type | What to do |
| action-target | optional | State value, item ref, etc. |

`down` fires when the counter crosses at-or-below the threshold (decrements past it). `up` fires when the counter crosses at-or-above the threshold (increments past it). `0` is a valid threshold — not a special case.

`on-counter` has three behavioural rules:

1. **Threshold crossing** — counter crosses the threshold in the declared direction. Fires once per crossing. The client tracks this to avoid repeated firing on every subsequent change.
2. **State entry** — whenever an event's state changes via any `set-state` action, the client immediately evaluates all `on-counter` tags. If the counter already satisfies the threshold condition, the action fires immediately — unless the event's current state is already the result of that action (prevents loops).
3. **Reconciliation on load** — when the client restores persisted player state, it re-evaluates all `on-counter` tags for all events in the current place. If a counter satisfies a threshold and the event's state doesn't reflect it, the action fires immediately. Catches inconsistencies from sessions ending mid-sequence.

This means a lantern turned off and back on at low battery will immediately enter `flickering` state — the correct physical behaviour. The player doesn't lose the warning cue because they cycled the lantern.

The loop prevention guard applies to all three conditions: if the event is already in the action's target state, do not fire.

The client tracks threshold crossings per counter per threshold value — multiple `on-counter` tags on the same counter with different thresholds each track and fire independently. State entry re-evaluation and load reconciliation always run regardless of prior crossing history.

**Counter actions — tag positions:**

Counter actions follow the same `on-interact` shape as all other actions, with the state guard in position 2. Counter name is at position 4, numeric amount at position 5, optional external event `a`-tag at position 6:

```json
// Self-targeting (counter on this event)
["on-interact", "pump",   "", "add-counter", "heat",    "10"],
["on-interact", "drain",  "", "sub-counter", "heat",    "5"],
["on-interact", "double", "", "mul-counter", "heat",    "2"],
["on-interact", "halve",  "", "div-counter", "heat",    "2"],
["on-interact", "refill", "", "set-counter", "battery", "300"],

// External targeting (counter on another event)
["on-interact", "pump",   "", "add-counter", "heat",    "10", "30078:<PUBKEY>:forge:feature:forge"],
["on-interact", "use",    "", "set-counter", "charge",  "50", "30078:<PUBKEY>:forge:item:battery"]
```

All arithmetic counter amounts are parsed as integers (floats are floored). `sub-counter` floors at 0. `div-counter` ignores a divisor of 0. For external targets, the counter name must exist on the target event — if not, the action is silently ignored.

`increment` and `decrement` are **deprecated** shorthands for `add-counter`/`sub-counter` with amount `1`. They continue to work but authors should prefer the new forms.

Multiple counters on a single event:

```json
["counter", "battery", "300"]
["counter", "charges", "5"]
```


---

#### health triggers — `on-health` and `on-player-health`

Health triggers mirror the `on-counter` system — same direction model, same crossing semantics, same three behavioural rules (threshold crossing, state entry re-evaluation, load reconciliation).

**Shape:**

```json
["on-health",        "<direction>", "<threshold>", "<action-type>", "<action-target?>"]
["on-player-health", "<direction>", "<threshold>", "<action-type>", "<action-target?>"]
```

| Element | Values | Meaning |
|---------|--------|---------|
| direction | `down` \| `up` | Which crossing direction triggers the action |
| threshold | Integer or `N%` string | Absolute health value or percentage of max-health |
| action-type | any action type | What to do |
| action-target | optional | State value, consequence ref, etc. |

**Threshold formats:**
- `"0"` — absolute. Fires when health reaches exactly zero.
- `"3"` — absolute. Fires when health crosses at-or-below 3.
- `"50%"` — percentage of `max-health`. Fires when health crosses at-or-below 50% of max. Portable across different health pools.

**`on-health`** is declared on an NPC and fires for that NPC's health only.

**`on-player-health`** fires for player health. Valid on the world event (global — fires anywhere) or on an NPC (local — fires only when that NPC is in the same place). Use the world event for death consequences; use NPC declaration for NPC-specific player-health reactions.

```json
// Guard — wounded at 50%, flees at 0
["on-health", "down", "50%", "set-state", "wounded"],
["on-health", "down", "0",   "set-state", "defeated"],
["on-health", "down", "0",   "flees"],

// World event — player death anywhere
["on-player-health", "down", "0", "consequence", "30078:<pubkey>:the-lake:consequence:death"],

// NPC — gloats when player is nearly dead
["on-player-health", "down", "2", "set-state", "gloating"]
```

**Replaces `on-health-zero` and `on-player-health-zero`:** these legacy tags are equivalent to `on-health down 0` and `on-player-health down 0` respectively. Clients should support them as aliases for backwards compatibility but they are removed from the spec.

**Player health declaration** lives on the world event:

```json
["health",     "10"]   // starting health
["max-health", "10"]   // maximum health ceiling
```

**Inventory cap** — optional carry limit on the world event:

```json
["max-inventory",     "6",  "You're carrying too much."]
["on-inventory-full", "",   "consequence", "30078:<PUBKEY>:world:consequence:overloaded"]
```

`max-inventory` enforces a hard cap on `player.inventory` length. When a pickup or `give-item` would exceed it, the blocked-message is shown and the item is not added. `on-inventory-full` fires when a pickup is blocked — trigger-target is always blank, supports all standard actions (repeatable). Both are optional independently.

**HUD** — persistent counter display on the world event:

```json
["hud", "Score: {{score}} | Moves: {{moves}}"]
```

`hud` declares a persistent client display. Multiple `hud` tags render multiple lines. Visual placement is a client concern. Template variables:

| Variable | Source |
|---|---|
| `{{counter-name}}` | Player counter (world-scoped) |
| `{{health}}` | Current player health |
| `{{max-health}}` | Maximum player health |
| `{{inventory-count}}` | Number of items carried |

**Map** — opt-in player map overlay on the world event:

```json
["map", "fog"]
["map", "full"]
```

`map` enables an in-game map overlay toggled by the `map` built-in command. Two modes:

- `fog` — shows only places the player has visited (named nodes) and portals they have traversed (edges). Unknown territory is invisible.
- `full` — additionally shows adjacent unvisited places as unnamed dim nodes, giving a sense of world extent without spoiling content.

The map is rendered as a force-directed graph, seeded from d-tag hashes for stable layout across sessions. Nodes are compact; edges are the portals the player has used. The current place is highlighted. Node names are truncated to fit the compact display.

The `map` command is **built-in and reserved** when the world has a `map` tag. `map` with no noun opens the overlay. `map <noun>` performs a verb/noun lookup first (so `map cairns` works if there is a map item with that noun) and falls through to the overlay only if no match is found.

Player state tracks:
- `visited` — place refs visited (already tracked)
- `portalsUsed` — portal refs traversed, stored as `{ portal, from, to }` triples. Written on every portal traversal (directional move and `traverse` action).

#### state & transition

`state` declares the initial state of an event. `transition` defines the legal edges of the state graph — the client only executes a `set-state` action if a matching transition exists. If no `transition` tags are present, any state change is permitted (opt-in enforcement).

```json
["state",      "<initial-state>"]
["transition", "<from-state>", "<to-state>", "<optional-text>"]
```

The optional fourth element is **transition text** — rendered to the player when this transition fires. This applies to any event type: items, features, NPCs. It is the world giving feedback at the moment of change.

```json
["transition", "off",  "on",   "The lantern flickers to life."],
["transition", "on",   "off",  "Darkness closes in."],
["transition", "on",   "dead", "The lantern slowly fades out and darkness looms."],
["transition", "dead", "dead", "The lantern is dead. Nothing happens."]
```

`["transition", "dead", "dead", "..."]` declares a terminal state — the client shows the text and blocks any further state change. Other examples:

```json
// Door with feedback
["transition", "closed", "open",   "The door swings open with a groan."]
["transition", "open",   "closed", "The door thuds shut."]
["transition", "locked", "closed", "The lock clicks open."]

// NPC weakening in combat
["transition", "healthy",  "wounded", "The troll staggers, clutching its side."]
["transition", "wounded",  "dead",    "The troll collapses with a final roar."]
["transition", "dead",     "dead",    "The troll is already dead."]

// Feature worn out
["transition", "charged",    "depleted", "The altar's glow fades as the last of its power is spent."]
["transition", "depleted",   "depleted", "The altar is cold and silent."]
```

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",           "the-lake:feature:kitchen-window"],
    ["t",           "the-lake"],
    ["type",        "feature"],
    ["title",       "Kitchen Window"],
    ["verb", "open", "examine", "enter"],
    ["state",       "ajar"],
    ["on-interact", "open",  "", "set-state", "open"],
    ["on-interact", "open",  "", "set-state", "open"],
    ["on-interact", "enter", "", "traverse",  "30078:<pubkey>:the-lake:portal:window-to-kitchen"]
  ],
  "content": "The window is slightly ajar."
}
```

A stateless feature:

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",           "the-lake:feature:bronze-altar"],
    ["t",           "the-lake"],
    ["type",        "feature"],
    ["title",       "A Bronze Altar"],
    ["verb", "examine", "place"],
    ["on-interact", "examine", "", "set-state", "visible", "30078:<pubkey>:the-lake:clue:altar-inscription"]
  ],
  "content": "A heavy bronze altar, worn smooth by many hands."
}
```

A chest with state, contents, and a lock:

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",           "the-lake:feature:ancient-chest"],
    ["t",           "the-lake"],
    ["type",        "feature"],
    ["title",       "An Ancient Chest"],
    ["noun",        "chest", "box"],
    ["verb",        "open",  "examine"],
    ["state",       "closed"],
    ["requires",    "30078:<pubkey>:the-lake:item:iron-key", "", "The chest is sealed with a serpent-shaped lock."],
    ["on-interact", "open",  "", "set-state", "open"],
    ["contains",    "30078:<pubkey>:the-lake:item:treasure-map", "open", "The chest is closed."],
    ["contains",    "30078:<pubkey>:the-lake:item:gold-coin",    "open", "The chest is closed."]
  ],
  "content": "A heavy oak chest bound with iron. The lock is shaped like a serpent."
}
```

Features support `contains` with the same shape as items. The state gate is particularly useful on features — a chest only yields its contents when `open`, a safe only when `unlocked`. Contained items are not declared on the place event — they exist exclusively inside the feature:

```json
// CORRECT — place declares the chest, not its contents
["feature", "30078:<pubkey>:the-lake:feature:ancient-chest"]

// WRONG — contained items must not appear as place items
// ["item", "30078:<pubkey>:the-lake:item:treasure-map"]  ← bug: exists in two places
```

The place event declares the chest and any ground-level items — not items inside containers:

```json
["item",    "30078:<pubkey>:the-lake:item:brass-lantern"],
["feature", "30078:<pubkey>:the-lake:feature:ancient-chest"],
["feature", "30078:<pubkey>:the-lake:feature:bronze-altar"]
```

**`on-drop` on a feature** fires when the player explicitly drops an item onto or into the feature — `drop X in/on/into Y` or `drop X on Y`. Plain `drop X` (no feature target) does not trigger feature `on-drop` handlers; the item falls to the floor silently. This makes features into receptacles — wells, bowls, slots, chests — that react to specific items being deposited.

```json
// Feature (wishing well): coin deposited → reveal clue and change well state
["on-drop", "30078:<pubkey>:the-lake:item:ancient-coin", "", "set-state", "deposited", "30078:<pubkey>:the-lake:item:ancient-coin"],
["on-drop", "30078:<pubkey>:the-lake:item:ancient-coin", "", "set-state", "fulfilled"],
["on-drop", "30078:<pubkey>:the-lake:item:ancient-coin", "", "set-state", "visible", "30078:<pubkey>:the-lake:clue:well-inscription"]
```

Dispatch rules:
- Item-ref (position 1) blank = any item matches. Specific event ref = only that item.
- State guard (position 2) blank = fires in any feature state. A specific state = fires only when the feature is in that state.
- If item-ref matches but state guard fails → "You can't do that."
- If no `on-drop` matches the item → item drops to floor silently (no error message).
- **All matching tags fire**, in declaration order — same semantics as `on-interact`. The three-tag example above (mark item deposited → set feature state → reveal clue) works because all three match and execute in sequence.

---

### 2.5 Clue (`type: clue`)

A self-contained piece of information with its own state lifecycle. Clues start `hidden` and are set to `visible` by whatever discovers them — a feature interaction, an NPC, a place entry. They can be referenced independently by multiple events. The `sealed` state means the content is NIP-44 encrypted — visible but unreadable without the right key.

**Conditional clue visibility:** a `requires` tag on a clue gates its visibility even after `set-state visible` has fired. If the `requires` condition is not met, the client suppresses the clue regardless of its state. This is the correct pattern for clues that should only appear under specific world conditions — not inline `requires` strings on `on-interact` tags (which are not valid schema):

```json
// Clue only shows when lamp is running — requires gates visibility
{
  "kind": 30078, "tags": [
    ["d",       "lighthouse:clue:lamp-running"],
    ["type",    "clue"],
    ["state",   "hidden"],
    ["requires","30078:<PUBKEY>:lighthouse:feature:lamp", "running", ""]
  ],
  "content": "The light cuts out to sea. Something answers back."
}
```

The `on-interact` that fires `set-state visible` on this clue can run unconditionally — the `requires` on the clue itself is the gate.

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",          "the-lake:clue:altar-inscription"],
    ["t",          "the-lake"],
    ["type",       "clue"],
    ["title",      "Altar Inscription"],
    ["noun",       "inscription", "writing", "carving"],
    ["state",      "hidden"],
    ["transition", "hidden",  "visible", "You notice writing carved into the stone."],
    ["transition", "sealed",  "visible", "The inscription becomes readable."],
    ["transition", "visible", "visible", "You've already read this."]
  ],
  "content": "Carved into the altar stone: 'The serpent opens what the serpent guards.'"
}
```

**Clue states:**

| State | Meaning |
|-------|---------|
| `hidden` | Not yet discovered — not rendered to the player |
| `visible` | Discovered and readable |
| `sealed` | Visible but NIP-44 encrypted — requires a crypto key to read |

**Surfacing a clue** — any event can set a clue's state to `visible` via `set-state`:

```json
// Feature interaction
["on-interact", "examine", "", "set-state", "visible", "30078:<pubkey>:the-lake:clue:altar-inscription"]

// Place entry (ambient clue — shown on arrival)
["on-enter", "player", "", "set-state", "visible", "30078:<pubkey>:the-lake:clue:notice-on-wall"]

// NPC dialogue node
["on-enter", "player", "", "set-state", "visible", "30078:<pubkey>:the-lake:clue:hermit-hint"]
```

**Sealed clue** — content encrypted, key found elsewhere in the world:

```json
{
  "kind": 30078, "tags": [
    ["d",            "the-lake:clue:sealed-prophecy"],
    ["t",            "the-lake"],
    ["type",         "clue"],
    ["state",        "sealed"],
    ["content-type", "application/nip44"],
    ["transition",   "sealed",  "visible", "The inscription shimmers and becomes readable."]
  ],
  "content": "<NIP-44 encrypted content>"
}
```

The `clue` tag on a place references an ambient clue that becomes visible on entry without requiring explicit player interaction:

```json
["clue", "30078:<pubkey>:the-lake:clue:notice-on-wall"]
```

---

### 2.6 Puzzle (`type: puzzle`)

A challenge that produces an outcome when completed. Verification is always client-side. `puzzle-type` is a hint to the client about how to present the challenge — it does not change the underlying mechanic. All puzzles use `requires` to define conditions and `on-complete` to define outcomes.

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",           "the-lake:puzzle:chapel-riddle"],
    ["t",           "the-lake"],
    ["type",        "puzzle"],
    ["puzzle-type", "riddle"],
    ["answer-hash", "<sha256(answer + salt)>"],
    ["salt",        "the-lake:puzzle:chapel-riddle:v1"],
    ["on-complete", "", "set-state", "solved"]
  ],
  "content": "I have a neck but no head, a body but no soul. I guard what you seek but ask nothing in return. What am I?"
}
```

The answer is never stored. `SHA256(answer + salt)` means the client hashes the player's input and compares locally. No server, no relay read, no cheating.

**Puzzle types** (`puzzle-type` tag — UI hint only, not logic):

| Type | Mechanic | Notes |
|------|---------|-------|
| `riddle` | Answer hashes to known value | Uses `answer-hash` + `salt` tags |
| `sequence` | Events must reach given states in order | Same as recipe with `ordered: true` |
| `cipher` | Decode an encrypted message | Uses NIP-44 sealed content |
| `observe` | Notice something in place/clue descriptions | Client surfaces on player action |

**`observe` puzzles** are a named variant of `sequence` — the player must have examined or visited specific things rather than manipulated them. The `requires` tags check for `visited` or `read` states on places, clues, or features. Auto-evaluated after any state change, same as sequence puzzles. No answer input required — completion is automatic when all conditions pass:

```json
{
  "kind": 30078, "tags": [
    ["d",           "lighthouse:puzzle:read-clues"],
    ["t",           "lighthouse"],
    ["type",        "puzzle"],
    ["puzzle-type", "observe"],
    ["requires",    "30078:<PUBKEY>:lighthouse:clue:logbook-entry",  "visible", "Read the logbook first."],
    ["requires",    "30078:<PUBKEY>:lighthouse:clue:desk-letter",    "visible", "Find the letter in the cottage."],
    ["requires",    "30078:<PUBKEY>:lighthouse:clue:hearth-ash",     "visible", "Examine the hearth."],
    ["on-complete", "", "give-item", "30078:<PUBKEY>:lighthouse:item:insight"]
  ],
  "content": "The pieces are coming together."
}
```

**`cipher` puzzles** use NIP-44 sealed clue content. The clue is visible but unreadable — the puzzle answer derives the decryption key. Same hash verification as `riddle`: `answer-hash = SHA256(answer + salt)`. On solve, `on-complete` gives the player the derived key which the client uses to decrypt the clue's content.

**`map` puzzle type — deferred.** Originally specced as "navigate a sub-maze" but requires significant client-side spatial UI that is not yet defined. Removed from the type list pending a future extension. Do not use.

**Sequence puzzles** are structurally identical to recipes with `ordered: true` — the only difference is what the `requires` tags reference. A recipe requires inventory items; a sequence puzzle requires world event states. Both use `ordered: true` to enforce evaluation order:

```json
{
  "kind": 30078, "tags": [
    ["d",           "the-lake:puzzle:lever-sequence"],
    ["t",           "the-lake"],
    ["type",        "puzzle"],
    ["puzzle-type", "sequence"],
    ["ordered",     "true"],
    ["requires",    "30078:<pubkey>:the-lake:feature:lever-a", "pulled", "You need to pull lever A first."],
    ["requires",    "30078:<pubkey>:the-lake:feature:lever-b", "pulled", "You need to pull lever B next."],
    ["requires",    "30078:<pubkey>:the-lake:feature:lever-c", "pulled", "You need to pull lever C last."],
    ["on-complete", "", "set-state", "visible", "30078:<pubkey>:the-lake:portal:secret-door"]
  ],
  "content": "Three levers protrude from the wall."
}
```


The `combine` puzzle type is now redundant — item combination is handled entirely by `type: recipe`. Remove it from the type hint list.

**Sequence puzzle evaluation** — the client evaluates a sequence puzzle's `requires` automatically after any feature or item state change in the current place, not only on explicit player action. If all conditions are satisfied, `on-complete` fires immediately. This means players don't need to "submit" a sequence — completing the last step triggers completion automatically.

**`on-fail` — wrong answer hook**

When a puzzle receives a wrong answer, `on-fail` fires. Shape mirrors `on-complete` exactly — blank trigger-target, action type, optional action target:

```json
["on-fail", "", "deal-damage",  "2"],
["on-fail", "", "set-state",    "alarmed", "30078:<pubkey>:the-lake:npc:guard"],
["on-fail", "", "decrement",    "attempts"],
["on-fail", "", "consequence",  "30078:<pubkey>:the-lake:consequence:trap-springs"]
```

`on-fail` fires on every wrong answer unless the author uses a counter to limit attempts. `on-fail` paired with a counter and `on-counter` gives attempt-limited puzzles with no new tag needed:

```json
// Puzzle with 3 attempts — alarm triggers on exhaustion
["counter",    "attempts", "3"],
["on-fail",    "", "decrement",   "attempts"],
["on-counter", "down", "attempts", "0", "consequence", "30078:<pubkey>:the-lake:consequence:alarm-triggered"]
```

`on-fail` is only valid on `riddle` and `cipher` puzzle types — sequence and observe puzzles have no wrong-answer state.

**Forks and branching — state is the primitive**

Branching is not a puzzle mechanic. It is expressed through `set-state` on any trigger, with the state carrying through the world and gating future content. The fork is wherever the state gets set — a dialogue choice, an item used, a place visited, a puzzle solved one way.

```json
// Dialogue choice — player sides with the hermit
["on-option", "side-with-hermit", "set-state", "ally", "30078:<pubkey>:the-lake:item:journal"]

// Later — hidden portal only opens for hermit allies
["requires", "30078:<pubkey>:the-lake:item:journal", "ally", "The passage doesn't respond to you."]

// Different NPC reaction based on earlier choice
["on-encounter", "player", "give-item", "30078:<pubkey>:the-lake:item:token"]
// (gated by requires on the NPC or portal referencing the journal state)
```

State set anywhere propagates everywhere. NPCs react differently, portals open or stay sealed, items become available or don't — all reading the same state flag. This is the correct model for branching narratives in FOAKLOAR. No special branching mechanic exists or is needed.

Everything else — conditions, outcomes, state transitions, NPC behaviour — is fully expressed in the schema with no special client logic required.

---

### 2.7 Recipe (`type: recipe`)

Defines what items combine to produce a new item. Structurally identical to a sequence puzzle — `requires` tags define what's needed, `on-complete` fires the outcome, `ordered: true` enforces sequence. The only difference is that `requires` references inventory items rather than world event states, and the client presents it as a crafting UI rather than a puzzle.

Recipes come in two forms depending on whether they have a `noun` tag:

**Portable recipe** — has `verb` + `noun` tags on the recipe itself. The recipe's verbs enter the global command vocabulary and the recipe can be triggered from any room. Use this for skills or formulas the player carries with them.

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",           "the-lake:recipe:serpent-staff"],
    ["t",           "the-lake"],
    ["type",        "recipe"],
    ["verb",        "assemble", "combine", "make"],
    ["noun",        "staff", "serpent staff"],
    ["state",       "unknown"],
    ["transition",  "unknown", "known", "You piece together how the staff was made."],
    ["requires",    "30078:<pubkey>:the-lake:item:wooden-rod",   "", ""],
    ["requires",    "30078:<pubkey>:the-lake:item:iron-key",     "", ""],
    ["requires",    "30078:<pubkey>:the-lake:item:serpent-gem",  "", ""],
    ["on-complete", "", "give-item",  "30078:<pubkey>:the-lake:item:serpent-staff"],
    ["on-complete", "", "set-state",  "known", "30078:<pubkey>:the-lake:clue:staff-origin"],
    ["ordered",     "false"]
  ],
  "content": ""
}
```

**Feature-bound recipe** — has `verb` tag but **no `noun` tag**. Triggered exclusively via a feature's `on-interact activate` action. The feature provides the noun and scopes the recipe to its place. The verb on the recipe is informational (for display); the feature's own verb tag is what puts it in scope.

```json
// Feature in the smithy — provides the noun "forge" and scopes to its place:
["on-interact", "use", "", "activate", "30078:<pubkey>:world:recipe:forge-sword"]

// Recipe — no noun tag, scoped to the smithy:
["verb", "use"],
["requires",    "30078:<pubkey>:world:item:iron-bar", "", "You need an iron bar."],
["on-complete", "", "give-item",    "30078:<pubkey>:world:item:sword"],
["on-complete", "", "consume-item", "30078:<pubkey>:world:item:iron-bar"]
```

Other notes:

- `content` — optional prose, shown on examine (ingredient checklist) and on successful craft (completion text). Use it to describe the crafting moment.
- `ordered: true` — ingredients must be combined in sequence; client evaluates `requires` in tag order
- **Ingredient consumption is explicit** — items are only consumed if listed as `on-complete consume-item` tags. `requires` gates the recipe (player must hold the item) but does not consume it. This allows non-item requirements — a lit forge, a specific place state — without consuming them:

```json
// Forge is required but not consumed — only the iron-bar and leather-strip are
["requires",    "30078:<pubkey>:forge:feature:forge",       "lit", "You need a lit forge."],
["requires",    "30078:<pubkey>:forge:item:iron-bar",       "", ""],
["requires",    "30078:<pubkey>:forge:item:leather-strip",  "", ""],
["on-complete", "", "give-item",    "30078:<pubkey>:forge:item:iron-key"],
["on-complete", "", "consume-item", "30078:<pubkey>:forge:item:iron-bar"],
["on-complete", "", "consume-item", "30078:<pubkey>:forge:item:leather-strip"]
```

- A feature can be required for crafting without being consumed — `requires` on a feature state is a gate, not an ingredient

---

### 2.8 Payment (`type: payment`)

A Lightning payment gate. The player pays a LNURL invoice; on confirmation the client fires `on-complete` — typically giving a receipt item that satisfies a `requires` condition on a portal or feature. Verification is via LUD-11 (LNURL-verify), keyed on the payment hash.

There is no hash verification — payment itself is the condition. The verify endpoint is the source of truth.

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",           "the-lake:payment:entry-fee"],
    ["t",           "the-lake"],
    ["type",        "payment"],
    ["amount",      "1000"],
    ["unit",        "sats"],
    ["lnurl",       "lnurl1dp68gurn8..."],
    ["on-complete", "", "give-item", "30078:<pubkey>:the-lake:item:entry-token"],
    ["on-complete", "", "set-state", "solved"]
  ],
  "content": "A toll gate. 1000 sats to pass."
}
```

**Client flow:**

1. Client fetches LNURL-pay metadata, generates invoice
2. Stores `payment-hash` locally against the payment event `d`-tag — before player pays
3. Displays invoice (QR code or copyable string) to player
4. Polls LUD-11 verify endpoint until `paid` or timeout
5. On `paid` → fire `on-complete`, add receipt item to inventory, mark `complete` in local state

**Local state shape:**

```json
{
  "payment-attempts": {
    "the-lake:payment:entry-fee": {
      "payment-hash": "abc123...",
      "status": "pending | paid | complete"
    }
  }
}
```

**Recovery on reload:**
On load, the client checks all `payment-attempts` entries. Any entry with status `pending` or `paid` but not `complete` is re-verified by polling LUD-11 with the stored `payment-hash`. If the endpoint confirms `paid`, `on-complete` fires. This handles client crashes, network failures, and interrupted sessions cleanly — the payment hash is the persistent proof of payment.

**Proof of payment:**
The player's wallet holds the preimage as cryptographic proof of payment. The payment hash (stored by the client) is sufficient for verify endpoint queries. If the player disputes a failed `on-complete`, the preimage from their wallet is unforgeable proof to the world author.

**Invoice expiry:**
LNURL-pay invoices typically expire after 60 seconds. If the player doesn't pay before expiry, the client should offer to generate a fresh invoice. The stored `payment-hash` is discarded and replaced with the new invoice's hash.

**Author infrastructure:**

`type: payment` requires the world author to operate or use a LNURL server supporting:

| LUD | Name | Purpose |
|-----|------|---------|
| [LUD-01](https://github.com/lnurl/luds/blob/legacy/lnurl-rfc.md) | LNURL base | Core encoding and request/response format |
| [LUD-06](https://github.com/lnurl/luds/blob/legacy/06.md) | `payRequest` | LNURL-pay flow — invoice generation |
| [LUD-11](https://github.com/lnurl/luds/blob/legacy/11.md) | `verify` | Payment status polling keyed on payment hash |

If the verify endpoint goes offline, the puzzle becomes unsolvable for new players — existing players with `complete` status are unaffected. Authors should treat LNURL infrastructure as a long-term hosting commitment, or use a shared platform service.

---

### 2.9 NPC (`type: npc`)

An actor in the world. NPCs are placed by the place author via reference tags — they do not declare their own location. NPCs use the same `on-*` dispatcher as features, items, and places for all reactive behaviour — `on-interact`, `on-encounter`, `on-enter`, `on-attacked`. No separate `behaviour` tag needed.

A static NPC:

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",           "the-lake:npc:old-hermit"],
    ["t",           "the-lake"],
    ["type",        "npc"],
    ["title",       "Old Hermit"],
    ["noun",        "hermit", "old man", "man"],
    ["on-interact", "talk", "", "give-item", "30078:<pubkey>:the-lake:item:map-fragment"],
    ["on-interact", "talk", "", "set-state", "visible", "30078:<pubkey>:the-lake:clue:hermit-warning"],
    ["dialogue",    "30078:<pubkey>:the-lake:dialogue:hermit:greeting"]
  ],
  "content": "A weathered old man sits by a dying fire."
}
```

A roaming NPC with autonomous behaviour:

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",            "the-lake:npc:thief"],
    ["t",            "the-lake"],
    ["type",         "npc"],
    ["title",        "Thief"],
    ["speed",        "3"],
    ["order",        "random"],
    ["route",        "30078:<pubkey>:the-lake:place:treasure-room"],
    ["route",        "30078:<pubkey>:the-lake:place:maze-1"],
    ["route",        "30078:<pubkey>:the-lake:place:gallery"],
    ["route",        "30078:<pubkey>:the-lake:place:cyclops-room"],
    ["on-encounter", "player",    "steals-treasure"],
    ["on-enter",    "30078:<pubkey>:the-lake:place:treasure-room", "", "deposits"],
    ["on-attacked",  "consequence","30078:<pubkey>:the-lake:consequence:thief-flees"],
    ["stash",        "30078:<pubkey>:the-lake:place:treasure-room"],
    ["dialogue",     "30078:<pubkey>:the-lake:dialogue:thief-tree"]
  ],
  "content": "A seedy-looking individual in a trench coat."
}
```

A lethal NPC (grue):

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",            "the-lake:npc:grue"],
    ["t",            "the-lake"],
    ["type",         "npc"],
    ["title",        "Grue"],
    ["requires-not", "30078:<pubkey>:the-lake:item:brass-lantern", "on", ""],
    ["on-encounter", "player", "consequence", "30078:<pubkey>:the-lake:consequence:death"]
  ],
  "content": "A sinister, lurking presence in the dark."
}
```

The grue only exists (is rendered) when the lantern is off — `requires-not` on the NPC itself. When encountered, it fires the death consequence. No special-case client logic needed.

**Movement tags:**

| Tag | Value | Meaning |
|-----|-------|---------|
| `speed` | Integer string | Moves once every N player moves |
| `order` | `sequential` \| `random` | How the NPC traverses its route |
| `route` | Place `a`-tag | A place in the NPC's movement pool (multiple allowed) |
| `stash` | Place `a`-tag | Where the NPC deposits stolen items on arrival |
| `roams-when` | State string | NPC only roams when in this state; if absent, always roams |
| `inventory` | Item `a`-tag | Item the NPC starts with — multiple allowed. Shown on `examine`. Separate from stolen items. |

`inventory` on an NPC fills the gap left by `steals-item` and `deposits` — those actions imply the NPC can hold items, but without `inventory` there was no way to declare what it starts with. The Zork thief carrying a stiletto, the bat stealing your lantern — both need a starting inventory:

```json
// Thief starts carrying a stiletto
["inventory", "30078:<ZA>:zork1:item:stiletto"]

// Merchant stocks three items for sale
["inventory", "30078:<pubkey>:the-lake:item:healing-potion"],
["inventory", "30078:<pubkey>:the-lake:item:rope"],
["inventory", "30078:<pubkey>:the-lake:item:torch"]
```

NPC items are tracked in two separate lists in player state:

- **`inventory`** — native items declared on the NPC event. Shown on `examine`. Never auto-dropped; transfer to the player only via explicit `give-item` actions in triggers.
- **`stolen`** — items taken from the player via `steals-item`. When `deposits` fires, the stolen list is deposited at the current place and cleared. Native inventory is not affected by `deposits`.

Nothing drops automatically on NPC defeat. The author uses `give-item` in `on-health` or `on-health-zero` triggers to control exactly what the player receives and when.

`roams-when` allows movement to be state-conditional. An NPC with `route` tags but a `roams-when` state will only move when its current state matches. In any other state it stays at its spawn point. This means roaming can be activated or deactivated by a state transition — a consequence fires, the NPC transitions to the `roams-when` state, and the client begins routing it.

```json
// Always roams — no roams-when tag (Zork thief, bat)

// Only roams when ally — confined until freed (Sloth)
["roams-when", "ally"]

// Only patrols when blocking — stops when defeated
["roams-when", "blocking"]

// Only follows on team path
["roams-when", "following"],
["requires",   "30078:<pubkey>:the-lake:item:path-team", "", ""]
```

**Placement and spawn:** A roaming NPC is brought into the world by a place author referencing it with an `npc` tag — this is the NPC's spawn point, where it first appears. From there it roams its `route`. The place author controls where the NPC enters the world; the NPC's `route` controls where it goes after. If no place references the NPC, it doesn't exist in the world.

**NPC-blocked portals:** NPCs do not declare what they guard. If an NPC blocks a portal, express it as a `requires` on the portal itself — the portal requires the NPC to be in state `gone`. This keeps the blocking condition with the thing being blocked, consistent with the rest of the schema:

```json
// Portal blocked by troll
["requires", "30078:<pubkey>:the-lake:npc:troll", "gone", "The troll blocks your passage."]
```

NPC position is deterministic — seeded by player move count and the NPC's own `d` tag. Multiple NPCs with the same speed move independently. All players see the same NPC position at the same move count.

---

### 2.10 Dialogue (`type: dialogue`)

Each dialogue node is its own event. Nodes are grouped by `d` tag namespacing — all nodes for a conversation share a common prefix (e.g. `the-lake:dialogue:hermit:`), allowing the client to fetch the entire conversation tree in one relay query.

`dialogue` tags are valid on **any event** — NPC, feature, item, or place. A magical mirror, an ancient tome, an oracle stone, or a whispering item can all carry dialogue trees. The `talk` / `ask` verb and `on-interact` trigger the conversation regardless of the host event type.

Any event can carry multiple `dialogue` tags — each an alternative entry point with an optional `requires` condition. The client evaluates them in order and uses the **last one that passes** — so the most advanced applicable entry point wins. If none have `requires`, the first unconditional tag is the root.

The client checks two conditions when selecting a tier:
- The `requires` condition on the `dialogue` tag itself (ref + state gate)
- `requires-counter` tags on the target dialogue node event — useful for counter-based tier progression (e.g. CASS accuracy tier advancing as the player discovers sensor errors)

Both must pass. A dialogue node with `requires-counter` that fails is skipped even if the NPC tag's ref/state passes.

```json
["dialogue", "30078:<pubkey>:the-lake:dialogue:hermit:greeting"]
["dialogue", "30078:<pubkey>:the-lake:dialogue:hermit:after-cave",     "30078:<pubkey>:the-lake:dialogue:hermit:cave",     "visited"]
["dialogue", "30078:<pubkey>:the-lake:dialogue:hermit:after-blessing",  "30078:<pubkey>:the-lake:dialogue:hermit:blessing",  "visited"]
```

`dialogue` tag shape: `["dialogue", "<node-ref>", "<optional-requires-ref>", "<optional-state>"]`

This allows conversations to resume at the appropriate depth — a player who has already received the blessing won't be greeted as a stranger. The client gates options by evaluating each destination node's `requires` tags. Options whose destination fails `requires` are not rendered. No per-option conditions needed in the `option` tag itself.

**`option` shape:** `["option", "<label>", "<next-node-ref-or-blank>"]`  
Blank next = end of conversation.

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",      "the-lake:dialogue:hermit:greeting"],
    ["t",      "the-lake"],
    ["type",   "dialogue"],
    ["option", "Ask about the cave", "30078:<pubkey>:the-lake:dialogue:hermit:cave"],
    ["option", "Ask about the key",  "30078:<pubkey>:the-lake:dialogue:hermit:key"],
    ["option", "Leave",              ""]
  ],
  "content": "What do you want, wanderer?"
}
```

A gated node — only offered when the player holds the map fragment:

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",       "the-lake:dialogue:hermit:key"],
    ["t",       "the-lake"],
    ["type",    "dialogue"],
    ["requires", "30078:<pubkey>:the-lake:item:map-fragment", "", ""],
    ["option",  "Ask what the gate looks like", "30078:<pubkey>:the-lake:dialogue:hermit:gate"],
    ["option",  "Thank him and leave",          ""]
  ],
  "content": "Ah, you found the map. The key you seek is hidden behind the serpent gate."
}
```

A node that gives an item on visit:

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",           "the-lake:dialogue:hermit:cave"],
    ["t",           "the-lake"],
    ["type",        "dialogue"],
    ["on-enter",    "player", "give-item", "30078:<pubkey>:the-lake:item:map-fragment"],
    ["option",      "Ask what the blessing is", "30078:<pubkey>:the-lake:dialogue:hermit:blessing"],
    ["option",      "Thank him and leave",       ""]
  ],
  "content": "The cave is old. Older than me. Don't go north without the serpent's blessing."
}
```

**Feature dialogue — a speaking mirror:**

Any feature can host dialogue. The player types `talk to mirror` or `ask mirror` — the `talk`/`ask` verb is declared on the feature, and `on-interact` routes into the dialogue tree:

```json
{
  "kind": 30078,
  "tags": [
    ["d",           "the-lake:feature:oracle-mirror"],
    ["t",           "the-lake"],
    ["type",        "feature"],
    ["title",       "The Oracle Mirror"],
    ["noun",        "mirror", "oracle", "glass"],
    ["verb",        "examine", "look"],
    ["verb",        "talk",    "ask",   "speak"],
    ["dialogue",    "30078:<pubkey>:the-lake:dialogue:mirror:greeting"],
    ["dialogue",    "30078:<pubkey>:the-lake:dialogue:mirror:after-sanctum",
                    "30078:<pubkey>:the-lake:place:sanctum", "visited"]
  ],
  "content": "A mirror of black glass. It reflects nothing. It watches everything."
}
```

The mirror's dialogue tree advances as the player progresses — it knows if the sanctum has been visited. No NPC event needed.

**Client flow:**
1. Player types `talk` / `ask` on a feature, item, or NPC → client resolves the target event
2. Target event's `dialogue` tags evaluated in order — last passing `requires` wins as entry point
3. Client renders entry node text and options
4. For each `option`, evaluates destination node's `requires` — hides failing options
5. Player selects option → client moves to destination node, repeats
6. Blank next → conversation ends

---

### 2.11 Consequence (`type: consequence`)

A reusable outcome definition. Consequences are fired by portals, NPCs, or `on-interact` actions — they define what happens to player state, not why. Multiple callers can reference the same consequence event.

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",       "the-lake:consequence:death"],
    ["t",       "the-lake"],
    ["type",    "consequence"],
    ["respawn", "30078:<pubkey>:the-lake:place:west-of-house"],
    ["clears",  "inventory"],
    ["clears",  "cryptoKeys"]
  ],
  "content": "It is pitch black. You are likely to be eaten by a grue."
}
```

**Consequence tags:**

| Tag | Value | Effect |
|-----|-------|--------|
| `requires` | Event `a`-tag, optional state, optional description | Pre-flight gate — consequence is silently skipped if condition fails. Multiple tags = AND logic. |
| `requires-not` | Event `a`-tag, optional state, optional description | Pre-flight gate (inverted) — consequence is silently skipped if condition passes. |
| `transition-effect` | Effect name | Visual effect played when the consequence fires: `blackout`, `flash`, `fade`, `shake`, `glitch`, `invert`, `static`, `pulse`. |
| `transition-duration` | Milliseconds | Duration of the transition effect. Defaults to `800`. |
| `transition-clear` | `"true"` | Clears the game log when the consequence fires. |
| `respawn` | Place `a`-tag | Moves player to this place — always fires last |
| `clears` | State key | Wipes this part of player state — see below |
| `give-item` | Item `a`-tag | Adds item to inventory |
| `consume-item` | Item `a`-tag | Removes item from inventory |
| `deal-damage` | Integer string | Reduces player health |
| `set-state` | State string, optional event `a`-tag | Transitions this event (or a referenced event) to a new state — same shape as `on-interact` |
| `set-counter` | Counter name, value, optional event `a`-tag | Sets a named counter to a specific value. Without external ref, targets the world-scoped counter of that name. Useful for resetting countdowns after a consequence without wiping all counters. |

State keys for `clears`: `inventory`, `states`, `counters`, `cryptoKeys`, `dialogueVisited`, `paymentAttempts`, `visited`.

**Pre-flight requires:** `requires` and `requires-not` on a consequence act as a gate on the consequence itself, independent of any gate on the caller. If the pre-flight check fails the consequence body is silently skipped — the caller's other actions still proceed. Use this to make a single consequence conditional without duplicating the caller's trigger logic:

```json
// Only bad things happen if the player opens B1 without the PPG suit donned
["on-interact", "open", "sealed", "set-state",   "open"]
["on-interact", "open", "sealed", "consequence",  "30078:<pubkey>:world:consequence:b1-open-check"]

// b1-open-check has requires-not gate — silently skipped if suit is donned
["requires-not", "30078:<pubkey>:world:item:ppg-suit", "donned", ""]
["deal-damage",  "10"]
```

---

**`clears inventory` — drop behaviour**

When `clears inventory` fires, all items in the player's inventory are **dropped to the current place** (the place where the consequence fired, not the respawn destination) before the inventory array is emptied. The player can walk back to retrieve them after respawning.

This is the only built-in behaviour — there is no destroy-on-death variant. Dropping prevents soft-locks: if the player dies holding the only key, the key is recoverable. World authors who want certain items to be unrecoverable should make those items re-acquirable elsewhere, or not use `clears inventory` on death consequences that fire in unreachable places.

Dropped items appear in the place's ground inventory and behave exactly as if the author had declared `["item", "<ref>"]` on that place — they persist until picked up.

---

**`clears states` and item state**

`clears states` wipes the entire `player.states` map — all event states the player has set. Dropped items are deposited to the ground **before** states are wiped, so the drop completes cleanly. When the player re-picks up a dropped item, it initialises from the event's declared `state` tag (its default), not its pre-death state. This is correct behaviour — a lantern left on the ground resets to `off` (its default) when picked up again.

---

**`clears counters` and resource reset**

`clears counters` wipes the `player.counters` map. When a dropped item is re-picked up, its counters re-initialise from the event's `counter` tags. A depleted lantern battery resets to full on re-pickup after a death that clears counters — generous but prevents counters from making the world unwinnable. Authors who want counters to persist across death should not include `clears counters` on the consequence.

---

**Execution order**

When a consequence fires, its tags execute in this fixed order regardless of tag declaration order:

0. **Pre-flight** — `requires` / `requires-not` evaluated; if any fail, execution halts silently
1. **Transition** — `transition-effect` / `transition-duration` / `transition-clear` emitted (fires before content so the effect plays over what follows)
2. `give-item` — add items to inventory
3. `consume-item` — remove items from inventory
4. `deal-damage` — reduce player health
5. `set-counter` — set named counter(s) to specific value(s)
6. `set-state` — transition event states (self or external)
7. **Drop inventory to current place** — if `clears inventory` is present
8. `clears inventory` — empty player inventory array
9. `clears states` — wipe states map
10. `clears counters` — wipe counters map
11. `clears` other keys — in declaration order
12. `respawn` — move player to declared place (always last)

Pre-flight first, transition next, drop before clear, respawn last. The engine uses `currentPlace` at consequence dispatch time for the drop location — this is always known.

---

**Referencing a consequence:**

```json
// From a lethal portal (fired when requires fails)
["consequence", "30078:<pubkey>:the-lake:consequence:death"]

// From an NPC encountering the player in the same place
["on-encounter", "player", "consequence", "30078:<pubkey>:the-lake:consequence:death"]

// From on-interact dispatcher
["on-interact", "touch", "", "consequence", "30078:<pubkey>:the-lake:consequence:cursed"]

// Room entry triggers a consequence
["on-enter", "", "", "consequence", "30078:<pubkey>:the-lake:consequence:victory"]
```

A lethal portal fires its consequence on traversal attempt when `requires` conditions are not met:

```json
{
  "kind": 30078,
  "tags": [
    ["d",           "the-lake:portal:chasm-crossing"],
    ["t",           "the-lake"],
    ["type",        "portal"],
    ["exit", "30078:<pubkey>:the-lake:place:east-of-chasm", "west", "A narrow ledge crosses the chasm."],
    ["exit", "30078:<pubkey>:the-lake:place:west-of-chasm", "east", "A narrow ledge crosses the chasm."],
    ["requires", "30078:<pubkey>:the-lake:place:east-of-chasm", "bridged", "The ledge crumbles beneath you."],
    ["consequence", "30078:<pubkey>:the-lake:consequence:fell-into-chasm"]
  ],
  "content": ""
}
```

If `requires` passes — player crosses. If it fails — consequence fires instead of blocking. This replaces the old `lethal` flag idea with something more expressive: the portal author decides exactly what happens on a failed crossing.

---

### 2.12 Combat

Combat is not a separate system — it is the `on-*` dispatcher applied to health values. The schema provides the data; the client resolves the round sequence. Different games define different combat feels purely through tag values.

**Combat tags on NPCs:**

| Tag | Value | Meaning |
|-----|-------|---------|
| `health` | Integer string | NPC hit points |
| `damage` | Integer string | Damage dealt per hit |
| `hit-chance` | Float string `0.0–1.0` | Probability of hitting (optional, default `1.0`) |

**Combat tags on items (weapons):**

| Tag | Value | Meaning |
|-----|-------|---------|
| `damage` | Integer string | Damage dealt when used to attack |
| `hit-chance` | Float string `0.0–1.0` | Probability of hitting (optional, default `1.0`) |

**Player health** is tracked in local player state:
- `health` — current hit points
- `max-health` — ceiling (set by the world, default client-defined)

**Combat round sequence (client responsibility):**
1. Player issues `attack` verb → fires `deal-damage-npc` on target NPC
2. If NPC health > 0, NPC `on-attacked` fires → `deal-damage` on player
3. Check all `on-health` tags on NPC — fire any whose threshold is crossed (direction-aware)
4. Check all `on-player-health` tags — fire any whose threshold is crossed

---

**`on-attacked` — shape and target**

`on-attacked` follows the standard `on-*` shape — the trigger-target is the item used to attack (or `""` for any), and an optional external event `a`-tag is the action target:

```json
["on-attacked", "<item-ref-or-blank>", "<action-type>", "<action-arg?>", "<external-target?>"]
```

| trigger-target | Meaning |
|---------------|---------|
| `""` | Fires on any attack |
| `"30078:...:item:silver-sword"` | Fires only when attacked with that specific item |

The external target (final element) applies the action to another event — same convention as other `on-*` tags:

```json
// Counter-attack player — any weapon
["on-attacked", "", "deal-damage", "3"],

// Alert a guard NPC — any weapon
["on-attacked", "", "set-state", "alerted", "30078:<PUBKEY>:the-lake:npc:captain"],

// Decrement shield durability — any weapon
["on-attacked", "", "decrement", "durability", "30078:<PUBKEY>:the-lake:item:shield"],

// Extra damage from silver — weapon-specific
["on-attacked", "30078:<PUBKEY>:the-lake:item:silver-sword", "deal-damage", "6"],

// Weapon-specific reaction delegates to consequence
["on-attacked", "30078:<PUBKEY>:the-lake:item:silver-sword", "consequence", "30078:<PUBKEY>:the-lake:consequence:silver-weakness"]
```

---

**When to use inline actions vs consequences**

Inline actions are for simple, single-effect reactions. Consequences are for complex or reusable reactions.

| Use inline when | Use consequence when |
|----------------|---------------------|
| One action fires | Multiple actions fire together |
| Effect is unique to this trigger | Same effect fires from multiple triggers |
| Action is self-contained | Actions target multiple external events |
| Simple state change or damage | Narrative text + state + damage + sound all together |

```json
// Inline — simple counter-attack, one action
["on-attacked", "", "deal-damage", "3"],

// Consequence — silver weakness: extra damage + state change + clue revealed
["on-attacked", "30078:<PUBKEY>:the-lake:item:silver-sword",
  "consequence", "30078:<PUBKEY>:the-lake:consequence:silver-weakness"]
```

```json
// consequence:silver-weakness — bundles several effects cleanly
{
  "kind": 30078, "tags": [
    ["d",           "the-lake:consequence:silver-weakness"],
    ["type",        "consequence"],
    ["deal-damage", "8"],
    ["set-state",   "burning",   "30078:<PUBKEY>:the-lake:npc:werewolf"],
    ["set-state",   "visible",   "30078:<PUBKEY>:the-lake:clue:silver-secret"]
  ],
  "content": "The silver burns. The creature recoils."
}
```

The consequence also becomes reusable — a silver room, a silver trap, and a silver weapon can all reference the same `silver-weakness` consequence. Authors should resist creating a consequence for every single action — inline is almost always right for one-action reactions.

---

**A complete Zork-style troll:**

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",             "the-lake:npc:troll"],
    ["t",             "the-lake"],
    ["type",          "npc"],
    ["title",         "Troll"],
    ["health",        "6"],
    ["damage",        "3"],
    ["on-encounter",  "player", "deal-damage",  "3"],
    ["on-attacked",   "",       "deal-damage",  "3"],
    ["on-health", "down", "0",  "consequence",  "30078:<pubkey>:the-lake:consequence:troll-dies"]
  ],
  "content": "A nasty troll brandishing a bloody axe."
}
```

**A werewolf — resistant to normal weapons, vulnerable to silver:**

```json
{
  "kind": 30078,
  "tags": [
    ["d",            "the-lake:npc:werewolf"],
    ["t",            "the-lake"],
    ["type",         "npc"],
    ["title",        "Werewolf"],
    ["health",       "12"],
    ["damage",       "5"],
    ["on-attacked",  "",                                        "deal-damage", "1"],
    ["on-attacked",  "30078:<PUBKEY>:the-lake:item:silver-sword", "consequence", "30078:<PUBKEY>:the-lake:consequence:silver-weakness"],
    ["on-health", "down", "0", "consequence", "30078:<PUBKEY>:the-lake:consequence:werewolf-dies"]
  ],
  "content": "A massive wolf-shaped creature. Your sword barely scratches it."
}
```

**A weapon:**

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",           "the-lake:item:elvish-sword"],
    ["t",           "the-lake"],
    ["type",        "item"],
    ["title",       "Elvish Sword"],
    ["damage",      "4"],
    ["hit-chance",  "0.8"],
    ["on-interact", "attack", "", "deal-damage-npc", ""]
  ],
  "content": "A blade of elvish steel, glowing faintly blue."
}
```

`deal-damage-npc` with an empty target hits the NPC in the current place. In multi-NPC rooms the client resolves targeting by last referenced NPC or prompts the player.

**Varying combat systems through data:**

| System | Tags |
|--------|------|
| Zork-simple | Fixed `damage`, `hit-chance: 1.0`, low NPC `health` |
| D&D-lite | `hit-chance: 0.65`, higher `health`, multiple weapon tiers |
| One-hit | NPC `health: 1`, weapon `damage: 1` — have the right sword or don't |
| Pacifist | No `health` or `damage` tags — combat simply doesn't exist |
| Souls-like | High NPC `health`/`damage`, low player `max-health`, specific weapon `requires` |

**A healing item:**

```json
{
  "kind": 30078,
  "tags": [
    ["d",           "the-lake:item:healing-potion"],
    ["t",           "the-lake"],
    ["type",        "item"],
    ["title",       "Healing Potion"],
    ["verb", "drink"],
    ["on-interact", "drink", "", "heal",         "6"],
    ["on-interact", "drink", "", "consume-item", ""]
  ],
  "content": "A small vial of healing potion."
}}
```

**Counters and consumable resources:**

Any item, feature, or NPC can carry a named counter — a numeric value tracked in player state that ticks under defined conditions. This handles lantern battery life, torch fuel, NPC patience, charged altars, and any other resource that depletes over time.

```json
{
  "kind": 30078,
  "tags": [
    ["d",               "the-lake:item:brass-lantern"],
    ["t",               "the-lake"],
    ["type",            "item"],
    ["title",           "Brass Lantern"],
    ["state",           "off"],
    ["counter",         "battery", "300"],
    ["transition",      "off",  "on",   "The lantern flickers to life."],
    ["transition",      "on",   "off",  "Darkness closes in."],
    ["transition",      "on",   "dead", "The lantern slowly fades out and darkness looms."],
    ["transition",      "dead", "dead", "The lantern is dead. Nothing happens."],
    ["on-interact",     "turn on",  "", "set-state",   "on"],
    ["on-interact",     "turn off", "", "set-state",   "off"],
    ["on-move",         "on",       "decrement",   "battery"],
    ["on-counter", "down", "battery", "0",  "set-state",   "dead"],
    ["on-counter", "down", "battery", "0",  "consequence", "30078:<pubkey>:the-lake:consequence:lamp-dies"]
  ],
  "content": "A battery-powered brass lantern."
}}
```

The `transition` table enforces legal state changes — the client blocks any `set-state` not listed. `["transition", "dead", "dead", "..."]` is a terminal state declaration. The optional fourth element is **transition text**, rendered to the player when the transition fires. It applies universally to items, features, and NPCs — a door groaning open, a troll staggering, an altar going dark.

---

### 2.13 Scenario Events (Dev Only)

Scenarios are **dev-only test fixtures** for large worlds. They let an author jump directly into a specific game state — room, quest states, inventory, counters — without replaying the whole world. They are **never published to NOSTR relays** and exist only in `localStorage` under the key `folklore:scenarios:<worldSlug>`.

Scenarios are imported via the Drafts panel ("Import Scenarios" button) and applied via the Scenarios panel in the event graph (genesis/collaborator pubkeys only, or fully-draft worlds).

**Tag shape:**

```
["d",           "<worldslug>:scenario:<id>"]
["t",           "<worldslug>"]
["type",        "scenario"]
["title",       "Act 2 — After Job 3b"]
["place",       "30078:<pk>:<worldslug>:place:<id>"]
["set-state",   "30078:<pk>:<worldslug>:quest:<id>", "complete"]
["set-state",   "30078:<pk>:<worldslug>:quest:<id>", "active"]
["give-item",   "30078:<pk>:<worldslug>:item:<id>"]
["set-counter", "<counter-name>", "<value>"]
["chain",       "<worldslug>:scenario:<base-id>"]
```

| Tag | Description |
|-----|-------------|
| `d` | Unique identifier: `<worldslug>:scenario:<id>` |
| `t` | World slug (for grouping) |
| `type` | Must be `scenario` |
| `title` | Human-readable name shown in the scenarios panel |
| `place` | Start room (a-tag ref: `30078:<pk>:<worldslug>:place:<id>`) |
| `set-state` | Set entity state (same shape as the action tag) |
| `give-item` | Add item to inventory (same shape as the action tag) |
| `set-counter` | Set a world-scoped counter (same shape as the action tag) |
| `chain` | Inherit from a base scenario d-tag; base applied first, current overrides |

Content field: plain text description of what game state this scenario represents.

**Chaining:** A `chain` tag causes the client to resolve the base scenario first (depth-limited to 5), then apply the current scenario's tags as overrides. `set-state` and `set-counter` use last-write-wins per key; `give-item` uses union; `place` uses current over base.

**Applying a scenario** writes the resolved player state to `localStorage` under the world slug key, then reloads the page. NPC state is not set — NPCs start in their default states.

**File format** (`<worldslug>-scenarios.json`):

```json
[
  {
    "tags": [
      ["d", "metropolitan:scenario:act2-start"],
      ["t", "metropolitan"],
      ["type", "scenario"],
      ["title", "Act 2 — After Job 3b"],
      ["place", "30078:<pk>:metropolitan:place:safehouse"],
      ["set-state", "30078:<pk>:metropolitan:quest:job3b", "complete"],
      ["give-item", "30078:<pk>:metropolitan:item:burner-phone"]
    ],
    "content": "Player has completed Job 3b, received the burner phone, and is at the safehouse."
  }
]
```

---

## 3. Cryptographic Puzzle Mechanics

The central innovation: puzzle gates are not simulated — they use actual cryptography. A locked event cannot be read without the key, regardless of relay access.

---

### 3.1 NIP-44 Encrypted Places / Clues

A sealed place or clue has its `content` encrypted via NIP-44 and declares `content-type: application/nip44`. The `state` is set to `sealed`. The `puzzle` tag declares which puzzle's answer is the decryption key — the publishing tool uses this to encrypt before signing.

```json
{
  "kind": 30078, "tags": [
    ["d",            "the-lake:place:sanctum"],
    ["t",            "the-lake"],
    ["type",         "place"],
    ["title",        "The Sanctum"],
    ["state",        "sealed"],
    ["content-type", "application/nip44", "text/markdown"],
    ["puzzle",         "the-lake:puzzle:serpent-mechanism"]
  ],
  "content": "<NIP-44 ciphertext>"
}
```

The client detects `content-type: application/nip44`, attempts decryption using the key derived from the solved puzzle's answer, and renders the decrypted content on success.

**Note on the `puzzle` tag at runtime:** the `puzzle` tag on a sealed place is used by the publishing tool to know which answer to use for encryption. It is not read by the client engine at runtime — riddle puzzles are activated via feature `on-interact` → `set-state` targeting the puzzle event, not by the place's `puzzle` tag. On failure the place description is withheld — the player knows they're missing something.

When the sealed content is not plain text, declare the plaintext format with a `content-type third element` tag:

```json
["content-type", "application/nip44", "text/markdown"],
["puzzle",         "the-lake:puzzle:serpent-mechanism"]
```

`content-type third element` tells the client how to render the decrypted content. If absent, `text/plain` is assumed. The publishing tool uses it to validate the plaintext before encrypting.

**What this means in practice:**
- The place event exists on relays and is publicly visible
- Its `content` is ciphertext — unreadable without the puzzle answer
- No amount of relay scraping helps. The answer must be earned in-game.

---

### 3.1.1 World Event File Format (for LLM authorship)

When an LLM authors a world, it cannot perform NIP-44 encryption — this requires a keypair the author generates outside the LLM session. Instead, the LLM outputs a structured JSON file with two top-level keys:

```json
{
  "answers": {
    "the-lake:puzzle:serpent-mechanism": "the answer the player must find"
  },
  "events": [
    {
      "kind": 30078,
      "tags": [
        ["d",            "the-lake:place:sanctum"],
        ["content-type", "application/nip44"],
        ["puzzle",       "the-lake:puzzle:serpent-mechanism"]
      ],
      "content": "The plaintext win prose goes here — the publishing tool will encrypt this."
    }
  ]
}
```

The publishing tool processes the file before signing:
1. For each event with `content-type: application/nip44` and a `puzzle` tag
2. Look up the answer from the `answers` map using the puzzle d-tag
3. Derive the NIP-44 key from the answer
4. Encrypt the `content` field with that key
5. Replace `content` with ciphertext
6. Strip the `answers` object entirely — it never reaches the relay
7. Sign and publish

The `answers` map also drives `answer-hash` computation. The LLM outputs the plaintext answer; the publishing tool computes `SHA256(answer + salt)` and verifies it matches the puzzle event's `answer-hash` before encrypting.

**For LLM authors:** always output the `answers` map alongside your events. The `content` of NIP-44 sealed events should be the plaintext prose — clearly readable, clearly intended for encryption. The publishing tool handles the rest.

---

### 3.2 Hash Preimage Puzzles

Used for riddles, codes, and observed secrets. The answer is never stored.

```
answer-hash = SHA256(player_answer + salt)
```

The client hashes the player's input with the known salt and compares to `answer-hash`. Match = solved. The event never contains the answer in any form.

**Salt design:** Use a deterministic, human-readable salt tied to the puzzle identity (e.g. `the-lake:puzzle:serpent-riddle:v1`). This prevents rainbow table attacks across puzzles while remaining reproducible.

---

### 3.3 Derived Key Puzzles

More advanced: the key to decrypt a location is not found directly but *derived* from combining information scattered across the world.

```
key = SHA256(fragment_1 + fragment_2 + fragment_3)
```

Each fragment is a clue found in a different location. No single fragment is useful. Players must explore, collect, and combine information to reconstruct the key. The derived key unlocks a NIP-44 encrypted event.

This enables multi-stage quests with no server coordination required.

---

### 3.4 Schnorr Signature Gating

For "possession proof" mechanics. A key item in the game world is a real NOSTR keypair (pubkey embedded in the item event, private key revealed on acquisition).

To pass a gate, the player signs a challenge string with that keypair. The gate event contains the expected pubkey. The client verifies locally.

```
gate requires: sign("open:the-lake:portal:sanctum-gate") with <key_pubkey>
```

Nobody can fake possession without the private key.

---

## 4. Player State & Inventory

Player state is personal and instanced. No two players share progression state. The world map is shared; what you've done in it is yours alone.

---

### 4.1 Storage Architecture

All state stored under the world slug as the localStorage key. Player, NPCs, and places are flat siblings:

```json
{
  "player": {
    "place":           "the-lake:place:cave-network",
    "inventory":       ["the-lake:item:brass-lantern"],
    "states":          {
      "the-lake:item:brass-lantern":     "on",
      "the-lake:feature:altar":          "watered",
      "the-lake:portal:chapel-to-crypt": "visible",
      "the-lake:puzzle:chapel-riddle":   "solved"
    },
    "counters":        { "the-lake:item:brass-lantern:battery": 147 },
    "cryptoKeys":      [],
    "dialogueVisited": { "the-lake:dialogue:hermit:cave": "visited" },
    "paymentAttempts": {},
    "visited":         ["the-lake:place:clearing"],
    "portalsUsed":     ["the-lake:portal:clearing-to-cave"],
    "moveCount":       8
  },
  "the-lake:npc:collector": {
    "state":     null,
    "inventory": ["the-lake:item:iron-key"],
    "health":    null
  },
  "the-lake:place:flooded-passage": {
    "inventory": ["the-lake:item:iron-key"]
  }
}
```

**Key rules:**

- **Flat siblings** — `player`, NPCs, and places are siblings at the top level. No nesting.
- **`player.states`** — flat map, d-tag → state string. All event states the player has affected: items, features, portals, puzzles. Type-agnostic — consistent with how `requires` evaluates.
- **`player.counters`** — flat map, `d-tag:counterName` → integer. All counters across all event types.
- **`player.moveCount`** — incremented on every navigation. Drives deterministic NPC position calculation.
- **NPC `state`** — `null` until first encounter or state change. Client reads NPC event's `state` tag as default when `null`. First-class property, not nested in a map.
- **Place inventories** — seeded from place event `item` tags on first visit (tracked via `player.visited`). After seeding, the array is the source of truth.
- **Every item lives in exactly one inventory** — player, NPC, or place. No duplication, no negative checks. Items move between inventories on pickup, drop, steal, deposit.
- **camelCase** throughout: `cryptoKeys`, `dialogueVisited`, `paymentAttempts`, `moveCount`.

---

### 4.2 What Player State Covers

- **`player.place`** — current place d-tag. Restored on reload — player resumes where they left off.
- **`player.inventory`** — list of item d-tag references currently carried
- **`player.states`** — unified state map for all event types (items, features, portals, puzzles)
- **`player.counters`** — all counter values across all event types
- **`player.cryptoKeys`** — private keys discovered or derived through play (unlock NIP-44 sealed events)
- **`player.dialogueVisited`** — dialogue nodes visited, for entry point evaluation
- **`player.paymentAttempts`** — payment hashes and status for recovery on reload
- **`player.visited`** — place d-tags visited, for place inventory seeding and map rendering
- **`player.portalsUsed`** — portal refs traversed (array of strings). Written on every directional move and `traverse` action. Idempotent — each ref recorded once regardless of how many times the portal is used. Map overlay derives edge endpoints from the portal's `exit` tags at render time.
- **`player.moveCount`** — total moves taken, for NPC position calculation

---

### 4.3 Local State (Primary)

Player state lives on the client device. No relay writes required for normal play.

**Pros:** Private, fast, zero relay dependency, no contention with other players.  
**Cons:** Not portable across devices without export; lost if cleared.

---

### 4.4 NOSTR-Signed Backup (Optional)

Player publishes encrypted state events to relays for portability. Content is NIP-44 encrypted to the player's own pubkey — only they can read it.

```json
{
  "kind": 30078,
  "pubkey": "<player_pubkey>",
  "tags": [
    ["d", "the-lake:player-state:<player_pubkey>"],
    ["t", "the-lake"],
    ["type", "player-state"]
  ],
  "content": "<NIP-44 encrypted state blob>"
}
```

The client publishes this periodically as a checkpoint. On a new device, the player loads their keypair and the client fetches + decrypts their state.

**Recommendation:** Local state as primary, signed backup as opt-in sync mechanism.

---

### 4.5 Inventory & Non-Scarcity

Items are non-scarce by design. Multiple players can hold the same item simultaneously. This is intentional — the item is not the gate, the cryptographic condition is.

The iron key in your inventory does nothing on its own. The chest requires the *private key* that decrypts its NIP-44 sealed content. That private key must be earned through play. Holding the item is flavour; satisfying the crypto condition is progression.

---

## 5. World State Model

**Resolved.** The world uses a hybrid model across three distinct layers. Each layer uses the right tool for the job — none of them fight NOSTR's nature.

---

### 5.1 The Three Layers

| Layer | What it covers | Storage | Mutability |
|-------|---------------|---------|------------|
| **Map** | Rooms, portals, placed items | NOSTR events | Additive + replaceable by author |
| **Personal** | Puzzles solved, gates unlocked, inventory | Local client + optional signed backup | Player-owned, private |
| **World events** | Crypto key publications, major unlocks | NOSTR events (immutable) | Write-once, global, irreversible |

---

### 5.2 Map Layer — Shared and Living

The map is the one truly shared layer. Rooms and portals are NOSTR events — additive by nature. Nobody mutates existing events; they publish new ones. Portal contests, new places, new connections — all expressed as new events. The map evolves without any consensus mechanism.

A player-builder who notices an unconnected exit slot (`exit:north` with no portal) can publish a new place and a portal to connect it. That change is immediately visible to all players. The world grows.

A disconnected exit slot is rendered as a hint to builders: *"there is a crack in the northern wall, just wide enough to suggest a passage — but it leads nowhere yet."*

---

### 5.3 Personal Layer — Instanced Per Player

Puzzle solves, gate states, and inventory are **per-player, not global**. The iron gate is open *for you* because *you* solved the puzzle. Someone else must earn it themselves.

This means:
- No consensus needed for progression state
- No player can block another by "taking" a solve
- Items are non-scarce — anyone can pick up the iron key
- The lock doesn't care who holds the item, only whether the crypto condition is satisfied

**Item non-scarcity is intentional.** Possession is bookkeeping. Access is cryptographic.

---

### 5.4 World Events Layer — Irreversible Global State

For high-stakes moments — a major puzzle solved for the first time, a sealed region opened, a world-changing discovery — the state change is expressed by **publishing a decryption key** as a NOSTR event.

```json
{
  "kind": 1,
  "pubkey": "<puzzle_author_pubkey>",
  "tags": [
    ["t",       "the-lake"],
    ["reveals", "30078:<pubkey>:the-lake:portal:ancient-seal"]
  ],
  "content": "<decryption_key_or_derived_secret>"
}
```

Once published, the key is public. The sealed region is open for everyone. This is irreversible — the event is immutable. These are designed to be rare, dramatic world events. The first player to crack a deep puzzle doesn't just solve it for themselves — they change the world.

---

### 5.5 The Scarcity Principle

> Scarcity is about *knowledge and access*, not possession.

Anyone can pick up the iron key. But picking it up means nothing on its own. The chest is locked because its content is NIP-44 encrypted to a specific public key. The corresponding private key must be *earned* — found by solving puzzles, decrypting clues, navigating the world. The cryptographic depth *is* the barrier.

This dissolves the hard distributed-state problem for items entirely. No consensus, no first-claim races, no cheating via relay reads. The relay can be read in full — it doesn't help without the key.

---

## 6. Trust, Collaboration & Security

A fully permissionless world is philosophically pure but practically unnavigable — and potentially unsafe. The trust model must be light enough to enable genuine collaboration while preventing malicious injection.

---

### 6.1 The World Event

Every world has a single root event authored by the genesis keypair. It is the world's **manifest** — everything a client needs before loading a single place. The author's signature is proof of genesis — no separate `genesis` tag needed.

The world event is a replaceable event (`kind: 30078`). The genesis author can update the title, collaborators, theme, relay hints, or any other field at any time by republishing.

```json
{
  "kind": 30078,
  "pubkey": "<genesis-pubkey>",
  "tags": [
    ["d",             "the-lake:world"],
    ["t",             "the-lake"],
    ["w",             "folklore"],   // indexed tag — enables relay discovery
    ["type",          "world"],

    // Identity
    ["title",         "The Lake"],
    ["author",        "Ross"],
    ["version",       "1.0.0"],
    ["lang",          "en"],
    ["voice",         "atmospheric, second person, short sentences"],
    ["tag",           "mystery"],
    ["tag",           "ancient"],
    ["tag",           "exploration"],
    ["cw",            "mild-peril"],   // optional content warnings

    // Bootstrap
    ["start",         "30078:<genesis-pubkey>:the-lake:place:clearing"],
    ["relay",         "wss://relay.damus.io"],
    ["relay",         "wss://nos.lol"],

    // Collaboration
    ["collaboration", "vouched"],
    ["collaborator",  "<Bob's pubkey>"],
    ["collaborator",  "<Carol's pubkey>"],

    // Aesthetic
    ["theme",   "terminal-green"],
    ["colour",  "bg",        "#000000"],
    ["colour",  "text",      "#00ff41"],
    ["colour",  "title",     "#a7f3d0"],
    ["colour",  "dim",       "#16a34a"],
    ["colour",  "highlight", "#ffffff"],
    ["colour",  "error",     "#f87171"],
    ["colour",  "item",      "#facc15"],
    ["colour",  "npc",       "#fbbf24"],
    ["colour",  "clue",      "#22d3ee"],
    ["colour",  "puzzle",    "#c084fc"],
    ["colour",  "exits",     "#16a34a"],
    ["font",    "ibm-plex-mono"],
    ["cursor",  "block"],
    ["effects", "crt"],        // optional — defaults from theme if absent

    // Sound
    ["bpm",   "72"],
    ["sound", "30078:<genesis-pubkey>:the-lake:sound:surface-drone", "ambient", "0.7"],

    // Cover media
    ["content-type",  "text/markdown"],
    ["media",         "text/plain", "    ~  ~  ~\n  ~ THE  ~\n  ~ LAKE ~\n    ~  ~  ~"]
  ],
  "content": "An ancient lake, hidden underground. Something sleeps beneath it.\n\nThe world above has forgotten it exists. You haven't."
}
```

**Tag reference:**

| Tag | Value | Purpose |
|-----|-------|---------|
| `w` | `"folklore"` | Protocol identifier — always this exact lowercase value. Single-letter indexed tag enabling relay discovery: `{ kinds: [30078], '#w': ['folklore'] }`. Only on world events. |
| `title` | String | Display name |
| `author` | String | World author display name |
| `version` | Semver string | World version |
| `lang` | BCP-47 code | Language (`en`, `es`, `fr`) |
| `tag` | String | Genre/discovery tags — multiple allowed |
| `cw` | String | Content warning — multiple allowed. Client displays before loading. |
| `start` | Place `a`-tag | Genesis place — where players begin |
| `inventory` | Item `a`-tag | Starting inventory item — multiple allowed. Given to player on new game, not on reload. |
| `relay` | WSS URL | Recommended relay for this world — multiple allowed |
| `collaboration` | `closed` \| `vouched` \| `open` | Collaboration mode |
| `collaborator` | Pubkey hex | Trusted collaborator — multiple allowed |
| `theme` | Theme string | Named preset — provides all colour defaults. `colour` tags override individual slots. |
| `colour` | Slot + hex | Override a specific colour slot — multiple allowed |
| `font` | Font string | Preferred font — named option or CSS font-family string |
| `cursor` | `block` \| `underline` \| `beam` | Cursor style |
| `effects` | Bundle string | Visual effect bundle. Default determined by `theme` if absent. |
| `scanlines` | 0.0–1.0 | Override scanline intensity (0 = off, 1 = heavy) |
| `glow` | 0.0–1.0 | Override phosphor glow intensity |
| `flicker` | `on` \| `off` | Override screen flicker |
| `vignette` | 0.0–1.0 | Override edge vignette intensity |
| `noise` | 0.0–1.0 | Grain/static overlay — adds texture without full CRT feel |
| `bpm` | Integer string | Global tempo in BPM. Default 120. Place overrides world. |
| `samples` | Preset name or URL | Opt into a sample library — see sound section. |
| `sound` | Sound `a`-tag + role + volume + state | Play a `type: sound` event — see sound scoring section |
| `content-type` | MIME type | Format of `content` field |
| `media` | Type + value | Cover art or world image |

**Colour slots:**

| Slot | Semantic role |
|------|--------------|
| `bg` | Background |
| `text` | Primary text |
| `title` | Place titles, headings |
| `dim` | Secondary/muted text — exits, descriptions |
| `highlight` | Hover, focus, selection |
| `error` | Error messages |
| `item` | Item names and interactions |
| `npc` | NPC names and dialogue |
| `clue` | Clue text |
| `puzzle` | Puzzle prompts |
| `exits` | Exit slot labels |

**Built-in theme presets:**

| Theme | Feel | bg | text | Default effects |
|-------|------|----|------|-----------------|
| `terminal-green` | Classic CRT | `#000000` | `#00ff41` | `crt` |
| `void-blue` | Sci-fi cold | `#000814` | `#00b4d8` | `crt` |
| `blood-red` | Horror | `#0a0000` | `#ff2020` | `static` |
| `parchment` | Ancient manuscript | `#f5e6c8` | `#3d2b1f` | `typewriter` |
| `monochrome` | Clean minimal | `#111111` | `#eeeeee` | `clean` |
| `custom` | No defaults — all `colour` tags required | — | — | `clean` |

Each preset defines a full colour map. `colour` tags override individual slots. Use `theme: custom` with all `colour` tags for total control.

**Font options:**

| Value | Description |
|-------|-------------|
| `ibm-plex-mono` | Current default — clean technical monospace |
| `courier` | Classic typewriter feel |
| `pixel` | 8-bit pixel font (Pixelify Sans) |
| `arcade` | Arcade bitmap font (Silkscreen) |
| `serif` | Parchment/manuscript feel |
| Any CSS `font-family` string | Custom font — client applies directly |

**Effect bundles:**

| Bundle | Effects active | Suits |
|--------|---------------|-------|
| `crt` | scanlines + glow + flicker + vignette | `terminal-green`, `void-blue` |
| `static` | scanlines + glow + flicker + vignette + noise | `blood-red`, horror/glitch worlds |
| `typewriter` | vignette only | `parchment` |
| `clean` | no effects | `monochrome`, `custom`, museum/gallery use cases |
| `none` | alias for `clean` | |

The `effects` tag selects a bundle. Individual tags override specific effects within the bundle:

```json
["effects",   "crt"],      // bundle — all four CRT effects
["flicker",   "off"],      // override — disable flicker
["glow",      "0.3"],      // override — reduce glow intensity
["vignette",  "0.8"]       // override — strong vignette
```

If `effects` is absent, the bundle defaults from the active `theme` preset (see preset table above). Individual effect tags without an `effects` tag override the preset's default bundle.

Intensity values (0.0–1.0) give fine control where it matters — `glow` and `vignette` benefit from gradation. `scanlines` and `flicker` are effectively boolean (`on`/`off`). `noise` adds grain/static for texture without the full CRT aesthetic — useful for horror, aged documents, or abstract worlds.

---

**Sound scoring:**

Sound in FOAKLOAR uses two primitives — `type: sound` events define named sound recipes, and `sound` tags on any event play them. The engine is Strudel (TidalCycles-style) synthesised client-side via WebAudio. No audio files required — built-in oscillators (`sine`, `triangle`, `sawtooth`, `square`) and `noise` work instantly. External samples can be loaded via the `sample` tag.

---

### `type: sound` — sound definition event

A named, reusable sound recipe. Declared as a FOAKLOAR event with a `d`-tag for world-scoped uniqueness. Tags are applied in declaration order to build the Strudel chain. `note` or `noise` should come first — they establish the source pattern everything else modifies. All numeric tag values support Strudel mini-notation (e.g. `"600 250"` alternates between values each cycle).

```json
{
  "kind": 30078,
  "tags": [
    ["d",          "the-lake:sound:cave-drone"],
    ["t",          "the-lake"],
    ["type",       "sound"],
    ["note",       "c2 ~ ~ ~"],
    ["s",          "sawtooth"],
    ["lpf",        "200"],
    ["slow",       "4"],
    ["gain",       "0.4"]
  ],
  "content": ""
}
```

**Source tags:**

| Tag | Values | Strudel | Effect |
|-----|--------|---------|--------|
| `note` | Mini-notation string | `note("...")` | Pitch sequence. Always first when using oscillators. |
| `s` | `sine` `triangle` `sawtooth` `square` (or sample names) | `.s("...")` | Sound source. `sine` = smooth, `triangle` = warm, `sawtooth` = buzzy, `square` = hollow/retro. With sample libraries loaded, also accepts sample names like `piano`, `bd`, `sd`. |
| `oscillator` | *(alias for `s`)* | `.s("...")` | Legacy alias — use `s` for new content. |
| `noise` | *(no value)* | `s("noise")` | White noise source. Base for wind, rain, fire, static. Use with filters. |

**Volume & timing:**

| Tag | Values | Strudel | Effect |
|-----|--------|---------|--------|
| `gain` | 0.0–1.0 | `.gain(n)` | Base volume baked into the definition. Multiplies with play tag volume — see below. |
| `slow` | float > 1 | `.slow(n)` | Stretch cycle — slower playback. Relative to global BPM. |
| `fast` | float > 1 | `.fast(n)` | Compress cycle — faster playback. Relative to global BPM. |
| `pan` | -1.0–1.0 | `.pan(n)` | Stereo position. -1 = left, 0 = centre, 1 = right. |

**ADSR envelope:**

| Tag | Values | Strudel | Effect |
|-----|--------|---------|--------|
| `attack` | Seconds e.g. `0.1` | `.attack(n)` | Fade-in time. `0` = instant, higher = gradual swell. |
| `decay` | Seconds e.g. `0.1` | `.decay(n)` | Time from peak to sustain level. |
| `sustain` | Seconds e.g. `2` | `.sustain(n)` | How long each note sounds. Longer = droning. Shorter = responsive to state changes — the sound cuts off quickly when a state gate deactivates it. |
| `release` | Seconds e.g. `0.1` | `.release(n)` | Fade-out after note ends. `0` = hard cut, higher = natural decay. |

**Filters:**

| Tag | Values | Strudel | Effect |
|-----|--------|---------|--------|
| `lpf` | Hz: `200`–`20000` | `.lpf(n)` | Low-pass — removes highs. Lower = warmer, muffled. Drones, underwater. |
| `hpf` | Hz: `200`–`20000` | `.hpf(n)` | High-pass — removes lows. Higher = thinner, airy. Shimmer, radio. |
| `bpf` | Hz | `.bpf(n)` | Bandpass — isolates a frequency band. |
| `lpq` / `hpq` / `bpq` | 0–50 | `.lpq(n)` | Filter resonance. Boosts frequencies near cutoff. |
| `ftype` | `12db` `ladder` `24db` | `.ftype(s)` | Filter circuit type. |
| `vowel` | `a` `e` `i` `o` `u` or pattern | `.vowel("a e i o")` | Formant filter — vocal vowel shaping. Pattern cycles through shapes. |

**Distortion:**

| Tag | Values | Strudel | Effect |
|-----|--------|---------|--------|
| `crush` | 1–16 (lower = harsher) | `.crush(n)` | Bit crush — retro/digital distortion. 16 = clean, 1 = extreme. |
| `shape` | 0.0–1.0 | `.shape(n)` | Soft saturation — warmth and presence. |
| `distort` | amount | `.distort(n)` | Waveshaping distortion (worklet). |
| `coarse` | factor | `.coarse(n)` | Sample rate reduction — lo-fi texture. |

**Effects:**

| Tag | Values | Strudel | Effect |
|-----|--------|---------|--------|
| `room` | 0.0–1.0 | `.room(n)` | Reverb wet/dry. 0 = dry, 1 = fully wet. |
| `roomsize` | 1–10 | `.roomsize(n)` | Reverb room size. Only meaningful with `room` > 0. |
| `roomfade` / `roomlp` / `roomdim` | varies | — | Reverb fade, lowpass, and damping. |
| `delay` | time 0.0–1.0, feedback 0.0–1.0 | `.delay(t, f)` | Echo. Time = spacing, feedback = repeats. Two values: `["delay", "0.5", "0.3"]` |
| `phaser` | Hz | `.phaser(n)` | Phaser effect (with `phaserdepth`, `phasercenter`, `phasersweep`). |
| `rev` | *(no value)* | `.rev()` | Reverse pattern order within each cycle. |
| `palindrome` | *(no value)* | `.palindrome()` | Forward then backward — mirrored loop. |

**Texture & randomness:**

| Tag | Values | Strudel | Effect |
|-----|--------|---------|--------|
| `degrade-by` | 0.0–1.0 | `.degradeBy(n)` | Random note dropout each cycle. 0.3 = ~30% dropped. Organic, irregular texture. |
| `rand` | min, max | `.gain(rand.range(n,m))` | Random gain per event. Crackle, shimmer, breathing. Two values: `["rand", "0.1", "0.4"]` |

**Stereo & layering:**

| Tag | Values | Strudel | Effect |
|-----|--------|---------|--------|
| `jux` | `rev` | `.jux(rev)` | Normal left, reversed right. Spatial width. |
| `stack` | Comma-separated `a`-tags | `stack(...)` | Layer multiple sound events simultaneously. Client resolves each ref and combines. |

**Pitch manipulation:**

| Tag | Values | Strudel | Effect |
|-----|--------|---------|--------|
| `arp` | `up` `down` `updown` | `.arp("up")` | Arpeggiate chords — play notes in sequence rather than simultaneously. |

**Additional parameter categories:** Filter envelopes (`lpenv`/`hpenv`/`bpenv` + attack/decay/sustain/release per filter), pitch envelopes (`penv` + attack/decay/release/curve/anchor), FM synthesis (`fm`, `fmh`, `fmattack`, `fmdecay`, `fmsustain`, `fmenv`), vibrato (`vib`, `vibmod`), tremolo (`tremolodepth`/`sync`/`skew`/`phase`/`shape`), dynamics (`velocity`, `postgain`, `compressor`), sample manipulation (`n`, `begin`, `end`, `speed`, `cut`, `loop`, `chop`, `striate`, `fit`), and time/pattern transforms (`early`, `late`, `swing`, `iter`, `ply`). See `docs/authoring/tag-reference.md` for the complete tag listing.

---

**`sample` tag — external audio:**

```json
["sample", "<name>", "<url>"]
```

Registers an external audio file (WAV, MP3, OGG) under a short name. Once registered, use the name in `note` patterns: `["note", "crackle*8"]`.

On world load the client collects all `sample` tags, deduplicates by name, and calls Strudel's `samples()` to preload. Sample-based patterns wait until files are fetched — built-in oscillators and `noise` work instantly.

```json
// Campfire — noise sample with organic dropout
{ "tags": [
    ["d",          "the-lake:sound:campfire"],
    ["type",       "sound"],
    ["sample",     "crackle", "https://blossom.example/crackle.wav"],
    ["note",       "crackle*8"],
    ["degrade-by", "0.3"],
    ["lpf",        "800"],
    ["gain",       "0.4"]
]}
```

---

**`samples` tag — world-level sample libraries:**

Declared on the world event to load a sample library on startup. Without it, only built-in oscillators and `noise` are available (plus any `sample` tags on individual sound events).

```json
["samples", "dirt"]                                              // built-in preset — 217 sample banks
["samples", "classic"]                                           // built-in preset — 53 acoustic/orchestral samples
["samples", "github:tidalcycles/Dirt-Samples"]                  // any GitHub repo with strudel.json
["samples", "https://myblossom.example/my-world-samples.json"]  // direct URL to sample index
```

| Value | Resolves to |
|-------|------------|
| `dirt` | `github:tidalcycles/Dirt-Samples` — 217 sample banks: drums, synths, nature, voice, world instruments |
| `classic` | VCSL (CC0) — 53 acoustic/orchestral: recorder, ocarina, sax, harmonica, pipe organ, timpani, bongo |
| `github:user/repo` | Any GitHub-hosted sample pack — must contain a `strudel.json` index at the repo root |
| `https://...` | Direct URL to a Strudel-compatible sample index JSON |

Full sample listings for both presets are in `sample-presets.md`.

Sample libraries load asynchronously on world start. Built-in oscillators and `noise` work instantly. Patterns using samples won't play until files are fetched — design accordingly.

**Custom GitHub sample repos:** any GitHub repository containing a `strudel.json` index file can be loaded as a sample pack. The `strudel.json` maps sample names to audio file paths within the repo. This lets world authors host their own samples on GitHub and reference them directly:

```json
["samples", "github:my-username/my-world-sounds"]
```

---

**Playing a sound — `sound` tag on any event:**

```json
["sound", "<sound-a-tag>", "<role>", "<volume>", "<state?>"]
```

| Element | Values | Meaning |
|---------|--------|---------|
| sound ref | `a`-tag | Which `type: sound` event to play |
| role | `ambient` `layer` `effect` | How it plays |
| volume | 0.0–1.0 | Mix volume at this point of use |
| state | state string | Only play when event is in this state (optional) |

**`gain` × `volume`:** the sound event's `gain` bakes a base level into the definition. The play tag's `volume` controls the mix at point of use. These multiply: `finalVolume = gain × volume`. The same sound event can play at `0.6` near a cave entrance and `0.8` deeper inside.

**Roles:**

| Role | Behaviour |
|------|-----------|
| `ambient` | Continuous loop. One per place. Crossfades on room change. |
| `layer` | Continuous loop added to mix. Multiple layers can play simultaneously. |
| `effect` | One-shot. Fires when event enters scope. Re-fires on re-entry. |

```json
// Place — atmospheric drone
["sound", "30078:<PUBKEY>:the-lake:sound:cave-drone",   "ambient", "0.7"],

// Item — lamp hum only when on
["sound", "30078:<PUBKEY>:the-lake:sound:lamp-hum",     "layer",   "0.3", "on"],

// Puzzle — tension while unsolved
["sound", "30078:<PUBKEY>:the-lake:sound:tension",      "layer",   "0.5", "unsolved"],

// Consequence — death jingle
["sound", "30078:<PUBKEY>:the-lake:sound:death-jingle", "effect",  "1.0"]
```

---

**`sound` as an action type:**

```json
["on-complete", "", "sound", "30078:<PUBKEY>:the-lake:sound:victory-chord", "0.9"],
["on-fail",     "", "sound", "30078:<PUBKEY>:the-lake:sound:wrong-answer",  "0.6"],
["on-interact", "use", "", "sound", "30078:<PUBKEY>:the-lake:sound:mechanism-clunk"],
["on-health",   "down", "0", "sound", "30078:<PUBKEY>:the-lake:sound:death-jingle"]
```

Volume optional — defaults to `1.0`.

---

**Tempo — `bpm` tag:**

```json
["bpm", "90"]   // world event — global default (default: 120)
["bpm", "60"]   // place event — override on entry
```

`bpm` is a standalone tag on world or place events. Individual sound events use `slow`/`fast` for relative tempo adjustment.

---

**Sound events and the `w` tag:** `type: sound` events do not carry the `["w", "folklore"]` discovery tag. They are referenced by `a`-tag from other events — not discovered via relay filtering. Only `type: world` events need the `w` tag.

**Two sound models:**
- `sound` tags on events — passive, scope-driven. Plays while event is relevant.
- `sound` action type — imperative, trigger-driven. One-shot at a specific moment.

**Layering budget:** 3–4 active layers maximum. One `ambient` per place.

Sound is a progressive enhancement. Clients that do not implement the sound system ignore all `sound` tags and `type: sound` events silently. World authors must not require sound for puzzle solving or navigation.

---

**Recipe examples:**

```json
// Wind — noise + filters
["noise", ""], ["lpf", "400"], ["rand", "0.05", "0.2"], ["slow", "4"], ["gain", "0.3"]

// Water drip — oscillator + delay
["note", "e5 ~ ~ g5 ~ ~ a5 ~"], ["s", "sine"], ["fast", "2"], ["delay", "0.3", "0.2"], ["gain", "0.3"]

// Eerie shimmer — stereo reversal
["note", "c4 eb4 g4"], ["s", "sine"], ["jux", "rev"], ["slow", "8"], ["gain", "0.2"]

// Fire crackle — noise + bit crush
["noise", ""], ["lpf", "800"], ["crush", "6"], ["rand", "0.1", "0.4"], ["gain", "0.3"]

// Warm cave drone — filtered sawtooth
["note", "c2 ~ ~ ~"], ["s", "sawtooth"], ["lpf", "200"], ["slow", "4"], ["gain", "0.4"]
```

Content warnings use a `cw` tag with a short string. Clients display these before the world loads — the player can choose not to enter. Common values: `violence`, `horror`, `mild-peril`, `adult`, `flashing-lights`. No enforced vocabulary — world authors choose their own, clients can filter on known values.

The `start` tag removes any ambiguity about where to begin — the client fetches the world event, reads `start`, fetches that place, and begins. The `relay` hints mean the world is self-contained — share the `npub` URL and a client can find everything without prior knowledge of which relays to query.

`inventory` tags declare the player's starting items — given once on new game, not on every session load. This is the world author's character setup: the scribbled note that implies mystery, the worn compass that implies a journey. Items declared here follow all normal inventory rules — they can be consumed, stolen, or lost.

```json
["inventory", "30078:<pubkey>:the-lake:item:scribbled-note"],
["inventory", "30078:<pubkey>:the-lake:item:worn-compass"]
```

The client bootstraps a world by fetching:
```
kind: 30078, author: <genesis-pubkey>, d: <world-slug>:world
```

The genesis pubkey is the source of truth — NOSTR event signatures make it cryptographically unforgeable.

---

### 6.2 World Loading — URL Model

World URLs take the form `/w/<slug>` where the slug optionally includes an 8-character hex pubkey prefix:

```
/w/the-lake               bare slug   — loads oldest world event for that tag (unsafe for sharing)
/w/the-lake-c08d7b5a      pinned slug — filters to the author whose pubkey starts with c08d7b5a
```

The prefix is the first 4 bytes (8 hex chars) of the author's pubkey — enough to prevent accidental collision while keeping URLs short and human-readable. The client generates the pinned form automatically via `history.replaceState` once the world event resolves, so bare slug URLs self-pin on first load.

**Curated worlds** (lobby/landing page) reference full a-tags (`30078:<PUBKEY>:<slug>:world`) and are unaffected by the slug scheme — the pubkey is already baked in.

**Sharing:** Copy the URL from the browser after a world loads — it will already be in pinned form. The pinned URL is safe to share; it will always resolve to the same author's world regardless of relay contents.

---

### 6.2.0 Relay Discovery — `#w` Tag

NOSTR relays only index single-letter tags. Custom tags like `type` are not indexed, making "find all FOAKLOAR worlds on this relay" impossible with a standard query.

World events carry a `["w", "folklore"]` tag — a single-letter indexed tag that enables open discovery:

```javascript
// Find all FOAKLOAR world events on a relay
{ kinds: [30078], '#w': ['folklore'] }
```

Rules:
- **Only world events** carry `["w", "folklore"]`. Content events (places, items, features, NPCs) do not — discovery works from the world event outward via the genesis pubkey.
- **Always lowercase `"folklore"`** — the canonical value. Any other casing is invisible to the standard query.
- `#w` enables open discovery. NIP-51 curated lists (section 6.2.1) layer curation on top.

---

### 6.2.1 World Discovery — NIP-51 Curated Lists

Platforms and curators publish world lists using **NIP-51** (`kind: 30001`) — NOSTR's standard list format. A curated worlds list is a replaceable event containing `a`-tags referencing world events:

```json
{
  "kind": 30001,
  "pubkey": "<platform-pubkey>",
  "tags": [
    ["d",     "curated-worlds"],
    ["title", "Featured Worlds"],
    ["a",     "30078:<alice-pubkey>:the-lake:world"],
    ["a",     "30078:<bob-pubkey>:shadowrealm:world"],
    ["a",     "30078:<carol-pubkey>:pirate-cove:world"]
  ]
}
```

The platform maintains its own canonical list. Anyone can publish their own list — a community curator, a genre enthusiast, a friend circle. Clients fetch the relevant list to populate their world browser.

**URL routing:**
```
/w                         → lobby (world browser, search, curated list)
/w/the-lake                → bare slug (self-pins on load)
/w/the-lake-c08d7b5a       → pinned slug (safe to share)
/u/npub1...                → author profile page
```

---

### 6.2.2 Extend, Don't Fork

The preferred model for collaboration is **extension** — building new places that connect to an existing world — not forking. Forking creates a parallel universe: the player base splits, the lore diverges, both versions need independent maintenance.

**Extension** (preferred):
Bob publishes new places with `t: the-lake` and a portal connecting to Alice's clearing south exit. Alice vouches Bob. The world grows as one coherent graph.

**New world** (also good):
Bob publishes his own world event with `t: bobs-dungeon`. Completely separate world, his own keypair, his own lore. No confusion with Alice's world.

**Forking** (discouraged):
Bob copies Alice's events under his own pubkey. Now there are two incompatible versions of `the-lake`. Players are confused about which is canonical. Lore diverges. Both authors are on the hook for maintenance.

The schema makes extension natural — portals reference specific `a`-tags, so Bob's new places can connect to Alice's world without Alice needing to change anything (in `open` mode) or with a simple vouch (in `vouched` mode). Forking offers no advantage the extension model doesn't already provide.

---

### 6.3 Collaboration Modes

The `collaboration` tag on the world event controls who the client trusts:

| Mode | Tag | Who is trusted |
|------|-----|----------------|
| `closed` | `["collaboration", "closed"]` | Genesis pubkey only |
| `vouched` | `["collaboration", "vouched"]` | Genesis + `collaborator` tags + `vouch` events (minus `revoke` events) |
| `open` | `["collaboration", "open"]` | Any pubkey — fully permissionless |

**`closed`** — solo world, total authorial control. Use for canonical story worlds.

**`vouched`** — curated collaboration. The genesis author lists trusted pubkeys directly on the world event via `collaborator` tags. Simple, no extra events needed. Updating the collaborator list is just republishing the world event (it's replaceable).

**`open`** — anyone can contribute places and portals. The client still validates reference chains (see 6.5) but does not filter by pubkey. Best for community worlds — clients should show a content warning.

---

### 6.4 Collaborator Tags

The simplest way to grant trust — list pubkeys directly on the world event:

```json
["collaborator", "<Bob's pubkey>"],
["collaborator", "<Carol's pubkey>"]
```

Collaborators can publish places, portals, features, items, NPCs, and dialogue nodes that the client treats as trusted. Adding or removing a collaborator is just republishing the world event. No extra events, no relay queries.

---

### 6.5 Vouch Events

For delegated trust — when a collaborator wants to vouch for someone without requiring the genesis author to update the world event:

```json
{
  "kind": 30078,
  "pubkey": "<trusted-author>",
  "tags": [
    ["d",         "the-lake:vouch:bob-vouches-dave"],
    ["t",         "the-lake"],
    ["type",      "vouch"],
    ["pubkey",    "<Dave's pubkey>"],
    ["scope",     "portal"],
    ["can-vouch", "false"]
  ],
  "content": ""
}}
```

**`scope`** — what the vouched pubkey is trusted for:

| Scope | Trusted to publish |
|-------|-------------------|
| `portal` | Portals only — can connect places but not create them |
| `place` | Places and their contents |
| `all` | Everything — full collaborator equivalent |

**`can-vouch`** — whether the vouched author can vouch others. `false` by default. Set `true` to allow the world to grow without the genesis author being a bottleneck.

Vouch events are only valid if authored by a pubkey already in the trust set (genesis, collaborator, or vouched with `can-vouch: true`).

---

### 6.5.1 Vouch Revocation

A vouch can be revoked by publishing a revoke event:

```json
{
  "kind": 30078,
  "pubkey": "<revoking-author>",
  "tags": [
    ["d",      "the-lake:revoke:dave"],
    ["t",      "the-lake"],
    ["type",   "revoke"],
    ["pubkey", "<revoked-pubkey>"]
  ],
  "content": ""
}
```

Revocation follows the same chain as vouching:
- Genesis and collaborators can revoke any vouched pubkey
- A vouched author (with `can-vouch: true`) can only revoke pubkeys they personally vouched

**Cascading:** revoking pubkey A also invalidates all vouches that A issued. If A vouched B who vouched C, revoking A removes both B and C (unless B or C has an alternate vouch path through a different trusted author).

---

### 6.6 Trust Rules (client enforcement)

The client applies these rules when rendering any event:

**1. Place contents are trusted based on the place's author**
Features, items, NPCs, and clues are only rendered if referenced by the current place event. An event floating on the relay with no trusted place referencing it is invisible — it cannot inject itself.

**2. Portal authorship is validated against the originating place**
A portal claiming an exit slot on Alice's place is only valid if:
- It is authored by Alice, OR
- It is authored by a pubkey Alice has listed as a `collaborator`, OR
- It is authored by a pubkey vouched (transitively) from Alice

A portal by Bob claiming Alice's exit slot — without Alice's endorsement — is fringe content, only shown in `open` mode.

**3. Trust is local to the current place**
When you're in Alice's place, you trust Alice's reference chain. When you traverse Alice's portal into Bob's place, you now trust Bob's reference chain. Trust delegates naturally as you move through the world.

**4. The reference chain is the security boundary**
```
World event (genesis)
  → place (trusted author)
    → features / items / NPCs / portals (referenced by place)
      → clues / dialogue / consequences (referenced by features/NPCs)
```
An attacker can publish anything — but if no trusted event in the chain references it, it is never evaluated.

**5. Content is always sanitised**
`content` and tag values are author-supplied strings. The client must sanitise before rendering — no raw HTML, no script execution. Unknown `content-type` values fall back to `text/plain`.

**6. Image URL protocol validation**
`media` tag URLs and any image references must use `https:` (or `http:`) protocol only. `javascript:`, `data:`, and other URI schemes are blocked to prevent XSS via image injection.

**7. World event genesis pinning**
The world event is pinned to the genesis pubkey — the author of the world event with the oldest `created_at` timestamp wins. This prevents an attacker from publishing a competing world event with the same `d`-tag to hijack the trust root.

**8. Portal exit slot enforcement**
Portals can only claim exit slots that are declared on the originating place event via `exit` tags. A portal claiming an undeclared slot is invalid and silently ignored. This prevents exit injection — an attacker cannot add new directions to a place they do not control.

---

### 6.6.1 Author Chain Validation

The trust model validates not just top-level event visibility but the entire reference chain. When a trusted event references another event (via action targets, entity refs, dialogue nodes, etc.), the referenced event's author must also be in the trust set.

Events from untrusted authors are silently skipped:
- Items, features, NPCs, clues, sounds referenced by a place but authored by an untrusted pubkey are not rendered
- Action targets (`set-state`, `give-item`, `consequence`) pointing to untrusted events are not executed
- Dialogue nodes from untrusted authors are not shown
- Payment events from untrusted authors are blocked
- Portal exits are only allowed on declared exit slots (portals cannot inject exits)
- The world event is pinned to the genesis pubkey (oldest `created_at` wins)

---

### 6.7 Portal Conflict Resolution

When multiple portals claim the same exit slot, the client's behaviour depends on trust mode and the number of portals involved. The core principle: **navigation should always work without surprise; unverified content requires deliberate exploration.**

---

**Exit slot behaviour:**

| Situation | `south` | `look south` |
|-----------|---------|-------------|
| One trusted portal | Navigate immediately | Shows portal details |
| Multiple trusted portals | Disambiguation list | Full list |
| One trusted + unverified | Navigate, shows `[+N unverified]` hint | Full list with all |
| Unverified only | Short list (up to 5) with trust indicators | Full list |
| No portals | "You can't go that way." | "Nothing leads south." |

`south` is the navigation command — it moves the player or presents a choice when ambiguous. `look south` is always the examination command — it shows everything available on that slot without navigating.

---

**Short list (unverified-only, `south`):**

```
> south
  Multiple paths south:
  1. A freshly cut path into the woods. (trusted) [npub1dan...]
  2. A mysterious door. (unverified) [npub1abc...]
  3. A dark alley. (unverified) [npub1xyz...]
  + 9 more — type "look south" to see all

> 2
  You are about to enter an unverified path by npub1abc...
  "A mysterious door." — proceed? (yes/no)
```

Entering an unverified portal always requires confirmation — the player sees the label and author pubkey before committing.

**Full list (`look south`):**

Shows all portals on the slot with trust indicators and author attribution. No cap. No navigation — examination only.

**`[+N unverified]` hint:**

When a trusted portal is navigated but unverified alternatives exist, the client appends a hint after arrival:

```
You take the path north into the woods.
[+3 unverified paths from the clearing — type "look south" to see them]
```

The player is never surprised by alternatives they didn't know existed.

---

**Trust indicators:**

| Label | Meaning |
|-------|---------|
| `(trusted)` | Authored by genesis, collaborator, or vouched pubkey |
| `(community)` | Outside trust set but in community mode |
| `(unverified)` | Unknown pubkey — explorer mode only |

**Content warnings on portals:** if an unverified portal has a `cw` tag, display it in the list before the player selects it.

---

**Mode summary:**

| Mode | Default display | Unverified shown |
|------|----------------|-----------------|
| `closed` | Trusted exits only | Never |
| `vouched` | Trusted + vouched exits | Never |
| `community` | Trusted + vouched, `[+N unverified]` hint | On `look <slot>` only |
| `open` | All, trusted first | In short list, full on `look <slot>` |

Contested portals are a feature of open worlds — unreliable cartography, diverging factions, living history. The UI model makes this explorable without being overwhelming.

---

### 6.8 Client Modes

| Mode | Trusts | Use case |
|------|--------|----------|
| **Canonical** | Genesis + collaborators only | Stable, curated play |
| **Community** | + vouch chain | Default — extended world |
| **Explorer** | All pubkeys | Full permissionless world |
| **Archive** | Specific relay snapshot | Historical world state |

---

### 6.9 Open World Moderation

In `open` collaboration worlds, all content is visible without trust labels — the player accepted the open model when entering. Curation is post-hoc: moderators (genesis, collaborators, vouched with `can-vouch`) prune bad content after the fact using revocation.

#### Report Command

Players can report content they encounter:

- `report` — reports the current place
- `report <noun>` — reports a specific entity (item, feature, NPC) resolved via noun lookup

**Flow:**
1. Engine resolves the target event (place or entity via noun)
2. Shows: `Report "<title>" by npub1...? Reason (or "cancel" to abort):`
3. Player types a reason (free text) or `cancel`
4. On confirm: publishes a report event

**Report event shape:**

```json
{
  "kind": 30078,
  "tags": [
    ["d",      "<slug>:report:<reporter-short>-<target-short>"],
    ["t",      "<world-slug>"],
    ["type",   "report"],
    ["target", "<event-a-tag>"],
    ["reason", "<free-text-reason>"]
  ],
  "content": ""
}
```

Reports are visible to moderators in build mode. The moderator can then revoke the reported author's content or dismiss the report. Reports do not affect gameplay — they are signals for moderators.

#### Open World Trust Rules

| Rule | Behaviour |
|------|-----------|
| Player experience | All content visible, no trust labels, no confirmation prompts |
| Moderator experience | Build mode shows author info, report counts, revoke button |
| Content filtering | None — players see everything |
| Bad content removal | Moderators publish revoke events to remove author's content |
| Report visibility | Only moderators see report events |

---

## 7. NPC & Dialogue System

NPCs are world actors defined by their author. They can be static (always say the same thing) or dynamic (state-aware).

---

### 7.1 NPC Behaviour Types

| Type | Description |
|------|-------------|
| `static` | Fixed dialogue, always available |
| `conditional` | Dialogue/items change based on player state |
| `guardian` | Blocks a lock until a condition is met |
| `merchant` | Trades items (possibly for sats) |
| `quest-giver` | Triggers a quest chain on interaction |

---

### 7.2 Conditional Dialogue

`requires` conditions live on the **destination node**, not on the `option` tag. The client evaluates each destination node's `requires` against player state before rendering the option. Options whose destination fails `requires` are hidden. This is the same evaluation logic used for rooms, portals, and features — no special dialogue condition handling needed.

```json
// Option is always shown — destination has no requires
["option", "Ask about the cave", "30078:<pubkey>:the-lake:dialogue:hermit:cave"]

// Option only shown if player holds map fragment — requires lives on the destination node
["option", "Ask about the key",  "30078:<pubkey>:the-lake:dialogue:hermit:key"]

// hermit:key node — requires evaluated before offering this option
{
  "tags": [
    ["d",        "the-lake:dialogue:hermit:key"],
    ["requires", "30078:<pubkey>:the-lake:item:map-fragment", "", ""],
    ...
  ],
  "content": "Ah, you found the map..."
}
```

Condition types are the same as everywhere:

| Type | Evaluates true when |
|------|---------------------|
| `item` | Player holds item; optional state check |
| `flag` | Named flag is set in player state |
| `solved` | Player has solved the referenced puzzle |
| `npc` | NPC exists in a given state (`gone`, `present`, `blocking`, or blank for any) |

---

### 7.3 NPC Placement — Room-Owned

NPCs do not self-place. The place author controls which NPCs appear in their place by adding `npc` reference tags to their place event. Since place events are replaceable, the author can add or remove NPCs at any time by republishing.

This means:
- A place author can invite another author's NPC into their place by referencing it
- Cross-author NPC placement requires the place author's active cooperation
- Nobody can inject an NPC into a place they don't control
- An NPC event with no place referencing it exists but is invisible — orphaned until a place adopts it

This mirrors the portal model: the connection is always owned by the party granting access. For portals, the place author owns the exit slot. For NPCs, the place author owns the guest list.

---

## 8. Progression & Quest Design

---

### 8.1 Quest as Event Graph

A quest is not a separate event type — it emerges from the graph of connected primitives. A quest chain is:

```
Clue → found in Room
  → hints at Recipe
    → combine Items → produces Item
      → satisfies Lock (key-type) → on Portal
        → Portal leads to Room
          → Room contains Puzzle
            → Puzzle (solved) → unlocks Lock (crypto-type) → on Item
              → Item is encrypted Clue
                → Clue reveals hidden Room
```

No quest tracking event is required. The player's progress through the graph *is* the quest.

---

### 8.2 Quest Hooks (optional `type: quest`)

For named, trackable quests, an optional quest event groups the chain and defines completion. Completion uses the same `requires` tags as everywhere else — the client evaluates them against player state. When all `requires` conditions pass, the quest is complete.

```json
{
  "kind": 30078,
  "pubkey": "<author_pubkey>",
  "tags": [
    ["d",        "the-lake:quest:the-serpents-staff"],
    ["t",        "the-lake"],
    ["type",     "quest"],
    ["title",    "The Serpent's Staff"],
    ["involves", "30078:<pubkey>:the-lake:puzzle:chapel-riddle"],
    ["involves", "30078:<pubkey>:the-lake:recipe:serpent-staff"],
    ["requires", "30078:<pubkey>:the-lake:item:serpent-staff", "", ""],
    ["requires", "30078:<pubkey>:the-lake:place:sanctum", "visited", ""],
    ["requires", "30078:<pubkey>:the-lake:puzzle:chapel-riddle", "solved", ""]
  ],
  "content": "Somewhere in the cave system lies the legendary Serpent's Staff. The hermit knows something."
}
```

`requires` is consistent across the entire schema — the same evaluation model the client uses for rooms, features, portals, locks, and dialogue nodes applies here unchanged. Multiple `requires` tags = all must be satisfied (AND logic).

`involves` tags are optional hints for the client's quest log UI — they indicate which events are part of this quest chain without affecting completion logic.

**Quest display types via `quest-type`:** controls how the quest log reveals progress to the player:

```json
["quest-type", "hidden"]
```

| `quest-type` | Completed | Uncompleted | Count visible? |
|---|---|---|---|
| `open` (default) | `✓ Title` | `✗ Title` | Yes |
| `hidden` | `✓ Title` | `✗ ???` | Yes |
| `mystery` | `✓ Title` | not shown | No |
| `sequential` | `✓ Title` | next: `✗ Title`, rest hidden | No |

`open` is the default when no `quest-type` tag is present — backwards compatible. `hidden` shows the scope of the quest without spoiling details. `mystery` reveals nothing about remaining steps. `sequential` is a breadcrumb trail — only the next undone step is named.

**Endgame quests** use `quest-type: endgame` with an optional third element controlling whether the world closes or stays open:

```json
["quest-type", "endgame"]          // hard end — win screen, no more commands
["quest-type", "endgame", "open"]  // soft end — acknowledged, world stays open
```

Endgame quests are always hidden from the quest log — they are the game's internal win-state detector, not player-facing objectives. The event's `content` field is the closing prose rendered to the player on completion.

The client evaluates all `quest-type: endgame` quests continuously on every state change — same as sequence puzzle auto-evaluation. The first one whose `requires` all pass fires. Multiple endgame quests = multiple possible endings.

`endgame` (hard) renders the win screen and stops accepting commands, offering restart or share. `endgame` with `open` acknowledges the culmination but keeps the world open for further exploration — good for sandbox worlds or worlds with multiple endings to discover.

**Quest rewards via `on-complete`:** when all `requires` conditions pass, the quest fires its `on-complete` tags — same dispatcher as puzzles and recipes. Use this to give reward items, open portals, change world state:

```json
["on-complete", "", "give-item",  "30078:<pubkey>:the-lake:item:hermit-token"],
["on-complete", "", "set-state",  "rewarded"],
["on-complete", "", "set-state",  "open", "30078:<pubkey>:the-lake:portal:hermit-shortcut"]
```

Without `on-complete` tags, quest completion is recorded in player state and the quest log is updated — that's the minimum behaviour. The client automatically sets the quest event's state to `complete` on completion. Authors do not need to manually set this state — it happens automatically when all `requires` pass.

**Quest chaining:** quests can depend on other quests via `requires`. When Quest 1 completes, its state becomes `complete` — Quest 2 can require that state before it activates. The client cascades evaluation: completing one quest immediately re-evaluates all others, so chains resolve in a single pass.

```json
// Quest 2 — only activates after Quest 1 is complete
["requires", "30078:<PUBKEY>:the-lake:quest:find-the-hermit", "complete", ""]
```

This enables quest chains of arbitrary depth. Each quest in the chain has its own objectives, display type, and rewards. The endgame quest sits at the end of the chain — when its `requires` pass, the game is won.

**Restart:** both hard and soft endgame modes offer a `restart` command. Restart clears all player state (inventory, visited places, quest progress, counters, crypto keys) and returns to the start room. Items return to their original locations.

**Score** — numeric scoring (e.g. points per treasure deposited) is client-side presentation, not schema. The client can derive a score from whatever rule fits the game. No schema tag needed.

---

### 8.3 World Tiers

The world should have a natural progression structure:

| Tier | Description | Lock types used |
|------|-------------|----------------|
| Surface | Starting areas, tutorial mechanics | `key`, simple `combo` |
| Shallow | First real puzzles, NPC quests | `puzzle`, `combined-item` |
| Deep | Multi-stage quest chains | `crypto`, `derived-key` |
| Hidden | Secret areas, endgame content | `schnorr`, `condition` |

Deeper tiers use harder cryptographic lock types. The difficulty gradient maps to cryptographic complexity.

---

### 8.4 The Meta-Game

The living world creates emergent player roles beyond the standard adventurer:

| Role | Activity |
|------|---------|
| **Explorer** | Maps the world, publishes reliable portal guides |
| **Builder** | Creates new places and wings, seeks connections |
| **Saboteur** | Publishes misleading portals, seals passages |
| **Gatekeeper** | Controls high-traffic portal hubs |
| **Archivist** | Runs relays preserving historical world states |
| **Solver** | Focuses on cryptographic puzzle chains |

---

## 9. Client Architecture

A web client with two modes: **Play** and **Build**. Same keypair, same identity, different UI. A player can switch into builder mode at any time to inspect the world structure, publish new places, or forge portal connections to unexplored exit slots.

---

### 9.1 Dual Mode Design

**Play mode** — the classic text adventure experience. Room descriptions, exits, items, NPCs. Command input. No structural metadata visible.

**Build mode** — the world's scaffolding exposed. Unconnected exit slots highlighted. Place event IDs visible. Portal authorship shown. Tools to publish new places, portals, items, clues, puzzles. A map view showing the local graph of connected rooms.

The two modes share all state. Switching is a UI toggle, not a different session.

---

### 9.2 Component Overview

```
┌──────────────────────────────────────────────────┐
│                    Web Client                    │
│                                                  │
│  ┌──────────────┐   ┌──────────────────────────┐ │
│  │  Relay Pool  │   │    World Graph Cache     │ │
│  │  (multi)     │──▶│  rooms, portals, items,  │ │
│  └──────────────┘   │  locks, clues, puzzles   │ │
│                     └────────────┬─────────────┘ │
│  ┌──────────────┐                │               │
│  │ Trust Engine │◀───────────────┤               │
│  │ (social      │                │               │
│  │  graph)      │   ┌────────────▼─────────────┐ │
│  └──────────────┘   │      Render Engine       │ │
│                     │  Play mode / Build mode  │ │
│  ┌──────────────┐   │  place, exits, items,     │ │
│  │ Crypto Layer │◀──│  NPCs, graph overlay     │ │
│  │ NIP-44,      │   └────────────┬─────────────┘ │
│  │ SHA256,      │                │               │
│  │ Schnorr      │   ┌────────────▼─────────────┐ │
│  └──────────────┘   │      Player State        │ │
│                     │  local + encrypted NOSTR │ │
│  ┌──────────────┐   │  signed backup           │ │
│  │ Input Parser │   └──────────────────────────┘ │
│  │ (verb/noun + │                                │
│  │  build cmds) │                                │
│  └──────────────┘                                │
└──────────────────────────────────────────────────┘
```

---

### 9.3 Built-in Commands

The following commands are always available regardless of world content. They are client-level commands — not dispatched through the world's `verb` tag system.

| Command | Aliases | Effect |
|---------|---------|--------|
| `look` | `l` | Re-render current place description, exits, items, NPCs |
| `look <direction>` | | Show all portals on that exit slot — full list including unverified |
| `inventory` | `i`, `inv` | List carried items |
| `help` | `?` | Show available commands |
| `quests` | `q`, `journal` | Show active and completed quests |
| `examine <noun>` | `x`, `look at` | Examine a feature, item, or NPC |
| `take <noun>` | `get`, `pick up` | Pick up an item |
| `take <noun> from <container>` | | Extract item from container (item in inventory or feature in place) |
| `take all from <container>` | | Extract all accessible contents from container |
| `drop <noun>` | | Drop an item to current place |
| `drop <noun> in/on/into <feature>` | `drop X on Y` | Drop an item onto a specific feature (triggers feature `on-drop` handlers) |
| `go <direction>` | Direction alone | Navigate an exit slot |
| `north` / `south` / `east` / `west` / `up` / `down` | `n s e w u d` | Navigation shortcuts |
| `attack <noun>` | `fight`, `hit` | Attack a target (combat) |

World-defined `verb` tags extend this set — built-in commands are always available and cannot be overridden by world events. If a world's verb conflicts with a built-in command, the built-in takes precedence.

---

### 9.3 Room Rendering Flow

When the player enters a place:

1. Fetch place event by `a`-tag reference (latest version)
2. Query relays for all `kind:30078` / `type:portal` events with `#exit` tag matching this place's `a`-tag (place-ref is the indexed second element)
3. Filter portals by trust model — discard fringe unless in explorer mode
4. For each portal, check for `kind:30078` / `type:lock` events targeting it — determine if traversable
5. Resolve `item` tags → fetch item events → filter out locally picked-up items
6. Resolve `feature` tags → fetch feature events → check for locks on each
7. Resolve `npc` tags → fetch NPC events → fetch dialogue trees
8. Resolve `puzzle` tags directly on place (if any) → fetch puzzle events
9. Render: place description, visible exits with labels, items, features, NPCs
10. Prefetch adjacent places in background

---

### 9.3 Relay Strategy

- Publish world events to **multiple relays** for redundancy
- Subscribe using `#t` tag filter to scope to a specific world — `t: the-lake` returns only events for this game instance. A different `t` tag = a different world, same client, same kind numbers.
- Cache aggressively — world events change rarely, player state changes often
- For replaceable events, always request latest (relay serves most recent by `d` + pubkey)
- Consider a **dedicated game relay** that only accepts events with `t: the-lake` to reduce noise and improve query performance as the world grows

---

### 9.4 Conflict Resolution Flow

When two portals claim the same exit slot:

```
Fetch all portals for exit slot
  │
  ├─ Only one? → Render normally
  │
  └─ Multiple?
       │
       ├─ Filter by trust → One survives? → Render normally
       │
       └─ Still multiple?
            │
            ├─ Render primary (highest trust) as normal exit
            └─ Render others as "unstable shimmer" — player can investigate
```

---

## 10. Open Questions

Remaining design decisions before or during build:

| # | Question | Options | Notes |
|---|----------|---------|-------|
| 1 | Private key storage in client | Client keystore / derived from player key / browser extension | Security vs UX — browser keystore for MVP |
| 2 | NPC liveness | Static events only / author-operated bots / AI-driven | Static for MVP |
| 3 | Relay incentives | Free relays / paid relays / dedicated game relay | Dedicated relay recommended long-term |
| 4 | Player identity | Fresh keypair per game / existing NOSTR identity | Existing identity preferred — social graph benefits |
| 5 | Build mode publish flow | Immediate publish / draft + preview / co-sign required | Draft + preview recommended |
| 6 | Map view in build mode | 2D graph / ASCII map / force-directed graph | Force-directed graph most natural for NOSTR event graph |

---

*Resolved questions (no longer open):*
- ~~Item scarcity model~~ → Non-scarce items, cryptographic access control
- ~~Shared world state~~ → Hybrid: map shared, progression personal, world events via key publication
- ~~World forking~~ → Forks are a feature; client modes (canonical / community / explorer)
- ~~Mobile vs web~~ → Web client first, play + build modes

---

## 11. MVP Scope

*See separate MVP scoping document.*

---

*Last updated: March 2026*  
*Status: Design complete — ready to scope MVP*
