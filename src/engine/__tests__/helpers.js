/**
 * Test helpers — factory functions for building NOSTR events and engine instances.
 */
import { PlayerStateMutator } from '../player-state.js';
import { GameEngine } from '../engine.js';

const PUBKEY = 'testpubkey0000000000000000000000000000000000000000000000000000';
const PUBKEY2 = 'testpubkey2222222222222222222222222222222222222222222222222222';
const PUBKEY3 = 'testpubkey3333333333333333333333333333333333333333333333333333';
const WORLD = 'test-world';

export { PUBKEY, PUBKEY2, PUBKEY3, WORLD };

/** Build an a-tag event ref from a d-tag. */
export function ref(dtag) {
  return `30078:${PUBKEY}:${dtag}`;
}

/** Create a minimal NOSTR event with tags. */
export function makeEvent(dtag, tags = [], content = '') {
  return {
    kind: 30078,
    pubkey: PUBKEY,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', dtag], ...tags],
    content,
  };
}

/** Create a place event. */
export function makePlace(name, { features = [], items = [], npcs = [], clues = [], portals = [], puzzles = [], exits = [], extraTags = [] } = {}) {
  const dtag = `${WORLD}:place:${name}`;
  const tags = [
    ['type', 'place'],
    ['title', name.charAt(0).toUpperCase() + name.slice(1)],
    ...features.map((f) => ['feature', ref(f)]),
    ...items.map((i) => ['item', ref(i)]),
    ...npcs.map((n) => ['npc', ref(n)]),
    ...clues.map((c) => ['clue', ref(c)]),
    ...portals.map((p) => ['portal', ref(p)]),
    ...puzzles.map((p) => ['puzzle', ref(p)]),
    ...exits.map((e) => ['exit', e]),
    ...extraTags,
  ];
  return makeEvent(dtag, tags, `You are in the ${name}.`);
}

/** Create a feature event. */
export function makeFeature(name, { state, transitions = [], verbs = [], nouns = [], onInteract = [], requires = [], content = '', extraTags = [] } = {}) {
  const dtag = `${WORLD}:feature:${name}`;
  const tags = [
    ['type', 'feature'],
    ['title', name.charAt(0).toUpperCase() + name.slice(1)],
    ...(state ? [['state', state]] : []),
    ...transitions.map((t) => ['transition', t[0], t[1], t[2] || '']),
    ...verbs.map((v) => ['verb', ...v]),
    ...nouns.map((n) => ['noun', ...n]),
    ...onInteract.map((oi) => ['on-interact', oi[0], '', ...oi.slice(1)]),
    ...requires.map((r) => ['requires', ...r]),
    ...extraTags,
  ];
  return makeEvent(dtag, tags, content);
}

/** Create an item event. */
export function makeItem(name, { state, counters = [], verbs = [], nouns = [], onInteract = [], onMove = [], onCounter = [], transitions = [], content = '', extraTags = [] } = {}) {
  const dtag = `${WORLD}:item:${name}`;
  const tags = [
    ['type', 'item'],
    ['title', name.charAt(0).toUpperCase() + name.slice(1)],
    ...(state ? [['state', state]] : []),
    ...counters.map((c) => ['counter', c[0], String(c[1])]),
    ...transitions.map((t) => ['transition', t[0], t[1], t[2] || '']),
    ...verbs.map((v) => ['verb', ...v]),
    ...nouns.map((n) => ['noun', ...n]),
    ...onInteract.map((oi) => ['on-interact', oi[0], '', ...oi.slice(1)]),
    ...onMove.map((om) => ['on-move', ...om]),
    ...onCounter.map((oc) => ['on-counter', ...oc]),
    ...extraTags,
  ];
  return makeEvent(dtag, tags, content);
}

/** Create a portal event. */
export function makePortal(name, exits, { state, transitions = [], requires = [], extraTags = [] } = {}) {
  const dtag = `${WORLD}:portal:${name}`;
  const tags = [
    ['type', 'portal'],
    ...exits.map((e) => ['exit', ref(e[0]), e[1], e[2] || '']),
    ...(state ? [['state', state]] : []),
    ...transitions.map((t) => ['transition', t[0], t[1], t[2] || '']),
    ...requires.map((r) => ['requires', ...r]),
    ...extraTags,
  ];
  return makeEvent(dtag, tags, '');
}

