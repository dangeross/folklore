# Puzzles, Clues, and Sealed Content

Puzzles are the core challenge mechanic in folklore. They gate progression, reward exploration, and give players something to solve rather than just something to find. This guide covers how to create puzzles, place clues that help players solve them, and how sealed (encrypted) content works at a high level.

> ▶ **Try it:** Import [tides-end-05-puzzles.json](tutorials/tides-end-05-puzzles.json) to explore these concepts in a working world.

---

## Puzzle Types

A puzzle is an event with `type: puzzle`. The `puzzle-type` tag tells the client how to present the challenge, but all puzzles share the same underlying structure: `requires` tags define conditions, and `on-complete` tags define what happens when the puzzle is solved.

### Riddle

A riddle puzzle prompts the player for a text answer. The answer is never stored -- only its cryptographic hash. The client hashes the player's input with a salt value and compares to the stored hash. If they match, the puzzle is solved.

```json
{
  "kind": 30078,
  "tags": [
    ["d",           "my-world:puzzle:gate-riddle"],
    ["t",           "my-world"],
    ["type",        "puzzle"],
    ["puzzle-type", "riddle"],
    ["answer-hash", "<SHA256 hex digest>"],
    ["salt",        "my-world:puzzle:gate-riddle:v1"],
    ["on-complete", "", "set-state", "decoded", "30078:<PUBKEY>:my-world:feature:gate"]
  ],
  "content": "A voice echoes: 'I have cities but no houses, forests but no trees, water but no fish. What am I?'"
}
```

Key tags:
- `answer-hash` -- SHA256 of `(answer + salt)`. The publishing tool computes this from the `answers` map in your world file.
- `salt` -- a unique string tied to this puzzle. Convention: use the puzzle's d-tag plus a version suffix like `:v1`.
- `on-complete` -- fires when the answer is correct. Typically sets state on another event or gives an item.

Answers are **case-sensitive**. The answer in the answers map must match exactly what the player types. Convention is to use lowercase answers so players don't need to guess capitalisation.

### Sequence

A sequence puzzle requires the player to manipulate multiple things in a specific order. It uses `requires` tags that reference separate features, each of which must reach a target state. With `ordered: true`, the client evaluates the requires tags in tag order -- earlier conditions must pass before later ones are checked.

```json
{
  "kind": 30078,
  "tags": [
    ["d",           "my-world:puzzle:lever-sequence"],
    ["t",           "my-world"],
    ["type",        "puzzle"],
    ["puzzle-type", "sequence"],
    ["ordered",     "true"],
    ["requires",    "30078:<PUBKEY>:my-world:feature:lever-a", "pulled", "Pull lever A first."],
    ["requires",    "30078:<PUBKEY>:my-world:feature:lever-b", "pulled", "Pull lever B next."],
    ["requires",    "30078:<PUBKEY>:my-world:feature:lever-c", "pulled", "Pull lever C last."],
    ["on-complete", "", "set-state", "solved"],
    ["on-complete", "", "give-item", "30078:<PUBKEY>:my-world:item:treasure"]
  ],
  "content": "Three levers protrude from the wall."
}
```

Each step is a separate feature with its own verb, state, and transitions. When the player completes the last step, the sequence puzzle auto-evaluates and fires `on-complete` -- no explicit "submit" is needed.

**Important:** each step must be a separate feature event. A single feature cycling through states will not work because `requires` checks are evaluated against the feature's *current* state. Once a feature moves past a required state, the earlier `requires` condition fails.

### Other Types

| Type | Mechanic | Notes |
|------|----------|-------|
| `observe` | Player must have visited places or read clues | Auto-evaluates after state changes. No answer input needed. |
| `cipher` | Decode NIP-44 encrypted content | Answer derives the decryption key. Advanced topic -- see Sealed Content below. |

---

## Clues

A clue is a self-contained piece of information with `type: clue`. Clues have a state lifecycle: they start `hidden` and become `visible` when discovered. The player must find a clue before its content is shown.

### Placement

Clues are placed in rooms using the `clue` tag on the place event:

```json
["clue", "30078:<PUBKEY>:my-world:clue:scrap-of-paper"]
```

When a clue is referenced this way, it appears automatically when the player enters the room -- the `clue` tag on the place triggers `set-state visible` on the clue event. This is the **ambient clue** pattern: the player discovers it just by being there.

### Clue Event Structure

```json
{
  "kind": 30078,
  "tags": [
    ["d",          "my-world:clue:scrap-of-paper"],
    ["t",          "my-world"],
    ["type",       "clue"],
    ["title",      "Scrap of Paper"],
    ["noun",       "paper", "scrap", "note"],
    ["state",      "hidden"],
    ["transition", "hidden",  "visible", "You notice a scrap of paper tucked behind a bottle."],
    ["transition", "visible", "visible", "You have already read the paper."]
  ],
  "content": "Written in faded ink: 'The answer is always north.'"
}
```

