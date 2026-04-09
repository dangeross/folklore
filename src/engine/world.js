export function getTag(event, name) {
  return event.tags.find((t) => t[0] === name)?.[1];
}

export function getTags(event, name) {
  return event.tags.filter((t) => t[0] === name);
}

export function getEventByDTag(events, dtag) {
  return events.get(dtag);
}

/** Construct the full a-tag for an event: 30078:<pubkey>:<d-tag> */
export function aTagOf(event) {
  return `30078:${event.pubkey}:${getTag(event, 'd')}`;
}

/** @deprecated — only for display; use a-tag refs directly as keys */
export function dtagFromRef(ref) {
  return ref.replace(/^30078:[^:]+:/, '');
}

/**
 * Check requires and requires-not tags on an event against player state.
 * Spec shapes:
 *   ["requires",     "<event-ref>", "<state-or-blank>", "<description-or-blank>"]
 *   ["requires-not", "<event-ref>", "<state-or-blank>", "<description-or-blank>"]
 *
 * All event states live in playerState.states — unified map keyed by d-tag.
 * Items additionally require inventory membership.
 *
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
export function checkRequires(event, playerState, events) {
  // --- requires ---
  for (const tag of getTags(event, 'requires')) {
    const ref = tag[1];        // full a-tag: 30078:<pubkey>:<d-tag>
    const expectedState = tag[2] || '';
    const failDesc = tag[3] || "You can't do that.";

    const refEvent = events?.get(ref);
    const refType = refEvent ? getTag(refEvent, 'type') : '';

    if (refType === 'item') {
      if (!playerState.inventory.includes(ref)) {
        return { allowed: false, reason: failDesc };
      }
      if (expectedState) {
        const currentState = playerState.states?.[ref];
        if (currentState !== expectedState) {
          return { allowed: false, reason: failDesc };
        }
      }
    } else if (refType === 'puzzle') {
      if (expectedState === 'solved') {
        if (playerState.states?.[ref] !== 'solved') {
          return { allowed: false, reason: failDesc };
        }
      }
    } else if (refType === 'feature' || refType === 'npc') {
      const currentState = playerState.states?.[ref];
      if (expectedState && currentState !== expectedState) {
        return { allowed: false, reason: failDesc };
      }
    } else if (refType === 'portal') {
      const currentState = playerState.states?.[ref];
      if (expectedState && currentState !== expectedState) {
        return { allowed: false, reason: failDesc };
      }
    } else if (refType === 'quest') {
      const currentState = playerState.states?.[ref];
      if (expectedState && currentState !== expectedState) {
        return { allowed: false, reason: failDesc };
      }
    } else if (refType === 'clue') {
      const currentState = playerState.states?.[ref];
      if (expectedState && currentState !== expectedState) {
        return { allowed: false, reason: failDesc };
      }
    } else if (refType === 'place') {
      const currentState = playerState.states?.[ref];
      if (expectedState && currentState !== expectedState) {
        return { allowed: false, reason: failDesc };
      }
    } else if (refType === 'world') {
      const currentState = playerState.states?.[ref];
      if (expectedState && currentState !== expectedState) {
        return { allowed: false, reason: failDesc };
      }
    } else {
      return { allowed: false, reason: failDesc };
    }
  }

  // --- requires-not ---
  for (const tag of getTags(event, 'requires-not')) {
    const ref = tag[1];        // full a-tag
    const forbiddenState = tag[2] || '';
    const failDesc = tag[3] || "You can't do that.";

    const refEvent = events?.get(ref);
    const refType = refEvent ? getTag(refEvent, 'type') : '';

    if (refType === 'item') {
      const hasItem = playerState.inventory.includes(ref);
      if (!forbiddenState) {
        if (hasItem) return { allowed: false, reason: failDesc };
      } else {
        if (hasItem && playerState.states?.[ref] === forbiddenState) {
          return { allowed: false, reason: failDesc };
        }
      }
    } else if (refType === 'puzzle') {
      const currentState = playerState.states?.[ref] ?? 'unsolved';
      if (forbiddenState && currentState === forbiddenState) {
        return { allowed: false, reason: failDesc };
      }
    } else if (refType === 'feature' || refType === 'npc' || refType === 'portal' ||
               refType === 'quest' || refType === 'clue' || refType === 'place') {
      const currentState = playerState.states?.[ref];
      if (forbiddenState && currentState === forbiddenState) {
        return { allowed: false, reason: failDesc };
      }
    } else {
      // Unknown ref on requires-not — pass (fail open, since it's a negative gate)
    }
  }

  return { allowed: true };
}

/**
 * Check requires-counter tags on an event against player counters.
 *
 * Tag shape:
 *   ["requires-counter", "<verb-or-blank>", "<event-ref-or-blank>", "<counter>", "<op>", "<N>", "<fail-msg>"]
 *
 * Operators: >= <= > < =
 * Blank verb matches any verb (event-level gate).
 * Blank event-ref auto-resolves: checks the event's own counters first, then the world event.
 *
 * @param {Object} event
 * @param {string|null} verb — the verb being used; null/blank matches any
 * @param {Object} playerState
 * @param {Map} events
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkRequiresCounter(event, verb, playerState, events) {
  const tags = getTags(event, 'requires-counter');
  if (tags.length === 0) return { allowed: true };

  const eventDtag = getTag(event, 'd');

  // Lazily find world event for auto-resolution
  let worldDtag = null;
  const getWorldDtag = () => {
    if (worldDtag !== null) return worldDtag;
    const worldEvent = events ? [...events.values()].find((e) => getTag(e, 'type') === 'world') : null;
    worldDtag = worldEvent ? (getTag(worldEvent, 'd') ?? '') : '';
    return worldDtag;
  };

  for (const tag of tags) {
    const tagVerb    = tag[1] || '';
    const eventRef   = tag[2] || '';
    const counterName = tag[3] || '';
    const op         = tag[4] || '>=';
    const threshold  = parseInt(tag[5], 10) || 0;
    const failMsg    = tag[6] || "You can't do that.";

    if (!counterName) continue;
    // Verb filter: blank = any verb
    if (tagVerb && verb && tagVerb !== verb) continue;

    // Resolve counter key
    let counterKey;
    if (eventRef) {
      counterKey = `${eventRef}:${counterName}`;
    } else {
      const localKey = `${eventDtag}:${counterName}`;
      const localVal = playerState.counters?.[localKey];
      if (localVal !== undefined) {
        counterKey = localKey;
      } else {
        const wd = getWorldDtag();
        const worldKey = wd ? `${wd}:${counterName}` : null;
        counterKey = (worldKey && playerState.counters?.[worldKey] !== undefined) ? worldKey : localKey;
      }
    }

    const value = playerState.counters?.[counterKey] ?? 0;
    let passes;
    switch (op) {
      case '>=': passes = value >= threshold; break;
      case '<=': passes = value <= threshold; break;
      case '>':  passes = value > threshold;  break;
      case '<':  passes = value < threshold;  break;
      case '=':
      case '==': passes = value === threshold; break;
      default:   passes = false;
    }

    if (!passes) return { allowed: false, reason: failMsg };
  }

  return { allowed: true };
}

/**
 * Find a feature or item in the current place by noun match.
 */
