# Getting Started with Folklore

## What is Folklore?

Folklore is a decentralised text adventure engine built on NOSTR. Worlds are graphs of NOSTR events stored on relays — no central server, no accounts, no login. Your identity is a NOSTR keypair, and anyone can build, extend, or play any world.

You can build:

- Exploration worlds with interconnected locations and environmental storytelling
- Puzzle worlds with cryptographic locks, item gates, and state machines
- Combat worlds with NPCs, weapons, health, and consequences
- Narrative worlds with dialogue trees, quests, and multiple endings
- Collaborative worlds where multiple authors contribute places and connections

Everything is data-driven. Behaviour comes from tags on events, not hardcoded logic.

> ▶ **Try it:** Import [tides-end-01-basics.json](tutorials/tides-end-01-basics.json) to explore these concepts in a working world.

---

## The Three Basics: Worlds, Places, and Portals

Every folklore world is built from three foundational event types.

### World

The world event is the root manifest. It declares the world's name, starting location, theme colours, collaboration mode, and relay hints. There is exactly one world event per world, authored by the genesis keypair.

Key properties:
- **slug** — the `t` tag value (e.g. `tides-end-01-basics`). This is your world's unique identifier.
- **start** — an event reference pointing to the place where new players begin.
- **collaboration** — `closed` (solo author), `vouched` (trusted contributors), or `open` (anyone can add content).
- **theme/colours** — background, text, accent, and highlight colours that define the visual feel.

### Place

A place is a location the player can occupy. It has a title, prose description, and a set of **exit slots** — named directions that a player can move through. Exit slots are just declarations: "this room has a `north` exit." They do not say where `north` leads. That is the portal's job.

Common exit slot names: `north`, `south`, `east`, `west`, `up`, `down`, `in`, `out`. You can also use custom names like `climb`, `path`, or `follow-river`.

**Place colour overrides** — a place can override the world's colour theme with its own `colour` tags. The override applies while the player is in that room and reverts when they leave. This lets specific locations feel distinct — a warm amber tavern in a green world, a blood-red dungeon, or a blinding white void.

### Portal

A portal stitches two exit slots together. It says: "the `north` exit on Place A leads to Place B, and the `south` exit on Place B leads back to Place A." A two-way portal has two `exit` tags. A one-way portal has one.

Portals are separate events from places. This means:
- Anyone can propose a connection between two places (in open/vouched worlds).
- Connections can be gated with `requires` tags (e.g. needing a key).
- Multiple portals can claim the same exit slot — the client resolves this by trust level.
- Portals can trigger **transition effects** — visual animations like blackout, flash, shake, or glitch that play when the player traverses. Add `["transition-effect", "blackout"]` and optionally `["transition-duration", "1000"]` to a portal. Use `["transition-clear", "true"]` to clear the game log during the transition — useful for dramatic scene changes.

---

## Builder Walkthrough

This walkthrough creates a minimal world with two places and a portal connecting them. You can follow along in the folklore client's Build Mode.

### Step 1: Create a World

Open the folklore client and click **Create World** from the lobby.

Fill in:
- **Slug**: `my-first-world`
- **Title**: "My First World"
- **Collaboration**: `open`

The client generates the world event with your keypair as the genesis author. A starting place is required — you will set this after creating your first place.

### Step 2: Add a Place

In Build Mode, click the **[+ New]** dropdown and select **Place**.

Fill in:
- **d-tag**: `my-first-world:place:entrance-hall`
- **Title**: "Entrance Hall"
- **Content**: Your prose description of the room.
- **Exits**: Add `north` as an exit slot.

Publish the event. You now have a place with a north exit, but it does not lead anywhere yet.

Go back to your world event and set the **start** tag to this place's event reference.

### Step 3: Add a Second Place

Create another place:
- **d-tag**: `my-first-world:place:garden`
- **Title**: "The Garden"
- **Exits**: Add `south` as an exit slot.

### Step 4: Connect Them with a Portal

Create a portal event:
- **d-tag**: `my-first-world:portal:hall-to-garden`
- **Exit 1**: Points to the garden place, bound to the `north` slot. Label: "A door opens onto a sunlit garden."
- **Exit 2**: Points to the entrance hall, bound to the `south` slot. Label: "The entrance hall lies through the doorway."

This is a two-way portal. The player can go `north` from the hall to reach the garden, and `south` from the garden to return.

### Step 5: Play

Switch out of Build Mode. You start in the Entrance Hall. Type `north` to walk to the Garden. Type `south` to return. That is the core loop — places declare exits, portals bind them to destinations.

---

## Tutorial World: Tide's End

> ▶ **Try it:** Import [tides-end-01-basics.json](tutorials/tides-end-01-basics.json) to play through everything covered in this guide.

This world contains four places (The Dock, Village Square, The Tavern, The Beach) connected by four portals in a logical coastal village layout. It demonstrates:

- World event with theme colours and collaboration mode
- Place events with multiple exit slots
- Two-way portal events binding exits to destinations
- Evocative prose descriptions grounded in a consistent setting

To use it:
1. Open the folklore client
2. Go to Build Mode
3. Use **Import** to load the JSON file
4. The `<PUBKEY>` placeholders are automatically replaced with your keypair on import
5. Publish the events to a relay
6. Play through the world — try navigating all four locations

### Tide's End Map

```
                 The Tavern
                     |
                   (east/west)
                     |
The Dock ----(north/south)---- Village Square ----(west/east)---- The Beach
   |                                                                  |
   +-----------------------(east/west, coastal path)------------------+
```

---

## Tips

- **Exit slots must match portal bindings** — If a place declares `["exit", "north"]`, the portal must bind to the `north` slot on that place. A portal binding to `north` on a place that only has `south` and `east` exits will not work — the client will not render the connection.
- **Portal exit tags point TO destinations** — The portal's `exit` tag references the **destination** place, not the origin. The slot name tells the client which exit on the origin leads there: `["exit", "<destination-place-ref>", "<slot-on-origin>", "<label>"]`. So if you want the player to go `north` from the Dock to the Square, the portal exit tag references the Square (the destination) with slot `north` (on the Dock).
- **Use the `a`-tag format for all references** — Event references always use the format `30078:<pubkey>:<d-tag>`. Never use bare d-tags or shorthand. The client resolves references to find the latest version of the target event.
- **d-tags must be prefixed with the world slug** — Every event's `d` tag starts with the world slug: `my-world:place:garden`, not just `place:garden`. This prevents collisions if the same author publishes multiple worlds.
- **Two-way portals need two exit tags** — A single exit tag creates a one-way connection. If you want the player to travel in both directions, add two exit tags — one for each direction. Forgetting the return exit is a common mistake that leaves players stranded.
- **Keep place descriptions concise** — Three to four sentences is the sweet spot. Players read room descriptions many times — overly long prose becomes tedious. Focus on atmosphere, key details, and available directions.
- **Collaboration mode matters** — `closed`: only the genesis author's events are trusted (good for tightly authored narratives). `vouched`: genesis author plus explicitly vouched contributors (good for small teams). `open`: all events are visible in community mode (good for collaborative or experimental worlds).

---

## Next Steps

Once you are comfortable with places and portals, the next tutorials cover:

- **02: Items and Features** — adding interactive objects and fixed scenery
- **03: State and Triggers** — making the world react to player actions
- **04: NPCs and Dialogue** — populating your world with characters
- **05: Puzzles and Gates** — locking content behind challenges
