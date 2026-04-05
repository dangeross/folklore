# CLAUDE.md — Project Rules

## Golden Rule

**The design spec is the source of truth.** Every tag shape, trigger type, and action type must conform to `docs/spec/folklore-design.md`. If a feature or tag doesn't exist in the spec, **discuss it with the user before implementing**. Never invent new tags, triggers, or action types.

---

## Project Overview

A decentralised text adventure built on NOSTR (kind 30078). The world is a graph of events on relays. The client is a Vite + React 19 + Tailwind v4 app.

**World:** "The Lake" (`t` tag: `the-lake`)

---

## Key Files

| File | Purpose |
|------|---------|
| `docs/spec/folklore-design.md` | **Canonical design spec** — all tag shapes defined here |
| `docs/spec/CHANGELOG.md` | Schema changelog — all spec changes |
| `docs/spec/sample-presets.md` | Sound sample preset reference (dirt, classic) |
| `docs/authoring/` | LLM world authoring guides and worked examples |
| `docs/reference/` | Reference test worlds based on movies/games |
| `docs/worlds/` | Complete importable world JSON files |
| `src/components/App.jsx` | Main game component — rendering, theme, world bootstrap |
| `src/components/Lobby.jsx` | Landing page — world slug input, identity, world creator |
| `src/hooks/usePlayerState.js` | Player state hook with world-keyed localStorage persistence |
| `src/hooks/useRelay.js` | Relay subscription hook — world-scoped kind:30078 events |
| `src/services/router.js` | SPA routing — parseRoute, navigateToWorld, navigateToLobby |
| `src/services/theme.js` | Theme resolver — presets + world event colour overrides |
| `src/config.js` | Relay URLs, default world tag |
| `src/engine/world.js` | World query helpers (requires check, noun lookup, exits with trust) |
| `src/engine/trust.js` | Trust model — buildTrustSet, getTrustLevel, resolveClientMode |
| `src/engine/engine.js` | GameEngine class — command dispatch, room entry, movement, contested exits |
| `src/engine/player-state.js` | PlayerStateMutator — synchronous state wrapper |
| `src/engine/parser.js` | Verb/noun parser — verb map, article stripping |
| `src/engine/actions.js` | Action resolution — set-state, give-item, counters |
| `src/engine/content.js` | Content rendering — markdown, media, NIP-44 |
| `src/engine/nip44-client.js` | NIP-44 encryption — key derivation, sealed content |
| `src/engine/__tests__/` | Vitest unit tests for engine, parser, actions, world, trust |
| `src/components/ui/DOSPanel.jsx` | Shared UI primitive — modal panel with title bar |
| `src/builder/tagSchema.js` | Tag schemas, EVENT_TYPE_DESCRIPTIONS, TAGS_BY_EVENT_TYPE |
| `src/builder/eventBuilder.js` | Event template building + validateEvent |
| `src/builder/validateWorld.js` | Cross-event world validation |
| `scripts/world-review.js` | CLI world reviewer — compact narrative summary for LLM analysis: `node scripts/world-review.js <world.json>` |
| `src/builder/draftStore.js` | Draft persistence, import/export, bulk publish |
| `src/builder/components/EventEditor.jsx` | Generic event creation/edit form |
| `src/builder/components/TagEditor.jsx` | Data-driven tag editor + Tooltip component |
| `src/builder/components/BuildModeOverlay.jsx` | Annotated room view — exits, entities, + new dropdown |
| `src/builder/components/WorldCreator.jsx` | World creation panel |
| `src/builder/components/DraftListPanel.jsx` | Draft management panel |
| `src/builder/components/ui/InlineList.jsx` | Shared chip-tag input (aliases, tags, relays) |
| `src/builder/components/ui/DOSSelect.jsx` | Themed dropdown select |
| `src/builder/components/ui/DOSButton.jsx` | Themed button |
| `.claude/proposals.md` | Feature proposals — tracked ideas and their status |

---

## Tag Shape Reference

The spec is the full reference. These are the shapes most likely to be gotten wrong:

### requires / requires-not

Always event refs (a-tag format), never bare strings. Always exactly 4 elements:

```
["requires",     "<event-ref>", "<state-or-blank>", "<description-or-blank>"]
["requires-not", "<event-ref>", "<state-or-blank>", "<description-or-blank>"]
```

### on-interact — state guard at position 2

```
["on-interact", "<verb>", "<state-guard-or-blank>", "<action>", ...action-args]
```

Blank (`""`) = fires in any state. Named state = fires only when entity is in that state.

### on-counter — direction field required

```
["on-counter", "<down|up>", "<counter>", "<threshold>", "<action-type>", "<action-target?>"]
```

`down` fires at-or-below threshold; `up` fires at-or-above. Message comes from a `transition` tag, not the trigger.

---

## Parser Conventions

