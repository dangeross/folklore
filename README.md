# folklore

A decentralised text adventure engine built on [NOSTR](https://nostr.com). Worlds live on relays. Player identity is a keypair. Puzzle gates are enforced by cryptography, not servers.

→ **[flklr.com](https://flklr.com)** — play or build a world

---

## How it works

Worlds are graphs of NOSTR events. Each event represents a primitive — a place, a portal, an item, a puzzle — linked by [a-tag](https://github.com/nostr-protocol/nostr/blob/master/nips/01.md) references. The engine subscribes to a relay, loads all events for a world tag, and derives the game world entirely from the event graph. No database, no backend.

World authors publish events from their keypair. Other authors can contribute (portals, items, dialogue) under a trust model that lets the world owner control what appears to players.

---

## NOSTR

All game data is stored as `kind: 30078` [parameterised replaceable events](https://github.com/nostr-protocol/nostr/blob/master/nips/33.md). The `d` tag identifies each event uniquely within a world (e.g. `the-lake:place:clearing`). The `t` tag scopes events to a world slug. A-tag references (`30078:<pubkey>:<d-tag>`) always resolve to the latest version.

Player state is stored locally (localStorage) and can optionally be backed up as a NIP-44 encrypted event published to the player's own pubkey.

### NIPs implemented

| NIP | Usage |
|-----|-------|
| [NIP-01](https://github.com/nostr-protocol/nostr/blob/master/nips/01.md) | Basic protocol — event signing, relay connections, subscriptions |
| [NIP-07](https://github.com/nostr-protocol/nostr/blob/master/nips/07.md) | Browser extension signing (`window.nostr`) |
| [NIP-19](https://github.com/nostr-protocol/nostr/blob/master/nips/19.md) | `npub` / `nprofile` encoding for identity and profile links |
| [NIP-33](https://github.com/nostr-protocol/nostr/blob/master/nips/33.md) | Parameterised replaceable events (`kind: 30078`) |
| [NIP-44](https://github.com/nostr-protocol/nostr/blob/master/nips/44.md) | Encryption for sealed content (puzzle-gated places/clues, player state backups) |
| [NIP-47](https://github.com/nostr-protocol/nostr/blob/master/nips/47.md) | Nostr Wallet Connect for in-game Lightning payments |
| [NIP-51](https://github.com/nostr-protocol/nostr/blob/master/nips/51.md) | `kind: 30001` categorised list for world curation (`d: "folklore:worlds"`) |
| [NIP-57](https://github.com/nostr-protocol/nostr/blob/master/nips/57.md) | Zap receipts for tipping world authors |
| [NIP-65](https://github.com/nostr-protocol/nostr/blob/master/nips/65.md) | Relay list metadata — player's preferred relays for state backup |

Default relays: `wss://relay.primal.net`, `wss://nos.lol`. Worlds can specify additional relays via `relay` tags on the world event.

---

## Event types

All events are `kind: 30078` and carry a `["type", "<name>"]` tag.

| Type | Description |
|------|-------------|
| `world` | Root manifest — genesis pubkey, collaboration mode, theme colours, starting place, relays, player health |
| `place` | A location — exit slots, placed items/features/NPCs/clues, `on-enter`/`on-interact`/`on-drop` handlers |
| `portal` | Connection between two place exit slots — state machine, `requires` gates, transition text, one-way option |
| `item` | Portable entity — state machine, verbs, container behaviour, weapon stats |
| `feature` | Fixed place object — interactive with verbs and state, `on-interact` handlers |
| `clue` | Information piece — optionally NIP-44 sealed behind a puzzle key |
| `puzzle` | Player challenge — riddle (SHA-256 hash), sequence (requires chain), derived-key (NIP-44) |
| `quest` | Named goal — groups conditions, tracks completion, display types: `open`, `hidden`, `mystery`, `sequential`, `endgame` |
| `npc` | Actor — dialogue, combat stats, roaming routes, `on-encounter`/`on-attacked`/`on-health` triggers |
| `dialogue` | Single dialogue node — grouped by d-tag prefix, conditional display via `requires` |
| `recipe` | Item combination rule — `on-complete`/`on-fail` actions |
| `consequence` | Reusable named outcome — respawn, state clears, item transfers, damage |
| `payment` | Lightning payment gate — LNURL or static invoice, receipt item |
| `sound` | Strudel synthesis recipe — no audio files required, client-rendered via WebAudio |
| `vouch` | Delegated trust — extends trust chain to another pubkey |
| `revoke` | Revokes a vouch — cascades through the trust chain |

---

## Tag shapes

Full reference in [`docs/spec/folklore-design.md`](docs/spec/folklore-design.md). Key shapes:

```
["type",        "<event-type>"]
["d",           "<world-slug>:<type>:<name>"]
["t",           "<world-slug>"]
["title",       "<display name>"]

["exit",        "<30078:pubkey:d-tag>", "<slot>", "<description?>"]
["feature",     "<30078:pubkey:d-tag>"]
["item",        "<30078:pubkey:d-tag>"]
["npc",         "<30078:pubkey:d-tag>"]
["clue",        "<30078:pubkey:d-tag>"]

["requires",     "<event-ref>", "<state-or-blank>", "<description>"]
["requires-not", "<event-ref>", "<state-or-blank>", "<description>"]

["on-interact", "<verb>", "<state-guard>", "<action>", "<target?>", "<ext-ref?>"]
["on-enter",    "<entity-type>", "<state-guard>", "<action>", "<target?>", "<ext-ref?>"]
["on-move",     "<state-guard>", "<action>", "<target?>", "<ext-ref?>"]
["on-drop",     "<item-ref>", "<state-guard>", "<action>", "<target?>", "<ext-ref?>"]
["on-counter",  "<down|up>", "<counter>", "<threshold>", "<action>", "<target?>"]
["on-health",   "<down|up>", "<threshold>", "<action>", "<target?>", "<ext-ref?>"]
["on-complete", "", "<action>", "<target?>", "<ext-ref?>"]
```

### Action types

`set-state` · `give-item` · `consume-item` · `traverse` · `deal-damage` · `heal` · `activate` · `increment` · `decrement` · `set-counter` · `consequence` · `sound` · `steals-item` · `deposits` · `flees`

---

## Trust model

Collaboration is controlled by the `collaboration` tag on the world event.

| World mode | Available client modes |
|------------|----------------------|
| `closed` | `canonical` |
| `vouched` | `canonical`, `community`, `explorer` |
| `open` | `canonical`, `community` |

| Trust level | canonical | community | explorer |
|-------------|-----------|-----------|----------|
| Genesis / collaborator | ✅ trusted | ✅ trusted | ✅ trusted |
| Vouched author | ❌ hidden | ✅ trusted | ✅ trusted |
| Untrusted | ❌ hidden | ❌ hidden | ⚠️ unverified |

The trust chain is built from `vouch` events published by the genesis author or any author with `can-vouch: true`. Vouches can be revoked; revocation cascades through the chain. Unverified portals require player confirmation before entry. Multiple portals on the same exit slot create contested exits — players see all options with trust indicators.

---

## Engine

The engine (`src/engine/`) is a pure JS module — no DOM, no React — and is fully unit tested.

```
src/engine/
├── engine.js          # GameEngine class — command dispatch, room entry, movement
├── actions.js         # Action resolution — set-state, give-item, counters, ...
├── combat.js          # Combat mixin — attack, damage, health triggers
├── puzzle.js          # Puzzle mixin — riddle hash check, sequence eval, on-fail
├── npc.js             # NPC mixin — roaming, dialogue, encounter, stash
├── world.js           # World query helpers — requires check, exit resolution
├── parser.js          # Verb/noun parser — verb map from event tags, article strip
├── player-state.js    # PlayerStateMutator — synchronous state wrapper
├── trust.js           # Trust model — buildTrustSet, getTrustLevel, vouch chain
├── content.js         # Content rendering — markdown, media, NIP-44 decryption
├── nip44-client.js    # NIP-44 key derivation and encryption helpers
└── __tests__/         # Vitest unit tests (600+ test cases)
```

### Parser

Verb aliases are **data, not code** — the parser builds its verb map from `verb` tags on events in the current place and inventory. Built-in commands (`look`, `examine`, `inventory`, `help`, `attack`, `talk`, direction words) are always available. Two-noun commands use prepositions: `use key on door`, `attack guard with sword`.

### Puzzles

- **Riddle** — SHA-256(answer + salt); correct answer derives a NIP-44 key stored in player state, unlocking sealed content
- **Sequence** — auto-solved when all `requires` conditions pass; no answer input needed
- **Cipher** — same as riddle with on-fail damage support

---

## Client

```
src/
├── components/        # React UI — App, Lobby, AuthorProfile, WorldCard, ...
├── hooks/             # useRelay, usePlayerState, useWorldDiscovery, useWorldList, ...
├── services/          # router, theme, relayPool, sound, ...
├── builder/           # In-browser world builder — event editor, tag editor, draft store
└── engine/            # Engine (no React dependency)
```

Built with **Vite 8**, **React 19**, **Tailwind CSS v4**, **nostr-tools v2.12**.

Sound synthesis uses **[Strudel](https://strudel.cc)** (a TidalCycles-inspired live coding environment) running in-browser via WebAudio — no audio files, fully declarative from event tags.

The in-browser **world builder** (`src/builder/`) provides a GUI for creating and editing all event types, with a data-driven tag editor, live event preview, draft management, and bulk publish to relays.

---

## Lightning payments

`type: payment` events are Lightning payment gates. The player pays a [LNURL](https://github.com/lnurl/luds) invoice; on confirmation the engine fires `on-complete` — typically giving a receipt item that satisfies a `requires` condition on a portal or feature.

```json
["type",        "payment"],
["amount",      "1000"],
["unit",        "sats"],
["lnurl",       "lnurl1dp68gurn8..."],
["on-complete", "", "give-item", "30078:<pubkey>:the-lake:item:entry-token"]
```

**Flow:**
1. Client fetches LNURL-pay metadata, generates invoice
2. Stores `payment-hash` locally before the player pays
3. Displays invoice as QR code and copyable string
4. Polls the LUD-11 verify endpoint until `paid` or timeout
5. On `paid` → fires `on-complete`, adds receipt item to inventory

**Recovery:** on reload, any `pending` or `paid` (but not yet `complete`) payment attempt is re-verified using the stored hash. Handles crashes and interrupted sessions cleanly.

**Proof of payment:** the payment preimage in the player's wallet is unforgeable cryptographic proof. The stored hash is sufficient to query the verify endpoint.

### LUDs required by world authors

| LUD | Purpose |
|-----|---------|
| [LUD-01](https://github.com/lnurl/luds/blob/legacy/lnurl-rfc.md) | LNURL base encoding and request/response format |
| [LUD-06](https://github.com/lnurl/luds/blob/legacy/06.md) | `payRequest` — LNURL-pay invoice generation |
| [LUD-11](https://github.com/lnurl/luds/blob/legacy/11.md) | `verify` — payment status polling keyed on payment hash |

Authors must operate (or use) a LNURL server that supports these LUDs. If the verify endpoint goes offline, the payment gate becomes unsolvable for new players — treat LNURL infrastructure as a long-term hosting commitment.

---

## World curation

Any user can maintain a curated world list by publishing a `kind: 30001` event with `d: "folklore:worlds"` containing `a`-tag references to world events. This list is browsable on the user's profile page (`/u/<npub>`) and can be set as the lobby's featured list by configuring `VITE_APP_PUBKEY`.

---

## Developing

```bash
npm install
npm run dev        # dev server
npm test           # run all engine tests
npm run build      # production build
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `VITE_APP_PUBKEY` | Hex pubkey whose `kind:30001` list appears as the lobby featured list |

---

## Docs

| File | Contents |
|------|----------|
| [`docs/spec/folklore-design.md`](docs/spec/folklore-design.md) | Full design spec — canonical tag shapes, all mechanics |
| [`docs/spec/CHANGELOG.md`](docs/spec/CHANGELOG.md) | Schema changelog |
| [`docs/guide/`](docs/guide/) | World-building guide — 12 chapters covering every mechanic from basics to combat, sound, trust, and endgame |
| [`docs/authoring/folklore-authoring-guide.md`](docs/authoring/folklore-authoring-guide.md) | LLM world authoring guide |
| [`docs/authoring/tag-reference.md`](docs/authoring/tag-reference.md) | Complete tag reference |
| [`docs/worlds/`](docs/worlds/) | Importable world JSON files |
