/**
 * draftStore.js — Draft CRUD against localStorage.
 *
 * Drafts are unsigned event templates stored locally until published.
 * Uses the same shape as the bulk import/export format:
 *
 *   { events: [{ kind, tags, content, _draft: { id, createdAt, updatedAt } }],
 *     answers: {} }
 *
 * Event refs use `<PUBKEY>` placeholder — resolved at publish time.
 *
 * Storage key: `drafts:<world-slug>`
 */

const STORAGE_PREFIX = 'drafts:';
const PUBLISH_STATUS_PREFIX = 'publishStatus:';
export const PUBKEY_PLACEHOLDER = '<PUBKEY>';

/**
 * Compare two events for equality (ignoring _draft metadata, pubkey, sig, id, created_at).
 * Tags are compared as sorted JSON strings to handle order differences.
 */
function eventsEqual(a, b) {
  if (!a || !b) return false;
  if ((a.content || '') !== (b.content || '')) return false;
  // Normalize <PUBKEY> placeholders: replace with the other event's pubkey for comparison
  const pubkeyA = a.pubkey || '';
  const pubkeyB = b.pubkey || '';
  const normA = JSON.stringify([...(a.tags || [])].sort())
    .replaceAll('<PUBKEY>', pubkeyB || pubkeyA);
  const normB = JSON.stringify([...(b.tags || [])].sort())
    .replaceAll('<PUBKEY>', pubkeyA || pubkeyB);
  return normA === normB;
}

/**
 * Parse JSON with lenient handling — strips // comments and trailing commas.
 * Standard JSON doesn't support comments, but world authors may add them.
 */
export function parseJsonLenient(raw) {
  // Strip single-line // comments (not inside strings)
  const stripped = raw.replace(/^\s*\/\/.*$/gm, '');
  // Strip trailing commas before } or ]
  const cleaned = stripped.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(cleaned);
}

function getKey(worldSlug) {
  return `${STORAGE_PREFIX}${worldSlug}`;
}

function readStore(worldSlug) {
  try {
    const raw = localStorage.getItem(getKey(worldSlug));
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old format: { drafts: [...] } → { events: [...] }
      if (parsed.drafts && !parsed.events) {
        return migrateOldFormat(parsed);
      }
      return parsed;
    }
  } catch {
    // Corrupt — start fresh
  }
  return { events: [], answers: {} };
}

/** Migrate from old draft format to event template format */
function migrateOldFormat(old) {
  const events = old.drafts.map((d) => {
    // Reconstruct tags: old format had separate eventType + tags
    const hasDTag = d.tags?.some((t) => t[0] === 'd');
    const hasTTag = d.tags?.some((t) => t[0] === 't');
    const hasTypeTag = d.tags?.some((t) => t[0] === 'type');

    const tags = [];
    if (!hasDTag && d.dTag) tags.push(['d', d.dTag]);
    if (!hasTTag) tags.push(['t', '']);  // will be filled on edit
    if (!hasTypeTag && d.eventType) tags.push(['type', d.eventType]);
    tags.push(...(d.tags || []));

    return {
      kind: 30078,
      tags,
      content: d.content || '',
      _draft: {
        id: d.id || crypto.randomUUID(),
        createdAt: d.createdAt || Date.now(),
        updatedAt: d.updatedAt || Date.now(),
      },
    };
  });
  return { events, answers: {} };
}

function writeStore(worldSlug, store) {
  localStorage.setItem(getKey(worldSlug), JSON.stringify(store));
}

// ── Helpers to read tags from event templates ──────────────────────────────

