/**
 * Walkthrough runner and smoke tester for headless world playtesting.
 *
 * runWalkthrough — plays a command sequence, validates output against expect/reject patterns.
 * smokeTest — BFS explores all reachable places, examines every entity, reports structural issues.
 */
import { GameEngine } from './engine.js';
import { PlayerStateMutator } from './player-state.js';
import { getTag, getTags } from './world.js';

/** Extract world config from events map. */
function extractWorldConfig(events) {
  for (const [, ev] of events) {
    if (getTag(ev, 'type') === 'world') {
      return {
        startPlace: getTag(ev, 'start'),
        authorPubkey: ev.pubkey,
        health: getTag(ev, 'health'),
        maxHealth: getTag(ev, 'max-health'),
      };
    }
  }
  return null;
}

/** Create a fresh engine from events. */
function createEngine(events, worldConfig) {
  const state = {
    place: worldConfig.startPlace,
    inventory: [],
    states: {},
    counters: {},
    visited: [],
    dialogueVisited: {},
    cryptoKeys: [],
    paymentAttempts: {},
    moveCount: 0,
    health: worldConfig.health ? Number(worldConfig.health) : null,
    maxHealth: worldConfig.maxHealth ? Number(worldConfig.maxHealth) : null,
  };
  const player = new PlayerStateMutator(state, {});
  const config = {
    GENESIS_PLACE: worldConfig.startPlace,
    AUTHOR_PUBKEY: worldConfig.authorPubkey,
  };
  return new GameEngine({ events, player, config });
}

/** Collect all text output from a flush. */
function collectText(output) {
  return output.map((e) => e.text || e.html || '').join('\n');
}

// ── Walkthrough Runner ───────────────────────────────────────────────────────

/**
 * Run a walkthrough command sequence against a world.
 *
 * @param {Map} events — world events keyed by a-tag
 * @param {Array<{input: string, expect?: string[], reject?: string[]}>} walkthrough
 * @param {object} [configOverride] — optional { startPlace, authorPubkey }
 * @returns {Promise<{passed: number, failed: number, results: Array, coverage: object}>}
 */
export async function runWalkthrough(events, walkthrough, configOverride) {
  const worldConfig = configOverride || extractWorldConfig(events);
  if (!worldConfig?.startPlace) {
    return { passed: 0, failed: 0, results: [{ input: '(init)', pass: false, errors: ['No world event or start place found'] }], coverage: {} };
  }

  const engine = createEngine(events, worldConfig);
  engine.enterRoom(worldConfig.startPlace);
  engine.flush(); // discard initial room output

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const step of walkthrough) {
    await engine.handleCommand(step.input);
    const output = engine.flush();
    const text = collectText(output);
    const errors = [];

    // Check expect — all substrings must appear (case-insensitive)
    if (step.expect) {
      const lower = text.toLowerCase();
      for (const sub of step.expect) {
        if (!lower.includes(sub.toLowerCase())) {
          errors.push(`Expected "${sub}" not found in output`);
        }
      }
    }

    // Check reject — none must appear
    if (step.reject) {
      const lower = text.toLowerCase();
      for (const sub of step.reject) {
        if (lower.includes(sub.toLowerCase())) {
          errors.push(`Rejected "${sub}" found in output`);
        }
      }
    }

    const pass = errors.length === 0;
    if (pass) passed++;
    else failed++;

    results.push({
      input: step.input,
      output: text.substring(0, 500), // truncate for readability
      pass,
      errors,
      place: engine.currentPlace,
    });
  }

  // Coverage: which places were visited
  const allPlaces = [];
  for (const [ref, ev] of events) {
    if (getTag(ev, 'type') === 'place') allPlaces.push(ref);
  }
  const visited = engine.player.state.visited || [];
  const coverage = {
    placesVisited: visited.length,
    placesTotal: allPlaces.length,
    unvisited: allPlaces.filter((p) => !visited.includes(p)),
  };

  return { passed, failed, results, coverage };
}

// ── Smoke Tester ─────────────────────────────────────────────────────────────

/**
 * Automatically explore a world: BFS through exits, examine all entities.
 *
 * @param {Map} events — world events keyed by a-tag
 * @param {object} [configOverride] — optional { startPlace, authorPubkey }
 * @returns {Promise<{reachable: string[], unreachable: string[], issues: Array, coverage: object}>}
 */