/** Create a puzzle event. */
export function makePuzzle(name, { puzzleType, answerHash, salt, onComplete = [], requires = [], extraTags = [] } = {}) {
  const dtag = `${WORLD}:puzzle:${name}`;
  const tags = [
    ['type', 'puzzle'],
    ['title', name.charAt(0).toUpperCase() + name.slice(1)],
    ...(puzzleType ? [['puzzle-type', puzzleType]] : []),
    ...(answerHash ? [['answer-hash', answerHash]] : []),
    ...(salt ? [['salt', salt]] : []),
    ...onComplete.map((oc) => ['on-complete', ...oc]),
    ...requires.map((r) => ['requires', ...r]),
    ...extraTags,
  ];
  return makeEvent(dtag, tags, 'What is the answer?');
}

/** Create a clue event. */
export function makeClue(name, content = 'A mysterious clue.') {
  const dtag = `${WORLD}:clue:${name}`;
  return makeEvent(dtag, [['type', 'clue'], ['title', name.charAt(0).toUpperCase() + name.slice(1)]], content);
}

/** Create an NPC event. */
export function makeNPC(name, { dialogue = [], requires = [], content = '', extraTags = [] } = {}) {
  const dtag = `${WORLD}:npc:${name}`;
  const tags = [
    ['type', 'npc'],
    ['title', name.charAt(0).toUpperCase() + name.slice(1)],
    ['noun', name],
    ...dialogue.map((d) => ['dialogue', ...d]),
    ...requires.map((r) => ['requires', ...r]),
    ...extraTags,
  ];
  return makeEvent(dtag, tags, content);
}

/** Create a dialogue node event. */
export function makeDialogueNode(name, { text, options = [], onEnter = [], requires = [], extraTags = [] } = {}) {
  const dtag = `${WORLD}:dialogue:${name}`;
  const tags = [
    ['type', 'dialogue'],
    ...options.map((o) => ['option', o[0], o[1] ? ref(o[1]) : '']),
    ...onEnter.map((oe) => ['on-enter', ...oe]),
    ...requires.map((r) => ['requires', ...r]),
    ...extraTags,
  ];
  return makeEvent(dtag, tags, text || '');
}

/** Build a Map<a-tag, event> from an array of events. */
export function buildEvents(...eventList) {
  const map = new Map();
  for (const ev of eventList) {
    const dtag = ev.tags.find((t) => t[0] === 'd')?.[1];
    if (dtag) map.set(`30078:${ev.pubkey}:${dtag}`, ev);
  }
  return map;
}

/** Create a roaming NPC event. */
export function makeRoamingNPC(name, { speed = 3, order = 'sequential', routes = [], stash, roamsWhen, inventory = [], onEncounter = [], onEnter = [], state, health, dialogue = [], requires = [], content = '', extraTags = [] } = {}) {
  const dtag = `${WORLD}:npc:${name}`;
  const tags = [
    ['type', 'npc'],
    ['title', name.charAt(0).toUpperCase() + name.slice(1)],
    ['noun', name],
    ['speed', String(speed)],
    ['order', order],
    ...routes.map((r) => ['route', ref(r)]),
    ...(stash ? [['stash', ref(stash)]] : []),
    ...(roamsWhen ? [['roams-when', roamsWhen]] : []),
    ...inventory.map((i) => ['inventory', ref(i)]),
    ...onEncounter.map((oe) => ['on-encounter', ...oe]),
    ...onEnter.map((oe) => ['on-enter', ...oe]),
    ...(state ? [['state', state]] : []),
    ...(health ? [['health', String(health)]] : []),
    ...dialogue.map((d) => ['dialogue', ...d]),
    ...requires.map((r) => ['requires', ...r]),
    ...extraTags,
  ];
  return makeEvent(dtag, tags, content);
}

/** Create a fresh player state. */
export function freshState(overrides = {}) {
  return {
    place: null,
    inventory: [],
    states: {},
    counters: {},
    cryptoKeys: [],
    dialogueVisited: {},
    paymentAttempts: {},
    visited: [],
    moveCount: 0,
    health: null,
    maxHealth: null,
    ...overrides,
  };
}

/** Create a PlayerStateMutator from optional overrides. */
export function makeMutator(overrides = {}, npcStates = {}) {
  return new PlayerStateMutator(freshState(overrides), npcStates);
}

/** Create a GameEngine with events, player, and config. */
export function makeEngine(events, playerOverrides = {}, configOverrides = {}, npcStates = {}) {
  const player = makeMutator(playerOverrides, npcStates);
  const config = {
    GENESIS_PLACE: ref(`${WORLD}:place:start`),
    AUTHOR_PUBKEY: PUBKEY,
    ...configOverrides,
  };
  return new GameEngine({ events, player, config });
}