function getTagValue(event, tagName) {
  const tag = event.tags?.find((t) => t[0] === tagName);
  return tag?.[1] ?? null;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Load all draft events for a world.
 * Returns array of event templates with _draft metadata.
 */
export function loadDrafts(worldSlug) {
  return readStore(worldSlug).events;
}

/**
 * Load the answers map.
 */
export function loadAnswers(worldSlug) {
  return readStore(worldSlug).answers || {};
}

/**
 * Load the walkthrough array (if any).
 */
export function loadWalkthrough(worldSlug) {
  return readStore(worldSlug).walkthrough || null;
}

/**
 * Save a new draft event template. Returns the entry with _draft metadata.
 */
export function saveDraft(worldSlug, event) {
  const store = readStore(worldSlug);
  const now = Date.now();
  const entry = {
    kind: event.kind || 30078,
    tags: event.tags || [],
    content: event.content || '',
    _draft: {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    },
  };
  store.events.push(entry);
  writeStore(worldSlug, store);
  return entry;
}

/**
 * Update an existing draft by id.
 */
export function updateDraft(worldSlug, id, updates) {
  const store = readStore(worldSlug);
  const idx = store.events.findIndex((e) => e._draft?.id === id);
  if (idx === -1) return null;
  store.events[idx] = {
    ...store.events[idx],
    ...updates,
    _draft: {
      ...store.events[idx]._draft,
      updatedAt: Date.now(),
    },
  };
  writeStore(worldSlug, store);
  return store.events[idx];
}

/**
 * Delete a draft by id.
 */
export function deleteDraft(worldSlug, id) {
  const store = readStore(worldSlug);
  store.events = store.events.filter((e) => e._draft?.id !== id);
  writeStore(worldSlug, store);
}

/**
 * Delete all drafts for a world.
 */
export function clearDrafts(worldSlug) {
  const store = readStore(worldSlug);
  store.events = [];
  writeStore(worldSlug, store);
}

/**
 * Get a single draft by id.
 */
export function getDraft(worldSlug, id) {
  const store = readStore(worldSlug);
  return store.events.find((e) => e._draft?.id === id) || null;
}

/**
 * Save or update an answer for a puzzle d-tag.
 */
export function saveAnswer(worldSlug, dTag, answer) {
  const store = readStore(worldSlug);
  store.answers = store.answers || {};
  store.answers[dTag] = answer;
  writeStore(worldSlug, store);
}

// ── Discovery ─────────────────────────────────────────────────────────────

/**
 * Scan localStorage for all worlds that have local drafts.
 * Returns metadata for each draft world (slug, title, etc.).
 */
export function listDraftWorlds() {
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith(STORAGE_PREFIX)) continue;
    const slug = key.slice(STORAGE_PREFIX.length);
    if (!slug) continue;
    const store = readStore(slug);
    const worldDraft = store.events.find(
      (e) => e.tags?.find((t) => t[0] === 'type')?.[1] === 'world'
    );
    if (worldDraft) {
      results.push({
        slug,
        title: getTagValue(worldDraft, 'title') || slug,
        author: getTagValue(worldDraft, 'author') || '',
        description: worldDraft.content || '',
        tags: worldDraft.tags.filter((t) => t[0] === 'tag').map((t) => t[1]),
        cw: worldDraft.tags.filter((t) => t[0] === 'cw').map((t) => t[1]),
        collaboration: getTagValue(worldDraft, 'collaboration') || 'closed',
        isDraft: true,
        draftCount: store.events.length,
      });
    }
  }
  return results;
}

// ── Import Validation ─────────────────────────────────────────────────────

/**
 * Validate import data before importing.
 * Checks structure, world slug consistency, and d-tag duplicates.
 *
 * @param {string} worldSlug - expected world slug (from current world context)
 * @param {{ events?: Array, answers?: Object }} data
 * @returns {{ valid: Array, rejected: Array<{event, reason}>, warnings: string[], worldSlug: string|null }}
 */
/**
 * @param {string} worldSlug
 * @param {{ events: Array }} data
 * @param {Map<string, object>} [publishedEvents] — optional map of a-tag → published event for diff
 */
