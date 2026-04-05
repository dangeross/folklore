/**
 * relayUrls.js — Relay URL resolution from multiple sources.
 *
 * Merges relay URLs from:
 *  1. Hardcoded defaults (config.js)
 *  2. World event relay tags
 *  3. NIP-65 user relay list (read-only)
 *  4. User custom relays (localStorage)
 */

import { DEFAULT_RELAY_URLS } from '../config.js';

const CUSTOM_RELAY_PREFIX = 'folklore:relays:';
const NIP65_CACHE_PREFIX = 'folklore:nip65:';
const NIP65_TTL = 60 * 60 * 1000; // 1 hour

// ── Source extractors ────────────────────────────────────────────────────────

/** Extract relay URLs from a world event's relay tags. */
export function getWorldRelays(worldEvent) {
  if (!worldEvent?.tags) return [];
  return worldEvent.tags
    .filter((t) => t[0] === 'relay' && t[1])
    .map((t) => t[1]);
}

/** Load custom relay URLs from localStorage for a world. */
export function getCustomRelays(worldSlug) {
  try {
    const raw = localStorage.getItem(`${CUSTOM_RELAY_PREFIX}${worldSlug}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Save custom relay URLs to localStorage. */
export function saveCustomRelays(worldSlug, urls) {
  localStorage.setItem(`${CUSTOM_RELAY_PREFIX}${worldSlug}`, JSON.stringify(urls));
}

// ── NIP-65 ───────────────────────────────────────────────────────────────────

/**
 * Fetch NIP-65 relay list (kind:10002) for a pubkey.
 * Uses a pool to query default relays. Caches in localStorage.
 *
 * @param {string} pubkey - hex pubkey
 * @param {import('./relayPool.js').RelayPool} pool
 * @returns {Promise<{ read: string[], write: string[] }>}
 */
export async function fetchNip65Relays(pubkey, pool) {
  // Check cache first
  try {
    const raw = localStorage.getItem(`${NIP65_CACHE_PREFIX}${pubkey}`);
    if (raw) {
      const cached = JSON.parse(raw);
      if (Date.now() - cached.fetchedAt < NIP65_TTL) {
        return { read: cached.read, write: cached.write };
      }
    }
  } catch {}

  // Fetch from relays
  return new Promise((resolve) => {
    let best = null;

    const relay = pool.getAnyRelay();
    if (!relay) {
      resolve({ read: [], write: [] });
      return;
    }

    const sub = relay.subscribe(
      [{ kinds: [10002], authors: [pubkey] }],
      {
        onevent(event) {
          if (!best || event.created_at > best.created_at) best = event;
        },
        oneose() {
          sub.close();
          const result = parseNip65(best);

          // Cache
          try {
            localStorage.setItem(`${NIP65_CACHE_PREFIX}${pubkey}`, JSON.stringify({
              ...result,
              fetchedAt: Date.now(),
            }));
          } catch {}

          resolve(result);
        },
      }
    );

    // Timeout
    setTimeout(() => {
      try { sub.close(); } catch {}
      resolve(parseNip65(best));
    }, 5000);
  });
}

/** Parse a NIP-65 kind:10002 event into read/write relay lists. */
export function parseNip65(event) {
  if (!event?.tags) return { read: [], write: [] };

  const read = [];
  const write = [];

  for (const tag of event.tags) {
    if (tag[0] !== 'r' || !tag[1]) continue;
    const marker = tag[2];
    if (marker === 'read') {
      read.push(tag[1]);
    } else if (marker === 'write') {
      write.push(tag[1]);
    } else {
      // No marker = both
      read.push(tag[1]);
      write.push(tag[1]);
    }
  }

  return { read, write };
}

// ── Merge ────────────────────────────────────────────────────────────────────

/**
 * Merge relay URLs from all sources into subscribe and publish sets.
 *
 * @param {{ worldRelays?: string[], nip65Read?: string[], nip65Write?: string[], custom?: string[] }} sources
 * @returns {{ subscribe: string[], publish: string[] }}
 */
export function mergeRelayUrls({ worldRelays = [], nip65Read = [], nip65Write = [], custom = [] } = {}) {
  const normalize = (url) => url.replace(/\/+$/, '');

  const subscribe = [...new Set([
    ...DEFAULT_RELAY_URLS,
    ...worldRelays,
    ...nip65Read,
    ...custom,
  ].map(normalize))];

  const publish = [...new Set([
    ...DEFAULT_RELAY_URLS,
    ...worldRelays,
    ...nip65Write,
    ...custom,
  ].map(normalize))];

  return { subscribe, publish };
}