- **Verb aliases are data, not code.** The parser builds its verb map from `verb` tags on events in the current place + inventory. Aliases like `x` for `examine` must be on the verb tag: `["verb", "examine", "x", "look at", "inspect"]`. First value is canonical; `on-interact` always references the canonical verb.
- **One verb tag per canonical verb.** Don't combine multiple canonical verbs into one tag (e.g. `["verb", "examine", "pray"]` is wrong — use two separate verb tags).
- **Article stripping.** The client strips leading articles (`the`, `a`, `an`) from noun input. Noun tags should never include articles: `["noun", "lantern", "brass lantern"]` matches `the brass lantern`.
- **Two-noun commands.** `<verb> <noun> [preposition] <noun>` — `with` keeps order (target=noun1, instrument=noun2): `attack guard with sword`. Other prepositions swap (target=noun2, instrument=noun1): `use key on door`. Prepositions: `on`, `with`, `to`, `at`, `in`, `into`.
- **Built-in commands** (not data-driven): `look`/`l`, `look <direction>`, `examine`/`x`/`inspect`/`look at`, `inventory`/`i`, `help`/`h`/`?`, `quests`/`q`, `pick up`/`take`/`get`/`grab`, `attack <npc> [with <weapon>]`, `talk`/`speak`, direction words, `yes`/`no` (confirmation).

---

## Combat (spec section 2.12)

- NPC `set-state` writes to both `npcStates` and `player.states` so `requires` can check NPC state
- Use `on-health` (not `on-health-zero`) — supports `%` and absolute thresholds, direction field
- Use `on-player-health` (not `on-player-health-zero`) — on world event (global) or NPC (local)

---

## Trust Model (spec section 6)

### Collaboration modes and available client modes

| World `collaboration` | Available client modes |
|---|---|
| `closed` | canonical |
| `vouched` | canonical, community, explorer (vouchers only) |
| `open` | canonical, community |

### Trust levels per mode

| Trust Level | Canonical | Community | Explorer / Open+Community |
|---|---|---|---|
| Genesis / Collaborator | ✅ trusted | ✅ trusted | ✅ trusted |
| Vouched | ❌ hidden | ✅ trusted | ✅ trusted |
| Untrusted | ❌ hidden | ❌ hidden | ⚠️ unverified |

### Contested exit UI (spec section 6.7)

| Situation | `south` | `look south` |
|---|---|---|
| One trusted | Navigate immediately | Shows portal details |
| Multiple trusted | Disambiguation list | Full list |
| Trusted + unverified | Navigate trusted, `[+N unverified]` hint | Full list |
| Unverified only | Short list (max 5), choice + confirmation | Full list |

- `look <direction>` always shows all portals on a slot with trust indicators and pubkeys
- Unverified portals require yes/no confirmation before entry
- `cw` tags shown in `look <direction>` listing
- `resolveExitsWithTrust` returns `{ exits, hiddenByTrust }` — hidden exits available for `look`

---

## Tech Stack

- Vite 8, React 19, Tailwind CSS v4 (`@tailwindcss/postcss`)
- nostr-tools v2.12 (`Relay.connect`, `relay.subscribe`, `relay.publish`)
- Vitest for unit testing
- NIP-44 encryption/decryption for sealed content
- SHA-256 hash puzzles with salt

---

## Testing

- Run `npm test` (or `npx vitest run`) before committing — all tests must pass
- Run `npm run test:watch` during development for live feedback
- Tests live in `src/engine/__tests__/` and cover: player state, parser, world helpers, actions, engine integration, trust
- Test helpers in `__tests__/helpers.js` provide factory functions for building events and engine instances
- When adding new engine features, add corresponding tests
- **Preview testing:** When changes affect UI rendering or depend on live relay events (e.g. new event types, visual styling, trust mode switching), also test with a browser preview before committing
- **Build mode minimize:** The build overlay has a `[-]` toggle that collapses it to a single-line header. Use this when preview testing gameplay to see more game output. Click `[+]` to restore.
- **Preview input helper:** To send game commands from preview_eval, use this pattern:
  ```js
  // Setup (once per session):
  window._send = (cmd) => {
    const input = document.querySelector('input');
    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSet.call(input, cmd);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => {
      const form = input.closest('form');
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    }, 50);
  };
  window._read = () => [...document.querySelectorAll('p')].slice(-15).map(p => p.textContent.trim().substring(0, 120)).filter(Boolean);

  // Usage:
  window._send('look');
  // Then read output:
  window._read();
  ```

---

## Process

- Read the spec before implementing any new mechanic
- All world events must use tag shapes exactly as defined in the spec
- Discuss any proposed spec extensions before writing code
- **Keep docs in sync:** changes to the spec (`docs/spec/folklore-design.md`), authoring guide (`docs/authoring/folklore-authoring-guide.md`), or tag reference (`docs/authoring/tag-reference.md`) must be reflected in the other docs if applicable. Also update the spec changelog (`docs/spec/CHANGELOG.md`). **Guide pages** (`docs/guide/*.md`) that cover affected features must also be updated with new tag shapes, examples, and behaviour changes.
- The client should be event/data-driven — behaviour comes from tags, not hardcoded logic
- Test each phase with world content that exercises the new mechanic
- Run `npm test` to verify all engine tests pass before committing

## Git Workflow

- **Do not commit until the user says to.** You can suggest committing, but wait for the user to confirm. Never auto-commit.
- **Feature branches:** use `git rebase main` to sync with main, not `git merge main`. This keeps a linear history.
- Commit to main directly for small fixes. Use feature branches for larger work.
- Always push feature branches with `-u origin <branch>` on first push.
