/**
 * ProfileEditor — Edit and publish your Nostr kind:0 profile.
 *
 * Fetches the current profile from relays, pre-fills fields,
 * then signs and publishes a new kind:0 event on save.
 */

import React, { useState, useEffect } from 'react';
import { Relay } from 'nostr-tools/relay';
import DOSPanel from './DOSPanel.jsx';
import Tooltip from './Tooltip.jsx';
import { RELAY_URLS } from '../../config.js';

/** Cache key used by useProfile — invalidated after a successful save. */
const CACHE_PREFIX = 'folklore:profile:';

const FIELDS = [
  {
    key: 'name',
    label: 'Name',
    type: 'text',
    placeholder: 'Display name',
    tooltip: 'Your display name shown on Nostr and in the game header.',
  },
  {
    key: 'about',
    label: 'About',
    type: 'textarea',
    placeholder: 'A short bio…',
    tooltip: 'A short bio about yourself, shown on your Nostr profile.',
  },
  {
    key: 'picture',
    label: 'Picture',
    type: 'text',
    placeholder: 'https://example.com/avatar.png',
    tooltip: 'URL to your profile picture (must start with https://).',
  },
  {
    key: 'lud16',
    label: 'Lightning',
    type: 'text',
    placeholder: 'you@wallet.com',
    tooltip: 'Lightning Address for receiving tips, e.g. you@wallet.com',
  },
  {
    key: 'nip05',
    label: 'NIP-05',
    type: 'text',
    placeholder: 'you@yourdomain.com',
    tooltip: 'NIP-05 verification identifier, e.g. you@yourdomain.com — used to verify your Nostr identity.',
  },
];

const EMPTY = { name: '', about: '', picture: '', lud16: '', nip05: '' };

function fromCached(pubkey) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + pubkey);
    if (!raw) return null;
    const { ts, profile } = JSON.parse(raw);
    if (Date.now() - ts > 24 * 60 * 60 * 1000) return null;
    return profile;
  } catch { return null; }
}

/** Build a deduplicated relay list for profile fetching: game relays + NIP-65 write + purplepag.es */
function profileRelays(publishUrls, nip65WriteRelays) {
  const seen = new Set();
  const out = [];
  const add = (url) => { if (url && !seen.has(url)) { seen.add(url); out.push(url); } };
  (nip65WriteRelays || []).forEach(add);            // user's own write relays first
  (publishUrls || RELAY_URLS).forEach(add);          // game relays
  add('wss://relay.damus.io');                      // popular relay, broad profile coverage
  add('wss://relay.nostr.band');                    // broad profile index
  add('wss://purplepag.es');                         // broad profile index fallback
  return out;
}

