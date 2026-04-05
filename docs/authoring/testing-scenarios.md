# Scenario Events — Authoring Guide

Scenarios are dev-only test fixtures for large worlds. They let an author jump directly into a specific game state (room + quest states + inventory + counters) without replaying the entire world from scratch.

**Scenarios are never published to NOSTR relays.** They live only in `localStorage` under `folklore:scenarios:<worldSlug>` and are imported/applied inside the event graph build view.

---

## When to create scenarios

Create scenarios when:

- The world has **more than 30 events** and reaching later acts requires many steps
- The world has **complex quest chains** where testing Act 3 requires completing Acts 1 and 2
- You are iterating on a specific scene and don't want to replay the entire game each time
- Multiple authors are working on different acts and need to jump to their section

For small worlds (under 30 events), scenarios are usually unnecessary — just play through from the start.

---

## Tag shape

```
["d",           "<worldslug>:scenario:<id>"]
["t",           "<worldslug>"]
["type",        "scenario"]
["title",       "Human-readable name"]
["place",       "30078:<pk>:<worldslug>:place:<id>"]
["set-state",   "30078:<pk>:<worldslug>:quest:<id>", "complete"]
["set-state",   "30078:<pk>:<worldslug>:quest:<id>", "active"]
["give-item",   "30078:<pk>:<worldslug>:item:<id>"]
["set-counter", "<counter-name>", "<value>"]
["chain",       "<worldslug>:scenario:<base-id>"]
```

The content field is a plain-text description of what game state this scenario represents. Keep it to 1-3 sentences.

### Tag meanings

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique ID: `<worldslug>:scenario:<id>` |
| `t` | Yes | World slug for grouping |
| `type` | Yes | Must be `scenario` |
| `title` | Yes | Short label shown in the scenarios panel |
| `place` | Recommended | Start room (a-tag format) |
| `set-state` | As needed | Set a quest/item/feature state |
| `give-item` | As needed | Add item to player inventory |
| `set-counter` | As needed | Set a world counter value |
| `chain` | Optional | Inherit from a base scenario |

---

## File format

Save scenarios as `<worldslug>-scenarios.json` — an array of scenario objects:

```json
[
  {
    "tags": [...],
    "content": "Description of this game state."
  }
]
```

---

## How to identify what states are needed

1. Find your world's quest events. Each quest has a `d` tag like `metropolitan:quest:job3b`.
2. To place the player after a quest is complete, add a `set-state` with that quest's a-tag ref and state `"complete"`.
3. Check if any items are gated behind the quest — add `give-item` tags for items the player should already have.
4. Check if any `on-complete` actions fire counters — add `set-counter` tags to match.
5. Set `place` to the room where the next act begins.

**To find a-tag refs:** Look at `requires` or `on-complete` tags in your world events — they use the full a-tag format (`30078:<pk>:<worldslug>:<type>:<id>`). Use those same refs in your scenario's `set-state` and `give-item` tags.

---

## Chaining

Use `chain` to inherit from a base scenario. This avoids duplicating long lists of states across scenarios for the same world.

```json
[
  {
    "tags": [
      ["d", "metropolitan:scenario:base"],
      ["t", "metropolitan"],
      ["type", "scenario"],
      ["title", "Base — Prologue complete"],
      ["place", "30078:<pk>:metropolitan:place:apartment"],
      ["set-state", "30078:<pk>:metropolitan:quest:prologue", "complete"],
      ["give-item", "30078:<pk>:metropolitan:item:key-card"]
    ],
    "content": "Prologue complete. Player has the key card and is at the apartment."
  },
  {
    "tags": [
      ["d", "metropolitan:scenario:act2-start"],
      ["t", "metropolitan"],
      ["type", "scenario"],
      ["title", "Act 2 — After Job 3b"],
      ["chain", "metropolitan:scenario:base"],
      ["place", "30078:<pk>:metropolitan:place:safehouse"],
      ["set-state", "30078:<pk>:metropolitan:quest:job1", "complete"],
      ["set-state", "30078:<pk>:metropolitan:quest:job2", "complete"],
      ["set-state", "30078:<pk>:metropolitan:quest:job3b", "complete"],
      ["give-item", "30078:<pk>:metropolitan:item:burner-phone"]
    ],
    "content": "Jobs 1-3b complete. Player has the burner phone and is at the safehouse."
  }
]
```

