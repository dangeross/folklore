/**
 * eventBuilder.js — Construct valid NOSTR dungeon events from form data.
 */

import { TAG_SCHEMAS, TAGS_BY_EVENT_TYPE, TRIGGER_ACTIONS, ACTION_TARGET_FIELD, getTagSchema, tagToValues } from './tagSchema.js';

// ── Slug helpers ────────────────────────────────────────────────────────────

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function buildDTag(worldSlug, type, title) {
  return `${worldSlug}:${type}:${slugify(title)}`;
}

export function buildATag(pubkey, dTag) {
  return `30078:${pubkey}:${dTag}`;
}

// ── Template builder ────────────────────────────────────────────────────────

export function buildEventTemplate({ eventType, worldSlug, dTag, tags, content }) {
  const identityTags = [
    ['d', dTag],
    ['t', worldSlug],
    ['type', eventType],
  ];
  const userTags = tags.filter(
    (t) => t[0] !== 'd' && t[0] !== 't' && t[0] !== 'type'
  );
  return {
    kind: 30078,
    tags: [...identityTags, ...userTags],
    content: content || '',
  };
}

// ── Issue factory helpers ───────────────────────────────────────────────────

function err(category, message, fix, tag) {
  const issue = { category, message, fix };
  if (tag) issue.tag = tag;
  return issue;
}

