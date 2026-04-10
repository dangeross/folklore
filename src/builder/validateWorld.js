/**
 * validateWorld.js — Cross-event validation for a world's event set.
 *
 * Single-event checks live in eventBuilder.js (validateEvent).
 * This module checks relationships between events: dangling refs,
 * puzzle answer availability, puzzle-type mismatches, etc.
 *
 * Works with both draft events (<PUBKEY> placeholders) and published events.
 *
 * All errors/warnings are structured objects:
 * { dTag, category, message, fix, tag? }
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTagValue(event, name) {
  return event.tags?.find((t) => t[0] === name)?.[1] ?? null;
}

function getTags(event, name) {
  return (event.tags || []).filter((t) => t[0] === name);
}

/**
 * Extract the d-tag portion from an a-tag ref.
 * "30078:<PUBKEY>:the-lake:feature:lamp" → "the-lake:feature:lamp"
 * "30078:abc...def:the-lake:feature:lamp" → "the-lake:feature:lamp"
 */
export function extractDTagFromRef(ref) {
  if (typeof ref !== 'string') return null;
  const parts = ref.split(':');
  if (parts.length < 3 || parts[0] !== '30078') return null;
  return parts.slice(2).join(':');
}

/**
 * Check if a string looks like an a-tag event ref.
 */
function isEventRef(value) {
  return typeof value === 'string' && value.startsWith('30078:');
}

/**
 * Build a lookup of d-tag → event for a set of events.
 */
function buildEventIndex(events) {
  const byDTag = new Map();
  const dTags = new Set();
  for (const event of events) {
    const dTag = getTagValue(event, 'd');
    if (dTag) {
      dTags.add(dTag);
      byDTag.set(dTag, event);
    }
  }
  return { dTags, byDTag };
}

/**
 * Resolve an a-tag ref against the known d-tag set.
 * Returns the matched d-tag or null.
 */
function resolveRef(ref, dTags) {
  const dTag = extractDTagFromRef(ref);
  if (!dTag) return null;
  return dTags.has(dTag) ? dTag : null;
}

/**
 * Infer event type from a d-tag pattern like "world:npc:broker-solis" → "npc"
 */
function inferTypeFromDTag(dTagStr) {
  const validTypes = ['place', 'item', 'feature', 'npc', 'portal', 'puzzle', 'clue', 'dialogue', 'sound', 'quest', 'recipe', 'consequence', 'payment'];
  const parts = dTagStr.split(':');
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 2];
    if (validTypes.includes(candidate)) return candidate;
  }
  return null;
}

// ── Main validator ───────────────────────────────────────────────────────────

/**
 * Validate cross-event relationships in a world.
 *
 * @param {Array} events - array of event templates { kind, tags, content }
 * @param {Object} answers - { puzzleDTag: answer } map (for NIP-44 checks)
 * @returns {{ errors: Array<{dTag, category, message, fix, tag?}>, warnings: Array<{dTag, category, message, fix, tag?}> }}
 */