- `state: hidden` means the clue is not shown until discovered.
- The `hidden -> visible` transition provides discovery text.
- The `visible -> visible` transition handles re-examination.
- The `content` field holds the actual clue information shown to the player.

### Clue Discovery Methods

Clues can be surfaced in several ways:

1. **Ambient (place entry)** -- place has a `clue` tag. The clue becomes visible when the player enters.
2. **Feature interaction** -- a feature's `on-interact` fires `set-state visible` on the clue.
3. **NPC dialogue** -- a dialogue node fires `set-state visible` on the clue.

### Clue Placement Tips

- **Spread clues across locations.** A riddle clue in one room and the puzzle in another encourages exploration.
- **Make clues findable but not obvious.** The clue content should hint at the answer without giving it away directly.
- **Use noun tags on clues** so players can `examine` them after discovery. The `examine` command is built-in and works on any event with a noun tag.

---

## Puzzle Activation

Riddle puzzles don't activate themselves. A feature in the game world triggers the puzzle by setting its state to `active`:

```json
{
  "tags": [
    ["d",    "my-world:feature:notice-board"],
    ["type", "feature"],
    ["noun", "board", "notice board"],
    ["verb", "decode", "decipher"],
    ["on-interact", "decode", "", "set-state", "active", "30078:<PUBKEY>:my-world:puzzle:gate-riddle"]
  ]
}
```

When the player types `decode board`, the engine fires `set-state active` on the puzzle event. The client detects the puzzle activation and presents the puzzle prompt to the player.

Sequence puzzles work differently -- they are tied to a place via the `puzzle` tag on the place event. The client auto-evaluates the puzzle's `requires` tags whenever any feature in that place changes state.

---

## Puzzle Completion (on-complete)

When a puzzle is solved, all `on-complete` tags fire in order. Common actions:

```json
["on-complete", "", "set-state", "decoded",  "30078:<PUBKEY>:my-world:feature:notice-board"]
["on-complete", "", "give-item",             "30078:<PUBKEY>:my-world:item:treasure"]
["on-complete", "", "set-state", "visible",  "30078:<PUBKEY>:my-world:portal:secret-door"]
["on-complete", "", "set-state", "visible",  "30078:<PUBKEY>:my-world:clue:revelation"]
["on-complete", "", "consequence",           "30078:<PUBKEY>:my-world:consequence:fanfare"]
```

The first element after the tag name is always blank for `on-complete` (the trigger-target is implicit). Then the action type, then the action target.

`set-state` can target any event type — `feature`, `portal`, `clue`, `place`, `npc`, `item`. The fifth element is the ref of the event to update; without it, the puzzle itself is the target (useful for marking the puzzle `solved`). `consequence` fires a reusable outcome — useful for multi-effect completions (sound + transition + prose) without cluttering the puzzle with inline actions.

Multiple `on-complete` tags can stack. In the tutorial world, the sequence puzzle both sets its own state to `solved` and gives the player a brass telescope.

---

## Wrong Answers (on-fail)

Riddle puzzles support `on-fail` tags that fire when the player enters an incorrect answer:

```json
["on-fail", "", "deal-damage",  "2"],
["on-fail", "", "sub-counter",  "attempts", "1"]
```

Combined with counters and `on-counter`, you can build attempt-limited puzzles:

```json
["counter",    "attempts", "3"],
["on-fail",    "", "sub-counter",  "attempts", "1"],
["on-counter", "down", "attempts", "0", "consequence", "30078:<PUBKEY>:my-world:consequence:alarm"]
```

`on-fail` is only valid on `riddle` and `cipher` puzzles. Sequence puzzles have no wrong-answer concept -- the player simply hasn't completed the sequence yet.

---

## Sealed Content and NIP-44

This is an advanced topic. The short version: folklore can encrypt event content using NIP-44 so that it is literally unreadable without the correct key. This is not simulated encryption -- it is real cryptography. Even scraping all relay data won't reveal the content.

A sealed clue or place has:
- `content-type: application/nip44` -- tells the client the content is encrypted.
- `state: sealed` -- visible but unreadable until decrypted.
- A `puzzle` tag pointing to the riddle whose answer derives the decryption key.

```json
{
  "tags": [
    ["d",            "my-world:clue:sealed-prophecy"],
    ["type",         "clue"],
    ["state",        "sealed"],
    ["content-type", "application/nip44"],
    ["puzzle",       "my-world:puzzle:the-riddle"]
  ],
  "content": "<NIP-44 ciphertext -- unreadable without the puzzle answer>"
}
```

