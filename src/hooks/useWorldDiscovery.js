/**
 * useWorldDiscovery — Discover folklore worlds from relays.
 *
 * Two modes:
 *   'curated'  — Fetch a specific pubkey's NIP-51 curated list (kind:30001,
 *                d-tag "folklore:worlds"), then load referenced world events.
 *   'search'   — Query all folklore worlds via indexed #w tag.
 */

import { useEffect, useState } from 'react';
import { Relay } from 'nostr-tools/relay';
import { RELAY_URLS } from '../config.js';

const CURATED_LIST_DTAG = 'folklore:worlds';

/**
 * Extract world metadata from a raw NOSTR event.
 */
function extractWorldInfo(event) {
  const get = (name) => event.tags.find((t) => t[0] === name)?.[1] || '';
  const getAll = (name) => event.tags.filter((t) => t[0] === name).map((t) => t[1]);

  const dTag = get('d');
  const slug = get('t') || dTag.replace(/:world$/, '');

  return {
    eventId: event.id || '',
    aTag: `30078:${event.pubkey}:${dTag}`,
    slug,
    title: get('title') || slug,
    author: get('author') || '',
    pubkey: event.pubkey,
    description: event.content || '',
    tags: getAll('tag'),
    cw: getAll('cw'),
    collaboration: get('collaboration') || 'closed',
    theme: get('theme') || '',
    version: get('version') || '',
    createdAt: event.created_at,
  };
}

/**
 * Extract world slugs from a NIP-51 curated list event.
 * List contains a-tags like "30078:<pubkey>:<slug>:world".
 */
function slugsFromCuratedList(listEvent) {
  const slugs = [];
  for (const tag of listEvent.tags) {
    if (tag[0] !== 'a') continue;
    const ref = tag[1];
    if (!ref) continue;
    const parts = ref.split(':');
    if (parts.length >= 4 && parts[0] === '30078') {
      const dTag = parts.slice(2).join(':');
      const slug = dTag.replace(/:world$/, '');
      if (slug) slugs.push(slug);
    }
  }
  return slugs;
}

/**
 * Collect world events into a Map, keeping the newest version of each.
 */
function collectWorld(event, collected) {
  const typeTag = event.tags.find((t) => t[0] === 'type')?.[1];
  if (typeTag !== 'world') return;

  const info = extractWorldInfo(event);
  const existing = collected.get(info.aTag);
  if (!existing || event.created_at > existing.createdAt) {
    collected.set(info.aTag, info);
  }
}

/**
 * Subscribe to a relay, collect matching events, close on EOSE.
 */
async function queryRelay(url, filter, collected, cancelled) {
  const relay = await Relay.connect(url);
  if (cancelled.current) { relay.close(); return false; }

  await new Promise((resolve) => {
    relay.subscribe([filter], {
      onevent(event) { collectWorld(event, collected); },
      oneose() { resolve(); },
    });
  });

  relay.close();
  return collected.size > 0;
}

/**
 * Curated mode: fetch a pubkey's folklore:worlds list, then load those worlds.
 */
async function discoverCurated(curatorPubkey, collected, cancelled) {
  let curatedSlugs = [];

  // Step 1: Fetch the curator's list
  for (const url of RELAY_URLS) {
    if (cancelled.current) return;
    try {
      const relay = await Relay.connect(url);
      if (cancelled.current) { relay.close(); return; }

      const lists = [];
      await new Promise((resolve) => {
        relay.subscribe(
          [{ kinds: [30001], authors: [curatorPubkey], '#d': [CURATED_LIST_DTAG] }],
          {
            onevent(event) { lists.push(event); },
            oneose() { resolve(); },
          }
        );
      });
      relay.close();

      for (const list of lists) {
        curatedSlugs.push(...slugsFromCuratedList(list));
      }
      if (lists.length > 0) break;
    } catch (err) {
      console.warn(`Curated list fetch failed on ${url}:`, err.message);
    }
  }

  curatedSlugs = [...new Set(curatedSlugs)];
  if (curatedSlugs.length === 0) return;

  // Step 2: Fetch world events by slug
  for (const url of RELAY_URLS) {
    if (cancelled.current) return;
    try {
      const found = await queryRelay(
        url,
        { kinds: [30078], '#t': curatedSlugs },
        collected,
        cancelled
      );
      if (found) return;
    } catch (err) {
      console.warn(`World fetch failed on ${url}:`, err.message);
    }
  }
}

/**
 * Search mode: find all folklore worlds via indexed #w tag.
 */
async function discoverAll(collected, cancelled) {
  for (const url of RELAY_URLS) {
    if (cancelled.current) return;
    try {
      const found = await queryRelay(
        url,
        { kinds: [30078], '#w': ['folklore'] },
        collected,
        cancelled
      );
      if (found) return;
    } catch (err) {
      console.warn(`World discovery failed on ${url}:`, err.message);
    }
  }
}

/**
 * Author mode: find all folklore worlds by a specific pubkey.
 */
async function discoverByAuthor(authorPubkey, collected, cancelled) {
  for (const url of RELAY_URLS) {
    if (cancelled.current) return;
    try {
      const found = await queryRelay(
        url,
        { kinds: [30078], authors: [authorPubkey], '#w': ['folklore'] },
        collected,
        cancelled
      );
      if (found) return;
    } catch (err) {
      console.warn(`Author discovery failed on ${url}:`, err.message);
    }
  }
}

/**
 * @param {'curated' | 'search' | 'author'} mode
 * @param {string} [pubkey] — required for 'curated' and 'author' modes
 */
export function useWorldDiscovery(mode = 'curated', pubkey) {
  const [worlds, setWorlds] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const cancelled = { current: false };
    const collected = new Map();

    setWorlds([]);
    setStatus('loading');

    async function run() {
      if (mode === 'author' && pubkey) {
        await discoverByAuthor(pubkey, collected, cancelled);
      } else if (mode === 'curated' && pubkey) {
        await discoverCurated(pubkey, collected, cancelled);
      } else {
        await discoverAll(collected, cancelled);
      }

      if (cancelled.current) return;

      const sorted = [...collected.values()].sort((a, b) =>
        a.title.localeCompare(b.title)
      );
      setWorlds(sorted);
      setStatus(collected.size > 0 ? 'ready' : 'empty');
    }

    run().catch((err) => {
      console.warn('World discovery error:', err);
      if (!cancelled.current) setStatus('failed');
    });

    return () => { cancelled.current = true; };
  }, [mode, pubkey]);

  return { worlds, status };
}