export function validateWorld(events, answers = {}) {
  const errors = [];
  const warnings = [];
  const hints = [];
  const { dTags, byDTag } = buildEventIndex(events);

  for (const event of events) {
    const dTag = getTagValue(event, 'd') || '?';
    const eventType = getTagValue(event, 'type');

    // ── 1. Dangling event refs ─────────────────────────────────────────────
    for (const tag of event.tags || []) {
      for (let i = 1; i < tag.length; i++) {
        if (!isEventRef(tag[i])) continue;
        const resolved = resolveRef(tag[i], dTags);
        if (!resolved) {
          const refDTag = extractDTagFromRef(tag[i]);
          const inferredType = inferTypeFromDTag(refDTag);
          const typeHint = inferredType ? ` with type "${inferredType}"` : '';
          warnings.push({
            dTag,
            category: 'dangling-ref',
            message: `${tag[0]} references "${refDTag}" which is not in this world`,
            tag: tag.join(', '),
            fix: `Either create a new event${typeHint} with d-tag "${refDTag}", or remove the ["${tag[0]}", "..."] tag from "${dTag}".`,
          });
        }
      }
    }

    // ── 2. Place puzzle tag referencing non-sequence puzzle ─────────────────
    // Skip if the place has NIP-44 content — puzzle tag is there for encryption key derivation, not auto-evaluation
    if (eventType === 'place' && getTagValue(event, 'content-type') !== 'application/nip44') {
      for (const tag of getTags(event, 'puzzle')) {
        const puzzleDTag = extractDTagFromRef(tag[1]) || tag[1];
        const puzzleEvent = byDTag.get(puzzleDTag);
        if (puzzleEvent) {
          const puzzleType = getTagValue(puzzleEvent, 'puzzle-type');
          if (puzzleType && puzzleType !== 'sequence') {
            warnings.push({
              dTag,
              category: 'puzzle-type-mismatch',
              message: `puzzle tag references "${puzzleDTag}" which is type "${puzzleType}" — only sequence puzzles auto-evaluate from place puzzle tags. Riddle puzzles need an on-interact trigger on a feature`,
              tag: tag.join(', '),
              fix: `The puzzle "${puzzleDTag}" is type "${puzzleType}". Change it to type "sequence", or remove the puzzle tag from "${dTag}" and instead add an on-interact trigger on a feature in this place that targets the puzzle.`,
            });
          }
        }
      }
    }

    // ── 3. NIP-44 content validation ───────────────────────────────────────
    const contentType = getTagValue(event, 'content-type');
    if (contentType === 'application/nip44') {
      const puzzleRef = getTags(event, 'puzzle')[0]?.[1];
      if (puzzleRef) {
        const puzzleDTagStr = extractDTagFromRef(puzzleRef) || puzzleRef;
        const puzzleEvent = byDTag.get(puzzleDTagStr);

        if (!puzzleEvent) {
          errors.push({
            dTag,
            category: 'nip44',
            message: `NIP-44 content references puzzle "${puzzleDTagStr}" which is not in this world`,
            fix: `Create the puzzle event with d-tag "${puzzleDTagStr}", or check the puzzle reference.`,
          });
        } else {
          const puzzleType = getTagValue(puzzleEvent, 'puzzle-type');
          if (puzzleType === 'sequence') {
            errors.push({
              dTag,
              category: 'nip44',
              message: `NIP-44 content references puzzle "${puzzleDTagStr}" which is type "sequence" — sequence puzzles have no typed answer so no encryption key can be derived`,
              fix: `Change the puzzle to type "riddle" (player types an answer that becomes the key), or remove the NIP-44 content-type.`,
            });
          }
          const salt = getTagValue(puzzleEvent, 'salt');
          if (!salt) {
            errors.push({
              dTag,
              category: 'nip44',
              message: `NIP-44 content references puzzle "${puzzleDTagStr}" which has no salt tag — cannot derive encryption key`,
              fix: `Add a ["salt", "<random-hex>"] tag to the puzzle event "${puzzleDTagStr}".`,
            });
          }
          if (!answers[puzzleDTagStr]) {
            errors.push({
              dTag,
              category: 'nip44',
              message: `NIP-44 content references puzzle "${puzzleDTagStr}" but no answer is stored — content cannot be encrypted at publish time`,
              fix: `Add the puzzle answer to the top-level "answers" object: { "${puzzleDTagStr}": "<answer>" }.`,
            });
          }
        }
      }
    }

    // ── 4. on-interact set-state targeting a puzzle without answer ──────────
    for (const tag of getTags(event, 'on-interact')) {
      const action = tag[3];  // [on-interact, verb, state-guard, action, target, ext-ref]
      const extRef = tag[5];
      if (action === 'set-state' && extRef && isEventRef(extRef)) {
        const targetDTag = resolveRef(extRef, dTags);
        if (targetDTag) {
          const targetEvent = byDTag.get(targetDTag);
          const targetType = getTagValue(targetEvent, 'type');
          if (targetType === 'puzzle') {
            const answerHash = getTagValue(targetEvent, 'answer-hash');
            if (answerHash && !answers[targetDTag]) {
              warnings.push({
                dTag,
                category: 'nip44',
                message: `on-interact targets puzzle "${targetDTag}" which has an answer-hash but no answer stored — puzzle will activate but cannot verify answers at publish time for NIP-44`,
                tag: tag.join(', '),
                fix: `Add the puzzle answer to the "answers" object: { "${targetDTag}": "<answer>" }.`,
              });
            }
          }
        }
      }
    }
  }

  // ── 5. Portal exit slot validation ──────────────────────────────────────
  // Build a map of place d-tags → declared exit slots
  const placeExitSlots = new Map();
  for (const event of events) {
    if (getTagValue(event, 'type') !== 'place') continue;
    const placeDTag = getTagValue(event, 'd') || '?';
    const slots = new Set(getTags(event, 'exit').map((t) => t[1]));
    placeExitSlots.set(placeDTag, slots);
  }
  // Check each portal's exit tags claim slots that exist on the place
  for (const event of events) {
    if (getTagValue(event, 'type') !== 'portal') continue;
    const portalDTag = getTagValue(event, 'd') || '?';
    for (const exitTag of getTags(event, 'exit')) {
      const placeRef = exitTag[1];
      const slot = exitTag[2];
      if (!placeRef || !slot) continue;
      const placeDTag = extractDTagFromRef(placeRef) || placeRef;
      const declaredSlots = placeExitSlots.get(placeDTag);
      if (declaredSlots && !declaredSlots.has(slot)) {
        warnings.push({
          dTag: portalDTag,
          category: 'undeclared-exit-slot',
          message: `Portal claims slot "${slot}" on place "${placeDTag}" but that place has no ["exit", "${slot}"] tag`,
          tag: exitTag.join(', '),
          fix: `Add ["exit", "${slot}"] to the place event "${placeDTag}", or change the portal's direction to one of: ${[...declaredSlots].join(', ') || '(none declared)'}.`,
        });
      }
    }
  }

  // ── 6. Portal cardinal direction check ──────────────────────────────────
  // When a portal has exactly two exit slots and both are recognised direction
  // words, they must be cardinal/ordinal opposites. north/east is disorienting;
  // north/south is correct. Custom slot names (e.g. "passage") are skipped.
  const DIRECTION_OPPOSITES = {
    north: 'south', south: 'north',
    east: 'west', west: 'east',
    up: 'down', down: 'up',
    in: 'out', out: 'in',
    northeast: 'southwest', southwest: 'northeast',
    northwest: 'southeast', southeast: 'northwest',
  };

  for (const event of events) {
    if (getTagValue(event, 'type') !== 'portal') continue;
    const portalDTag = getTagValue(event, 'd') || '?';
    const exitTags = getTags(event, 'exit');
    if (exitTags.length !== 2) continue; // one-way or multi-leg — skip
    const slotA = exitTags[0][2];
    const slotB = exitTags[1][2];
    if (!slotA || !slotB) continue;
    // Only flag if both slots are recognised directional words
    if (!(slotA in DIRECTION_OPPOSITES) || !(slotB in DIRECTION_OPPOSITES)) continue;
    if (DIRECTION_OPPOSITES[slotA] !== slotB) {
      hints.push({
        dTag: portalDTag,
        category: 'portal-direction',
        message: `Portal exits "${slotA}" and "${slotB}" are not opposites — entering from the ${slotA} and exiting via ${slotB} is disorienting`,
        tag: `["exit", "...", "${slotA}"] / ["exit", "...", "${slotB}"]`,
        fix: `Change the return exit to "${DIRECTION_OPPOSITES[slotA]}" so the portal is symmetric: go ${slotA} → return ${DIRECTION_OPPOSITES[slotA]}.`,
      });
    }
  }

  // ── 7. Orphaned NPCs ─────────────────────────────────────────────────────
  // An NPC not referenced by any place's ["npc", ...] tag cannot be encountered
  // by the player. Flag as a warning (some NPCs may be spawned dynamically).
  const placedNpcRefs = new Set();
  for (const event of events) {
    if (getTagValue(event, 'type') !== 'place') continue;
    for (const tag of getTags(event, 'npc')) {
      const refDTag = extractDTagFromRef(tag[1]);
      if (refDTag) placedNpcRefs.add(refDTag);
    }
  }
  for (const event of events) {
    if (getTagValue(event, 'type') !== 'npc') continue;
    const npcDTag = getTagValue(event, 'd') || '?';
    if (!placedNpcRefs.has(npcDTag)) {
      warnings.push({
        dTag: npcDTag,
        category: 'orphaned-npc',
        message: `NPC is not placed in any place — players cannot encounter it`,
        fix: `Add ["npc", "<ref>"] to a place event, or if this NPC appears dynamically via an action, this warning can be ignored.`,
      });
    }
  }

  // ── 10. Verb alias collisions per place ─────────────────────────────────
  for (const event of events) {
    if (getTagValue(event, 'type') !== 'place') continue;
    const placeDTag = getTagValue(event, 'd') || '?';

    // Collect verb sources: features + items + npcs referenced by this place
    const refTypes = ['feature', 'item', 'npc'];
    const verbSources = [];
    for (const type of refTypes) {
      for (const tag of getTags(event, type)) {
        const ref = tag[1];
        const refDTag = extractDTagFromRef(ref);
        const refEvent = refDTag ? byDTag.get(refDTag) : null;
        if (!refEvent) continue;
        for (const vt of getTags(refEvent, 'verb')) {
          const canonical = vt[1];
          for (let i = 1; i < vt.length; i++) {
            verbSources.push({ eventDTag: refDTag, canonical, alias: vt[i].toLowerCase() });
          }
        }
      }
    }

    // NOTE: We intentionally skip global inventory items here.
    // Items travel everywhere, so their common verbs ("use", "examine")
    // would collide at every place — noisy false positives.
    // Only flag collisions between entities co-located at this place.

    // Check for verb tags that shadow built-in commands
    const builtInVerbs = new Set([
      'look', 'l', 'examine', 'x',
      'talk', 'speak',
      'take', 'get', 'grab', 'pick up',
      'drop',
      'attack',
      'inventory', 'i',
      'help', 'h',
      'quests', 'quest', 'q',
      'go',
    ]);
    for (const { eventDTag, alias } of verbSources) {
      if (builtInVerbs.has(alias)) {
        warnings.push({
          dTag: eventDTag,
          category: 'verb-collision',
          message: `Verb alias "${alias}" shadows a built-in command and will be unreachable`,
          fix: `Remove "${alias}" from the verb tag on "${eventDTag}" — the engine handles "${alias}" as a built-in command before checking data-driven verbs.`,
        });
      }
    }

    // Find collisions: same alias, different canonical
    const aliasMap = new Map();
    for (const { eventDTag, canonical, alias } of verbSources) {
      const existing = aliasMap.get(alias);
      if (existing && existing.canonical !== canonical) {
        const entity1Short = existing.eventDTag.split(':').pop();
        const entity2Short = eventDTag.split(':').pop();
        warnings.push({
          dTag: placeDTag,
          category: 'verb-collision',
          message: `Verb collision: "${alias}" maps to "${existing.canonical}" (${entity1Short}) and "${canonical}" (${entity2Short}) — last one wins, may cause unexpected behaviour`,
          fix: `The alias "${alias}" is claimed by both entities. Remove "${alias}" from the verb tag on either "${entity1Short}" (${existing.eventDTag}) or "${entity2Short}" (${eventDTag}), or rename one to a unique alias.`,
        });
      }
      aliasMap.set(alias, { canonical, eventDTag });
    }
  }

  // ── 11. Discoverability: thin noun aliases ───────────────────────────────
  // Flag entities whose only noun aliases are long compound words
  for (const event of events) {
    const eventType = getTagValue(event, 'type');
    if (!['feature', 'item', 'npc'].includes(eventType)) continue;
    const dTag = getTagValue(event, 'd') || '?';
    const title = getTagValue(event, 'title') || dTag;
    const nouns = getTags(event, 'noun');
    if (nouns.length === 0) continue;
    const allAliases = nouns.flatMap((t) => t.slice(1));
    const hasShortAlias = allAliases.some((a) => !a.includes('-') && !a.includes(' ') && a.length <= 12);
    if (!hasShortAlias && allAliases.length > 0) {
      hints.push({
        dTag,
        category: 'thin-noun',
        message: `${title} only has long noun aliases [${allAliases.join(', ')}] — add a short alias for easier player input`,
        fix: `Add a shorter alias to the noun tag, e.g. ["noun", "${allAliases[0]}", "${allAliases[0].split(/[-\s]/).pop()}"].`,
      });
    }
  }

  // ── 12. Discoverability: undiscoverable verbs ────────────────────────────
  // Flag on-interact verbs not hinted in visible text at the same place
  const COMMON_VERBS = new Set(['examine', 'take', 'pick up', 'get', 'drop', 'talk', 'attack', 'look', 'open', 'close', 'read', 'use', 'give']);
  for (const event of events) {
    if (getTagValue(event, 'type') !== 'place') continue;
    const placeDTag = getTagValue(event, 'd') || '?';
    const placeTitle = getTagValue(event, 'title') || placeDTag;

    // Collect all visible text in the place
    let placeText = (event.content || '').toLowerCase();
    const entityRefs = [];
    for (const type of ['feature', 'item', 'npc']) {
      for (const tag of getTags(event, type)) {
        const refDTag = extractDTagFromRef(tag[1]);
        if (refDTag) entityRefs.push(refDTag);
      }
    }
    for (const refDTag of entityRefs) {
      const ent = byDTag.get(refDTag);
      if (!ent) continue;
      placeText += ' ' + (ent.content || '').toLowerCase();
      for (const tt of getTags(ent, 'transition')) {
        placeText += ' ' + (tt[3] || '').toLowerCase();
      }
    }

    // Check each entity's on-interact verbs
    const seenVerbs = new Set();
    for (const refDTag of entityRefs) {
      const ent = byDTag.get(refDTag);
      if (!ent) continue;
      const entTitle = getTagValue(ent, 'title') || refDTag;
      for (const oi of getTags(ent, 'on-interact')) {
        const verb = oi[1];
        if (!verb || COMMON_VERBS.has(verb)) continue;
        const key = `${refDTag}:${verb}`;
        if (seenVerbs.has(key)) continue;
        seenVerbs.add(key);
        if (!placeText.includes(verb.toLowerCase())) {
          hints.push({
            dTag: refDTag,
            category: 'undiscoverable-verb',
            message: `${entTitle} has on-interact "${verb}" but no visible text in ${placeTitle} hints at this action`,
            fix: `Add a mention of "${verb}" in the place description, the entity's content, or a transition text so players know this action is available.`,
          });
        }
      }
    }
  }

  // ── 13. Quest auto-cascade detection ─────────────────────────────────────
  //
  // _evalQuests() runs after every room entry and dialogue on-enter. It
  // completes any quest whose requires are ALL passively satisfied without
  // player interaction. Two patterns cause silent auto-cascades:
  //
  //   A) requires an NPC in its *initial* state — always true at world start
  //   B) all requires are quest-chain checks — no interaction gate at all
  //
  // Both are warnings (not errors) — some cascades are intentional.

  // Build a map of npc d-tag → initial state
  const npcInitialState = new Map();
  for (const event of events) {
    if (getTagValue(event, 'type') !== 'npc') continue;
    const nDTag = getTagValue(event, 'd');
    const initState = getTagValue(event, 'state');
    if (nDTag && initState) npcInitialState.set(nDTag, initState);
  }

  for (const event of events) {
    if (getTagValue(event, 'type') !== 'quest') continue;
    const dTag = getTagValue(event, 'd') || '?';
    const requires = getTags(event, 'requires');
    if (requires.length === 0) continue;

    let hasInteractionGuard = false;  // any requires that needs player action
    let hasSelfActiveGuard = false;   // requires self: active

    for (const req of requires) {
      const targetRef = req[1];
      const requiredState = req[2];
      if (!targetRef || !isEventRef(targetRef)) continue;

      const targetDTag = extractDTagFromRef(targetRef);
      const targetType = inferTypeFromDTag(targetDTag);

      // Self-active guard: requires self to be active
      if (targetDTag === dTag && requiredState === 'active') {
        hasSelfActiveGuard = true;
        hasInteractionGuard = true;
        continue;
      }

      if (targetType === 'npc') {
        const initState = npcInitialState.get(targetDTag);
        if (initState && initState === requiredState) {
          // Rule A: requires NPC in its starting state — always satisfied
          warnings.push({
            dTag,
            category: 'auto-cascade',
            message: `requires NPC "${targetDTag}" in state "${requiredState}" — that is the NPC's initial state, so this requires is always satisfied at world start`,
            tag: req.join(', '),
            fix: `Change the requires to a post-interaction state (e.g. "observed", "suspicious"), set that state via a dialogue on-enter, and require self "active" so the quest only completes after the player has the interaction.`,
          });
          // Still counts as having an NPC guard — just a broken one
        } else if (initState && initState !== requiredState) {
          // NPC in a non-initial state — player must interact to change it
          hasInteractionGuard = true;
        }
      } else if (targetType === 'item') {
        // Item state guard — requires interaction to acquire/change
        hasInteractionGuard = true;
      } else if (targetType === 'quest') {
        // Quest-chain requires — passive, _evalQuests can satisfy recursively
        // (not an interaction guard on its own)
      } else {
        // world, dialogue, portal, etc. — treated as passive for this check
      }
    }

    // Rule B: all requires are quest-chain (or world-state) with no interaction guard
    if (!hasInteractionGuard && !hasSelfActiveGuard && requires.length > 0) {
      const allQuestChain = requires.every((req) => {
        const targetDTag = extractDTagFromRef(req[1]);
        const t = inferTypeFromDTag(targetDTag);
        return t === 'quest' || t === 'world' || !t;
      });
      if (allQuestChain) {
        warnings.push({
          dTag,
          category: 'auto-cascade',
          message: `all requires are quest/world-state checks — quest may complete automatically without any player interaction`,
          fix: `If player interaction is required, add ["requires", "<self-ref>", "active", ""] and have a dialogue on-enter set it active. If the cascade is intentional (e.g. a chain milestone), this warning can be ignored.`,
        });
      }
    }
  }

  // ── 14. Dialogue item condition with non-empty state ─────────────────────
  // dialogue tag shape: ["dialogue", "<dialogue-ref>", "<requires-ref>", "<requires-state>"]
  // When the requires-ref is an item, the state field is almost always a bug:
  // the engine only sets states on items via explicit set-state actions, never
  // via "held" or similar. Empty string means "check inventory possession".
  for (const event of events) {
    if (getTagValue(event, 'type') !== 'npc') continue;
    const npcDTag = getTagValue(event, 'd') || '?';
    for (const tag of getTags(event, 'dialogue')) {
      const requiresRef = tag[2];
      const requiresState = tag[3];
      if (!requiresRef || !requiresState || !isEventRef(requiresRef)) continue;
      const requiresDTag = extractDTagFromRef(requiresRef);
      if (!requiresDTag) continue;
      const requiresType = inferTypeFromDTag(requiresDTag);
      if (requiresType === 'item') {
        warnings.push({
          dTag: npcDTag,
          category: 'dialogue-item-state',
          message: `dialogue condition references item "${requiresDTag}" with state "${requiresState}" — item states are almost never set; the condition will always be false`,
          tag: tag.join(', '),
          fix: `Change the dialogue tag's state field to "" to check that the player holds the item, or remove the condition entirely.`,
        });
      }
    }
  }

  // ── 15. Quest state conflict: on-enter active vs on-complete complete ─────
  // If a dialogue's on-enter sets quest X to "active", but a quest's on-complete
  // sets X to "complete", the dialogue could fire after the chain completes X —
  // resetting it to active and causing double-completion on next _evalQuests pass.
  // on-enter shape: ["on-enter", "<who>", "<state-guard>", "<action>", "<target>", "<ext-ref>"]
  // on-complete shape: ["on-complete", "<who>", "<action>", "<target>", "<ext-ref>"]
  const completedViaOnComplete = new Map(); // questDTag → completing quest dTag
  for (const event of events) {
    if (getTagValue(event, 'type') !== 'quest') continue;
    const completingDTag = getTagValue(event, 'd');
    for (const tag of getTags(event, 'on-complete')) {
      const action = tag[2];
      const state = tag[3];
      const targetRef = tag[4];
      if (action === 'set-state' && state === 'complete' && isEventRef(targetRef)) {
        const targetDTag = extractDTagFromRef(targetRef);
        if (targetDTag) completedViaOnComplete.set(targetDTag, completingDTag);
      }
    }
  }
  for (const event of events) {
    if (getTagValue(event, 'type') !== 'dialogue') continue;
    const dialogueDTag = getTagValue(event, 'd') || '?';
    for (const tag of getTags(event, 'on-enter')) {
      const action = tag[3];
      const state = tag[4];
      const targetRef = tag[5];
      if (action === 'set-state' && state === 'active' && isEventRef(targetRef)) {
        const targetDTag = extractDTagFromRef(targetRef);
        const completingQuest = completedViaOnComplete.get(targetDTag);
        if (completingQuest) {
          warnings.push({
            dTag: dialogueDTag,
            category: 'quest-state-conflict',
            message: `on-enter sets quest "${targetDTag}" to active, but "${completingQuest}" already sets it to complete — if this dialogue fires after that quest completes, the quest resets to active`,
            tag: tag.join(', '),
            fix: `Add ["requires-not", "<quest-ref>", "complete", ""] to this dialogue's event to prevent it firing after the quest is already complete.`,
          });
        }
      }
    }
  }

  // ── 16. Orphaned items ────────────────────────────────────────────────────
  // An item that is never placed in a place AND never targeted by a give-item
  // action cannot be obtained by the player. Scan all on-* tags for give-item.
  const reachableItemRefs = new Set();
  for (const event of events) {
    if (getTagValue(event, 'type') !== 'place') continue;
    for (const tag of getTags(event, 'item')) {
      const refDTag = extractDTagFromRef(tag[1]);
      if (refDTag) reachableItemRefs.add(refDTag);
    }
  }
  for (const event of events) {
    for (const tag of event.tags || []) {
      if (!tag[0]?.startsWith('on-')) continue;
      for (let i = 1; i < tag.length - 1; i++) {
        if (tag[i] === 'give-item' && isEventRef(tag[i + 1])) {
          const refDTag = extractDTagFromRef(tag[i + 1]);
          if (refDTag) reachableItemRefs.add(refDTag);
        }
      }
    }
  }
  for (const event of events) {
    if (getTagValue(event, 'type') !== 'item') continue;
    const itemDTag = getTagValue(event, 'd') || '?';
    if (!reachableItemRefs.has(itemDTag)) {
      warnings.push({
        dTag: itemDTag,
        category: 'orphaned-item',
        message: `Item is never placed in a place or given via a give-item action — players cannot obtain it`,
        fix: `Add ["item", "<ref>"] to a place event, or add a ["give-item", "<ref>"] action to an on-complete, on-enter, or on-interact trigger.`,
      });
    }
  }

  // ── 17. Answer hash mismatch (sync check — collect for async verify) ────
  const puzzlesToVerify = [];
  for (const event of events) {
    const eventType = getTagValue(event, 'type');
    if (eventType !== 'puzzle') continue;
    const dTag = getTagValue(event, 'd');
    const answerHash = getTagValue(event, 'answer-hash');
    const salt = getTagValue(event, 'salt');
    if (dTag && answerHash && salt && answers[dTag]) {
      puzzlesToVerify.push({ dTag, answerHash, salt, answer: answers[dTag] });
    }
  }

  return { errors, warnings, hints, puzzlesToVerify };
}

/**
 * Async verification of puzzle answer hashes.
 * The engine trims answers before hashing (case-sensitive).
 * This catches mismatches between stored answers and answer-hash tags.
 *
 * @param {Array<{dTag, answerHash, salt, answer}>} puzzlesToVerify
 * @returns {Promise<Array<{dTag, category, message, fix}>>} — additional errors
 */
export async function verifyPuzzleHashes(puzzlesToVerify) {
  const errors = [];
  for (const { dTag, answerHash, salt, answer } of puzzlesToVerify) {
    const trimmed = answer.trim();
    const data = new TextEncoder().encode(trimmed + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (hashHex !== answerHash) {
      errors.push({
        dTag,
        category: 'hash-mismatch',
        message: `Answer hash mismatch — stored answer "${answer}" does not match answer-hash.`,
        fix: `The answer "${answer}" does not produce the expected hash. Update the "answers" object with the correct answer, or regenerate the ["answer-hash", "..."] tag using SHA-256(answer + salt).`,
      });
    }
  }
  return errors;
}