/** Create a recipe event. */
export function makeRecipe(name, { ordered = false, requires = [], onComplete = [], verbs = [], nouns = [], state, transitions = [], content = '', extraTags = [] } = {}) {
  const dtag = `${WORLD}:recipe:${name}`;
  const tags = [
    ['type', 'recipe'],
    ['title', name.charAt(0).toUpperCase() + name.slice(1)],
    ...(ordered ? [['ordered', 'true']] : []),
    ...(state ? [['state', state]] : []),
    ...transitions.map((t) => ['transition', t[0], t[1], t[2] || '']),
    ...verbs.map((v) => ['verb', ...v]),
    ...nouns.map((n) => ['noun', ...n]),
    ...requires.map((r) => ['requires', ...r]),
    ...onComplete.map((oc) => ['on-complete', ...oc]),
    ...extraTags,
  ];
  return makeEvent(dtag, tags, content);
}

/** Create a consequence event. */
export function makeConsequence(name, { respawn, clears = [], giveItems = [], consumeItems = [], content = '', extraTags = [] } = {}) {
  const dtag = `${WORLD}:consequence:${name}`;
  const tags = [
    ['type', 'consequence'],
    ...(respawn ? [['respawn', ref(respawn)]] : []),
    ...clears.map((c) => ['clears', c]),
    ...giveItems.map((i) => ['give-item', ref(i)]),
    ...consumeItems.map((i) => ['consume-item', ref(i)]),
    ...extraTags,
  ];
  return makeEvent(dtag, tags, content);
}

/** Create a quest event. */
export function makeQuest(name, { questType, involves = [], requires = [], onComplete = [], content = '', extraTags = [] } = {}) {
  const dtag = `${WORLD}:quest:${name}`;
  const tags = [
    ['type', 'quest'],
    ['title', name.charAt(0).toUpperCase() + name.slice(1)],
    ...(questType ? [['quest-type', questType]] : []),
    ...involves.map((i) => ['involves', ref(i)]),
    ...requires.map((r) => ['requires', ...r]),
    ...onComplete.map((oc) => ['on-complete', ...oc]),
    ...extraTags,
  ];
  return makeEvent(dtag, tags, content);
}

// ── Multi-author helpers ──────────────────────────────────────────────

/** Build an a-tag ref with a specific pubkey. */
export function refFor(pubkey, dtag) {
  return `30078:${pubkey}:${dtag}`;
}

/** Create an event with a specific author pubkey. */
export function makeEventAs(pubkey, dtag, tags = [], content = '') {
  return {
    kind: 30078,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', dtag], ...tags],
    content,
  };
}

/** Create a portal event with a specific author pubkey. */
export function makePortalAs(pubkey, name, exits, { state, transitions = [], requires = [], extraTags = [] } = {}) {
  const dtag = `${WORLD}:portal:${name}`;
  const tags = [
    ['type', 'portal'],
    ...exits.map((e) => {
      // e[0] is a full a-tag ref (not a bare d-tag to wrap)
      return ['exit', e[0], e[1], e[2] || ''];
    }),
    ...(state ? [['state', state]] : []),
    ...transitions.map((t) => ['transition', t[0], t[1], t[2] || '']),
    ...requires.map((r) => ['requires', ...r]),
    ...extraTags,
  ];
  return makeEventAs(pubkey, dtag, tags, '');
}

/** Create a world event with collaboration and collaborator tags. */
export function makeWorldEvent({ collaboration = 'closed', collaborators = [], start, title, extraTags = [] } = {}) {
  const dtag = `${WORLD}:world`;
  const tags = [
    ['type', 'world'],
    ['w', 'folklore'],
    ['title', title || 'Test World'],
    ['collaboration', collaboration],
    ...collaborators.map((pk) => ['collaborator', pk]),
    ...(start ? [['start', start]] : []),
    ...extraTags,
  ];
  return makeEvent(dtag, tags, '');
}

/** Create a vouch event authored by a specific pubkey. */
export function makeVouch(authorPubkey, vouchedPubkey, { scope = 'all', canVouch = false, name = '' } = {}) {
  const dtag = `${WORLD}:vouch:${name || `${authorPubkey.slice(0, 8)}-vouches-${vouchedPubkey.slice(0, 8)}`}`;
  const tags = [
    ['type', 'vouch'],
    ['t', WORLD],
    ['pubkey', vouchedPubkey],
    ['scope', scope],
    ['can-vouch', canVouch ? 'true' : 'false'],
  ];
  return makeEventAs(authorPubkey, dtag, tags, '');
}
