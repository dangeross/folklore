# Trust & Collaboration

Every folklore world is built on NOSTR — an open protocol where anyone can publish events. This means anyone can publish content tagged with your world's slug. The trust model determines what players see and what gets filtered out.

---

## Collaboration Modes

When you create a world, you choose a collaboration mode. This is the most important decision for how your world grows.

**Closed** — only you (the genesis author) and named collaborators can add content. Players see nothing from anyone else. Best for tightly authored stories where you control every detail.

**Vouched** — you and your collaborators can vouch for other authors, bringing their content into the trusted set. Players see genesis + collaborator + vouched content. Best for small teams and curated community contributions.

**Open** — all content is visible to players, with unverified content clearly labelled. Best for experimental or community-driven worlds where anyone can contribute.

---

## Who Is Trusted?

Trust flows in a chain from the world's creator:

```
Genesis (world creator)
  ├── Collaborators (named in the world event)
  │     └── Can vouch others
  └── Vouched authors
        └── Can vouch others (if permitted)
```

- **Genesis** — the author who published the world event. Always trusted. Cannot be revoked.
- **Collaborators** — pubkeys listed in the world event's `collaborator` tags. Always trusted. Can vouch others.
- **Vouched** — authors endorsed by genesis, collaborators, or other vouched authors (with permission). Trust can be scoped and revoked.

---

## Vouching

Vouching brings an author's content into the trusted set. To vouch for someone:

1. Open **build mode** and find their content in the graph (shown as untrusted nodes)
2. Click the author's pubkey in the sidebar → **[vouch]**
3. The Vouch panel shows an **impact preview**: what events this author has published and what would become visible
4. Choose the **scope** — what types of content to trust:
   - **All** — everything this author publishes in the world
   - **Place** — places and portals only
   - **Portal** — portals only
5. Optionally enable **chain vouching** — allow this author to vouch for others
6. Click **Vouch** to publish the endorsement

### Vouch Impact Preview

Before vouching, the panel shows:
- A count of the author's events by type (places, items, NPCs, etc.)
- How many events the chosen scope covers
- Warnings about **cross-references** — if the author's events reference content by *other* unvouched authors, those references will remain hidden even after vouching

This helps you decide: do you trust just this author, or do you need to vouch their collaborators too?

---

## Revoking

Trust can be withdrawn. If a vouched author publishes harmful or unwanted content, you can revoke their access:

1. Open **build mode** → **Trust** panel (from the build dropdown)
2. Find the author in the trust tree
3. Click **[revoke]**

### Who Can Revoke?

- **Genesis and collaborators** can revoke any vouched author
- **Vouched authors** (with chain permission) can only revoke authors they personally vouched

### Cascading

Revoking an author also invalidates everyone they vouched. If Alice vouched Bob who vouched Charlie:
- Revoking Bob removes both Bob and Charlie
- Unless Charlie has an alternate vouch path through someone else

---

## Previewing Unvouched Content

As a trusted author (genesis, collaborator, or voucher), you can preview what unvouched content exists in your world without changing what players see.

Toggle **preview unvouched** in the mode dropdown. This shows:
- Unvouched exits, items, features, and NPCs labelled **(unverified)**
- You can explore unvouched areas to evaluate them before vouching
- Players never see this content — the preview is for your eyes only

---

## The Author Chain

The trust model doesn't just check top-level events — it validates the entire reference chain. A trusted place that references an untrusted item will not display that item. This prevents a malicious author from injecting content into your world by referencing your events.

What gets checked:
- Items, features, NPCs, clues, and sounds referenced by places
- Action targets (set-state, give-item, consequence) on triggers
- Dialogue nodes and payment events
- Portal exit slots (must match declared exits on the place)
- Container contents

Events from untrusted authors are silently skipped — no errors, no warnings, they simply don't exist from the player's perspective.

---

## Tips

- **Start closed, open later** — it's easier to expand trust than to clean up unwanted content. Begin with `closed` or `vouched` and open up when the community proves itself.
- **Scope carefully** — vouching with `portal` scope is the safest way to let someone connect their content to your world without trusting everything they publish.
- **Check cross-references** — the vouch panel warns you about dependencies on other unvouched authors. Follow the chain before vouching.
- **Preview before vouching** — use the preview toggle to explore unvouched content in-game before making trust decisions.
- **Revocation cascades** — revoking one author can remove an entire branch of the trust tree. Check the Trust panel's tree view to understand the impact before revoking.
