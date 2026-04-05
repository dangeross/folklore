/**
 * useProfile — Fetch a Nostr kind:0 profile event for a pubkey.
 *
 * Returns { name, displayName, about, picture, nip05, lud16 } from
 * the profile content JSON.
 *
 * When a relay pool is provided (from useRelay) it is queried first
 * via its existing connections — faster and avoids new connection
 * overhead on relays that rate-limit fresh connections (e.g. primal.net).
 * Falls back to fresh connections if the pool query returns nothing.
 *
 * Caches profiles in localStorage with a 24-hour TTL.
 */

import { useEffect, useState } from 'react';
import { Relay } from 'nostr-tools/relay';
import { RELAY_URLS } from '../config.js';

const CACHE_PREFIX = 'folklore:profile:';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCached(hexPubkey) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + hexPubkey);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL) {
      localStorage.removeItem(CACHE_PREFIX + hexPubkey);
      return null;
    }
    return entry.profile;
  } catch {
    return null;
  }
}

function setCache(hexPubkey, profile) {
  try {
    localStorage.setItem(
      CACHE_PREFIX + hexPubkey,
      JSON.stringify({ ts: Date.now(), profile })
    );
  } catch {}
}

function parseProfile(content) {
  const data = JSON.parse(content);
  return {
    name:        data.name         || '',
    displayName: data.display_name || '',
    about:       data.about        || '',
    picture:     data.picture      || '',
    nip05:       data.nip05        || '',
    lud16:       data.lud16        || '',
  };
}

/**
 * Query the existing pool connections first (avoids new-connection overhead),
 * then fall back to fresh individual relay connections.
 *
 * @param {string} hexPubkey
 * @param {object|null} pool - useRelay poolRef ({ current: RelayPool })
 * @param {{ current: boolean }} cancelled
 * @returns {Promise<object|null>} best kind:0 event or null
 */
async function fetchKind0(hexPubkey, pool, cancelled) {
  const filter = [{ kinds: [0], authors: [hexPubkey], limit: 1 }];
  let best = null;

  // ── 1. Try the existing pool (already-connected relays) ─────────────────
  // NOTE: Do NOT resolve on oneose — the pool fires oneose after the FIRST
  // relay's EOSE (the fastest relay, e.g. nos.lol which has no kind:0).
  // We need to wait for ALL relays (e.g. relay.primal.net) or until timeout.
  if (pool?.current?.subscribe) {
    try {
      let sub;
      await new Promise((resolve) => {
        let resolved = false;
        const done = () => { if (!resolved) { resolved = true; resolve(); } };
        const timeout = setTimeout(done, 4000);
        sub = pool.current.subscribe(filter, {
          onevent(event) {
            if (!best || event.created_at > best.created_at) best = event;
            // Got an event — resolve early, no need to wait further
            clearTimeout(timeout);
            done();
          },
          // No oneose handler: let timeout (or the event) decide when to stop
        });
      });
      sub?.close?.();
    } catch (err) {
      console.warn('[useProfile] pool query failed:', err.message);
    }
  }

  if (best || cancelled.current) return best;

  // ── 2. Fall back to fresh connections (game relays + profile relays) ────
  // Profile relays first (more likely to have kind:0), then game relays.
  const profileRelays = ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://purplepag.es'];
  const urls = [...new Set([...profileRelays, ...RELAY_URLS])];
  for (const url of urls) {
    if (cancelled.current) break;
    try {
      // Race connect against a 5s timeout so slow relays don't stall the loop
      const relay = await Promise.race([
        Relay.connect(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout')), 5000)),
      ]);
      if (cancelled.current) { relay.close(); break; }
      await new Promise((resolve) => {
        relay.subscribe(filter, {
          onevent(event) {
            if (!best || event.created_at > best.created_at) best = event;
          },
          oneose() { resolve(); },
        });
      });
      relay.close();
      if (best) break;
    } catch (err) {
      console.warn(`[useProfile] fetch failed on ${url}:`, err.message);
    }
  }

  return best;
}

/**
 * @param {string|null} hexPubkey
 * @param {{ current: import('../services/relayPool.js').RelayPool|null }|null} [pool]
 */
export function useProfile(hexPubkey, pool = null) {
  const [profile, setProfile] = useState(() => hexPubkey ? getCached(hexPubkey) : null);
  const [status, setStatus] = useState(() => {
    if (!hexPubkey) return 'idle';
    return getCached(hexPubkey) ? 'ready' : 'loading';
  });

  useEffect(() => {
    if (!hexPubkey) { setStatus('idle'); return; }

    const cached = getCached(hexPubkey);
    if (cached) {
      setProfile(cached);
      setStatus('ready');
      return;
    }

    const cancelled = { current: false };
    setProfile(null);
    setStatus('loading');

    fetchKind0(hexPubkey, pool, cancelled).then((best) => {
      if (cancelled.current) return;
      if (best) {
        try {
          const p = parseProfile(best.content);
          setCache(hexPubkey, p);
          setProfile(p);
          setStatus('ready');
        } catch {
          setStatus('empty');
        }
      } else {
        setStatus('empty');
      }
    }).catch((err) => {
      console.warn('[useProfile] error:', err);
      if (!cancelled.current) setStatus('failed');
    });

    return () => { cancelled.current = true; };
  }, [hexPubkey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { profile, status };
}
