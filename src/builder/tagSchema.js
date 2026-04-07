/**
 * tagSchema.js — Declarative schema for all NOSTR dungeon event tag shapes.
 *
 * Drives the TagEditor component. Adding a new tag type to the spec means
 * adding one entry to TAG_SCHEMAS and optionally updating TAGS_BY_EVENT_TYPE.
 *
 * Field types:
 *   'text'      — single-line string input
 *   'textarea'  — multi-line text input
 *   'select'    — dropdown from fixed options
 *   'event-ref' — searchable dropdown of known events, filterable by eventTypeFilter
 *   'number'    — numeric input
 *   'aliases'   — comma-separated aliases that expand into additional tag elements
 */

// All spec-defined action types (used as fallback for on-* trigger selects)
const ACTION_TYPES = [
  'set-state', 'traverse', 'give-item', 'consume-item',
  'deal-damage', 'deal-damage-npc', 'heal', 'consequence',
  'steals-item', 'deposits', 'flees',
  'add-counter', 'sub-counter', 'mul-counter', 'div-counter', 'set-counter',
  'decrement', 'increment', // deprecated — use add-counter / sub-counter
  'activate',
];

// Trigger × Action compatibility matrix from spec
// Each trigger only shows its valid action types in the dropdown
const COUNTER_ACTIONS = ['add-counter', 'sub-counter', 'mul-counter', 'div-counter', 'set-counter', 'decrement', 'increment'];

export const TRIGGER_ACTIONS = {
  'on-interact':           ['set-state', 'give-item', 'consume-item', 'traverse', 'deal-damage', 'deal-damage-npc', 'heal', 'consequence', ...COUNTER_ACTIONS, 'sound', 'activate'],
  'on-complete':           ['set-state', 'give-item', 'consume-item', 'traverse', 'heal', 'consequence', ...COUNTER_ACTIONS, 'sound', 'activate'],
  'on-enter':              ['set-state', 'give-item', 'consume-item', 'deal-damage', 'consequence', ...COUNTER_ACTIONS, 'sound'],
  'on-encounter':          ['set-state', 'deal-damage', 'consequence', 'steals-item', 'deposits', 'flees', ...COUNTER_ACTIONS, 'sound'],
  'on-attacked':           ['set-state', 'deal-damage', 'deal-damage-npc', 'consequence', 'steals-item', 'flees', ...COUNTER_ACTIONS, 'sound'],
  'on-fail':               ['set-state', 'deal-damage', 'consequence', ...COUNTER_ACTIONS, 'sound'],
  'on-health':             ['set-state', 'give-item', 'traverse', 'consequence', 'flees', 'deposits', 'sound'],
  'on-player-health':      ['set-state', 'traverse', 'consequence', 'sound'],
  'on-health-zero':        ['set-state', 'give-item', 'consequence', 'deposits', 'sound'],
  'on-player-health-zero': ['set-state', 'traverse', 'consequence', 'sound'],
  'on-move':               ['set-state', 'deal-damage', 'consequence', ...COUNTER_ACTIONS, 'sound'],
  'on-counter':            ['set-state', 'give-item', 'deal-damage', 'heal', 'consequence', 'sound'],
  'on-drop':               ['set-state', 'give-item', 'consume-item', 'decrement', 'increment', 'set-counter', 'consequence', 'sound'],
};

/**
 * Dynamic target field overrides based on selected action type.
 * When a trigger tag has an 'action' select, the 'target' field adapts.
 * Each entry defines the field type, placeholder, and optional filters.
 */
export const ACTION_TARGET_FIELD = {
  'set-state':      { type: 'text', placeholder: 'state name (e.g. open, lit, dead)', hidesEventRef: false },
  'traverse':       { type: 'event-ref', placeholder: 'portal to traverse', eventTypeFilter: 'portal', hidesEventRef: true },
  'give-item':      { type: 'event-ref', placeholder: 'item to give', eventTypeFilter: 'item', hidesEventRef: true },
  'consume-item':   { type: 'event-ref', placeholder: 'item to consume', eventTypeFilter: 'item', hidesEventRef: true },
  'steals-item':    { type: 'event-ref', placeholder: 'item to steal', eventTypeFilter: 'item', hidesEventRef: true },
  'deal-damage':    { type: 'number', placeholder: 'damage amount', hidesEventRef: true },
  'deal-damage-npc':{ type: 'event-ref', placeholder: 'target NPC (blank = current)', eventTypeFilter: 'npc', hidesEventRef: true },
  'heal':           { type: 'number', placeholder: 'heal amount', hidesEventRef: true },
  'consequence':    { type: 'event-ref', placeholder: 'consequence event', eventTypeFilter: 'consequence', hidesEventRef: true },
  'add-counter':    { type: 'text', placeholder: 'counter name', eventRefOverride: { type: 'text', placeholder: 'amount (e.g. 5)' } },
  'sub-counter':    { type: 'text', placeholder: 'counter name', eventRefOverride: { type: 'text', placeholder: 'amount (e.g. 5)' } },
  'mul-counter':    { type: 'text', placeholder: 'counter name', eventRefOverride: { type: 'text', placeholder: 'multiplier (e.g. 2)' } },
  'div-counter':    { type: 'text', placeholder: 'counter name', eventRefOverride: { type: 'text', placeholder: 'divisor (e.g. 2)' } },
  'set-counter':    { type: 'text', placeholder: 'counter name', eventRefOverride: { type: 'text', placeholder: 'value (e.g. 100)' } },
  'decrement':      { type: 'text', placeholder: 'counter name', hidesEventRef: true }, // deprecated
  'increment':      { type: 'text', placeholder: 'counter name', hidesEventRef: true }, // deprecated
  'deposits':       { type: 'text', placeholder: '(blank)', hidesEventRef: true },
  'flees':          { type: 'text', placeholder: '(blank)', hidesEventRef: true },
  'sound':          { type: 'text', placeholder: 'Strudel pattern (e.g. note("c3 e3 g3").s("sine"))', hidesEventRef: true },
};

/** Short descriptions for each event type — shown at the top of the editor */
export const EVENT_TYPE_DESCRIPTIONS = {
  place:       'A location in the world. Players move between places via portals. Add exits, features, items, and NPCs.',
  portal:      'A connection between two places. Declares direction slots and optional requirements for passage.',
  item:        'Something the player can pick up and carry. Declare verbs for how it can be used.',
  feature:     'An interactive object in a place. Can change state when the player uses verbs on it.',
  clue:        'Information revealed to the player. Often starts hidden and becomes visible through interaction.',
  puzzle:      'A challenge the player must solve. Riddles require typed answers; sequences auto-complete from state changes.',
  recipe:      'Defines how items combine to produce a new item. Player types the crafting verb to initiate.',
  payment:     'A Lightning payment gate. Player pays an invoice to unlock passage or receive an item.',
  npc:         'A character in the world. Can have dialogue, combat stats, inventory, and roaming routes.',
  dialogue:    'A single dialogue node — NPC spoken text with player choice options.',
  consequence: 'A reusable outcome (death, victory, curse). Fires respawn, clears state, gives/removes items.',
  sound:       'A named sound recipe. Defines note pattern, oscillator, and effects. Referenced by sound tags on other events.',
  world:       'The world manifest. Sets title, theme, starting place, player health, and collaboration mode.',
  vouch:       'A trust declaration — vouches for another author\'s content in this world.',
  quest:       'A named goal with completion conditions. Shows progress in the quest log.',
};