export default function ProfileEditor({ identity, pool, publishUrls, nip65WriteRelays, onClose }) {
  const [fields, setFields] = useState(() => {
    // Seed immediately from cache so the panel isn't blank while fetching
    if (!identity?.pubkey) return EMPTY;
    const cached = fromCached(identity.pubkey);
    return cached
      ? { name: cached.name || '', about: cached.about || '', picture: cached.picture || '', lud16: cached.lud16 || '', nip05: cached.nip05 || '' }
      : EMPTY;
  });
  // Full raw profile object from the relay — preserved so unknown fields aren't lost on save
  const [rawProfile, setRawProfile] = useState(() => {
    if (!identity?.pubkey) return {};
    return fromCached(identity.pubkey) || {};
  });
  const [loadStatus, setLoadStatus] = useState('loading'); // loading | ready
  const [saveStatus, setSaveStatus] = useState('idle');    // idle | saving | saved | error:<msg>

  // Fetch fresh from relays to pick up latest data (incl. picture not always in old cache)
  useEffect(() => {
    if (!identity?.pubkey) {
      setLoadStatus('ready');
      return;
    }

    const urls = profileRelays(publishUrls, nip65WriteRelays);
    const cancelled = { current: false };

    async function fetchProfile() {
      let best = null;

      for (const url of urls) {
        if (cancelled.current) return;
        try {
          const relay = await Relay.connect(url);
          if (cancelled.current) { relay.close(); return; }

          await new Promise((resolve) => {
            relay.subscribe(
              [{ kinds: [0], authors: [identity.pubkey] }],
              {
                onevent(event) {
                  if (!best || event.created_at > best.created_at) best = event;
                },
                oneose() { resolve(); },
              }
            );
          });
          relay.close();
          if (best) break;
        } catch (err) {
          console.warn(`ProfileEditor: fetch failed on ${url}:`, err.message);
        }
      }

      if (cancelled.current) return;

      if (best) {
        try {
          const data = JSON.parse(best.content);
          setRawProfile(data);
          setFields({
            name:    data.name    || '',
            about:   data.about   || '',
            picture: data.picture || '',
            lud16:   data.lud16   || '',
            nip05:   data.nip05   || '',
          });
        } catch {
          // Unparseable profile — keep whatever was seeded from cache
        }
      }

      setLoadStatus('ready');
    }

    fetchProfile();
    return () => { cancelled.current = true; };
  // Re-run when NIP-65 write relays arrive (they load async after mount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.pubkey, (nip65WriteRelays || []).join(',')]);

  async function handleSave() {
    if (!identity?.signer) return;
    setSaveStatus('saving');

    try {
      // Spread rawProfile first so unknown fields (website, banner, display_name, etc.)
      // are preserved — kind:0 is a full replacement, not a patch.
      const content = JSON.stringify({
        ...rawProfile,
        name:    fields.name.trim(),
        about:   fields.about.trim(),
        picture: fields.picture.trim(),
        lud16:   fields.lud16.trim(),
        nip05:   fields.nip05.trim(),
      });

      const template = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content,
      };

      const signed = await identity.signer.signEvent(template);

      // Publish to all connected relays
      if (pool?.current?.publish) {
        await pool.current.publish(signed);
      } else {
        // Fallback: individual relay connections
        const urls = publishUrls?.length ? publishUrls : RELAY_URLS;
        await Promise.allSettled(
          urls.map(async (url) => {
            const relay = await Relay.connect(url);
            await relay.publish(signed);
            relay.close();
          })
        );
      }

      // Bust the useProfile cache so the header/profile re-fetches next time
      try { localStorage.removeItem(CACHE_PREFIX + identity.pubkey); } catch {}

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      console.error('ProfileEditor: save failed', err);
      setSaveStatus('error:' + (err.message || 'unknown error'));
    }
  }

  function setField(key, value) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  const inputCls = 'bg-transparent outline-none font-mono text-xs w-full px-1 py-0.5';
  const inputStyle = { color: 'var(--colour-text)', border: '1px solid var(--colour-dim)' };

  return (
    <DOSPanel title="EDIT PROFILE" onClose={onClose} minWidth="32em">
      {loadStatus === 'loading' ? (
        <div style={{ color: 'var(--colour-dim)' }}>Fetching profile…</div>
      ) : (
        <div className="flex flex-col gap-3">
          {FIELDS.map(({ key, label, type, placeholder, tooltip }) => (
            <div key={key}>
              <div className="mb-1 flex items-center" style={{ color: 'var(--colour-dim)', fontSize: '0.65rem' }}>
                {label}
                <Tooltip text={tooltip} />
              </div>
              {type === 'textarea' ? (
                <textarea
                  rows={4}
                  value={fields[key]}
                  onChange={(e) => setField(key, e.target.value)}
                  placeholder={placeholder}
                  className={inputCls}
                  style={{ ...inputStyle, resize: 'vertical', display: 'block' }}
                />
              ) : (
                <input
                  type="text"
                  value={fields[key]}
                  onChange={(e) => setField(key, e.target.value)}
                  placeholder={placeholder}
                  className={inputCls}
                  style={inputStyle}
                />
              )}
            </div>
          ))}

          <div className="flex items-center gap-3 mt-1">
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              className="cursor-pointer"
              style={{
                color: saveStatus === 'saving' ? 'var(--colour-dim)' : 'var(--colour-highlight)',
                background: 'none',
                border: '1px solid var(--colour-dim)',
                font: 'inherit',
                padding: '2px 8px',
                cursor: saveStatus === 'saving' ? 'default' : 'pointer',
              }}
            >
              {saveStatus === 'saving' ? 'Saving…' : 'Save'}
            </button>
            {saveStatus === 'saved' && (
              <span style={{ color: 'var(--colour-text)', fontSize: '0.7rem' }}>✓ Saved</span>
            )}
            {saveStatus.startsWith('error:') && (
              <span style={{ color: 'var(--colour-error)', fontSize: '0.7rem' }}>
                {saveStatus.slice(6)}
              </span>
            )}
          </div>
        </div>
      )}
    </DOSPanel>
  );
}