function warn(category, message, fix, tag) {
  const issue = { category, message, fix };
  if (tag) issue.tag = tag;
  return issue;
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate a single event template.
 *
 * @param {Object} template - { kind, tags, content }
 * @returns {{ valid: boolean, errors: Array<{category, message, fix, tag?}>, warnings: Array<{category, message, fix, tag?}> }}
 */
export function validateEvent(template) {
  const errors = [];
  const warnings = [];

  const dTagValue = template.tags?.find((t) => t[0] === 'd')?.[1] || '?';

  // ── Identity tags ────────────────────────────────────────────────────────
  const tagNames = new Set(template.tags.map((t) => t[0]));

  if (!tagNames.has('d')) {
    errors.push(err('missing-tag', 'Missing d-tag', `Add a ["d", "<world>:<type>:<slug>"] tag to identify this event.`));
  }
  if (!tagNames.has('t')) {
    errors.push(err('missing-tag', 'Missing t-tag (world)', `Add a ["t", "<world-slug>"] tag to associate this event with a world.`));
  }
  if (!tagNames.has('type')) {
    errors.push(err('missing-tag', 'Missing type tag', `Add a ["type", "<event-type>"] tag (e.g. "place", "item", "feature", "npc", "portal").`));
  }

  const dTag = template.tags.find((t) => t[0] === 'd');
  if (dTag && !dTag[1]) {
    errors.push(err('missing-tag', 'D-tag value is empty', `Set the d-tag value to a unique identifier like "<world>:<type>:<slug>".`));
  }

  const typeTag = template.tags.find((t) => t[0] === 'type')?.[1];

  // World events need the protocol tag for relay discovery
  if (typeTag === 'world' && !tagNames.has('w')) {
    warnings.push(warn('missing-tag', 'World event missing w-tag (protocol identifier)', `Add a ["w", "folklore"] tag for relay discovery.`));
  }

  // World event d-tag must follow <slug>:world convention
  if (typeTag === 'world' && dTag?.[1]) {
    const tTag = template.tags.find((t) => t[0] === 't')?.[1];
    const expectedDTag = tTag ? `${tTag}:world` : null;
    if (expectedDTag && dTag[1] !== expectedDTag) {
      errors.push(err(
        'invalid-dtag',
        `World event d-tag must be "<slug>:world" — got "${dTag[1]}"`,
        `Change the d-tag to ["d", "${expectedDTag}"]. The client expects world events to use the format "<world-slug>:world".`,
      ));
    }
  }

  // Non-world event d-tags should follow <slug>:<type>:<name> convention
  if (typeTag && typeTag !== 'world' && dTag?.[1]) {
    const tTag = template.tags.find((t) => t[0] === 't')?.[1];
    if (tTag && !dTag[1].startsWith(`${tTag}:`)) {
      warnings.push(warn(
        'dtag-convention',
        `D-tag "${dTag[1]}" does not start with world slug "${tTag}:"`,
        `Convention is ["d", "${tTag}:${typeTag}:<name>"]. This helps group events by world.`,
      ));
    }
  }

  // ── Event ref format ─────────────────────────────────────────────────────
  for (const tag of template.tags) {
    for (let i = 1; i < tag.length; i++) {
      if (typeof tag[i] === 'string' && tag[i].startsWith('30078:')) {
        if (tag[i].includes('<PUBKEY>')) continue;
        const parts = tag[i].split(':');
        if (parts.length < 3 || parts[1].length !== 64) {
          errors.push(err(
            'invalid-ref',
            `Invalid event ref in ${tag[0]}: ${tag[i]}`,
            `Event refs must be "30078:<64-char-hex-pubkey>:<d-tag>". Check the pubkey length and format.`,
            tag.join(', '),
          ));
        }
      }
    }
  }

  // ── Schema-based field validation ────────────────────────────────────────
  if (typeTag) {
    for (const tag of template.tags) {
      const tagName = tag[0];
      const schema = getTagSchema(tagName, typeTag);
      if (!schema) continue;

      const values = tagToValues(tag, schema.fields);
      for (const field of schema.fields) {
        if (field.required && !values[field.name]) {
          errors.push(err(
            'required-field',
            `${schema.label || tagName}: "${field.name}" is required`,
            `Set the "${field.name}" field on the ["${tagName}", ...] tag.`,
            tag.join(', '),
          ));
        }
      }
    }

    // Title required on most event types
    const typesWithTitle = ['place', 'item', 'feature', 'clue', 'npc', 'payment', 'world', 'quest', 'recipe', 'puzzle'];
    if (typesWithTitle.includes(typeTag) && !tagNames.has('title')) {
      errors.push(err('missing-tag', 'Missing title tag', `Add a ["title", "<display name>"] tag to "${dTagValue}".`));
    }

    // Content required on most event types
    const contentOptionalTypes = ['portal', 'world', 'vouch', 'consequence', 'dialogue', 'recipe', 'payment', 'quest', 'sound'];
    if (!contentOptionalTypes.includes(typeTag) && !template.content) {
      errors.push(err(
        'missing-content',
        'Missing content — add a description in the content field',
        `Add descriptive text to the "content" field of "${dTagValue}". This is what players see when they examine or enter this ${typeTag}.`,
      ));
    }

    // Portal must have at least one exit
    if (typeTag === 'portal' && !tagNames.has('exit')) {
      errors.push(err('missing-tag', 'Portal must have at least one exit', `Add an ["exit", "30078:<pubkey>:<place-d-tag>", "<direction>", "<label>"] tag.`));
    }

    // Place should have at least one exit (warning)
    if (typeTag === 'place' && !tagNames.has('exit')) {
      warnings.push(warn('no-exits', 'Place has no exits — players cannot leave', `Add at least one ["exit", "<direction>"] tag to "${dTagValue}".`));
    }

    // Items/features/NPCs need at least one noun
    const typesWithNoun = ['item', 'feature', 'npc'];
    if (typesWithNoun.includes(typeTag) && !tagNames.has('noun')) {
      warnings.push(warn(
        'missing-noun',
        `${typeTag} has no noun — players cannot refer to it`,
        `Add a ["noun", "<name>", "<alias1>", ...] tag to "${dTagValue}" so players can refer to it in commands.`,
      ));
    }

    // Triggers with no action
    const triggerNames = ['on-interact', 'on-enter', 'on-encounter', 'on-attacked',
      'on-health', 'on-player-health', 'on-health-zero', 'on-player-health-zero', 'on-move', 'on-counter', 'on-complete', 'on-fail'];
    for (const tag of template.tags) {
      if (triggerNames.includes(tag[0])) {
        const schema = getTagSchema(tag[0], typeTag);
        if (schema) {
          const values = tagToValues(tag, schema.fields);
          if (!values.action) {
            errors.push(err(
              'trigger-no-action',
              `${schema.label}: no action type selected`,
              `Add an action type (e.g. "set-state", "give-item", "deal-damage") to the ["${tag[0]}", ...] tag, or remove the trigger.`,
              tag.join(', '),
            ));
          }
        }
      }
    }

    // ── Direction field: on-counter, on-health, on-player-health ───────────
    // Must be "down" or "up". LLMs commonly omit direction or put the wrong field first.
    const directionTriggers = {
      'on-counter': { pos: 1, shape: '["on-counter", "<direction>", "<counter>", "<threshold>", "<action>", "<target?>"]' },
      'on-health': { pos: 1, shape: '["on-health", "<direction>", "<threshold>", "<action>", "<target?>", "<event-ref?>"]' },
      'on-player-health': { pos: 1, shape: '["on-player-health", "<direction>", "<threshold>", "<action>", "<target?>"]' },
    };
    for (const tag of template.tags) {
      const spec = directionTriggers[tag[0]];
      if (!spec) continue;
      const direction = tag[spec.pos];
      if (direction !== 'down' && direction !== 'up') {
        errors.push(err(
          'invalid-direction',
          `${tag[0]} direction must be "down" or "up", got "${direction || '(empty)'}" — the tag shape is ${spec.shape}`,
          `Set field ${spec.pos} to "down" (fires at-or-below threshold) or "up" (fires at-or-above threshold).`,
          tag.join(', '),
        ));
      }
    }

    // ── Blank trigger-target: on-complete, on-fail ──────────────────────────
    // Position 1 must be "" (blank). LLMs often put a value there.
    for (const tag of template.tags) {
      if (tag[0] !== 'on-complete' && tag[0] !== 'on-fail') continue;
      if (tag[1] && tag[1].trim() !== '') {
        errors.push(err(
          'trigger-target-not-blank',
          `${tag[0]} trigger-target must be blank (""), got "${tag[1]}" — the tag shape is ["${tag[0]}", "", "<action>", "<target?>"]`,
          `Change the first field to "" (empty string). The value "${tag[1]}" should not be in position 1. The correct shape is: ["${tag[0]}", "", "${tag[2] || 'set-state'}", "${tag[3] || ''}"].`,
          tag.join(', '),
        ));
      }
    }

    // ── Invalid action type on triggers ─────────────────────────────────────
    // LLMs invent actions like "unlock", "remove", "teleport" that don't exist.
    for (const tag of template.tags) {
      const validActions = TRIGGER_ACTIONS[tag[0]];
      if (!validActions) continue;
      const schema = getTagSchema(tag[0], typeTag);
      if (!schema) continue;
      const values = tagToValues(tag, schema.fields);
      const action = values.action;
      if (action && !validActions.includes(action)) {
        errors.push(err(
          'invalid-action',
          `${tag[0]} action "${action}" is not valid — allowed actions: ${validActions.join(', ')}`,
          `Change the action to one of: ${validActions.join(', ')}. The action "${action}" does not exist in the spec.`,
          tag.join(', '),
        ));
      }
    }

    // ── Constrained select values ───────────────────────────────────────────
    // Validate fields with type 'select' have a value from their options list.
    // Catches LLMs using "public" instead of "open", "room" instead of "place", etc.
    const selectChecks = [
      { tag: 'type', field: 'value', label: 'Event type' },
      { tag: 'collaboration', field: 'value', label: 'Collaboration mode' },
      { tag: 'puzzle-type', field: 'value', label: 'Puzzle type' },
      { tag: 'order', field: 'value', label: 'Route order' },
      { tag: 'unit', field: 'value', label: 'Payment unit' },
      { tag: 'scope', field: 'value', label: 'Vouch scope' },
      { tag: 'theme', field: 'value', label: 'Theme preset' },
      { tag: 'font', field: 'value', label: 'Font' },
      { tag: 'cursor', field: 'value', label: 'Cursor style' },
      { tag: 'effects', field: 'value', label: 'Effect bundle' },
      { tag: 'flicker', field: 'value', label: 'Flicker' },
      { tag: 'quest-type', field: 'type', label: 'Quest type' },
      { tag: 'colour', field: 'slot', label: 'Colour slot' },
      { tag: 'transition-effect', field: 'value', label: 'Transition effect' },
      { tag: 'transition-clear', field: 'value', label: 'Transition clear' },
      { tag: 'roam-type', field: 'value', label: 'Roam type' },
    ];
    for (const check of selectChecks) {
      for (const tag of template.tags) {
        if (tag[0] !== check.tag) continue;
        const schema = getTagSchema(tag[0], typeTag || tag[1]); // type tag is its own type
        if (!schema) continue;
        const field = schema.fields.find((f) => f.name === check.field);
        if (!field?.options) continue;
        const values = tagToValues(tag, schema.fields);
        const val = values[check.field];
        if (val && !field.options.includes(val)) {
          errors.push(err(
            'invalid-enum',
            `${check.label} "${val}" is not valid — allowed values: ${field.options.join(', ')}`,
            `Change "${val}" to one of: ${field.options.join(', ')}.`,
            tag.join(', '),
          ));
        }
      }
    }

    // ── quest-type endgame mode validation ──────────────────────────────────
    for (const tag of template.tags) {
      if (tag[0] === 'quest-type' && tag[1] === 'endgame' && tag[2] && tag[2] !== 'open') {
        errors.push(err(
          'invalid-enum',
          `Endgame mode "${tag[2]}" is not valid — allowed values: "open" (soft end) or omit for hard end`,
          `Change ["quest-type", "endgame", "${tag[2]}"] to ["quest-type", "endgame"] (hard end) or ["quest-type", "endgame", "open"] (soft end).`,
          tag.join(', '),
        ));
      }
      if (tag[0] === 'quest-type' && tag[1] !== 'endgame' && tag[2]) {
        warnings.push(warn(
          'extra-fields',
          `quest-type "${tag[1]}" has an unexpected third element "${tag[2]}" — only "endgame" supports a mode`,
          `Remove the third element from ["quest-type", "${tag[1]}", "${tag[2]}"].`,
        ));
      }
    }

    // ── Numeric field validation ─────────────────────────────────────────────
    // Validate that fields declared as type 'number' in the schema are parseable.
    // Catches LLMs writing "ten" instead of "10", "high" instead of "3", etc.
    // Sound events are exempt — their numeric tags accept Strudel mini-notation
    // (e.g. "600 250" for alternating values, "0.5*4" for patterns).
    for (const tag of template.tags) {
      const schema = getTagSchema(tag[0], typeTag);
      if (!schema?.fields) continue;
      if (typeTag === 'sound') continue;
      const values = tagToValues(tag, schema.fields);
      for (const field of schema.fields) {
        if (field.type !== 'number') continue;
        const val = values[field.name];
        if (val === undefined || val === '') continue; // blank is handled by required-field checks
        if (isNaN(Number(val))) {
          errors.push(err(
            'invalid-number',
            `${schema.label || tag[0]} ${field.name} "${val}" is not a valid number`,
            `Change "${val}" to a numeric value (e.g. ${field.placeholder || '10'}).`,
            tag.join(', '),
          ));
        }
      }
    }

    // ── Numeric action targets ────────────────────────────────────────────────
    // Some action targets (deal-damage, heal) expect numbers, not event refs.
    const triggerPrefixes = ['on-interact', 'on-complete', 'on-fail', 'on-enter', 'on-encounter', 'on-attacked', 'on-health-zero', 'on-player-health-zero', 'on-move'];
    for (const tag of template.tags) {
      if (!triggerPrefixes.includes(tag[0])) continue;
      // on-interact and on-enter have state-guard at [2], action at [3]; others have action at [2]
      const actionIdx = (tag[0] === 'on-interact' || tag[0] === 'on-enter') ? 3 : 2;
      const actionType = tag[actionIdx];
      const actionTarget = tag[actionIdx + 1];
      if (!actionType || actionTarget === undefined || actionTarget === '') continue;
      const targetField = ACTION_TARGET_FIELD[actionType];
      if (!targetField || targetField.type !== 'number') continue;
      if (isNaN(Number(actionTarget))) {
        errors.push(err(
          'invalid-number',
          `${tag[0]} action target "${actionTarget}" is not a valid number — ${actionType} expects a numeric value`,
          `Change "${actionTarget}" to a number (e.g. ${targetField.placeholder || '5'}).`,
          tag.join(', '),
        ));
      }
    }

    // Also check on-counter and on-health which have different positions
    for (const tag of template.tags) {
      if (tag[0] === 'on-counter') {
        // ["on-counter", "direction", "counter", "threshold", "action", "target"]
        const actionType = tag[4];
        const actionTarget = tag[5];
        if (!actionType || actionTarget === undefined || actionTarget === '') continue;
        const targetField = ACTION_TARGET_FIELD[actionType];
        if (!targetField || targetField.type !== 'number') continue;
        if (isNaN(Number(actionTarget))) {
          errors.push(err(
            'invalid-number',
            `on-counter action target "${actionTarget}" is not a valid number — ${actionType} expects a numeric value`,
            `Change "${actionTarget}" to a number (e.g. ${targetField.placeholder || '5'}).`,
            tag.join(', '),
          ));
        }
      }
      if (tag[0] === 'on-health' || tag[0] === 'on-player-health') {
        // ["on-health", "direction", "threshold", "action", "target"]
        const actionType = tag[3];
        const actionTarget = tag[4];
        if (!actionType || actionTarget === undefined || actionTarget === '') continue;
        const targetField = ACTION_TARGET_FIELD[actionType];
        if (!targetField || targetField.type !== 'number') continue;
        if (isNaN(Number(actionTarget))) {
          errors.push(err(
            'invalid-number',
            `${tag[0]} action target "${actionTarget}" is not a valid number — ${actionType} expects a numeric value`,
            `Change "${actionTarget}" to a number (e.g. ${targetField.placeholder || '5'}).`,
            tag.join(', '),
          ));
        }
      }
    }

    // Sound role validation (on the sound play tag, not the sound event itself)
    for (const tag of template.tags) {
      if (tag[0] !== 'sound') continue;
      const role = tag[2]; // ["sound", "ref", "role", "volume", "state?"]
      if (role && !['ambient', 'layer', 'effect'].includes(role)) {
        errors.push(err(
          'invalid-enum',
          `Sound role "${role}" is not valid — allowed values: ambient, layer, effect`,
          `Change "${role}" to one of: ambient (loops), layer (adds to mix), effect (one-shot).`,
          tag.join(', '),
        ));
      }
    }

    // Transitions without initial state
    if (tagNames.has('transition') && !tagNames.has('state')) {
      warnings.push(warn(
        'missing-state',
        'Has transitions but no initial state',
        `Add a ["state", "<initial-state>"] tag to set the starting state.`,
      ));
    }

    // Verb declared but no matching on-interact
    const interactableTypes = ['feature', 'item', 'npc'];
    if (interactableTypes.includes(typeTag)) {
      const verbs = template.tags.filter((t) => t[0] === 'verb').map((t) => t[1]);
      const onInteractVerbs = new Set(
        template.tags.filter((t) => t[0] === 'on-interact').map((t) => t[1])
      );
      for (const verb of verbs) {
        if (verb && verb !== 'examine' && !onInteractVerbs.has(verb)) {
          warnings.push(warn(
            'unused-verb',
            `Verb "${verb}" has no matching on-interact — players can type it but nothing happens`,
            `Add an ["on-interact", "${verb}", "", "<action>", "<target>"] tag, or remove "${verb}" from the verb tag.`,
          ));
        }
      }
      // on-interact verb without matching verb tag (players can't trigger it)
      const declaredVerbs = new Set(
        template.tags.filter((t) => t[0] === 'verb').flatMap((t) => t.slice(1))
      );
      for (const onVerb of onInteractVerbs) {
        const builtinVerbs = new Set(['examine', 'talk', 'attack', 'pick up', 'take', 'get', 'grab', 'drop']);
        if (onVerb && !builtinVerbs.has(onVerb) && !declaredVerbs.has(onVerb)) {
          errors.push(err(
            'undeclared-verb',
            `on-interact uses verb "${onVerb}" but no ["verb", "${onVerb}"] tag exists — players cannot trigger this action`,
            `Add a ["verb", "${onVerb}"] tag so the parser recognises this command.`,
          ));
        }
      }
    }

    // on-interact / on-enter with too many elements
    for (const tag of template.tags) {
      if (tag[0] === 'on-interact' && tag.length > 6) {
        warnings.push(warn(
          'extra-fields',
          `on-interact "${tag[1]}" has ${tag.length - 1} fields (expected max 5) — extra elements are ignored`,
          `Remove the extra fields from ["on-interact", "${tag[1]}", ...]. The spec defines 5 fields: verb, state-guard, action, target, ext-ref.`,
          tag.join(', '),
        ));
      }
      if (tag[0] === 'on-enter' && tag.length > 6) {
        warnings.push(warn(
          'extra-fields',
          `on-enter has ${tag.length - 1} fields (expected max 5) — extra elements are ignored`,
          `Remove the extra fields from ["on-enter", ...]. The spec defines 5 fields: filter, state-guard, action, target, ext-ref.`,
          tag.join(', '),
        ));
      }
    }

    // NIP-44 content-type without puzzle tag
    const contentTypeTag = template.tags.find((t) => t[0] === 'content-type');
    if (contentTypeTag?.[1] === 'application/nip44' && !tagNames.has('puzzle')) {
      errors.push(err(
        'nip44',
        'NIP-44 encrypted content requires a puzzle tag to determine the encryption key',
        `Add a ["puzzle", "30078:<pubkey>:<puzzle-d-tag>"] tag referencing the puzzle whose answer derives the encryption key.`,
      ));
    }

    // Unknown tags for this event type
    const allowedTags = new Set([...(TAGS_BY_EVENT_TYPE[typeTag] || []), 'd', 't', 'type']);
    for (const tag of template.tags) {
      if (!allowedTags.has(tag[0])) {
        warnings.push(warn(
          'unknown-tag',
          `"${tag[0]}" is not expected on ${typeTag} events`,
          `The tag "${tag[0]}" is not in the spec for ${typeTag} events. Remove it, or check the spec for the correct tag name.`,
          tag.join(', '),
        ));
      }
    }
  }

  const valid = errors.length === 0;
  return { valid, errors, warnings };
}

/**
 * Encrypt NIP-44 content if the event requires it.
 *
 * Checks for content-type: application/nip44, looks up the puzzle answer
 * from the answers map, derives the puzzle keypair, and encrypts the content
 * using the signer's encryptTo method.
 *
 * @param {Object} template - event template { kind, tags, content }
 * @param {Object} signer - signer with encryptTo(pubkey, plaintext)
 * @param {Object} answers - { puzzleDTag: answer } map
 * @param {Map|Object} allEvents - events map to look up puzzle salt
 */
export async function encryptEventContent(template, signer, answers, allEvents) {
  const contentType = template.tags.find((t) => t[0] === 'content-type');
  if (!contentType || contentType[1] !== 'application/nip44') return template;

  const puzzleTag = template.tags.find((t) => t[0] === 'puzzle');
  if (!puzzleTag) return template;

  const puzzleRef = puzzleTag[1];
  const puzzleDTag = puzzleRef.split(':').slice(2).join(':');

  const answer = answers[puzzleDTag];
  if (!answer) {
    console.warn(`No answer stored for puzzle ${puzzleDTag} — skipping encryption`);
    return template;
  }

  // Look up puzzle event to get salt
  let puzzleEvent;
  if (allEvents instanceof Map) {
    for (const [, ev] of allEvents) {
      if (ev.tags?.find((t) => t[0] === 'd')?.[1] === puzzleDTag) {
        puzzleEvent = ev;
        break;
      }
    }
  } else if (Array.isArray(allEvents)) {
    puzzleEvent = allEvents.find(
      (ev) => ev.tags?.find((t) => t[0] === 'd')?.[1] === puzzleDTag
    );
  }

  if (!puzzleEvent) {
    console.warn(`Puzzle event ${puzzleDTag} not found — skipping encryption`);
    return template;
  }

  const salt = puzzleEvent.tags.find((t) => t[0] === 'salt')?.[1];
  if (!salt) {
    console.warn(`Puzzle ${puzzleDTag} has no salt — skipping encryption`);
    return template;
  }

  // Derive puzzle keypair from answer + salt
  const { derivePuzzleKeypair } = await import('../engine/nip44-client.js');
  const puzzleKey = await derivePuzzleKeypair(answer.trim(), salt);

  // Encrypt content
  const encrypted = await signer.encryptTo(puzzleKey.pubKeyHex, template.content);

  return {
    ...template,
    content: encrypted,
  };
}

/**
 * Sign and publish an event template to relays.
 *
 * Accepts either a RelayPool ref (pool.current) or a legacy relay ref.
 * When a pool is provided, publishes to all connected relays.
 *
 * @param {Object} signer - { signEvent(event), encryptTo?(pubkey, plaintext) }
 * @param {Object} poolOrRelay - pool ref (.current is RelayPool or legacy Relay)
 * @param {Object} template - from buildEventTemplate
 * @param {Object} [options] - { answers, allEvents } for NIP-44 encryption
 * @returns {Promise<{ ok: boolean, event?: Object, error?: string, results?: Map }>}
 */
export async function publishEvent(signer, poolOrRelay, template, options = {}) {
  try {
    // Encrypt NIP-44 content if needed
    const prepared = await encryptEventContent(
      template, signer, options.answers, options.allEvents
    );

    const unsigned = {
      ...prepared,
      created_at: Math.floor(Date.now() / 1000),
    };

    const signed = await signer.signEvent(unsigned);

    const target = poolOrRelay.current;
    if (!target) {
      return { ok: false, error: 'Not connected to any relay.' };
    }

    // RelayPool (has .publish that returns Map of results)
    if (typeof target.publish === 'function' && typeof target.connectedUrls !== 'undefined') {
      const results = await target.publish(signed);
      const anyOk = [...results.values()].some((r) => r.ok);
      if (!anyOk) {
        const errors = [...results.entries()]
          .filter(([, r]) => !r.ok)
          .map(([url, r]) => `${url}: ${r.error}`)
          .join('; ');
        return { ok: false, error: errors, results };
      }
      return { ok: true, event: signed, results };
    }

    // Legacy single relay
    await target.publish(signed);
    return { ok: true, event: signed };
  } catch (err) {
    return { ok: false, error: err.message || 'Publish failed.' };
  }
}

/**
 * Publish a report event for open world moderation.
 */
export async function publishReport({ pool, signer, worldSlug, targetRef, reason, shortTarget, shortReporter }) {
  const template = {
    kind: 30078,
    tags: [
      ['d', `${worldSlug}:report:${shortReporter}-${shortTarget}`],
      ['t', worldSlug],
      ['type', 'report'],
      ['target', targetRef],
      ['reason', reason],
    ],
    content: '',
  };
  return publishEvent(signer, pool, template);
}

/**
 * Publish a revoke event to remove a vouched author's trust.
 */
export async function publishRevoke({ pool, signer, worldSlug, targetPubkey }) {
  const shortSigner = signer.getPublicKey?.()?.slice(0, 8) || 'mod';
  const shortTarget = targetPubkey.slice(0, 8);
  const template = {
    kind: 30078,
    tags: [
      ['d', `${worldSlug}:revoke:${shortSigner}-${shortTarget}`],
      ['t', worldSlug],
      ['type', 'revoke'],
      ['pubkey', targetPubkey],
    ],
    content: '',
  };
  return publishEvent(signer, pool, template);
}

/**
 * Delete a published event from relays.
 * 1. Publish an empty overwrite (same d-tag, newer created_at) to clear content
 * 2. Publish a kind 5 deletion event to request removal
 * The overwrite ensures content is gone even on relays that ignore kind 5.
 */
export async function deletePublishedEvent({ pool, signer, event }) {
  const target = pool.current;
  if (!target) return { ok: false, error: 'Not connected to any relay.' };

  const dTag = event.tags?.find((t) => t[0] === 'd')?.[1];
  const tTag = event.tags?.find((t) => t[0] === 't')?.[1];
  if (!dTag) return { ok: false, error: 'Event has no d-tag.' };

  const now = Math.floor(Date.now() / 1000);

  // Step 1: empty overwrite (replaces content on all relays)
  const overwrite = await signer.signEvent({
    kind: 30078,
    created_at: now,
    tags: [['d', dTag], ...(tTag ? [['t', tTag]] : [])],
    content: '',
  });

  // Step 2: kind 5 deletion (relays that honour it remove the event)
  const aTag = `30078:${event.pubkey}:${dTag}`;
  const deletion = await signer.signEvent({
    kind: 5,
    created_at: now + 1,
    tags: [['a', aTag]],
    content: 'Event deleted by author.',
  });

  // Publish both — overwrite first, delete second
  const overwriteResults = await target.publish(overwrite);
  const deleteResults = await target.publish(deletion);

  const anyOk = [...overwriteResults.values()].some((r) => r.ok) ||
                [...deleteResults.values()].some((r) => r.ok);

  return {
    ok: anyOk,
    overwriteResults,
    deleteResults,
    error: anyOk ? null : 'Failed to delete on all relays.',
  };
}