export function validateImport(worldSlug, data, publishedEvents) {
  const warnings = [];
  const valid = [];
  const rejected = [];
  let unchangedCount = 0;
  let updatedCount = 0;

  // Support both { events: [...] } and bare array formats
  const eventList = Array.isArray(data) ? data : (Array.isArray(data?.events) ? data.events : null);

  if (!eventList) {
    return { valid: [], rejected: [], warnings: ['Invalid format: expected { events: [...] } or a bare array'], worldSlug: null };
  }

  if (eventList.length === 0) {
    return { valid: [], rejected: [], warnings: ['No events found in file'], worldSlug: null };
  }

  // Detect the world slug from the data (from the world event's t-tag, or first event's t-tag)
  const worldEvent = eventList.find((e) =>
    e.tags?.find((t) => t[0] === 'type')?.[1] === 'world'
  );
  const detectedSlug = worldEvent
    ? getTagValue(worldEvent, 't')
    : getTagValue(eventList[0], 't');

  const store = readStore(worldSlug);
  // Build lookup of existing drafts by d-tag
  const draftsByDTag = new Map();
  for (const e of store.events) {
    const d = getTagValue(e, 'd');
    if (d) draftsByDTag.set(d, e);
  }

  const seenDTags = new Set();

  for (const event of eventList) {
    if (!event.tags || !Array.isArray(event.tags)) {
      rejected.push({ event, reason: 'Missing or invalid tags array' });
      continue;
    }

    const dTag = getTagValue(event, 'd');
    if (!dTag) {
      rejected.push({ event, reason: 'Missing d-tag' });
      continue;
    }

    const tTag = getTagValue(event, 't');
    if (tTag && worldSlug && tTag !== worldSlug) {
      rejected.push({ event, reason: `World mismatch: "${tTag}" (expected "${worldSlug}")` });
      continue;
    }

    // Intra-import duplicate check
    if (seenDTags.has(dTag)) {
      rejected.push({ event, reason: `Duplicate d-tag in file: ${dTag}` });
      continue;
    }
    seenDTags.add(dTag);

    const typeTag = getTagValue(event, 'type');
    if (!typeTag) {
      warnings.push(`${dTag}: missing type tag`);
    }

    // Compare against existing draft
    const existingDraft = draftsByDTag.get(dTag);
    if (existingDraft && eventsEqual(event, existingDraft)) {
      unchangedCount++;
      rejected.push({ event, reason: 'Unchanged (matches existing draft)' });
      continue;
    }

    // Compare against published event (if available)
    if (publishedEvents) {
      // Try both a-tag formats: with pubkey and with placeholder
      let published = null;
      for (const [aTag, ev] of publishedEvents) {
        const pubDTag = ev.tags?.find((t) => t[0] === 'd')?.[1];
        if (pubDTag === dTag) { published = ev; break; }
      }
      if (published && eventsEqual(event, published)) {
        unchangedCount++;
        rejected.push({ event, reason: 'Unchanged (matches published event)' });
        continue;
      }
    }

    // Mark as updated if replacing an existing draft
    if (existingDraft) {
      event._importStatus = 'updated';
      updatedCount++;
    }

    valid.push(event);
  }

  // Warn if no world event in the valid set (and none already in drafts)
  const hasWorldInValid = valid.some((e) => getTagValue(e, 'type') === 'world');
  const hasWorldInStore = store.events.some((e) => e.tags?.find((t) => t[0] === 'type')?.[1] === 'world');
  if (!hasWorldInValid && !hasWorldInStore) {
    warnings.unshift('No world event found — the world will not appear in the lobby');
  }

  // Note walkthrough presence
  const walkthroughSteps = Array.isArray(data.walkthrough) ? data.walkthrough.length : 0;

  return { valid, rejected, warnings, worldSlug: detectedSlug, walkthroughSteps, unchangedCount, updatedCount };
}

// ── Import / Export ────────────────────────────────────────────────────────