export async function smokeTest(events, configOverride) {
  const worldConfig = configOverride || extractWorldConfig(events);
  if (!worldConfig?.startPlace) {
    return { reachable: [], unreachable: [], issues: [{ type: 'error', message: 'No world event or start place found' }], coverage: {} };
  }

  const engine = createEngine(events, worldConfig);
  const issues = [];

  // Collect all places
  const allPlaces = new Map();
  for (const [ref, ev] of events) {
    if (getTag(ev, 'type') === 'place') allPlaces.set(ref, ev);
  }

  // Collect all entities referenced by places
  const entitiesByPlace = new Map();
  for (const [placeRef, placeEv] of allPlaces) {
    const entities = [];
    for (const tagName of ['feature', 'item', 'npc', 'puzzle']) {
      for (const tag of getTags(placeEv, tagName)) {
        const entityRef = tag[1];
        const entityEv = events.get(entityRef);
        if (entityEv) {
          entities.push({ ref: entityRef, event: entityEv, tagName });
        }
      }
    }
    entitiesByPlace.set(placeRef, entities);
  }

  // Check for entities with no noun tag
  for (const [placeRef, entities] of entitiesByPlace) {
    const placeTitle = getTag(allPlaces.get(placeRef), 'title') || placeRef;
    for (const { ref, event, tagName } of entities) {
      const title = getTag(event, 'title') || ref;
      const nouns = getTags(event, 'noun');
      const type = getTag(event, 'type');
      if (nouns.length === 0 && type !== 'puzzle' && type !== 'sound') {
        issues.push({
          type: 'missing-noun',
          entity: title,
          entityRef: ref,
          place: placeTitle,
          message: `${title} (${tagName}) has no noun tag — players cannot interact with it by name`,
        });
      }
    }
  }

  // Build a raw structural adjacency map from ALL portal exit tags,
  // ignoring portal state (hidden/revealed) so gated places aren't false positives
  const adjacency = new Map(); // placeRef → Set<placeRef>
  const portalsByDest = new Map(); // placeRef → portal events that lead TO it
  for (const [, ev] of events) {
    if (getTag(ev, 'type') !== 'portal') continue;
    const exitTags = getTags(ev, 'exit');
    const placeRefs = exitTags.map((t) => t[1]).filter((r) => r?.includes(':place:'));
    // Each pair of places in exit tags is bidirectionally connected
    for (let i = 0; i < placeRefs.length; i++) {
      for (let j = 0; j < placeRefs.length; j++) {
        if (i === j) continue;
        if (!adjacency.has(placeRefs[i])) adjacency.set(placeRefs[i], new Set());
        adjacency.get(placeRefs[i]).add(placeRefs[j]);
        if (!portalsByDest.has(placeRefs[j])) portalsByDest.set(placeRefs[j], []);
        portalsByDest.get(placeRefs[j]).push(ev);
      }
    }
  }

  // BFS through structural adjacency
  const visited = new Set();
  const queue = [worldConfig.startPlace];
  visited.add(worldConfig.startPlace);

  while (queue.length > 0) {
    const placeRef = queue.shift();

    // Enter room and flush
    engine.enterRoom(placeRef);
    engine.flush();

    // Try examining every entity in this place
    const entities = entitiesByPlace.get(placeRef) || [];
    for (const { ref, event } of entities) {
      const nouns = getTags(event, 'noun');
      if (nouns.length === 0) continue;
      const firstNoun = nouns[0][1]; // first alias
      // Re-enter the place if a previous examine triggered a traverse (e.g. flashback)
      if (engine.currentPlace !== placeRef) {
        engine.enterRoom(placeRef);
        engine.flush();
      }
      await engine.handleCommand(`examine ${firstNoun}`);
      const output = engine.flush();
      const text = collectText(output);
      if (text.toLowerCase().includes("don't see") || text.toLowerCase().includes('not here') || text.toLowerCase().includes("can't see")) {
        const title = getTag(event, 'title') || ref;
        const placeTitle = getTag(allPlaces.get(placeRef), 'title') || placeRef;
        issues.push({
          type: 'noun-failure',
          entity: title,
          entityRef: ref,
          noun: firstNoun,
          place: placeTitle,
          message: `"examine ${firstNoun}" failed in ${placeTitle} — noun doesn't resolve to ${title}`,
        });
      }
    }

    // Follow all structural connections (ignores portal state)
    const neighbors = adjacency.get(placeRef);
    if (neighbors) {
      for (const dest of neighbors) {
        if (!visited.has(dest)) {
          visited.add(dest);
          queue.push(dest);
        }
      }
    }
  }

  // Find unreachable places — distinguish truly broken from gated
  const reachable = [...visited];
  const unreachable = [];
  for (const [ref, ev] of allPlaces) {
    if (!visited.has(ref)) {
      const title = getTag(ev, 'title') || ref;
      unreachable.push(ref);
      const hasPortals = portalsByDest.has(ref);
      if (!hasPortals) {
        issues.push({
          type: 'unreachable',
          entity: title,
          entityRef: ref,
          message: `Place "${title}" has no portal connections — truly unreachable`,
        });
      }
      // If it has portals but still unreachable after ignoring state,
      // it means the portal doesn't connect back to the main graph — still flag it
      else {
        issues.push({
          type: 'unreachable',
          entity: title,
          entityRef: ref,
          message: `Place "${title}" is not reachable from start — portals exist but don't connect to the main graph`,
        });
      }
    }
  }

  // Check for orphan entities (not referenced by any place)
  const referencedEntities = new Set();
  for (const [, entities] of entitiesByPlace) {
    for (const { ref } of entities) referencedEntities.add(ref);
  }
  for (const [ref, ev] of events) {
    const type = getTag(ev, 'type');
    if (['item', 'feature', 'npc'].includes(type) && !referencedEntities.has(ref)) {
      // Check if it's given by an action (give-item, inventory, contains) — not truly orphaned
      let referenced = false;
      for (const [, otherEv] of events) {
        for (const tag of otherEv.tags || []) {
          if (tag.includes(ref) && tag[0] !== 'd') { referenced = true; break; }
        }
        if (referenced) break;
      }
      if (!referenced) {
        const title = getTag(ev, 'title') || ref;
        issues.push({
          type: 'orphan',
          entity: title,
          entityRef: ref,
          message: `${title} (${type}) is not referenced by any place or action`,
        });
      }
    }
  }

  // ── Discoverability: thin noun aliases ──────────────────────────────────
  // Flag entities whose only noun aliases are long compound words with no short form
  for (const [placeRef, entities] of entitiesByPlace) {
    const placeTitle = getTag(allPlaces.get(placeRef), 'title') || placeRef;
    for (const { ref, event, tagName } of entities) {
      const nouns = getTags(event, 'noun');
      if (nouns.length === 0) continue;
      const allAliases = nouns.flatMap((t) => t.slice(1));
      const hasShortAlias = allAliases.some((a) => !a.includes('-') && !a.includes(' ') && a.length <= 12);
      if (!hasShortAlias && allAliases.length > 0) {
        const title = getTag(event, 'title') || ref;
        issues.push({
          type: 'thin-noun',
          entity: title,
          entityRef: ref,
          place: placeTitle,
          message: `${title} (${tagName}) only has long noun aliases [${allAliases.join(', ')}] — add a short alias for easier player input`,
        });
      }
    }
  }

  // ── Discoverability: undiscoverable verbs ──────────────────────────────
  // Flag on-interact verbs that aren't hinted in any nearby examine/content text
  const COMMON_VERBS = new Set(['examine', 'take', 'pick up', 'get', 'drop', 'talk', 'attack', 'look', 'open', 'close', 'read', 'use', 'give']);
  for (const [placeRef, entities] of entitiesByPlace) {
    const placeTitle = getTag(allPlaces.get(placeRef), 'title') || placeRef;
    // Collect all text visible in the place (place content + entity contents + transitions)
    const placeEvent = allPlaces.get(placeRef);
    let placeText = (placeEvent?.content || '').toLowerCase();
    for (const { event: ent } of entities) {
      placeText += ' ' + (ent.content || '').toLowerCase();
      // Include transition text
      for (const tt of getTags(ent, 'transition')) {
        placeText += ' ' + (tt[3] || '').toLowerCase();
      }
    }

    const seenVerbsByEntity = new Set(); // dedup entity+verb combos
    for (const { ref, event } of entities) {
      const onInteracts = getTags(event, 'on-interact');
      const title = getTag(event, 'title') || ref;
      for (const oi of onInteracts) {
        const verb = oi[1];
        if (!verb || COMMON_VERBS.has(verb)) continue;
        const key = `${ref}:${verb}`;
        if (seenVerbsByEntity.has(key)) continue;
        seenVerbsByEntity.add(key);
        const verbLower = verb.toLowerCase();
        if (!placeText.includes(verbLower)) {
          issues.push({
            type: 'undiscoverable-verb',
            entity: title,
            entityRef: ref,
            place: placeTitle,
            verb,
            message: `${title} has on-interact "${verb}" but no visible text in ${placeTitle} hints at this action`,
          });
        }
      }
    }
  }

  const coverage = {
    placesReachable: reachable.length,
    placesTotal: allPlaces.size,
    placesUnreachable: unreachable.length,
    entitiesChecked: [...entitiesByPlace.values()].flat().length,
    issueCount: issues.length,
  };

  return { reachable, unreachable, issues, coverage };
}