export const TAG_SCHEMAS = {
  // ── Identity tags ────────────────────────────────────────────────────────
  d:              { label: 'D-Tag', desc: 'Unique identifier for this event (auto-generated)', auto: true, fields: [{ name: 'value', type: 'text', required: true, placeholder: 'world:type:name' }] },
  t:              { label: 'World Tag', desc: 'World this event belongs to (auto-set)', auto: true, fields: [{ name: 'value', type: 'text', required: true, placeholder: 'the-lake' }] },
  type:           { label: 'Type', desc: 'Event type (auto-set from editor)', auto: true, fields: [{ name: 'value', type: 'select', required: true, options: ['place', 'portal', 'item', 'feature', 'clue', 'puzzle', 'recipe', 'payment', 'npc', 'dialogue', 'consequence', 'world', 'vouch', 'quest', 'sound', 'player-state'] }] },
  w:              { label: 'Protocol', desc: 'Protocol identifier for relay discovery (auto-set on world events)', auto: true, fields: [{ name: 'value', type: 'text', required: true, placeholder: 'folklore' }] },

  // ── Display ──────────────────────────────────────────────────────────────
  title:          { label: 'Title', desc: 'Display name shown to the player', fields: [{ name: 'value', type: 'text', required: true, placeholder: 'Display title' }] },
  'content-type': {
    label: 'Content Type',
    desc: 'Content is markdown by default. Use text/plain to disable formatting, or application/nip44 for sealed content.',
    fields: [
      { name: 'value', type: 'select', required: false, options: ['text/plain', 'application/nip44'] },
      { name: 'plaintext-format', type: 'select', required: false, options: ['', 'text/plain', 'text/markdown'], placeholder: 'Plaintext format (for NIP-44)' },
    ],
  },

  // ── Noun & Verb ──────────────────────────────────────────────────────────
  noun: {
    label: 'Noun',
    desc: 'Word the player types to refer to this thing, plus aliases',
    repeatable: true,
    fields: [
      { name: 'canonical', type: 'text', required: true, placeholder: 'key' },
      { name: 'aliases', type: 'aliases', required: false, placeholder: 'iron key, rusty key' },
    ],
  },
  verb: {
    label: 'Verb',
    desc: 'Custom verb the player can use on this thing, plus aliases',
    repeatable: true,
    fields: [
      { name: 'canonical', type: 'text', required: true, placeholder: 'examine' },
      { name: 'aliases', type: 'aliases', required: false, placeholder: 'x, look at, inspect' },
    ],
  },

  // ── State machine ────────────────────────────────────────────────────────
  state:      { label: 'Initial State', desc: 'Starting state for this entity\'s state machine', fields: [{ name: 'value', type: 'text', required: true, placeholder: 'off' }] },
  transition: {
    label: 'Transition',
    desc: 'State change rule: from → to, with optional text shown to player',
    repeatable: true,
    fields: [
      { name: 'from', type: 'text', required: true, placeholder: 'from state' },
      { name: 'to', type: 'text', required: true, placeholder: 'to state' },
      { name: 'text', type: 'text', required: false, placeholder: 'Transition text shown to player' },
    ],
  },

  // ── Counter ──────────────────────────────────────────────────────────────
  counter: {
    label: 'Counter',
    desc: 'Named numeric value that can be incremented/decremented by triggers',
    repeatable: true,
    fields: [
      { name: 'name', type: 'text', required: true, placeholder: 'battery' },
      { name: 'initial', type: 'number', required: true, placeholder: '300' },
    ],
  },

  // ── Requires ─────────────────────────────────────────────────────────────
  requires: {
    label: 'Requires',
    desc: 'Gate: player must hold/have this item or feature in the given state',
    repeatable: true,
    fields: [
      { name: 'ref', type: 'event-ref', required: true },
      { name: 'state', type: 'text', required: false, placeholder: 'state or blank' },
      { name: 'desc', type: 'text', required: false, placeholder: 'Failure message' },
    ],
  },
  'requires-not': {
    label: 'Requires Not',
    desc: 'Gate: player must NOT hold/have this item or feature in the given state',
    repeatable: true,
    fields: [
      { name: 'ref', type: 'event-ref', required: true },
      { name: 'state', type: 'text', required: false, placeholder: 'state or blank' },
      { name: 'desc', type: 'text', required: false, placeholder: 'Failure message' },
    ],
  },

  // ── Exit (place variant: slot-only; portal variant: place-ref + slot + label) ─
  exit: {
    label: 'Exit',
    desc: 'Direction slot (on places) or connection to a destination place (on portals)',
    repeatable: true,
    variants: {
      place: {
        fields: [{ name: 'slot', type: 'text', required: true, placeholder: 'north' }],
      },
      portal: {
        fields: [
          { name: 'place-ref', type: 'event-ref', required: true, eventTypeFilter: 'place' },
          { name: 'slot', type: 'text', required: false, placeholder: 'north (blank for traverse-only hidden portals)' },
          { name: 'label', type: 'text', required: false, placeholder: 'A dark passage leads north...' },
        ],
      },
    },
  },

  // ── Entity references (on places) ────────────────────────────────────────
  item:    { label: 'Item Ref', desc: 'Place an item in this location', repeatable: true, fields: [{ name: 'ref', type: 'event-ref', required: true, eventTypeFilter: 'item' }] },
  feature: { label: 'Feature Ref', desc: 'Place an interactive feature in this location', repeatable: true, fields: [{ name: 'ref', type: 'event-ref', required: true, eventTypeFilter: 'feature' }] },
  npc:     { label: 'NPC Ref', desc: 'Place an NPC in this location', repeatable: true, fields: [{ name: 'ref', type: 'event-ref', required: true, eventTypeFilter: 'npc' }] },
  clue:    { label: 'Clue Ref', desc: 'Place a clue in this location', repeatable: true, fields: [{ name: 'ref', type: 'event-ref', required: true, eventTypeFilter: 'clue' }] },

  // ── Triggers ─────────────────────────────────────────────────────────────
  'on-interact': {
    label: 'On Interact',
    desc: 'Fires an action when the player uses a verb on this entity. State guard gates which actions fire based on the entity\'s current state (blank = any state).',
    repeatable: true,
    fields: [
      { name: 'verb', type: 'text', required: true, placeholder: 'verb (e.g. examine, pull, insert)' },
      { name: 'state-guard', type: 'text', required: false, placeholder: 'state guard (blank = any)' },
      { name: 'action', type: 'select', required: true, options: TRIGGER_ACTIONS['on-interact'] },
      { name: 'target', type: 'text', required: false, placeholder: 'action target (state, amount, etc.)' },
      { name: 'event-ref', type: 'event-ref', required: false, placeholder: 'target event (blank = self)' },
    ],
  },
  'on-enter': {
    label: 'On Enter',
    desc: 'Fires an action when the player enters this place or encounters this NPC',
    repeatable: true,
    fields: [
      { name: 'trigger', type: 'text', required: false, placeholder: 'blank = any player' },
      { name: 'state-guard', type: 'text', required: false, placeholder: 'state guard (blank = any state)' },
      { name: 'action', type: 'select', required: true, options: TRIGGER_ACTIONS['on-enter'] },
      { name: 'target', type: 'text', required: false, placeholder: 'action target' },
      { name: 'event-ref', type: 'event-ref', required: false, placeholder: 'target event (blank = self)' },
    ],
  },
  'on-encounter': {
    label: 'On Encounter',
    desc: 'Fires when an entity enters this NPC\'s place. "player" = player only, blank = any entity, or set an NPC ref for NPC-on-NPC encounters.',
    repeatable: true,
    fields: [
      { name: 'filter', type: 'event-ref', required: false, eventTypeFilter: 'npc', placeholder: 'any entity (default)', prefixOptions: [{ value: '', label: 'Any entity (default)' }, { value: 'player', label: 'Player only' }] },
      { name: 'action', type: 'select', required: true, options: TRIGGER_ACTIONS['on-encounter'] },
      { name: 'target', type: 'text', required: false, placeholder: 'damage amount, state, or ref' },
      { name: 'event-ref', type: 'event-ref', required: false, placeholder: 'external target (blank = self)' },
    ],
  },
  'on-attacked': {
    label: 'On Attacked',
    desc: 'Fires when this NPC is attacked. Blank = any item. Set an item ref to fire only when attacked with that specific item (e.g. silver sword vulnerability, magic wand effect).',
    repeatable: true,
    fields: [
      { name: 'weapon-filter', type: 'event-ref', required: false, eventTypeFilter: 'item', placeholder: 'item filter (blank = any)' },
      { name: 'action', type: 'select', required: true, options: TRIGGER_ACTIONS['on-attacked'] },
      { name: 'target', type: 'text', required: false, placeholder: 'damage amount or state' },
      { name: 'event-ref', type: 'event-ref', required: false, placeholder: 'external target (blank = self)' },
    ],
  },
  'on-health': {
    label: 'On Health',
    desc: 'Fires when this NPC\'s health crosses a threshold. Supports absolute values or percentages (e.g. "50%").',
    repeatable: true,
    fields: [
      { name: 'direction', type: 'select', required: true, options: ['down', 'up'] },
      { name: 'threshold', type: 'text', required: true, placeholder: '0, 3, or 50%' },
      { name: 'action', type: 'select', required: true, options: TRIGGER_ACTIONS['on-health'] },
      { name: 'target', type: 'text', required: false, placeholder: 'state or target' },
      { name: 'event-ref', type: 'event-ref', required: false, placeholder: 'target event (blank = self)' },
    ],
  },
  'on-player-health': {
    label: 'On Player Health',
    desc: 'Fires when player health crosses a threshold. On world event = global, on NPC = local to that place.',
    repeatable: true,
    fields: [
      { name: 'direction', type: 'select', required: true, options: ['down', 'up'] },
      { name: 'threshold', type: 'text', required: true, placeholder: '0, 2, or 30%' },
      { name: 'action', type: 'select', required: true, options: TRIGGER_ACTIONS['on-player-health'] },
      { name: 'target', type: 'text', required: false, placeholder: 'consequence ref or state' },
    ],
  },
  // Legacy aliases (backwards compat)
  'on-health-zero': {
    label: 'On Health Zero (legacy)',
    desc: 'Legacy — use "On Health" with threshold "0" instead',
    repeatable: true,
    fields: [
      { name: 'blank', type: 'text', required: false, placeholder: '(blank)' },
      { name: 'action', type: 'select', required: true, options: TRIGGER_ACTIONS['on-health-zero'] },
      { name: 'target', type: 'text', required: false, placeholder: 'state or target' },
      { name: 'event-ref', type: 'event-ref', required: false, placeholder: 'target event (blank = self)' },
    ],
  },
  'on-player-health-zero': {
    label: 'On Player Health Zero (legacy)',
    desc: 'Legacy — use "On Player Health" with threshold "0" instead',
    repeatable: true,
    fields: [
      { name: 'blank', type: 'text', required: false, placeholder: '(blank)' },
      { name: 'action', type: 'select', required: true, options: TRIGGER_ACTIONS['on-player-health-zero'] },
      { name: 'target', type: 'text', required: false, placeholder: 'consequence ref or state' },
    ],
  },
  'on-move': {
    label: 'On Move',
    desc: 'Fires an action each time the player moves. On items: fires while item is in inventory. On world: fires globally (use for move counters, cave-closing timers, etc.). State guard is optional — blank fires on every move.',
    repeatable: true,
    fields: [
      { name: 'state-guard', type: 'text', required: false, placeholder: 'state or blank' },
      { name: 'action', type: 'select', required: true, options: TRIGGER_ACTIONS['on-move'] },
      { name: 'target', type: 'text', required: false },
      { name: 'event-ref', type: 'event-ref', required: false, placeholder: 'target event (blank = self)' },
    ],
  },
  'on-counter': {
    label: 'On Counter',
    desc: 'Fires an action when a counter crosses a threshold in the declared direction',
    repeatable: true,
    fields: [
      { name: 'direction', type: 'select', required: true, options: ['down', 'up'] },
      { name: 'counter', type: 'text', required: true, placeholder: 'battery' },
      { name: 'threshold', type: 'number', required: true, placeholder: '0' },
      { name: 'action', type: 'select', required: true, options: TRIGGER_ACTIONS['on-counter'] },
      { name: 'target', type: 'text', required: false },
    ],
  },
  'on-drop': {
    label: 'On Drop',
    desc: 'Fires when an item is dropped here. On a place: fires when item lands in this room (plain drop). On a feature: fires only when the feature is explicitly targeted ("drop X in/on Y"). Item filter (blank = any item). State guard gates on the entity\'s own state.',
    repeatable: true,
    fields: [
      { name: 'item-ref', type: 'event-ref', required: false, eventTypeFilter: 'item', placeholder: 'item filter (blank = any)' },
      { name: 'state-guard', type: 'text', required: false, placeholder: 'state guard (blank = any)' },
      { name: 'action', type: 'select', required: true, options: TRIGGER_ACTIONS['on-drop'] },
      { name: 'target', type: 'text', required: false, placeholder: 'action target (state, amount, etc.)' },
      { name: 'event-ref', type: 'event-ref', required: false, placeholder: 'target event (blank = self)' },
    ],
  },
  'on-fail': {
    label: 'On Fail',
    desc: 'Fires when a wrong answer is given. Only valid on riddle and cipher puzzles. Pairs with a counter for attempt limits.',
    repeatable: true,
    fields: [
      { name: 'blank', type: 'text', required: false, hidden: true },
      { name: 'action', type: 'select', required: true, options: ['set-state', 'deal-damage', 'consequence', 'decrement', 'increment', 'set-counter'] },
      { name: 'target', type: 'text', required: false, placeholder: 'damage, state, or counter name' },
      { name: 'event-ref', type: 'event-ref', required: false, placeholder: 'external target (blank = self)' },
    ],
  },
  'on-complete': {
    label: 'On Complete',
    desc: 'Fires an action when a puzzle or recipe is completed',
    repeatable: true,
    fields: [
      { name: 'blank', type: 'text', required: false, hidden: true },
      { name: 'action', type: 'select', required: true, options: TRIGGER_ACTIONS['on-complete'] },
      { name: 'target', type: 'text', required: false },
    ],
  },

  // ── Media ────────────────────────────────────────────────────────────────
  media: {
    label: 'Media',
    desc: 'Embedded content block: ANSI art, markdown, or image URL',
    repeatable: true,
    fields: [
      { name: 'mime', type: 'select', required: true, options: ['text/plain', 'text/x-ansi', 'text/markdown', 'image/url'] },
      { name: 'value', type: 'textarea', required: true, placeholder: 'Content or URL' },
    ],
  },

  // ── Dialogue ─────────────────────────────────────────────────────────────
  dialogue: {
    label: 'Dialogue Ref',
    desc: 'Link to a dialogue node, optionally gated by a requires condition',
    repeatable: true,
    fields: [
      { name: 'node-ref', type: 'event-ref', required: true, eventTypeFilter: 'dialogue' },
      { name: 'requires-ref', type: 'event-ref', required: false },
      { name: 'state', type: 'text', required: false },
    ],
  },
  option: {
    label: 'Dialogue Option',
    desc: 'A choice the player can select during dialogue',
    repeatable: true,
    fields: [
      { name: 'label', type: 'text', required: true, placeholder: 'Option text' },
      { name: 'next-ref', type: 'event-ref', required: false, eventTypeFilter: 'dialogue' },
    ],
  },
  'on-option': {
    label: 'On Option',
    desc: 'Fire an action when the player selects a specific dialogue option. Matches by option label.',
    repeatable: true,
    fields: [
      { name: 'option-label', type: 'text', required: true, placeholder: 'Exact option label text' },
      { name: 'action', type: 'select', required: true, options: ['set-state', 'give-item', 'consume-item', 'consequence', 'sound', 'deal-damage', 'heal', 'increment', 'decrement', 'set-counter'] },
      { name: 'target', type: 'text', required: false },
      { name: 'ext-ref', type: 'event-ref', required: false },
    ],
  },
  text: { label: 'Dialogue Text', desc: 'The NPC\'s spoken text in this dialogue node', fields: [{ name: 'value', type: 'textarea', required: true, placeholder: 'NPC dialogue text' }] },

  // ── Puzzle ───────────────────────────────────────────────────────────────
  'puzzle-type': { label: 'Puzzle Type', desc: 'Category of puzzle mechanic', fields: [{ name: 'value', type: 'select', required: true, options: ['riddle', 'sequence', 'cipher', 'observe'] }] },
  'answer-hash': { label: 'Answer Hash', desc: 'SHA-256 hash of (salt + answer) — keeps the answer secret on relays', fields: [{ name: 'value', type: 'text', required: true, placeholder: 'SHA-256 hash' }] },
  salt:          { label: 'Salt', desc: 'Random salt prepended to the answer before hashing', fields: [{ name: 'value', type: 'text', required: true }] },
  ordered:       { label: 'Ordered', desc: 'Whether sequence puzzle steps must be completed in order', fields: [{ name: 'value', type: 'select', required: true, options: ['true', 'false'] }] },

  // ── NPC movement ─────────────────────────────────────────────────────────
  speed: {
    label: 'Speed',
    desc: 'NPC roaming speed (turns) or sample playback speed',
    variants: {
      npc: { fields: [{ name: 'value', type: 'number', required: true, placeholder: '3' }], desc: 'Moves every N player turns' },
      sound: { fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }], desc: 'Playback speed. 1 = normal, 2 = double, -1 = reverse.' },
    },
    fields: [{ name: 'value', type: 'number', required: true, placeholder: '3' }],
  },
  'max-inventory': { label: 'Max Inventory', desc: 'Inventory carry cap — blocks pickup when exceeded', fields: [{ name: 'max', type: 'number', required: true, placeholder: '6' }, { name: 'message', type: 'text', required: false, placeholder: "You're carrying too much." }] },
  hud: { label: 'HUD', desc: 'Persistent display — {{counter-name}} interpolation for player counters', repeatable: true, fields: [{ name: 'template', type: 'text', required: true, placeholder: 'Score: {{score}} | Moves: {{moves}}' }] },
  map: { label: 'Map', desc: 'Enable in-game map overlay. "fog" = visited places only; "full" = also shows unnamed adjacent unvisited nodes', fields: [{ name: 'mode', type: 'select', required: true, options: ['fog', 'full'] }] },
  'on-inventory-full': {
    label: 'On Inventory Full',
    desc: 'Fires when pickup is blocked by max-inventory (world event only)',
    repeatable: true,
    fields: [
      { name: 'blank', type: 'text', required: false, hidden: true },
      { name: 'action', type: 'select', required: true, options: TRIGGER_ACTIONS['on-complete'] },
      { name: 'target', type: 'text', required: false, placeholder: 'action target' },
      { name: 'event-ref', type: 'event-ref', required: false, placeholder: 'target event (blank = self)' },
    ],
  },
  'roam-type': { label: 'Roam Type', desc: 'Route traversal: route (sequential waypoints, default) or random (random from pool each tick)', fields: [{ name: 'value', type: 'select', required: true, options: ['route', 'random'] }] },
  order:       { label: 'Order (deprecated)', desc: 'Deprecated — use roam-type instead', fields: [{ name: 'value', type: 'select', required: true, options: ['sequential', 'random'] }] },
  route:       { label: 'Route', desc: 'A place this NPC visits when roaming', repeatable: true, fields: [{ name: 'ref', type: 'event-ref', required: true, eventTypeFilter: 'place' }] },
  stash:       { label: 'Stash', desc: 'Place where the NPC deposits stolen items', fields: [{ name: 'ref', type: 'event-ref', required: true, eventTypeFilter: 'place' }] },
  'roams-when':{ label: 'Roams When', desc: 'NPC only roams when in this state', fields: [{ name: 'state', type: 'text', required: true }] },
  inventory:   { label: 'Inventory', desc: 'Item the NPC starts with or can carry', repeatable: true, fields: [{ name: 'ref', type: 'event-ref', required: true, eventTypeFilter: 'item' }] },

  // ── Combat ───────────────────────────────────────────────────────────────
  health:       { label: 'Health', desc: 'Hit points (NPC or player starting health on world event)', fields: [{ name: 'value', type: 'number', required: true }] },
  'max-health': { label: 'Max Health', desc: 'Maximum hit points (world event — player health ceiling)', fields: [{ name: 'value', type: 'number', required: true }] },
  damage:       { label: 'Damage', desc: 'Damage dealt per hit (NPC or weapon item)', fields: [{ name: 'value', type: 'number', required: true }] },
  'hit-chance': { label: 'Hit Chance', desc: 'Probability of landing a hit (0.0–1.0)', fields: [{ name: 'value', type: 'text', required: false, placeholder: '0.0-1.0' }] },

  // ── Consequence ──────────────────────────────────────────────────────────
  respawn:     { label: 'Respawn', desc: 'Place the player respawns at after this consequence', fields: [{ name: 'ref', type: 'event-ref', required: true, eventTypeFilter: 'place' }] },
  clears:      { label: 'Clears', desc: 'Player state category to wipe on consequence (e.g. inventory, states)', repeatable: true, fields: [{ name: 'key', type: 'select', required: true, options: ['inventory', 'states', 'counters', 'cryptoKeys', 'dialogueVisited', 'paymentAttempts', 'visited'] }] },
  consequence: { label: 'Consequence Ref', desc: 'Link to a consequence event triggered on portal traversal', fields: [{ name: 'ref', type: 'event-ref', required: true, eventTypeFilter: 'consequence' }] },

  // ── Payment ──────────────────────────────────────────────────────────────
  amount: { label: 'Amount', desc: 'Lightning payment amount', fields: [{ name: 'value', type: 'number', required: true }] },
  unit:   { label: 'Unit', desc: 'Payment denomination: sats or msats', fields: [{ name: 'value', type: 'select', required: true, options: ['sats', 'msats'] }] },
  lnurl:  { label: 'LNURL / Lightning Address', desc: 'Lightning address or LNURL for receiving payment', fields: [{ name: 'value', type: 'text', required: true, placeholder: 'user@domain.com or lnurl1...' }] },

  // ── Contains (items within items) ────────────────────────────────────────
  contains: {
    label: 'Contains',
    desc: 'Item inside this container. Accessible via "take X from Y". Optional state gate (e.g. only when chest is open).',
    repeatable: true,
    fields: [
      { name: 'ref', type: 'event-ref', required: true, eventTypeFilter: 'item' },
      { name: 'state', type: 'text', required: false, placeholder: 'required state (blank = always)' },
      { name: 'fail-msg', type: 'text', required: false, placeholder: 'failure message' },
    ],
  },

  // ── Sound ──────────────────────────────────────────────────────────────
  sound: {
    label: 'Sound',
    desc: 'Play a sound event. Role: ambient (loop), layer (adds to mix), effect (one-shot). Volume 0.0-1.0. Optional state gate.',
    repeatable: true,
    fields: [
      { name: 'sound-ref', type: 'event-ref', required: true, placeholder: 'sound event to play', eventTypeFilter: 'sound' },
      { name: 'role', type: 'select', required: true, options: ['ambient', 'layer', 'effect'] },
      { name: 'volume', type: 'text', required: true, placeholder: '0.0-1.0' },
      { name: 'state', type: 'text', required: false, placeholder: 'state gate (blank = always)' },
    ],
  },

  // ── Sound event tags ──────────────────────────────────────────────────
  // Source
  note:         { label: 'Note', desc: 'Mini-notation note pattern. First in the Strudel chain. Examples: c3 e3 g3, c2*4, c3 ~ ~ ~', fields: [{ name: 'pattern', type: 'text', required: true, placeholder: 'c3 e3 g3' }] },
  s:            { label: 'Sound Source', desc: 'Sound source (primary name). Built-in: sine, triangle, sawtooth, square. With samples loaded: piano, bass, bd, sd, hh, etc.', fields: [{ name: 'type', type: 'text', required: true, placeholder: 'sine' }] },
  oscillator:   { label: 'Oscillator', desc: 'Sound source (alias for s). Built-in: sine, triangle, sawtooth, square. With samples loaded: piano, bass, bd, sd, hh, etc.', fields: [{ name: 'type', type: 'text', required: true, placeholder: 'sine' }] },
  // Volume & timing (text type to allow Strudel mini-notation e.g. "0.5 0.25")
  gain:         { label: 'Gain', desc: 'Volume (0.0–1.0). Supports mini-notation: "0.5 0.25" alternates.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.5' }] },
  slow:         { label: 'Slow', desc: 'Stretch time. 2 = half speed, 4 = quarter speed.', fields: [{ name: 'factor', type: 'text', required: true, placeholder: '2' }] },
  fast:         { label: 'Fast', desc: 'Compress time. 2 = double speed, 4 = quadruple speed.', fields: [{ name: 'factor', type: 'text', required: true, placeholder: '2' }] },
  pan:          { label: 'Pan', desc: 'Stereo position. -1 = left, 0 = centre, 1 = right.', fields: [{ name: 'position', type: 'text', required: true, placeholder: '0' }] },
  // Filters
  lpf:          { label: 'Low-pass Filter', desc: 'Cutoff frequency (Hz). Supports mini-notation: "600 250".', fields: [{ name: 'freq', type: 'text', required: true, placeholder: '400' }] },
  hpf:          { label: 'High-pass Filter', desc: 'Cutoff frequency (Hz). Supports mini-notation.', fields: [{ name: 'freq', type: 'text', required: true, placeholder: '1000' }] },
  vowel:        { label: 'Vowel', desc: 'Formant filter — shapes sound to vocal vowels. Single or pattern: a e i o u', fields: [{ name: 'pattern', type: 'text', required: true, placeholder: 'a e i o' }] },
  // Distortion
  crush:        { label: 'Crush', desc: 'Bit crush for lo-fi texture. 1 = most crushed, 16 = least.', fields: [{ name: 'bits', type: 'text', required: true, placeholder: '8' }] },
  shape:        { label: 'Shape', desc: 'Soft distortion/saturation. 0 = clean, 1 = aggressive.', fields: [{ name: 'amount', type: 'text', required: true, placeholder: '0.5' }] },
  // Effects
  room:         { label: 'Room', desc: 'Reverb wet/dry (0–1). Supports mini-notation: "0.7 0.5".', fields: [{ name: 'amount', type: 'text', required: true, placeholder: '0.5' }] },
  roomsize:     { label: 'Room Size', desc: 'Reverb room size (1–10). Only meaningful with room > 0.', fields: [{ name: 'size', type: 'text', required: true, placeholder: '4' }] },
  delay:        { label: 'Delay', desc: 'Echo effect. Time = spacing (0–1), feedback = repeats (0–1).', fields: [{ name: 'time', type: 'text', required: true, placeholder: '0.5' }, { name: 'feedback', type: 'text', required: true, placeholder: '0.3' }] },
  rev:          { label: 'Reverse', desc: 'Reverse the pattern order within each cycle. No value needed.', fields: [] },
  palindrome:   { label: 'Palindrome', desc: 'Play pattern forward then backward — mirrored loop. No value needed.', fields: [] },
  // Texture & randomness
  'degrade-by': { label: 'Degrade By', desc: 'Randomly drop events each cycle (0.0–1.0). 0.3 = ~30% dropped.', fields: [{ name: 'amount', type: 'text', required: true, placeholder: '0.3' }] },
  // Stereo & layering
  jux:          { label: 'Jux', desc: 'Stereo width — normal in left, reversed in right.', fields: [{ name: 'fn', type: 'select', required: true, options: ['rev'] }] },
  arp:          { label: 'Arpeggio', desc: 'Arpeggiate chords. up = low-high, down = high-low.', fields: [{ name: 'direction', type: 'select', required: true, options: ['up', 'down', 'updown'] }] },
  // Envelope
  sustain:      { label: 'Sustain', desc: 'Note duration in seconds. Supports mini-notation: "0.6 1.0".', fields: [{ name: 'value', type: 'text', required: true, placeholder: '2' }] },
  attack:       { label: 'Attack', desc: 'Fade-in time in seconds. Supports mini-notation: "0.4 0.1".', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  release:      { label: 'Release', desc: 'Fade-out time in seconds. Supports mini-notation: "1.2 1.5".', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  // Sample
  sample:       { label: 'Sample', desc: 'Register external audio file by name. Use the name in note patterns.', repeatable: true, fields: [{ name: 'name', type: 'text', required: true, placeholder: 'kick' }, { name: 'url', type: 'text', required: true, placeholder: 'https://...' }] },
  // Filters (extended)
  bpf:          { label: 'Bandpass Filter', desc: 'Bandpass filter center frequency (Hz). Supports mini-notation.', fields: [{ name: 'freq', type: 'text', required: true, placeholder: '1000' }] },
  bpq:          { label: 'Bandpass Q', desc: 'Bandpass filter Q (resonance). Higher = narrower band.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  lpq:          { label: 'Lowpass Q', desc: 'Lowpass filter resonance (0-50). Boosts frequencies near cutoff.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  hpq:          { label: 'Highpass Q', desc: 'Highpass filter resonance (0-50). Boosts frequencies near cutoff.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  ftype:        { label: 'Filter Type', desc: 'Filter circuit type: 12db, ladder, 24db.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '12db' }] },
  // ADSR (extended)
  decay:        { label: 'Decay', desc: 'Decay time in seconds. Time from peak to sustain level.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  // Filter envelope — LP
  lpenv:        { label: 'LP Env Depth', desc: 'Lowpass filter envelope depth in Hz.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '4000' }] },
  lpattack:     { label: 'LP Env Attack', desc: 'LP filter envelope attack time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.01' }] },
  lpdecay:      { label: 'LP Env Decay', desc: 'LP filter envelope decay time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  lpsustain:    { label: 'LP Env Sustain', desc: 'LP filter envelope sustain level (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.5' }] },
  lprelease:    { label: 'LP Env Release', desc: 'LP filter envelope release time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  // Filter envelope — HP
  hpenv:        { label: 'HP Env Depth', desc: 'Highpass filter envelope depth in Hz.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '4000' }] },
  hpattack:     { label: 'HP Env Attack', desc: 'HP filter envelope attack time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.01' }] },
  hpdecay:      { label: 'HP Env Decay', desc: 'HP filter envelope decay time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  hpsustain:    { label: 'HP Env Sustain', desc: 'HP filter envelope sustain level (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.5' }] },
  hprelease:    { label: 'HP Env Release', desc: 'HP filter envelope release time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  // Filter envelope — BP
  bpenv:        { label: 'BP Env Depth', desc: 'Bandpass filter envelope depth in Hz.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '4000' }] },
  bpattack:     { label: 'BP Env Attack', desc: 'BP filter envelope attack time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.01' }] },
  bpdecay:      { label: 'BP Env Decay', desc: 'BP filter envelope decay time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  bpsustain:    { label: 'BP Env Sustain', desc: 'BP filter envelope sustain level (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.5' }] },
  bprelease:    { label: 'BP Env Release', desc: 'BP filter envelope release time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  fanchor:      { label: 'Filter Anchor', desc: 'Filter envelope anchor point.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.5' }] },
  // Pitch envelope
  penv:         { label: 'Pitch Env Depth', desc: 'Pitch envelope depth in semitones.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '12' }] },
  pattack:      { label: 'Pitch Env Attack', desc: 'Pitch envelope attack time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.01' }] },
  pdecay:       { label: 'Pitch Env Decay', desc: 'Pitch envelope decay time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  prelease:     { label: 'Pitch Env Release', desc: 'Pitch envelope release time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  pcurve:       { label: 'Pitch Curve', desc: 'Pitch envelope curve. 0 = linear, 1 = exponential.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0' }] },
  panchor:      { label: 'Pitch Anchor', desc: 'Pitch envelope anchor point (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0' }] },
  // FM synthesis
  fm:           { label: 'FM Index', desc: 'FM modulation index. Higher = more harmonics.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '2' }] },
  fmh:          { label: 'FM Harmonicity', desc: 'FM harmonicity ratio. Integer = harmonic, fractional = inharmonic.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  fmattack:     { label: 'FM Env Attack', desc: 'FM envelope attack time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.01' }] },
  fmdecay:      { label: 'FM Env Decay', desc: 'FM envelope decay time (seconds).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  fmsustain:    { label: 'FM Env Sustain', desc: 'FM envelope sustain level (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0' }] },
  fmenv:        { label: 'FM Env Type', desc: 'FM envelope type: lin (linear) or exp (exponential).', fields: [{ name: 'value', type: 'text', required: true, placeholder: 'lin' }] },
  // Vibrato
  vib:          { label: 'Vibrato Freq', desc: 'Vibrato frequency in Hz.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '5' }] },
  vibmod:       { label: 'Vibrato Depth', desc: 'Vibrato depth in semitones.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.5' }] },
  // Tremolo
  tremolodepth: { label: 'Tremolo Depth', desc: 'Tremolo depth (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.5' }] },
  tremolosync:  { label: 'Tremolo Speed', desc: 'Tremolo speed in cycles.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '4' }] },
  tremoloskew:  { label: 'Tremolo Skew', desc: 'Tremolo waveform skew (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.5' }] },
  tremolophase: { label: 'Tremolo Phase', desc: 'Tremolo phase offset.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0' }] },
  tremoloshape: { label: 'Tremolo Shape', desc: 'Tremolo waveform shape: tri, square, sine, saw, ramp.', fields: [{ name: 'value', type: 'text', required: true, placeholder: 'sine' }] },
  // Distortion (extended)
  distort:      { label: 'Distort', desc: 'Waveshaping distortion amount.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  coarse:       { label: 'Coarse', desc: 'Sample rate reduction factor. Higher = more lo-fi.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '4' }] },
  // Dynamics
  velocity:     { label: 'Velocity', desc: 'Velocity (0-1). Scales volume and brightness.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  postgain:     { label: 'Post Gain', desc: 'Post-effects gain multiplier.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  compressor:   { label: 'Compressor', desc: 'Dynamics compressor amount.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  // Sample manipulation
  n:            { label: 'Sample N', desc: 'Sample variant index (selects from sample bank).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0' }] },
  begin:        { label: 'Begin', desc: 'Sample start point (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0' }] },
  end:          { label: 'End', desc: 'Sample end point (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  cut:          { label: 'Cut Group', desc: 'Cut group number. Sounds in the same group cut each other off.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  loop:         { label: 'Loop', desc: 'Enable sample looping (0 = off, 1 = on).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  'loop-begin':    { label: 'Loop Begin', desc: 'Loop start point (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0' }] },
  'loop-end':      { label: 'Loop End', desc: 'Loop end point (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  'loop-at':       { label: 'Loop At', desc: 'Fit sample to N cycles.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  clip:         { label: 'Clip', desc: 'Signal clipping / legato mode.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  chop:         { label: 'Chop', desc: 'Divide sample into N equal parts.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '4' }] },
  striate:      { label: 'Striate', desc: 'Progressive slice playback. Like chop but with overlap.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '4' }] },
  fit:          { label: 'Fit', desc: 'Match sample duration to event length.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  // Effects (extended)
  delaytime:    { label: 'Delay Time', desc: 'Delay time (0-1). Supports mini-notation.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.25' }] },
  delayfeedback:{ label: 'Delay Feedback', desc: 'Delay feedback amount (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.5' }] },
  roomfade:     { label: 'Room Fade', desc: 'Reverb fade time.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.5' }] },
  roomlp:       { label: 'Room LP', desc: 'Reverb lowpass frequency. Darkens reverb tail.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '8000' }] },
  roomdim:      { label: 'Room Dim', desc: 'Reverb damping frequency.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '8000' }] },
  phaser:       { label: 'Phaser', desc: 'Phaser speed (rate in Hz).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  phaserdepth:  { label: 'Phaser Depth', desc: 'Phaser depth (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.5' }] },
  phasercenter: { label: 'Phaser Center', desc: 'Phaser center frequency (Hz).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1000' }] },
  phasersweep:  { label: 'Phaser Sweep', desc: 'Phaser sweep range (Hz).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '2000' }] },
  // Other
  orbit:        { label: 'Orbit', desc: 'Global effects bus context (integer).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0' }] },
  dry:          { label: 'Dry', desc: 'Dry (unprocessed) output amount (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '1' }] },
  xfade:        { label: 'Crossfade', desc: 'Crossfade between patterns (0-1).', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0' }] },
  // Pattern (loop only)
  early:        { label: 'Early', desc: 'Nudge events earlier in time.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  late:         { label: 'Late', desc: 'Nudge events later in time.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.1' }] },
  swing:        { label: 'Swing', desc: 'Swing amount — offsets every other event.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '0.5' }] },
  iter:         { label: 'Iter', desc: 'Progressive shift — rotate pattern each cycle.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '4' }] },
  ply:          { label: 'Ply', desc: 'Repeat each event N times within its slot.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '2' }] },

  // ── Consequence-level tags (direct on consequence events) ──────────────
  'set-state':    { label: 'Set State', desc: 'Set state on an external event (NPC, feature, portal). Used in consequences for side effects.', repeatable: true, fields: [{ name: 'state', type: 'text', required: true, placeholder: 'target state (e.g. burning, visible)' }, { name: 'ref', type: 'event-ref', required: true, placeholder: 'target event' }] },
  'give-item':    { label: 'Give Item', desc: 'Add this item to the player\'s inventory', repeatable: true, fields: [{ name: 'ref', type: 'event-ref', required: true, eventTypeFilter: 'item' }] },
  'consume-item': { label: 'Consume Item', desc: 'Remove this item from the player\'s inventory', repeatable: true, fields: [{ name: 'ref', type: 'event-ref', required: true, eventTypeFilter: 'item' }] },
  'deal-damage':  { label: 'Deal Damage', desc: 'Damage dealt to the player by this consequence', fields: [{ name: 'value', type: 'number', required: true, placeholder: '10' }] },

  // ── Vouch ──────────────────────────────────────────────────────────────
  pubkey:     { label: 'Pubkey', desc: 'Hex public key of the person being vouched for', fields: [{ name: 'value', type: 'text', required: true, placeholder: 'hex pubkey' }] },
  scope:      { label: 'Scope', desc: 'What this vouch permits: portals only, places, or everything', fields: [{ name: 'value', type: 'select', required: true, options: ['portal', 'place', 'all'] }] },
  'can-vouch':{ label: 'Can Vouch', desc: 'Whether the vouched person can vouch for others', fields: [{ name: 'value', type: 'select', required: true, options: ['true', 'false'] }] },

  // ── Quest ──────────────────────────────────────────────────────────────
  involves:      { label: 'Involves', desc: 'Event that is part of this quest', repeatable: true, fields: [{ name: 'ref', type: 'event-ref', required: true }] },
  'quest-type':  { label: 'Quest Type', desc: 'How quest progress is displayed — open (all visible), hidden (titles hidden), mystery (count hidden), sequential (one at a time), endgame (win-state detector)', fields: [{ name: 'type', type: 'select', options: ['open', 'hidden', 'mystery', 'sequential', 'endgame'], required: true }, { name: 'mode', type: 'select', options: ['', 'open'], required: false, placeholder: 'hard end (default)' }] },

  // ── World ────────────────────────────────────────────────────────────────
  author:        { label: 'Author', desc: 'Display name of the world author', fields: [{ name: 'value', type: 'text', required: false }] },
  version:       { label: 'Version', desc: 'Semantic version of the world', fields: [{ name: 'value', type: 'text', required: false, placeholder: '1.0.0' }] },
  lang:          { label: 'Language', desc: 'Primary language of the world content', fields: [{ name: 'value', type: 'select', required: false, options: ['en', 'es', 'fr', 'de', 'ja', 'zh', 'pt', 'ru'] }] },
  voice:         { label: 'Voice', desc: 'Writing tone/register guide for contributors (e.g. "terse, laconic — Cormac McCarthy meets a wanted poster")', fields: [{ name: 'value', type: 'text', required: false, placeholder: 'terse, atmospheric, second person' }] },
  tag:           { label: 'Genre Tag', desc: 'Genre or theme tag for discovery (e.g. fantasy, horror)', repeatable: true, fields: [{ name: 'value', type: 'text', required: true, placeholder: 'fantasy' }] },
  cw:            { label: 'Content Warning', desc: 'Warning shown before entering (e.g. violence, horror)', repeatable: true, fields: [{ name: 'value', type: 'text', required: true }] },
  start:         { label: 'Start Place', desc: 'The place where new players begin', fields: [{ name: 'ref', type: 'event-ref', required: true, eventTypeFilter: 'place' }] },
  relay:         { label: 'Relay', desc: 'Nostr relay URL where world events are published', repeatable: true, fields: [{ name: 'url', type: 'text', required: true, placeholder: 'wss://...' }] },
  collaboration: { label: 'Collaboration', desc: 'Who can contribute: closed, vouched (invite-only), or open', fields: [{ name: 'value', type: 'select', required: true, options: ['closed', 'vouched', 'open'] }] },
  collaborator:  { label: 'Collaborator', desc: 'Hex pubkey of a trusted co-author', repeatable: true, fields: [{ name: 'pubkey', type: 'text', required: true, placeholder: 'hex pubkey' }] },
  theme:         { label: 'Theme', desc: 'Visual theme preset for the client', fields: [{ name: 'value', type: 'select', required: false, options: ['terminal-green', 'parchment', 'void-blue', 'blood-red', 'monochrome', 'custom'] }] },
  colour:        { label: 'Colour Override', desc: 'Override a specific theme colour slot with a hex value', repeatable: true, fields: [{ name: 'slot', type: 'select', required: true, options: ['bg', 'text', 'title', 'dim', 'highlight', 'error', 'item', 'npc', 'clue', 'puzzle', 'exits'] }, { name: 'hex', type: 'text', required: true, placeholder: '#00ff41' }] },
  'transition-effect':   { label: 'Transition Effect', desc: 'Visual effect when traversing this portal', fields: [{ name: 'value', type: 'select', required: true, options: ['blackout', 'flash', 'fade', 'shake', 'glitch', 'invert', 'static', 'pulse'] }] },
  'transition-duration': { label: 'Transition Duration', desc: 'Duration of the transition effect in milliseconds', fields: [{ name: 'value', type: 'text', required: false, placeholder: '800' }] },
  'transition-clear':    { label: 'Clear Log', desc: 'Clear the game log during transition (true/false)', fields: [{ name: 'value', type: 'select', required: true, options: ['true', 'false'] }] },
  font:          { label: 'Font', desc: 'Preferred font for the client', fields: [{ name: 'value', type: 'select', required: false, options: ['ibm-plex-mono', 'courier', 'pixel', 'arcade', 'serif'] }] },
  cursor:        { label: 'Cursor', desc: 'Input cursor style: block, underline, or beam', fields: [{ name: 'value', type: 'select', required: false, options: ['block', 'underline', 'beam'] }] },
  effects:       { label: 'Effect Bundle', desc: 'Visual effect preset (defaults from theme if absent)', fields: [{ name: 'value', type: 'select', required: false, options: ['crt', 'static', 'typewriter', 'clean', 'none'] }] },
  scanlines:     { label: 'Scanlines', desc: 'Scanline intensity override (0.0–1.0)', fields: [{ name: 'value', type: 'text', required: false, placeholder: '0.35' }] },
  glow:          { label: 'Glow', desc: 'Phosphor glow intensity override (0.0–1.0)', fields: [{ name: 'value', type: 'text', required: false, placeholder: '0.4' }] },
  flicker:       { label: 'Flicker', desc: 'Screen flicker override', fields: [{ name: 'value', type: 'select', required: false, options: ['on', 'off'] }] },
  vignette:      { label: 'Vignette', desc: 'Edge vignette intensity override (0.0–1.0)', fields: [{ name: 'value', type: 'text', required: false, placeholder: '0.6' }] },
  noise: {
    label: 'Noise',
    desc: 'White noise source (sound) or grain overlay intensity (world)',
    variants: {
      sound: { fields: [], desc: 'White noise source. Use with filters for wind, rain, fire, static.' },
      world: { fields: [{ name: 'value', type: 'text', required: false, placeholder: '0.3' }], desc: 'Grain/static overlay intensity (0.0–1.0)' },
    },
    fields: [{ name: 'value', type: 'text', required: false, placeholder: '0.3' }],
  },
  puzzle:        { label: 'Puzzle NIP-44', desc: 'D-tag of the puzzle whose key decrypts NIP-44 content', fields: [{ name: 'ref', type: 'text', required: true, placeholder: 'puzzle d-tag for NIP-44' }] },
  bpm:           { label: 'BPM', desc: 'Global tempo (world) or place override. Default 120. Affects all Strudel pattern cycle speeds.', fields: [{ name: 'value', type: 'text', required: true, placeholder: '120' }] },
  samples:       { label: 'Sample Library', desc: 'Load a sample library. Use a preset name (e.g. "dirt") or a URL (e.g. "github:user/repo").', repeatable: true, fields: [{ name: 'value', type: 'text', required: true, placeholder: 'dirt' }] },
};

/** Which tags are valid for each event type */
export const TAGS_BY_EVENT_TYPE = {
  place:       ['title', 'content-type', 'exit', 'item', 'feature', 'npc', 'clue', 'noun', 'verb', 'state', 'transition', 'requires', 'requires-not', 'on-interact', 'on-enter', 'on-drop', 'on-player-health', 'media', 'sound', 'bpm', 'cw', 'puzzle', 'colour'],
  portal:      ['title', 'exit', 'state', 'transition', 'requires', 'requires-not', 'consequence', 'cw', 'content-type', 'sound', 'transition-effect', 'transition-duration', 'transition-clear'],
  item:        ['title', 'noun', 'verb', 'state', 'transition', 'on-interact', 'on-move', 'on-counter', 'counter', 'contains', 'requires', 'requires-not', 'damage', 'hit-chance', 'content-type', 'media', 'sound'],
  feature:     ['title', 'noun', 'verb', 'state', 'transition', 'on-interact', 'on-drop', 'on-counter', 'counter', 'contains', 'requires', 'requires-not', 'content-type', 'media', 'sound'],
  clue:        ['title', 'noun', 'state', 'transition', 'content-type', 'requires', 'requires-not', 'media', 'puzzle', 'sound'],
  puzzle:      ['title', 'puzzle-type', 'answer-hash', 'salt', 'ordered', 'requires', 'on-complete', 'on-fail', 'counter', 'on-counter', 'content-type', 'sound'],
  recipe:      ['title', 'noun', 'verb', 'state', 'transition', 'requires', 'on-complete', 'on-fail', 'counter', 'on-counter', 'ordered', 'content-type', 'sound'],
  payment:     ['title', 'amount', 'unit', 'lnurl', 'on-complete', 'content-type', 'sound'],
  npc:         ['title', 'noun', 'verb', 'state', 'transition', 'dialogue', 'on-interact', 'on-encounter', 'on-attacked', 'on-health', 'on-player-health', 'on-enter', 'on-move', 'on-counter', 'counter', 'speed', 'roam-type', 'order', 'route', 'stash', 'roams-when', 'inventory', 'health', 'damage', 'hit-chance', 'requires', 'requires-not', 'content-type', 'sound'],
  dialogue:    ['option', 'on-option', 'requires', 'requires-not', 'on-enter', 'content-type', 'sound'],
  consequence: ['respawn', 'clears', 'give-item', 'consume-item', 'deal-damage', 'set-state', 'content-type', 'sound'],
  sound:       ['note', 's', 'oscillator', 'noise', 'gain', 'slow', 'fast', 'pan', 'lpf', 'hpf', 'bpf', 'bpq', 'lpq', 'hpq', 'ftype', 'vowel', 'crush', 'shape', 'distort', 'coarse', 'room', 'roomsize', 'roomfade', 'roomlp', 'roomdim', 'delay', 'delaytime', 'delayfeedback', 'phaser', 'phaserdepth', 'phasercenter', 'phasersweep', 'rev', 'palindrome', 'degrade-by', 'jux', 'arp', 'sustain', 'attack', 'decay', 'release', 'lpenv', 'lpattack', 'lpdecay', 'lpsustain', 'lprelease', 'hpenv', 'hpattack', 'hpdecay', 'hpsustain', 'hprelease', 'bpenv', 'bpattack', 'bpdecay', 'bpsustain', 'bprelease', 'fanchor', 'penv', 'pattack', 'pdecay', 'prelease', 'pcurve', 'panchor', 'fm', 'fmh', 'fmattack', 'fmdecay', 'fmsustain', 'fmenv', 'vib', 'vibmod', 'tremolodepth', 'tremolosync', 'tremoloskew', 'tremolophase', 'tremoloshape', 'velocity', 'postgain', 'compressor', 'n', 'begin', 'end', 'speed', 'cut', 'loop', 'loop-begin', 'loop-end', 'loop-at', 'clip', 'chop', 'striate', 'fit', 'orbit', 'dry', 'xfade', 'early', 'late', 'swing', 'iter', 'ply', 'sample'],
  world:       ['title', 'author', 'version', 'lang', 'voice', 'tag', 'cw', 'start', 'inventory', 'relay', 'collaboration', 'collaborator', 'health', 'max-health', 'max-inventory', 'on-player-health', 'on-interact', 'on-inventory-full', 'on-move', 'counter', 'on-counter', 'hud', 'map', 'theme', 'colour', 'font', 'cursor', 'effects', 'scanlines', 'glow', 'flicker', 'vignette', 'noise', 'sound', 'bpm', 'samples', 'content-type', 'media', 'w'],
  vouch:       ['pubkey', 'scope', 'can-vouch'],
  revoke:      ['pubkey'],
  quest:       ['title', 'quest-type', 'involves', 'requires', 'requires-not', 'on-complete', 'content-type', 'sound'],
};

/**
 * Get the resolved fields for a tag, handling variants.
 * @param {string} tagName
 * @param {string} eventType - parent event type (for variant resolution)
 * @returns {{ fields: Array, repeatable: boolean, label: string } | null}
 */
export function getTagSchema(tagName, eventType) {
  const schema = TAG_SCHEMAS[tagName];
  if (!schema) return null;

  if (schema.variants) {
    const variant = schema.variants[eventType] || Object.values(schema.variants)[0];
    return { ...schema, fields: variant.fields, repeatable: variant.repeatable ?? schema.repeatable, desc: variant.desc || schema.desc };
  }

  return schema;
}

/**
 * Convert a tag schema field set + values to a tag array.
 * @param {string} tagName
 * @param {Object} values - field name -> value
 * @param {Array} fields - field definitions
 * @returns {string[]} - the tag array e.g. ["exit", "north"]
 */
export function valuesToTag(tagName, values, fields) {
  const tag = [tagName];
  for (const field of fields) {
    if (field.type === 'aliases') {
      // Aliases expand: comma-separated values become additional tag elements
      const raw = values[field.name] || '';
      const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
      tag.push(...parts);
    } else {
      tag.push(values[field.name] ?? '');
    }
  }
  return tag;
}

/**
 * Parse a tag array back into field values.
 * @param {string[]} tag - e.g. ["exit", "north"]
 * @param {Array} fields
 * @returns {Object} - field name -> value
 */
export function tagToValues(tag, fields) {
  const values = {};
  let idx = 1; // skip tag name at [0]
  for (const field of fields) {
    if (field.type === 'aliases') {
      // All remaining elements are aliases
      values[field.name] = tag.slice(idx).join(', ');
      break;
    } else {
      values[field.name] = tag[idx] ?? '';
      idx++;
    }
  }
  return values;
}