Chain rules:
- Base scenario is resolved first (recursively, max depth 5)
- `set-state` and `set-counter`: current scenario wins per key
- `give-item`: union (items from both base and current)
- `place`: current scenario wins; falls back to base

---

## Metropolitan world example

Here is a complete scenarios file for a heist world with three acts. Replace `<pk>` with the world author's pubkey.

```json
[
  {
    "tags": [
      ["d", "metropolitan:scenario:act1-done"],
      ["t", "metropolitan"],
      ["type", "scenario"],
      ["title", "Act 1 complete — At the docks"],
      ["place", "30078:<pk>:metropolitan:place:docks"],
      ["set-state", "30078:<pk>:metropolitan:quest:contact-fixed", "complete"],
      ["set-state", "30078:<pk>:metropolitan:quest:gear-acquired", "complete"],
      ["give-item", "30078:<pk>:metropolitan:item:lockpick"],
      ["give-item", "30078:<pk>:metropolitan:item:radio"]
    ],
    "content": "Act 1 complete. Player has lockpick and radio and is at the docks ready for the heist."
  },
  {
    "tags": [
      ["d", "metropolitan:scenario:act2-mid"],
      ["t", "metropolitan"],
      ["chain", "metropolitan:scenario:act1-done"],
      ["type", "scenario"],
      ["title", "Act 2 mid — Inside the vault"],
      ["place", "30078:<pk>:metropolitan:place:vault-antechamber"],
      ["set-state", "30078:<pk>:metropolitan:quest:heist-started", "active"],
      ["set-counter", "alarms-triggered", "1"]
    ],
    "content": "Heist in progress. Player is in the vault antechamber with one alarm triggered."
  },
  {
    "tags": [
      ["d", "metropolitan:scenario:act3-start"],
      ["t", "metropolitan"],
      ["chain", "metropolitan:scenario:act1-done"],
      ["type", "scenario"],
      ["title", "Act 3 — Escape"],
      ["place", "30078:<pk>:metropolitan:place:roof"],
      ["set-state", "30078:<pk>:metropolitan:quest:heist-started", "complete"],
      ["set-state", "30078:<pk>:metropolitan:quest:vault-open", "complete"],
      ["give-item", "30078:<pk>:metropolitan:item:case-of-money"],
      ["set-counter", "alarms-triggered", "0"]
    ],
    "content": "Heist complete. Player has the case of money and is on the roof. Time to escape."
  }
]
```

---

## How to use scenarios

1. Author the scenarios file and save as `<worldslug>-scenarios.json`.
2. In the event graph (build mode), open the Drafts panel.
3. Click **Import Scenarios** and select your JSON file.
4. Click **[scenarios]** in the graph header toolbar to open the scenarios panel.
5. Click **Apply** on any scenario. Confirm the dialog — your game state will be reset and the page will reload at the scenario's starting room.

The scenarios panel is only visible to genesis/collaborator pubkeys, or when all events are drafts (fully-draft worlds during local development).

---

## Naming convention

- File name: `<worldslug>-scenarios.json`
- Scenario d-tags: `<worldslug>:scenario:<act-or-descriptor>`
  - Examples: `metropolitan:scenario:act1-done`, `metropolitan:scenario:act2-mid`
- Titles: short, descriptive, include act/phase context
  - Examples: `"Act 1 complete — At the docks"`, `"Act 2 mid — Inside the vault"`
