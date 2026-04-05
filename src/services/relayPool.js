/**
 * RelayPool — Manages multiple simultaneous NOSTR relay connections.
 *
 * Connects to a set of relay URLs in parallel, provides composite
 * subscribe (events deduplicated across relays) and publish (broadcast
 * to all connected relays).
 */

import { Relay } from 'nostr-tools/relay';

const MAX_RELAYS = 8;

export class RelayPool {
  /** @type {Map<string, Relay>} */
  #relays = new Map();
  /** @type {Map<string, 'connecting'|'connected'|'failed'>} */
  #status = new Map();
  /** @type {Set<string>} seen event IDs for dedup */
  #seen = new Set();

  /** Connect to a list of relay URLs. Tolerates individual failures. */
  async connect(urls, timeoutMs = 5000) {
    const unique = [...new Set(urls)].slice(0, MAX_RELAYS);
    const tasks = unique
      .filter((url) => !this.#relays.has(url))
      .map(async (url) => {
        this.#status.set(url, 'connecting');
        try {
          const relay = await Promise.race([
            Relay.connect(url),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Connection timeout')), timeoutMs)
            ),
          ]);
          this.#relays.set(url, relay);
          this.#status.set(url, 'connected');
          console.log(`[pool] Connected to ${url}`);
        } catch (err) {
          this.#status.set(url, 'failed');
          console.warn(`[pool] Failed to connect to ${url}:`, err.message);
        }
      });
    await Promise.allSettled(tasks);
  }

  /**
   * Subscribe to all connected relays with a common filter.
   *
   * Events are deduplicated by event `id`. Calls `onevent` for each
   * unique event. Calls `oneose` after the FIRST relay sends EOSE
   * (fast path for initial render). Calls `onallEose` after ALL relays
   * have sent EOSE (or after `eoseTimeoutMs`) — use this to gate logic
   * that requires a complete event set.
   *
   * @param {Array} filters - nostr filter array
   * @param {{ onevent, oneose?, onallEose? }} callbacks
   * @param {{ eoseTimeoutMs?: number }} options
   * @returns {{ close: () => void }}
   */
  subscribe(filters, { onevent, oneose, onallEose }, { eoseTimeoutMs = 10000 } = {}) {
    const subs = [];
    const relayCount = this.#relays.size;
    let eoseCount = 0;
    let eoseFired = false;
    let allEoseFired = false;

    const fireEose = () => {
      if (eoseFired) return;
      eoseFired = true;
      oneose?.();
    };

    const fireAllEose = () => {
      if (allEoseFired) return;
      allEoseFired = true;
      clearTimeout(timer);
      onallEose?.();
    };

    // Timeout: fire all-eose even if slow relays haven't responded
    const timer = relayCount > 0
      ? setTimeout(() => { fireEose(); fireAllEose(); }, eoseTimeoutMs)
      : null;

    for (const [url, relay] of this.#relays) {
      try {
        const sub = relay.subscribe(filters, {
          onevent: (event) => {
            if (this.#seen.has(event.id)) return;
            this.#seen.add(event.id);
            onevent(event);
          },
          oneose: () => {
            eoseCount++;
            console.log(`[pool] EOSE from ${url} (${eoseCount}/${relayCount})`);
            // Fire on FIRST eose for fast initial render
            if (eoseCount === 1) fireEose();
            // Fire all-eose once every relay has responded
            if (eoseCount >= relayCount) fireAllEose();
          },
        });
        subs.push(sub);
      } catch (err) {
        console.warn(`[pool] Subscribe failed on ${url}:`, err.message);
      }
    }

    if (relayCount === 0) {
      // No relays connected — fire both immediately
      fireEose();
      fireAllEose();
    }

    return {
      close() {
        clearTimeout(timer);
        subs.forEach((s) => { try { s.close(); } catch {} });
      },
    };
  }

  /**
   * Publish a signed event to ALL connected relays in parallel.
   *
   * @param {Object} signedEvent
   * @returns {Promise<Map<string, { ok: boolean, error?: string }>>}
   */
  async publish(signedEvent) {
    const results = new Map();
    const tasks = [...this.#relays].map(async ([url, relay]) => {
      try {
        await relay.publish(signedEvent);
        results.set(url, { ok: true });
      } catch (err) {
        results.set(url, { ok: false, error: err.message });
      }
    });
    await Promise.allSettled(tasks);
    return results;
  }

  /**
   * Publish a signed event to relays sequentially with delay.
   * Useful when relays rate-limit.
   *
   * @param {Object} signedEvent
   * @param {number} delayMs - delay between publishes (default 200ms)
   * @returns {Promise<Map<string, { ok: boolean, error?: string }>>}
   */
  async publishSequential(signedEvent, delayMs = 200) {
    const results = new Map();
    for (const [url, relay] of this.#relays) {
      try {
        await relay.publish(signedEvent);
        results.set(url, { ok: true });
      } catch (err) {
        results.set(url, { ok: false, error: err.message });
      }
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
    return results;
  }

  /**
   * Publish to a specific subset of relay URLs.
   *
   * @param {Object} signedEvent
   * @param {string[]} urls - relay URLs to publish to
   * @returns {Promise<Map<string, { ok: boolean, error?: string }>>}
   */
  async publishTo(signedEvent, urls) {
    const results = new Map();
    const tasks = urls.map(async (url) => {
      const relay = this.#relays.get(url);
      if (!relay) {
        results.set(url, { ok: false, error: 'Not connected' });
        return;
      }
      try {
        await relay.publish(signedEvent);
        results.set(url, { ok: true });
      } catch (err) {
        results.set(url, { ok: false, error: err.message });
      }
    });
    await Promise.allSettled(tasks);
    return results;
  }

  /** Get a single connected relay (first available). For one-off subscriptions. */
  getAnyRelay() {
    for (const [, relay] of this.#relays) return relay;
    return null;
  }

  /** @returns {string[]} Connected relay URLs */
  get connectedUrls() {
    return [...this.#relays.keys()];
  }

  /** @returns {Map<string, string>} URL → status */
  get connectionStatus() {
    return new Map(this.#status);
  }

  /** @returns {number} Number of connected relays */
  get size() {
    return this.#relays.size;
  }

  /** Disconnect a single relay by URL. */
  disconnect(url) {
    const relay = this.#relays.get(url);
    if (relay) {
      try { relay.close(); } catch {}
      this.#relays.delete(url);
    }
    this.#status.delete(url);
  }

  /** Close all relay connections. */
  close() {
    for (const [url, relay] of this.#relays) {
      try { relay.close(); } catch {}
    }
    this.#relays.clear();
    this.#status.clear();
    this.#seen.clear();
  }
}