/**
 * Import events from a JSON object (the lighthouse format).
 * Each event becomes a draft. Existing drafts with the same d-tag are skipped.
 *
 * @param {string} worldSlug
 * @param {{ events: Array, answers?: Object }} data
 * @returns {{ imported: number, skipped: number }}
 */
export function importEvents(worldSlug, data) {
  const store = readStore(worldSlug);
  const draftIndexByDTag = new Map();
  for (let i = 0; i < store.events.length; i++) {
    const d = getTagValue(store.events[i], 'd');
    if (d) draftIndexByDTag.set(d, i);
  }
  const now = Date.now();
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const event of (Array.isArray(data) ? data : (data.events || []))) {
    const dTag = getTagValue(event, 'd');
    const existingIdx = dTag ? draftIndexByDTag.get(dTag) : undefined;

    if (existingIdx !== undefined) {
      // Update existing draft if content changed
      if (eventsEqual(event, store.events[existingIdx])) {
        skipped++;
        continue;
      }
      store.events[existingIdx] = {
        kind: event.kind || 30078,
        tags: event.tags || [],
        content: event.content || '',
        _draft: {
          ...store.events[existingIdx]._draft,
          updatedAt: now,
        },
      };
      updated++;
      continue;
    }

    store.events.push({
      kind: event.kind || 30078,
      tags: event.tags || [],
      content: event.content || '',
      _draft: {
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      },
    });
    if (dTag) draftIndexByDTag.set(dTag, store.events.length - 1);
    imported++;
  }

  // Merge answers
  if (data.answers) {
    store.answers = { ...(store.answers || {}), ...data.answers };
  }

  // Store walkthrough (replace, not merge)
  if (data.walkthrough) {
    store.walkthrough = data.walkthrough;
  }

  writeStore(worldSlug, store);
  return { imported, updated, skipped };
}

/**
 * Export all drafts as a clean JSON object (no _draft metadata).
 * Suitable for sharing or re-importing.
 *
 * @param {string} worldSlug
 * @returns {{ events: Array, answers: Object }}
 */
export function exportDrafts(worldSlug) {
  const store = readStore(worldSlug);
  const events = store.events.map(({ kind, tags, content }) => ({
    kind,
    tags,
    content,
  }));
  return {
    events,
    answers: store.answers || {},
  };
}

/**
 * Replace `<PUBKEY>` placeholder with actual pubkey in all tag values.
 *
 * @param {Object} event - event template { kind, tags, content }
 * @param {string} pubkey - hex pubkey to substitute
 * @returns {Object} - new event with substituted tags
 */
export function resolvePubkeyPlaceholder(event, pubkey) {
  return {
    ...event,
    tags: event.tags.map((tag) =>
      tag.map((val) =>
        typeof val === 'string' ? val.replaceAll(PUBKEY_PLACEHOLDER, pubkey) : val
      )
    ),
  };
}

/**
 * Bulk publish all drafts to multiple relays.
 *
 * Handles NIP-44 encryption: events with content-type application/nip44
 * are encrypted using the puzzle answer from the answers store before publishing.
 *
 * Publishes sequentially per relay (200ms delay) to avoid rate limits,
 * parallel across relays. Only removes a draft when it has been published
 * to ALL target relays.
 *
 * @param {string} worldSlug
 * @param {string} pubkey - publisher's pubkey (for placeholder substitution)
 * @param {Object} signer - { signEvent(event), encryptTo?(pubkey, plaintext) }
 * @param {Object} pool - pool ref (.current is RelayPool)
 * @param {Object} [options]
 * @param {Function} [options.onProgress] - called after each event with { total, published, failed, details }
 * @returns {Promise<{ published: number, failed: number, errors: string[], details: Array }>}
 */
/**
 * Persist a lightweight publish failure summary for a world.
 * Only saved when failed > 0 so the UI can warn the author on next open.
 *
 * Shape: { failed, total, relayErrors: { url: count }, timestamp }
 */
