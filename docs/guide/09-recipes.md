# Recipes: Combining Items

Recipes let players combine items to create new ones. A recipe defines what ingredients are needed and what the result is. When a player has all required items and uses the crafting verb, the recipe fires — consuming ingredients and producing the output.

This guide covers recipe events, ingredient requirements, crafting verbs, completion actions, and ordered vs unordered recipes.

> ▶ **Try it:** Import [tides-end-09-recipes.json](tutorials/tides-end-09-recipes.json) to explore these concepts in a working world.

---

## What is a Recipe?

A recipe is an event with `type: recipe`. It defines a crafting formula: which items (or conditions) are needed, what verb triggers it, and what happens on success. The player types the crafting verb followed by the recipe's noun to attempt it.

```json
{
  "tags": [
    ["d",           "my-world:recipe:fishing-rod"],
    ["type",        "recipe"],
    ["title",       "Fishing Rod"],
    ["noun",        "rod", "fishing rod"],
    ["state",       "unknown"],
    ["transition",  "unknown", "known", "You lash the hook to the rope and bind it to a piece of driftwood."],
    ["verb",        "craft", "combine", "make"],
    ["requires",    "30078:<PUBKEY>:my-world:item:rope", "", "You need some rope."],
    ["requires",    "30078:<PUBKEY>:my-world:item:hook", "", "You need a hook."],
    ["on-complete", "", "give-item",    "30078:<PUBKEY>:my-world:item:fishing-rod"],
    ["on-complete", "", "consume-item", "30078:<PUBKEY>:my-world:item:rope"],
    ["on-complete", "", "consume-item", "30078:<PUBKEY>:my-world:item:hook"],
    ["ordered",     "false"]
  ],
  "content": "A fishing rod can be made from rope and a hook."
}
```

Key tags:
- **`noun`** — what the player calls the recipe. `craft rod` or `make fishing rod` both work.
- **`verb`** — the crafting verbs that trigger the recipe. First value is canonical; the rest are aliases. Multiple canonical verbs need separate verb tags.
- **`requires`** — the ingredients (or conditions) needed. Each tag references an event. Empty state on items means "player holds it in any state". The third element is the failure message shown when the ingredient is missing.
- **`on-complete`** — actions that fire when all requirements are met. Use `give-item` to produce the output, `consume-item` to remove ingredients.
- **`state` / `transition`** — optional. Tracks whether the recipe has been crafted. The transition text is shown on first successful craft.
- **`ordered`** — `false` (default) means ingredients can be gathered in any order. `true` means the player must provide them in sequence.
- **`content`** — the recipe description, shown when the player examines it.

---

## Ingredient Requirements

Recipe `requires` tags work identically to requires tags everywhere else in the schema. They reference events and check conditions against player state.

### Item ingredients

The most common case — the player must hold a specific item:

```json
["requires", "30078:<PUBKEY>:my-world:item:rope", "", "You need some rope."]
```

Empty state (second element `""`) means the player holds the item in any state. The third element is the denial message.

### Non-item requirements

Recipes can also require non-item conditions. A feature must be in a specific state (e.g. a lit forge), or a puzzle must be solved. These conditions gate the recipe without being consumed:

```json
["requires", "30078:<PUBKEY>:my-world:feature:forge", "lit", "You need a lit forge."]
```

Non-item requirements should not have matching `consume-item` tags — they are gates, not ingredients.

---

## Consumption is Explicit

Items are only consumed if explicitly listed in `on-complete consume-item` tags. The `requires` tag gates the recipe (player must hold the item) but does not remove it. This separation is important:

- An item listed in `requires` **and** `consume-item` is a consumed ingredient
- An item listed in `requires` but **not** `consume-item` is a reusable tool
- A feature listed in `requires` is a condition (never consumed)

```json
["requires",    "30078:<PUBKEY>:my-world:item:hammer", "", "You need a hammer."],
["requires",    "30078:<PUBKEY>:my-world:item:iron-bar", "", "You need an iron bar."],
["on-complete", "", "consume-item", "30078:<PUBKEY>:my-world:item:iron-bar"],
```

Here the hammer is required but not consumed — it stays in the player's inventory. The iron bar is consumed.

---

## Crafting Verbs

The `verb` tag on a recipe defines what commands trigger the crafting attempt. The first value is the canonical verb; subsequent values are aliases:

```json
["verb", "craft", "combine", "make"]
```

This means `craft rod`, `combine rod`, and `make rod` all trigger the recipe. The player types the verb followed by the recipe's noun.

**Important:** `examine` is built-in and does not need a verb tag. Players can always `examine rod` to see the recipe's content and ingredient list. The engine shuffles the ingredient list on display so ordered recipes do not reveal their sequence.

---

## Portable vs Feature-Bound Recipes

How a recipe is triggered depends on whether it has a `noun` tag:

### Portable recipes (with `noun` tag)

A recipe with both `verb` and `noun` tags is **portable** — its verbs enter the global command vocabulary and the recipe can be triggered from anywhere, as long as the player has the required ingredients.

```json
["verb", "craft", "combine", "make"],
["noun", "rod", "fishing rod"]
```

`craft rod` works from any room. This is the right choice for recipes representing skills or knowledge the player carries with them.

### Feature-bound recipes (no `noun` tag on recipe)

A recipe without a `noun` tag is **feature-bound** — it can only be triggered via a feature's `on-interact` using the `activate` action. The feature provides the noun and scopes the recipe to its place.

