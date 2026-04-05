/**
 * SharePanel — publish a kind:1 NOSTR note sharing a world.
 *
 * Pre-fills a textarea with the world URL and description.
 * The player edits freely, then publishes via their identity signer.
 */

import React, { useState, useEffect, useRef } from 'react';
import DOSPanel from './ui/DOSPanel.jsx';

const FOAKLOAR_NPUB = 'npub1czxhkknee39356s6958lw0zzyes7xvac4805379jqegvqma78chswcvtxp';

function buildNoteText({ worldSlug, worldTitle, worldContent, worldAuthorPubkey }) {
  const pinned = worldAuthorPubkey ? `${worldSlug}-${worldAuthorPubkey.slice(0, 8)}` : worldSlug;
  const url = `${window.location.origin}/w/${pinned}`;

  const quoteLines = (worldContent || '')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => `> ${l}`)
    .join('\n');

  return [
    worldTitle || '',
    url,
    '',
    quoteLines,
    '',
    `nostr:${FOAKLOAR_NPUB}`,
    '',
    '#textadventure #folklore',
  ].filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
}

export default function SharePanel({
  worldSlug,
  worldTitle,
  worldContent,
  worldAuthorPubkey,
  identity,
  pool,
  writeRelays,  // nip65 write relays
  publishUrls,  // world relays (fallback)
  onClose,
}) {
  const defaultText = buildNoteText({ worldSlug, worldTitle, worldContent, worldAuthorPubkey });
  const [text, setText] = useState(defaultText);
  const [status, setStatus] = useState('idle'); // idle | publishing | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const textareaRef = useRef(null);

  // Reset text if world changes
  useEffect(() => {
    setText(buildNoteText({ worldSlug, worldTitle, worldContent, worldAuthorPubkey }));
  }, [worldSlug, worldTitle, worldContent]);

  // Auto-focus textarea
  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus();
  }, []);

  const relays = (writeRelays?.length ? writeRelays : publishUrls) || [];
  const canPublish = identity?.signer && identity?.pubkey && text.trim() && relays.length > 0 && status === 'idle';

  async function handlePublish() {
    if (!canPublish) return;
    setStatus('publishing');
    setErrorMsg('');

    try {
      const { finalizeEvent } = await import('nostr-tools/pure');

      const FOAKLOAR_PUBKEY = 'c08d7b5a79cc4b1a6a1a2d0ff73c422661e333b8a9df48f8b20650c06fbe3e2f';
      const pTags = [['p', FOAKLOAR_PUBKEY]];
      // Also tag world author if different from folklore
      if (worldAuthorPubkey && worldAuthorPubkey !== FOAKLOAR_PUBKEY) {
        pTags.push(['p', worldAuthorPubkey]);
      }

      const template = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['t', 'textadventure'],
          ['t', 'folklore'],
          ...pTags,
        ],
        content: text.trim(),
        pubkey: identity.pubkey,
      };

      const signed = await identity.signer.signEvent(template);

      if (!pool?.current) throw new Error('No relay pool available');

      const results = await Promise.allSettled(
        relays.map((url) => pool.current.publish(url, signed))
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      if (succeeded === 0) throw new Error('All relays rejected the note');

      setStatus('done');
    } catch (e) {
      setStatus('error');
      setErrorMsg(e.message || 'Unknown error');
    }
  }

  return (
    <DOSPanel title="Share on NOSTR" onClose={onClose} style={{ maxWidth: '480px', width: '90vw' }}>
      <div className="font-mono text-xs flex flex-col gap-3" style={{ color: 'var(--colour-text)' }}>

        {status === 'done' ? (
          <>
            <p style={{ color: 'var(--colour-highlight)' }}>Published to {(writeRelays?.length ? writeRelays : publishUrls)?.length || 0} relay{(writeRelays?.length ? writeRelays : publishUrls)?.length !== 1 ? 's' : ''}.</p>
            <button
              onClick={onClose}
              className="cursor-pointer hover:opacity-80"
              style={{ color: 'var(--colour-dim)', background: 'none', border: 'none', font: 'inherit', textAlign: 'left', padding: 0 }}
            >
              [close]
            </button>
          </>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="w-full resize-y font-mono text-xs"
              style={{
                background: 'var(--colour-bg)',
                color: 'var(--colour-text)',
                border: '1px solid var(--colour-dim)',
                padding: '0.5rem',
                outline: 'none',
                lineHeight: 1.5,
              }}
            />

            {!identity?.signer && (
              <p style={{ color: 'var(--colour-dim)' }}>Log in to publish.</p>
            )}

            {relays.length === 0 && identity?.signer && (
              <p style={{ color: 'var(--colour-dim)' }}>No write relays configured.</p>
            )}

            {status === 'error' && (
              <p style={{ color: 'var(--colour-error)' }}>Error: {errorMsg}</p>
            )}

            <div className="flex gap-4 items-center">
              <button
                onClick={handlePublish}
                disabled={!canPublish}
                className="cursor-pointer hover:opacity-80 disabled:opacity-40 disabled:cursor-default"
                style={{
                  color: 'var(--colour-highlight)',
                  background: 'none',
                  border: '1px solid var(--colour-highlight)',
                  font: 'inherit',
                  padding: '0.2rem 0.6rem',
                }}
              >
                {status === 'publishing' ? 'publishing...' : 'publish'}
              </button>
              <button
                onClick={onClose}
                className="cursor-pointer hover:opacity-80"
                style={{ color: 'var(--colour-dim)', background: 'none', border: 'none', font: 'inherit', padding: 0 }}
              >
                cancel
              </button>
            </div>
          </>
        )}
      </div>
    </DOSPanel>
  );
}
