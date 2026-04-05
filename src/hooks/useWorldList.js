/**
 * useWorldList — Manages a user's NIP-51 kind:30001 curated world list.
 *
 * Fetches the user's existing "folklore:worlds" list from relays on mount,
 * then provides toggle(aTag) to add/remove a world and auto-publish the update.
 *
 * The kind:30001 event is a NIP-51 "Categorized bookmarks list":
 *   kind: 30001
 *   d: "folklore:worlds"
 *   tags: [["a", "30078:<pubkey>:<dtag>"], ...]
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Relay } from 'nostr-tools/relay';
import { RELAY_URLS } from '../config.js';

const CURATED_LIST_DTAG = 'folklore:worlds';

/**
 * Fetch the user's current folklore:worlds list event from relays.
 * Returns the event with the most recent created_at, or null.
 */
async function fetchExistingList(pubkey) {
  for (const url of RELAY_URLS) {
    try {
      const relay = await Relay.connect(url);
      const events = [];
      await new Promise((resolve) => {
        relay.subscribe(
          [{ kinds: [30001], authors: [pubkey], '#d': [CURATED_LIST_DTAG] }],
          {
            onevent(event) { events.push(event); },
            oneose() { resolve(); },
          }
        );
      });
      relay.close();
      if (events.length > 0) {
        return events.sort((a, b) => b.created_at - a.created_at)[0];
      }
    } catch (err) {
      console.warn(`useWorldList: fetch failed on ${url}:`, err.message);
    }
  }
  return null;
}

/**
 * Publish a new version of the folklore:worlds list event.
 */
async function publishList(signer, aTags) {
  const template = {
    kind: 30001,
    tags: [
      ['d', CURATED_LIST_DTAG],
      ...aTags.map((a) => ['a', a]),
    ],
    content: '',
  };
  const unsigned = {
    ...template,
    created_at: Math.floor(Date.now() / 1000),
  };

  const signed = await signer.signEvent(unsigned);

  for (const url of RELAY_URLS) {
    try {
      const relay = await Relay.connect(url);
      await relay.publish(signed);
      relay.close();
      return { ok: true, event: signed };
    } catch (err) {
      console.warn(`useWorldList: publish failed on ${url}:`, err.message);
    }
  }
  return { ok: false, error: 'Failed to publish to any relay.' };
}

/**
 * @param {string|null} pubkey — hex pubkey of the logged-in user
 * @param {Object|null} signer — NIP-07 signer or null
 */
export function useWorldList(pubkey, signer) {
  // Set of a-tags currently in the list: "30078:<pubkey>:<dtag>"
  const [curatedATags, setCuratedATags] = useState(null); // null = loading
  const [saving, setSaving] = useState(false);
  const fetchedRef = useRef(false);

  // Fetch existing list on mount (when pubkey is available)
  useEffect(() => {
    if (!pubkey) {
      setCuratedATags(null);
      fetchedRef.current = false;
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetchExistingList(pubkey).then((event) => {
      if (event) {
        const aTags = event.tags
          .filter((t) => t[0] === 'a')
          .map((t) => t[1])
          .filter(Boolean);
        setCuratedATags(new Set(aTags));
      } else {
        setCuratedATags(new Set());
      }
    });
  }, [pubkey]);

  const toggle = useCallback(
    async (aTag) => {
      if (!signer || !pubkey || curatedATags === null) return;

      setSaving(true);
      const next = new Set(curatedATags);
      if (next.has(aTag)) {
        next.delete(aTag);
      } else {
        next.add(aTag);
      }

      const result = await publishList(signer, [...next]);
      if (result.ok) {
        setCuratedATags(next);
      }
      setSaving(false);
      return result;
    },
    [signer, pubkey, curatedATags]
  );

  const isCurated = useCallback(
    (aTag) => curatedATags?.has(aTag) ?? false,
    [curatedATags]
  );

  return { curatedATags, isCurated, toggle, saving, loaded: curatedATags !== null };
}