```json
// Feature in the smithy:
["on-interact", "use", "", "activate", "30078:<PUBKEY>:my-world:recipe:forge-sword"]

// Recipe — no noun tag:
["verb", "use", "forge"],
["requires", "30078:<PUBKEY>:my-world:item:iron-bar", "", "You need an iron bar."],
["on-complete", "", "give-item", "30078:<PUBKEY>:my-world:item:sword"]
```

`use forge` only works when the smithy feature is in the current room. The verb `use` comes from the feature, not the recipe. Use this pattern when crafting should require a specific location or tool (a forge, a workbench, an altar).

---

## Ordered Recipes

Set `["ordered", "true"]` to require ingredients in a specific sequence. The client evaluates `requires` tags in tag order — the player must provide each item in turn.

When ordered crafting begins, the client enters a crafting mode. The player types item names one at a time. Wrong order or wrong item cancels the attempt.

Ordered recipes are useful for rituals, alchemical formulas, or any process where sequence matters.

---

## Recipe Completion Actions

The `on-complete` tags fire when all requirements are met. Supported actions:

| Action | Purpose |
|--------|---------|
| `give-item` | Add the crafted item to the player's inventory |
| `consume-item` | Remove an ingredient from inventory |
| `set-state` | Change the state of any event |
| `sound` | Play a sound effect |

Multiple `on-complete` tags can fire on the same recipe. They execute in tag order.

---

## Builder Walkthrough: Creating a Fishing Rod Recipe

### Step 1: Create the ingredient items

Each ingredient is a standard item placed in a location:

```json
{
  "tags": [
    ["d",     "my-world:item:rope"],
    ["type",  "item"],
    ["title", "Rope"],
    ["noun",  "rope", "coil"]
  ],
  "content": "A sturdy coil of hemp rope."
}
```

Place each item in its respective place event:

```json
["item", "30078:<PUBKEY>:my-world:item:rope"]
```

### Step 2: Create the output item

The output item does not start in any place — it is given by the recipe's `on-complete` action:

```json
{
  "tags": [
    ["d",     "my-world:item:fishing-rod"],
    ["type",  "item"],
    ["title", "Fishing Rod"],
    ["noun",  "rod", "fishing rod"]
  ],
  "content": "A makeshift fishing rod, rough but functional."
}
```

### Step 3: Create the recipe event

The recipe ties ingredients to output:

```json
{
  "tags": [
    ["d",           "my-world:recipe:fishing-rod"],
    ["type",        "recipe"],
    ["title",       "Fishing Rod"],
    ["noun",        "rod", "fishing rod"],
    ["state",       "unknown"],
    ["transition",  "unknown", "known", "You lash the hook to the rope and fashion a fishing rod."],
    ["verb",        "craft", "combine", "make"],
    ["requires",    "30078:<PUBKEY>:my-world:item:rope", "", "You need some rope."],
    ["requires",    "30078:<PUBKEY>:my-world:item:hook", "", "You need a hook."],
    ["on-complete", "", "give-item",    "30078:<PUBKEY>:my-world:item:fishing-rod"],
    ["on-complete", "", "consume-item", "30078:<PUBKEY>:my-world:item:rope"],
    ["on-complete", "", "consume-item", "30078:<PUBKEY>:my-world:item:hook"],
    ["ordered",     "false"]
  ],
  "content": "A fishing rod can be made from rope and a hook."
}
```

### Step 4: Gate items behind the crafted result

You can make items only available after crafting by adding a `requires` tag that checks for the crafted item:

```json
{
  "tags": [
    ["d",        "my-world:item:raw-fish"],
    ["type",     "item"],
    ["title",    "Raw Fish"],
    ["noun",     "fish", "raw fish"],
    ["requires", "30078:<PUBKEY>:my-world:item:fishing-rod", "", "You'd need something to catch fish with."]
  ]
}
```

The fish only appears when the player has the fishing rod in inventory.

### Step 5: Publish

Publish all events — ingredients, output, and recipe — to the same world tag.

---

## Tips

- **Examine shows ingredients** — Players can always `examine` a recipe to see what it requires. The engine shuffles the list for ordered recipes so the sequence is not spoiled.
- **Portable recipes work from anywhere** — A recipe with `verb` + `noun` tags can be triggered from any room. Use this for skills or formulas the player carries with them. A recipe without a `noun` tag is feature-bound and only works via a specific feature's `on-interact activate` action.
- **Verb tags need aliases** — Players will try different words. If your recipe uses "craft", also add "combine" and "make" as aliases. Think about what feels natural for the action.
- **Failure messages guide the player** — The third element of each `requires` tag is shown when the ingredient is missing. Write helpful messages: "You need some rope" is better than nothing.
- **Chain recipes with items** — The output of one recipe can be an ingredient for another. A fishing rod recipe produces a rod; the rod is required to catch fish; the fish is an ingredient for a cooking recipe.
- **Non-consumed requirements** — Use `requires` without `consume-item` for tools or environmental conditions. A recipe that needs a lit forge does not consume the forge.

---

## Tutorial World

> ▶ **Try it:** Import [tides-end-09-recipes.json](tutorials/tides-end-09-recipes.json) to play through everything covered in this guide.

The world contains:
- Two ingredient items (rope and iron hook) in different locations
- A recipe that combines them into a fishing rod
- A fish that can only be caught with the crafted rod