When the player solves the riddle, the client derives the decryption key from the answer, decrypts the content, and displays it. The `puzzle` tag on the sealed event tells the publishing tool which answer to use for encryption. The client doesn't read this tag at runtime -- it uses the derived crypto key from the solved puzzle.

For LLM-authored worlds, you write the plaintext content and include the answer in the `answers` map. The publishing tool handles the encryption before the event reaches relays.

---

## Puzzle Exit

Players can leave a puzzle prompt at any time by typing `back`, `leave`, or `cancel`. This exits the puzzle input mode without submitting an answer. The puzzle remains unsolved and can be attempted again later.

This is a built-in client behaviour -- no tags or configuration needed.

---

## Builder Walkthrough: Adding a Riddle Puzzle

Here is a step-by-step guide to adding a riddle puzzle to a world.

### 1. Create the puzzle event

Choose your answer and salt. The answer should be a single word or short phrase.

```json
{
  "kind": 30078,
  "tags": [
    ["d",           "my-world:puzzle:my-riddle"],
    ["t",           "my-world"],
    ["type",        "puzzle"],
    ["puzzle-type", "riddle"],
    ["answer-hash", "<computed by publishing tool>"],
    ["salt",        "my-world:puzzle:my-riddle:v1"],
    ["on-complete", "", "set-state", "revealed", "30078:<PUBKEY>:my-world:feature:hidden-panel"]
  ],
  "content": "The riddle text the player sees when the puzzle is active."
}
```

Add the answer to your world file's `answers` map:

```json
{
  "answers": {
    "my-world:puzzle:my-riddle": "the answer"
  },
  "events": [ ... ]
}
```

### 2. Create a feature that activates the puzzle

The player needs a way to trigger the puzzle. Add a feature with a verb that fires `set-state active` on the puzzle:

```json
{
  "kind": 30078,
  "tags": [
    ["d",    "my-world:feature:hidden-panel"],
    ["t",    "my-world"],
    ["type", "feature"],
    ["title", "Hidden Panel"],
    ["noun", "panel", "wall panel"],
    ["verb", "decode", "decipher"],
    ["state", "hidden"],
    ["transition", "hidden", "revealed", "The panel slides open, revealing a passage."],
    ["on-interact", "decode", "", "set-state", "active", "30078:<PUBKEY>:my-world:puzzle:my-riddle"]
  ],
  "content": "A section of the wall looks different from the rest. Strange markings cover its surface."
}
```

Do **not** add `examine` to the verb list -- `examine` is a built-in command.

### 3. Create a clue

Place a clue somewhere else in the world to hint at the answer:

```json
{
  "kind": 30078,
  "tags": [
    ["d",          "my-world:clue:hint-note"],
    ["t",          "my-world"],
    ["type",       "clue"],
    ["title",      "Faded Note"],
    ["noun",       "note", "faded note"],
    ["state",      "hidden"],
    ["transition", "hidden",  "visible", "You find a note tucked behind a loose stone."],
    ["transition", "visible", "visible", "You have already read the note."]
  ],
  "content": "The note reads: 'The answer rhymes with...' -- the rest is torn away."
}
```

### 4. Place everything in rooms

Add the feature to the puzzle room's place event:

```json
["feature", "30078:<PUBKEY>:my-world:feature:hidden-panel"]
```

Add the clue to a different room as an ambient clue:

```json
["clue", "30078:<PUBKEY>:my-world:clue:hint-note"]
```

### 5. Test

Import the world, navigate to the clue room, read the clue, go to the puzzle room, activate the puzzle, and enter the answer.

---

## Tips

- **Answer case sensitivity** — Answers are case-sensitive. Use lowercase answers by convention so players don't have to guess capitalisation.
- **Clue placement matters** — Put clues in rooms the player will visit naturally. If clues are too well-hidden, the puzzle becomes frustrating rather than fun.
- **Puzzle exit is always available** — Players can type `back`, `leave`, or `cancel` to exit a puzzle prompt. You don't need to tell them this -- the client handles it.
- **Sequence steps must be separate features** — Each step in a sequence puzzle needs its own feature event with its own state. A single feature cycling through states won't work because `requires` checks the *current* state, not state history.
- **Use the `answers` map** — Always include plaintext answers in your world file's top-level `answers` object. The publishing tool uses this to compute `answer-hash` values and handle NIP-44 encryption.
- **Salt convention** — Use the puzzle's d-tag followed by `:v1` as the salt. If you change the answer, bump the version (`:v2`) to invalidate the old hash.
- **Test with the walkthrough** — Include a walkthrough in your world file that exercises every puzzle. This makes it easy to verify the world works correctly after importing.
