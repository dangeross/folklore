/**
 * useRelay — Subscribe to all kind:30078 events for a world across multiple relays.
 *
 * Uses RelayPool for simultaneous connections. Deduplicates events by a-tag,
 * keeping the latest created_at.
 *
 * Status flow:
 *   connecting → connected → ready (first relay EOSE, fast render) → expanded (all relays EOSE + world relays done)
 *
 * App.jsx gates initial room entry on 'expanded' so exits/items are never
 * missing on first load. 'ready' is available for showing a loading indicator.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { RelayPool } from '../services/relayPool.js';
import { DEFAULT_RELAY_URLS } from '../config.js';
import { getWorldRelays, getCustomRelays, mergeRelayUrls } from '../services/relayUrls.js';

/**
 * After all initial relay EOSEs, connect to any world-specific relays and
 * subscribe — then set status 'expanded'. If no new relays needed, sets
 * 'expanded' immediately.
 */
async function expandPool({
  pool, worldTag, worldEvent, handleEvent,
  cancelled, setStatus, setRelayStatus, setPublishUrls,
}) {
  if (cancelled) return;

  const worldRelays = worldEvent ? getWorldRelays(worldEvent) : [];

  const updatePublish = () => {
    const custom = getCustomRelays(worldTag);
    const { publish } = mergeRelayUrls({ worldRelays, custom });
    setPublishUrls(publish);
  };

  if (worldRelays.length === 0) {
    updatePublish();
    console.log('[useRelay] no world relays — expanded');
    setStatus('expanded');
    return;
  }

  const connected = new Set(pool.connectedUrls);
  const newUrls = worldRelays.filter((url) => !connected.has(url.replace(/\/+$/, '')));

  if (newUrls.length === 0) {
    updatePublish();
    console.log('[useRelay] no new world relays — expanded');
    setStatus('expanded');
    return;
  }

  await pool.connect(newUrls);
  if (cancelled) return;
  setRelayStatus(new Map(pool.connectionStatus));

  pool.subscribe(
    [{ kinds: [30078], '#t': [worldTag] }],
    {
      onevent: handleEvent,
      oneose() {
        if (!cancelled) {
          console.log('[useRelay] world relay EOSE — expanded');
          setStatus('expanded');
        }
      },
    },
  );

  updatePublish();
}

/**
 * @param {string} worldTag - the world slug to subscribe to
 * @returns {{
 *   events: Map,
 *   status: string,
 *   pool: { current: RelayPool | null },
 *   relayStatus: Map<string, string>,
 *   publishUrls: string[],
 * }}
 */
export function useRelay(worldTag) {
  const [events, setEvents] = useState(new Map());
  const [status, setStatus] = useState(worldTag ? 'connecting' : 'idle');
  const [relayStatus, setRelayStatus] = useState(new Map());
  const [publishUrls, setPublishUrls] = useState([...DEFAULT_RELAY_URLS]);
  const poolRef = useRef(null);
  const worldEventRef = useRef(null); // world event tracked as events arrive

  // Stable callback for handling events — also tracks the world event
  const handleEvent = useCallback((event) => {
    const d = event.tags.find((t) => t[0] === 'd')?.[1];
    if (!d) return;
    if (event.tags.find((t) => t[0] === 'type')?.[1] === 'world') {
      worldEventRef.current = event;
    }
    setEvents((prev) => {
      const aTag = `30078:${event.pubkey}:${d}`;
      const existing = prev.get(aTag);
      // Keep latest created_at for replaceable events
      if (existing && existing.created_at >= event.created_at) return prev;
      const next = new Map(prev);
      next.set(aTag, event);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!worldTag) {
      setStatus('idle');
      return;
    }

    setStatus('connecting');
    setEvents(new Map());
    worldEventRef.current = null;
    let cancelled = false;

    async function connect() {
      const pool = new RelayPool();
      poolRef.current = pool;

      // Start with defaults + any stored custom relays
      const custom = getCustomRelays(worldTag);
      const initialUrls = [...new Set([...DEFAULT_RELAY_URLS, ...custom])];

      await pool.connect(initialUrls);
      if (cancelled) { pool.close(); return; }

      setRelayStatus(new Map(pool.connectionStatus));

      if (pool.size === 0) {
        setStatus('failed');
        return;
      }

      setStatus('connected');

      // PAGE_SIZE is the threshold at which we suspect relay truncation and
      // fetch an additional page using until: minCreatedAt-1.
      const PAGE_SIZE = 500;

      // Track minimum created_at across the initial subscription so we can
      // paginate if the first batch fills PAGE_SIZE.
      let initialMin = Infinity;
      let initialCount = 0;

      // Recursive paginator — only called if the initial subscription fills PAGE_SIZE.
      function fetchNextPage(until) {
        const filter = { kinds: [30078], '#t': [worldTag], limit: PAGE_SIZE, until };
        let pageMin = Infinity;
        let pageCount = 0;
        pool.subscribe([filter], {
          onevent(event) {
            pageCount++;
            if (event.created_at < pageMin) pageMin = event.created_at;
            handleEvent(event);
          },
          oneose() {
            if (cancelled) return;
            if (pageCount >= PAGE_SIZE && pageMin < Infinity) {
              console.log(`[useRelay] page full (${pageCount}), fetching next page until=${pageMin - 1}`);
              fetchNextPage(pageMin - 1);
            } else {
              console.log(`[useRelay] pagination complete (${pageCount} events in final page).`);
            }
          },
        });
      }

      // Initial subscription.
      // oneose  (first relay EOSE) → 'ready' for fast UI render.
      // onallEose (all relays EOSE) → expand to world-specific relays, then 'expanded'.
      pool.subscribe(
        [{ kinds: [30078], '#t': [worldTag] }],
        {
          onevent(event) {
            initialCount++;
            if (event.created_at < initialMin) initialMin = event.created_at;
            handleEvent(event);
          },
          oneose() {
            if (!cancelled) {
              console.log(`[useRelay] first EOSE — ${initialCount} events so far`);
              setStatus('ready');
            }
          },
          onallEose() {
            if (cancelled) return;
            console.log(`[useRelay] all EOSE — ${initialCount} events total`);
            if (initialCount >= PAGE_SIZE && initialMin < Infinity) {
              console.log(`[useRelay] initial batch full — paginating from until=${initialMin - 1}`);
              fetchNextPage(initialMin - 1);
            }
            expandPool({
              pool, worldTag, worldEvent: worldEventRef.current, handleEvent,
              cancelled, setStatus, setRelayStatus, setPublishUrls,
            });
          },
        },
      );
    }

    connect();

    return () => {
      cancelled = true;
      poolRef.current?.close();
      poolRef.current = null;
    };
  }, [worldTag, handleEvent]);

  // Add or remove a relay dynamically (called from RelaySettingsPanel)
  const updateRelays = useCallback(async (action, url) => {
    const pool = poolRef.current;
    if (!pool) return;

    if (action === 'add') {
      await pool.connect([url]);
      // Subscribe the new relay to the world filter
      if (pool.connectionStatus.get(url) === 'connected') {
        pool.subscribe(
          [{ kinds: [30078], '#t': [worldTag] }],
          { onevent: handleEvent },
        );
      }
    } else if (action === 'remove') {
      pool.disconnect(url);
    }

    setRelayStatus(new Map(pool.connectionStatus));
  }, [worldTag, handleEvent]);

  return { events, status, pool: poolRef, relayStatus, publishUrls, updateRelays };
}
