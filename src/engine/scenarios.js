/**
 * scenarios.js — Scenario test fixtures for build/dev mode.
 * Never published to NOSTR relays.
 */

const STORAGE_PREFIX = 'folklore:scenarios:';

export function loadScenarios(worldSlug) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + worldSlug);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveScenarios(worldSlug, scenarios) {
  try {
    localStorage.setItem(STORAGE_PREFIX + worldSlug, JSON.stringify(scenarios));
  } catch {}
}

/**
 * Import scenarios from a JSON file.
 * File format: array of scenario events, or { scenarios: [...] }.
 * Saves and returns the scenario array.
 */
export function importScenariosFromData(worldSlug, data) {
  const arr = Array.isArray(data) ? data : (Array.isArray(data?.scenarios) ? data.scenarios : []);
  saveScenarios(worldSlug, arr);
  return arr;
}

/**
 * Resolve a scenario with chain inheritance (depth-limited).
 * Chain tag: ["chain", "<scenario-d-tag>"]
 * Base is applied first; current scenario overrides.
 * For set-state/set-counter: last-write-wins per key.
 * For give-item: union.
 * For place: current wins.
 */
export function resolveScenario(scenario, allScenarios, depth = 0) {
  if (depth > 5) return scenario;
  const chainTag = (scenario.tags || []).find(t => t[0] === 'chain');
  if (!chainTag) return scenario;
  const chainId = chainTag[1];
  const base = allScenarios.find(s => (s.tags || []).find(t => t[0] === 'd')?.[1] === chainId);
  if (!base) return scenario;
  const resolvedBase = resolveScenario(base, allScenarios, depth + 1);
  return mergeScenarios(resolvedBase, scenario);
}

function mergeScenarios(base, override) {
  const bt = base.tags || [];
  const ot = override.tags || [];

  // set-state: merge by ref, override wins
  const stateMap = {};
  for (const t of bt) if (t[0] === 'set-state' && t[1]) stateMap[t[1]] = t[2] || '';
  for (const t of ot) if (t[0] === 'set-state' && t[1]) stateMap[t[1]] = t[2] || '';

  // set-counter: merge by name, override wins
  const counterMap = {};
  for (const t of bt) if (t[0] === 'set-counter' && t[1]) counterMap[t[1]] = t[2] || '0';
  for (const t of ot) if (t[0] === 'set-counter' && t[1]) counterMap[t[1]] = t[2] || '0';

  // give-item: union
  const itemSet = new Set();
  for (const t of bt) if (t[0] === 'give-item' && t[1]) itemSet.add(t[1]);
  for (const t of ot) if (t[0] === 'give-item' && t[1]) itemSet.add(t[1]);

  // place: override wins, fall back to base
  const place = ot.find(t => t[0] === 'place')?.[1] || bt.find(t => t[0] === 'place')?.[1];

  // Non-data tags: keep override's identity tags
  const identityTags = ot.filter(t => !['set-state', 'set-counter', 'give-item', 'place', 'chain'].includes(t[0]));

  const mergedTags = [
    ...identityTags,
    ...Object.entries(stateMap).map(([ref, state]) => ['set-state', ref, state]),
    ...Object.entries(counterMap).map(([name, val]) => ['set-counter', name, val]),
    ...[...itemSet].map(ref => ['give-item', ref]),
    ...(place ? [['place', place]] : []),
  ];

  return { ...override, tags: mergedTags };
}

/**
 * Replace <PUBKEY> placeholder in a tag array with the actual pubkey.
 */
function resolvePubkey(tags, pubkey) {
  if (!pubkey) return tags;
  return tags.map(t => t.map(v => typeof v === 'string' ? v.replaceAll('<PUBKEY>', pubkey) : v));
}

/**
 * Apply a scenario: write player state to localStorage then reload.
 * worldSlug is both the localStorage key AND the world d-tag (used for counter prefix).
 * pubkey is the world genesis pubkey used to resolve <PUBKEY> placeholders in refs.
 */
export function applyScenario(scenario, worldSlug, allScenarios = [], pubkey = '') {
  const resolved = resolveScenario(scenario, allScenarios);
  const tags = resolvePubkey(resolved.tags || [], pubkey);

  const player = {
    place: null,
    inventory: [],
    states: {},
    counters: {},
    cryptoKeys: [],
    dialogueVisited: {},
    paymentAttempts: {},
    visited: [],
    moveCount: 0,
  };

  for (const t of tags) {
    if (t[0] === 'set-state' && t[1]) {
      player.states[t[1]] = t[2] || '';
    } else if (t[0] === 'give-item' && t[1]) {
      if (!player.inventory.includes(t[1])) player.inventory.push(t[1]);
    } else if (t[0] === 'set-counter' && t[1]) {
      // World-scoped counter: key = "${worldSlug}:${counterName}"
      player.counters[`${worldSlug}:${t[1]}`] = parseInt(t[2], 10) || 0;
    } else if (t[0] === 'place' && t[1]) {
      player.place = t[1];
    }
  }

  localStorage.setItem(worldSlug, JSON.stringify({ player }));
  window.location.reload();
}