export function findByNoun(events, placeEvent, noun) {
  const types = ['feature', 'item', 'npc'];
  for (const type of types) {
    const refs = getTags(placeEvent, type);
    for (const ref of refs) {
      const dtag = ref[1];  // full a-tag
      const event = events.get(dtag);
      if (!event) continue;

      const title = getTag(event, 'title')?.toLowerCase() || '';
      // Use word-boundary match so "pot" doesn't match "Potato Bin" (prefix-only)
      if (title && new RegExp(`\\b${noun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(title)) return { event, dtag, type };

      const nounTags = getTags(event, 'noun');
      for (const nt of nounTags) {
        for (let i = 1; i < nt.length; i++) {
          if (nt[i].toLowerCase() === noun) return { event, dtag, type };
        }
      }
    }
  }
  return null;
}

/**
 * Get the default state of a feature from its state tag.
 */
export function getDefaultState(event) {
  return getTag(event, 'state');
}

/**
 * Find a transition from currentState to targetState.
 * Returns { from, to, text } or null.
 */
export function findTransition(event, currentState, targetState) {
  for (const tag of getTags(event, 'transition')) {
    if (tag[1] === currentState && tag[2] === targetState) {
      return { from: tag[1], to: tag[2], text: tag[3] || '' };
    }
  }
  return null;
}

/**
 * For a given place d-tag, find all portals that reference it and return
 * resolved exits: { slot, label, destinationDTag, portalEvent }
 * Portals in state "hidden" are filtered out unless overridden by playerState.
 *
 * @param {Map} events - full event map (used to resolve place event)
 * @param {string} placeDTag - place a-tag
 * @param {Object} playerState
 * @param {Array|null} portals - pre-filtered portal events for this place (fast path).
 *   When null, falls back to scanning all events (backward-compatible, used by tests).
 */
export function resolveExits(events, placeDTag, playerState, portals = null) {
  const exits = [];
  const allClaimedSlots = new Set(); // includes hidden portal slots

  // Collect declared exit slots on the place — portals can only use declared slots
  const placeEvent = events.get(placeDTag);
  const declaredSlots = new Set(
    placeEvent ? getTags(placeEvent, 'exit').map((t) => t[1]) : []
  );

  // Use pre-filtered portals if provided (O(k) fast path from index),
  // otherwise scan all events for portals (O(n) backward-compatible path).
  function* portalCandidates() {
    if (portals) { yield* portals; return; }
    for (const [, event] of events) {
      if (getTag(event, 'type') === 'portal') yield event;
    }
  }

  for (const event of portalCandidates()) {

    // Track all portal-claimed slots (even hidden) for unexplored detection
    for (const tag of getTags(event, 'exit')) {
      if (tag[1] === placeDTag && tag[2] && declaredSlots.has(tag[2])) {
        allClaimedSlots.add(tag[2]);
      }
    }

    // Check portal visibility — state key is the full a-tag
    const portalRef = aTagOf(event);
    const defaultState = getTag(event, 'state');
    const currentState = playerState?.states?.[portalRef] ?? defaultState;
    if (currentState === 'hidden') continue;

    const exitTags = getTags(event, 'exit');
    for (let i = 0; i < exitTags.length; i++) {
      const tag = exitTags[i];
      // Portal exit shape: ["exit", "<place-ref>", "<slot>", "<label?>"]
      const ref = tag[1];  // full a-tag
      if (!ref.includes(':place:')) continue;

      if (ref !== placeDTag) continue;

      const slot = tag[2];
      const label = tag[3] || '';

      // Security: only allow portal exits on declared exit slots
      if (!declaredSlots.has(slot)) continue;

      for (let j = 0; j < exitTags.length; j++) {
        if (j === i) continue;
        const destRef = exitTags[j][1];  // full a-tag

        exits.push({ slot, label, destinationDTag: destRef, portalEvent: event });
      }
    }
  }

  return { exits, allClaimedSlots };
}

/**
 * Resolve exits with trust filtering and contested portal detection.
 * Wraps resolveExits and applies trust-based authorship checks.
 *
 * Returns two lists:
 * - `exits` — visible exits (trusted + unverified depending on mode)
 * - `hiddenByTrust` — exits hidden by trust filtering (for `look <direction>`)
 *
 * @param {Map} events — full event map
 * @param {string} placeDTag — current place a-tag
 * @param {Object} playerState — player state
 * @param {Object|null} trustSet — from buildTrustSet
 * @param {string} clientMode — 'canonical' | 'community' | 'explorer'
 * @param {function} getTrustLevelFn — getTrustLevel function
 * @returns {{ exits: Array, hiddenByTrust: Array }}
 */
export function resolveExitsWithTrust(events, placeDTag, playerState, trustSet, clientMode, getTrustLevelFn, portals = null) {
  const { exits: rawExits, allClaimedSlots } = resolveExits(events, placeDTag, playerState, portals);

  // No trust set — fall back to unfiltered (backward compat)
  if (!trustSet) {
    const exits = rawExits.map((e) => ({ ...e, trusted: true, trustLevel: 'trusted', contested: false }));
    return { exits, hiddenByTrust: [], allClaimedSlots };
  }

  // Tag each exit with trust level
  const tagged = rawExits.map((exit) => {
    const trustLevel = getTrustLevelFn(trustSet, exit.portalEvent.pubkey, 'portal', clientMode);
    return { ...exit, trustLevel, trusted: trustLevel !== 'hidden' };
  });

  // Split into visible and hidden
  const visible = tagged.filter((e) => e.trustLevel !== 'hidden');
  const hiddenByTrust = tagged.filter((e) => e.trustLevel === 'hidden');

  // Detect contested slots (multiple visible portals on same slot)
  const slotCounts = {};
  for (const exit of visible) {
    slotCounts[exit.slot] = (slotCounts[exit.slot] || 0) + 1;
  }

  const exits = visible.map((exit) => ({
    ...exit,
    contested: slotCounts[exit.slot] > 1,
  }));

  return { exits, hiddenByTrust, allClaimedSlots };
}