export function savePublishStatus(worldSlug, result) {
  if (!result) return;
  const { failed, details } = result;
  const total = (result.published || 0) + (result.failed || 0);
  const relayErrors = {};
  for (const d of details || []) {
    for (const [url, status] of Object.entries(d.relays || {})) {
      if (status === 'failed') relayErrors[url] = (relayErrors[url] || 0) + 1;
    }
  }
  const status = { failed, total, relayErrors, timestamp: Date.now() };
  try {
    localStorage.setItem(`${PUBLISH_STATUS_PREFIX}${worldSlug}`, JSON.stringify(status));
  } catch { /* storage full — not critical */ }
}

/** Load the last publish failure summary, or null if none / all clean. */
export function loadPublishStatus(worldSlug) {
  try {
    const raw = localStorage.getItem(`${PUBLISH_STATUS_PREFIX}${worldSlug}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Clear the stored publish status (call after a fully successful publish). */
export function clearPublishStatus(worldSlug) {
  try {
    localStorage.removeItem(`${PUBLISH_STATUS_PREFIX}${worldSlug}`);
  } catch { /* ignore */ }
}

export async function bulkPublish(worldSlug, pubkey, signer, pool, options = {}) {
  const { publishEvent, encryptEventContent } = await import('./eventBuilder.js');
  const store = readStore(worldSlug);
  const answers = store.answers || {};
  const allResolved = store.events.map((e) => resolvePubkeyPlaceholder(e, pubkey));
  const errors = [];

  // Sign all events first.
  // Stagger created_at by index so events have unique timestamps — this ensures
  // that timestamp-based relay pagination works correctly for large worlds.
  const baseTime = Math.floor(Date.now() / 1000);
  const signed = [];
  for (let i = 0; i < store.events.length; i++) {
    const event = store.events[i];
    const resolved = allResolved[i];
    const dTag = getTagValue(event, 'd') || '?';
    try {
      const prepared = await encryptEventContent(resolved, signer, answers, allResolved);
      const unsigned = { ...prepared, created_at: baseTime + i };
      const signedEvent = await signer.signEvent(unsigned);
      signed.push({ draftId: event._draft?.id, dTag, signed: signedEvent });
    } catch (err) {
      errors.push(`${dTag}: ${err.message}`);
      signed.push({ draftId: event._draft?.id, dTag, signed: null, error: err.message });
    }
  }

  // Publish to all connected relays
  const target = pool.current;
  if (!target || typeof target.connectedUrls === 'undefined') {
    // Legacy single relay fallback
    return _bulkPublishLegacy(worldSlug, store, signed, target, errors, options);
  }

  const relayUrls = target.connectedUrls;
  const total = signed.filter((s) => s.signed).length;

  // Track per-event per-relay status
  const details = signed.map((s) => ({
    draftId: s.draftId,
    dTag: s.dTag,
    signedEvent: s.signed || null,
    relays: Object.fromEntries(relayUrls.map((url) => [url, s.signed ? 'pending' : 'skipped'])),
    signError: s.error || null,
  }));

  let publishedCount = 0;
  let failedCount = 0;

  // Publish sequentially per relay (delay between events), parallel across relays
  const DELAY_MS = 200;
  const completedEvents = new Set(); // track events completed on all relays
  await Promise.allSettled(relayUrls.map(async (url) => {
    for (let i = 0; i < signed.length; i++) {
      const { signed: ev, dTag } = signed[i];
      if (!ev) continue;
      try {
        const results = await target.publishTo(ev, [url]);
        const result = results.get(url);
        details[i].relays[url] = result?.ok ? 'ok' : 'failed';
        if (!result?.ok) {
          errors.push(`${dTag} → ${url}: ${result?.error || 'unknown'}`);
        }
      } catch (err) {
        details[i].relays[url] = 'failed';
        errors.push(`${dTag} → ${url}: ${err.message}`);
      }
      // Fire progress after each event completes on this relay
      if (!completedEvents.has(i)) {
        const allDone = Object.values(details[i].relays).every((s) => s !== 'pending');
        if (allDone) {
          completedEvents.add(i);
          const ok = Object.values(details[i].relays).some((s) => s === 'ok');
          if (ok) publishedCount++;
          else failedCount++;
          options.onProgress?.({ total, published: publishedCount, failed: failedCount, details });
        }
      }
      // Delay between events per relay
      if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }));

  // Count results and remove fully-published drafts
  const publishedIds = [];
  for (const detail of details) {
    if (detail.signError) { failedCount++; continue; }
    const statuses = Object.values(detail.relays);
    const allOk = statuses.every((s) => s === 'ok');
    const anyOk = statuses.some((s) => s === 'ok');
    if (allOk) {
      publishedCount++;
      if (detail.draftId) publishedIds.push(detail.draftId);
    } else if (anyOk) {
      // Partially published — keep draft (not fully replicated)
      publishedCount++;
    } else {
      failedCount++;
    }
  }

  // Only remove drafts that succeeded on ALL relays
  if (publishedIds.length > 0) {
    const idSet = new Set(publishedIds);
    store.events = store.events.filter((e) => !idSet.has(e._draft?.id));
    writeStore(worldSlug, store);
  }

  options.onProgress?.({ total, published: publishedCount, failed: failedCount, details });

  return { published: publishedCount, failed: failedCount, errors, details };
}

/**
 * Retry publishing events that failed on specific relays.
 * Re-publishes only the failed relay×event pairs from a previous result.
 */
export async function retryFailed(previousResult, pool, options = {}) {
  if (!pool || !previousResult?.details) return previousResult;

  const DELAY_MS = 1000; // longer delay for retry (rate limit recovery)
  const relayUrls = pool.connectedUrls;
  const errors = [];
  let publishedCount = previousResult.published;
  let failedCount = 0;

  // Find events with failed relays
  const retryDetails = previousResult.details.filter((d) =>
    d.signedEvent && Object.values(d.relays).some((s) => s === 'failed')
  );

  for (const detail of retryDetails) {
    const failedRelays = Object.entries(detail.relays)
      .filter(([, s]) => s === 'failed')
      .map(([url]) => url);

    const results = await pool.publishTo(detail.signedEvent, failedRelays);
    for (const [url, res] of results) {
      detail.relays[url] = res.ok ? 'ok' : 'failed';
      if (!res.ok) errors.push(`${detail.dTag} → ${url}: ${res.error}`);
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  // Recount failures
  failedCount = previousResult.details.filter((d) =>
    Object.values(d.relays).some((s) => s === 'failed')
  ).length;

  const result = {
    published: previousResult.details.length - failedCount,
    failed: failedCount,
    errors: [...(previousResult.errors || []), ...errors],
    details: previousResult.details,
  };

  options.onProgress?.(result);
  return result;
}

/** Legacy fallback for single relay. */
async function _bulkPublishLegacy(worldSlug, store, signed, relay, errors, options) {
  let published = 0;
  let failed = 0;
  const publishedIds = [];

  for (const { draftId, dTag, signed: ev, error } of signed) {
    if (!ev) { failed++; continue; }
    try {
      if (!relay) throw new Error('Not connected to relay.');
      await relay.publish(ev);
      published++;
      if (draftId) publishedIds.push(draftId);
    } catch (err) {
      failed++;
      errors.push(`${dTag}: ${err.message}`);
    }
  }

  if (publishedIds.length > 0) {
    const idSet = new Set(publishedIds);
    store.events = store.events.filter((e) => !idSet.has(e._draft?.id));
    writeStore(worldSlug, store);
  }

  return { published, failed, errors, details: [] };
}
