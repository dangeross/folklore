/**
 * Lobby — World browser at /w.
 *
 * Header dropdown switches between:
 *   curated  — application's featured world list
 *   search   — all folklore worlds on relays (#w tag discovery)
 *   + world  — opens the world creator
 *
 * Also shows local draft worlds and manual slug entry.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import DOSPanel from './ui/DOSPanel.jsx';
import PageHeader from './ui/PageHeader.jsx';
import LoginPanel from './ui/LoginPanel.jsx';
import WorldCard from './WorldCard.jsx';
import TipPanel from './TipPanel.jsx';
import { useWorldDiscovery } from '../hooks/useWorldDiscovery.js';
import { useWorldList } from '../hooks/useWorldList.js';
import { listDraftWorlds, parseJsonLenient } from '../builder/draftStore.js';
import { TIDE_THEME } from '../services/guideTheme.js';
import ImportPreviewPanel from '../builder/components/ImportPreviewPanel.jsx';
import { APP_PUBKEY } from '../config.js';
import { navigateToGuide } from '../services/router.js';

const BASE_LOBBY_MODES = [
  { value: 'curated', label: 'featured' },
  { value: 'search', label: 'search' },
];

export default function Lobby({
  identity,
  pool,
  onSelectWorld,
  onImportToWorld,
  onCreateWorld,
  showWorldCreator,
  worldCreatorNode,
}) {
  const [slug, setSlug] = useState('');
  const [importPreview, setImportPreview] = useState(null); // { validation, data }
  const importFileRef = useRef(null);
  const [lobbyMode, setLobbyMode] = useState('search');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);
  const [pendingWorld, setPendingWorld] = useState(null);
  const [zapTarget, setZapTarget] = useState(null);
  const dropdownRef = useRef(null);

  // Modes — include "my list" only when logged in
  const LOBBY_MODES = useMemo(
    () => identity?.pubkey
      ? [...BASE_LOBBY_MODES, { value: 'mylist', label: 'my list' }]
      : BASE_LOBBY_MODES,
    [identity?.pubkey]
  );

  // User's own curated list (bookmark state)
  const { isCurated, toggle: toggleBookmark, saving: bookmarkSaving } =
    useWorldList(identity?.pubkey || null, identity?.signer || null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  // Map lobby mode to discovery mode + pubkey
  const discoveryMode = lobbyMode === 'mylist' ? 'curated' : lobbyMode;
  const discoveryPubkey =
    lobbyMode === 'curated' ? APP_PUBKEY
    : lobbyMode === 'mylist' ? identity?.pubkey
    : undefined;

  const { worlds: publishedWorlds, status: discoveryStatus } = useWorldDiscovery(
    discoveryMode,
    discoveryPubkey
  );
  const draftWorlds = useMemo(() => listDraftWorlds(), []);

  // Merge: published worlds win over drafts with the same slug
  const publishedSlugs = useMemo(
    () => new Set(publishedWorlds.map((w) => w.slug)),
    [publishedWorlds]
  );
  const uniqueDraftWorlds = useMemo(
    () => draftWorlds.filter((d) => !publishedSlugs.has(d.slug)),
    [draftWorlds, publishedSlugs]
  );

  // Filter worlds by text (title, author, description, genre tags)
  const filteredWorlds = useMemo(() => {
    if (!filter.trim()) return publishedWorlds;
    const q = filter.toLowerCase();
    return publishedWorlds.filter((w) =>
      w.title.toLowerCase().includes(q) ||
      w.author.toLowerCase().includes(q) ||
      w.description.toLowerCase().includes(q) ||
      w.slug.toLowerCase().includes(q) ||
      w.tags?.some((t) => t.toLowerCase().includes(q)) ||
      w.cw?.some((c) => c.toLowerCase().includes(q))
    );
  }, [publishedWorlds, filter]);

  const visibleWorlds = useMemo(
    () => filteredWorlds.slice(0, visibleCount),
    [filteredWorlds, visibleCount]
  );
  const hasMore = filteredWorlds.length > visibleCount;

  // Reset visible count when mode or filter changes
  useEffect(() => { setVisibleCount(10); }, [lobbyMode, filter]);

  // Intercept world selection — show CW confirmation if needed
  const handleSelectWorld = (world) => {
    if (world.cw?.length > 0) {
      setPendingWorld(world);
    } else {
      onSelectWorld(world.slug);
    }
  };

  return (
    <div
      className="max-w-2xl mx-auto flex flex-col min-h-dvh font-mono text-xs"
      style={{ backgroundColor: 'var(--colour-bg)', color: 'var(--colour-text)' }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <PageHeader identity={identity}>
        {/* Mode dropdown */}
        <span ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="cursor-pointer"
            style={{
              color: 'var(--colour-dim)',
              background: 'none',
              border: 'none',
              font: 'inherit',
              padding: 0,
            }}
          >
            [{LOBBY_MODES.find((m) => m.value === lobbyMode)?.label ?? lobbyMode}]
          </button>

          {dropdownOpen && (
            <div
              className="font-mono text-xs"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '0.25rem',
                border: '1px solid var(--colour-dim)',
                backgroundColor: 'var(--colour-bg)',
                boxShadow: '2px 2px 0 var(--colour-dim)',
                zIndex: 100,
                minWidth: '10em',
              }}
            >
              {LOBBY_MODES.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => {
                    setLobbyMode(mode.value);
                    setDropdownOpen(false);
                  }}
                  className="block w-full text-left px-2 py-1 cursor-pointer hover:opacity-80"
                  style={{
                    color: mode.value === lobbyMode
                      ? 'var(--colour-highlight)'
                      : 'var(--colour-text)',
                    background: 'none',
                    border: 'none',
                    font: 'inherit',
                  }}
                >
                  {mode.value === lobbyMode ? '> ' : '  '}{mode.label}
                </button>
              ))}
              <div style={{ borderTop: '1px solid var(--colour-dim)' }}>
                <button
                  onClick={() => {
                    onCreateWorld();
                    setDropdownOpen(false);
                  }}
                  className="block w-full text-left px-2 py-1 cursor-pointer hover:opacity-80"
                  style={{
                    color: 'var(--colour-item)',
                    background: 'none',
                    border: 'none',
                    font: 'inherit',
                  }}
                >
                  {'  '}+ world
                </button>
                <button
                  onClick={() => {
                    importFileRef.current?.click();
                    setDropdownOpen(false);
                  }}
                  className="block w-full text-left px-2 py-1 cursor-pointer hover:opacity-80"
                  style={{
                    color: 'var(--colour-item)',
                    background: 'none',
                    border: 'none',
                    font: 'inherit',
                  }}
                >
                  {'  '}import
                </button>
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigateToGuide();
                  }}
                  className="block w-full text-left px-2 py-1 cursor-pointer hover:opacity-80"
                  style={{
                    color: 'var(--colour-item)',
                    background: 'none',
                    border: 'none',
                    font: 'inherit',
                  }}
                >
                  {'  '}guide
                </button>
              </div>
            </div>
          )}
        </span>
      </PageHeader>

      {/* ── Hidden file input for world import ────────────────────────── */}
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const data = parseJsonLenient(reader.result);
                // Support both { events: [...] } and bare array formats
                const eventList = Array.isArray(data) ? data : (data.events ?? []);
                // Detect world slug from the imported data
                const worldEvent = eventList.find((ev) =>
                  ev.tags?.find((t) => t[0] === 'type')?.[1] === 'world'
                );
                const detectedSlug = worldEvent?.tags?.find((t) => t[0] === 't')?.[1] || '';
                if (!detectedSlug) {
                  // No slug — can't navigate, show error inline
                  setImportPreview({
                    validation: { valid: [], rejected: [], warnings: ['No world event found — cannot determine world slug'], worldSlug: null },
                    data,
                  });
                  return;
                }
                // Navigate to the world and pass import data for in-world preview
                onImportToWorld(detectedSlug, data);
              } catch {
                // Invalid JSON
              }
            };
            reader.readAsText(file);
          }
          e.target.value = '';
        }}
      />

      {/* ── Import preview panel ──────────────────────────────────────── */}
      {importPreview && (
        <ImportPreviewPanel
          validation={importPreview.validation}
          onConfirm={() => {
            const slug = importPreview.worldSlug;
            setImportPreview(null);
            // Navigate to the world and pass import data for in-world import
            onImportToWorld(slug, importPreview.data);
          }}
          onClose={() => setImportPreview(null)}
        />
      )}

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 px-6 pb-6">
        {/* Manual slug input */}
        <div className="mb-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const s = slug.trim().toLowerCase();
              if (s) onSelectWorld(s);
            }}
            className="flex gap-2 items-center"
          >
            <span style={{ color: 'var(--colour-dim)' }}>/w/</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="world-slug"
              className="flex-1 bg-transparent border-none outline-none font-mono"
              style={{ color: 'var(--colour-text)', borderBottom: '1px solid var(--colour-dim)' }}
              autoFocus
            />
            <button
              type="submit"
              disabled={!slug.trim()}
              className="cursor-pointer"
              style={{
                color: slug.trim() ? 'var(--colour-highlight)' : 'var(--colour-dim)',
                background: 'none',
                border: '1px solid var(--colour-dim)',
                font: 'inherit',
                padding: '2px 8px',
              }}
            >
              Go
            </button>
          </form>
        </div>

        {/* Filter input */}
        {lobbyMode === 'search' && (
          <div className="mb-4">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter by title, author, tag..."
              className="w-full bg-transparent border-none outline-none font-mono"
              style={{ color: 'var(--colour-text)', borderBottom: '1px solid var(--colour-dim)' }}
            />
          </div>
        )}

        {/* Draft worlds */}
        {uniqueDraftWorlds.length > 0 && (
          <div className="mb-6">
            <div className="mb-2" style={{ color: 'var(--colour-dim)', borderBottom: '1px solid var(--colour-dim)', paddingBottom: '2px' }}>
              Your Drafts
            </div>
            {uniqueDraftWorlds.map((w) => (
              <WorldCard key={w.slug} world={w} onClick={() => handleSelectWorld(w)} />
            ))}
          </div>
        )}

        {/* Published worlds */}
        <div className="mb-6">
          {discoveryStatus === 'loading' && (
            <div style={{ color: 'var(--colour-dim)' }}>Searching relays...</div>
          )}
          {discoveryStatus === 'failed' && (
            <div style={{ color: 'var(--colour-error)' }}>Failed to connect to relays.</div>
          )}
          {discoveryStatus === 'empty' && lobbyMode !== 'mylist' && (
            <div style={{ color: 'var(--colour-dim)' }}>No worlds found.</div>
          )}
          {discoveryStatus === 'empty' && lobbyMode === 'mylist' && (
            <div style={{ color: 'var(--colour-dim)' }}>
              Your list is empty.
            </div>
          )}
          {filter && filteredWorlds.length === 0 && publishedWorlds.length > 0 && (
            <div style={{ color: 'var(--colour-dim)' }}>No matches for "{filter}".</div>
          )}
          {visibleWorlds.map((w) => (
            <WorldCard
              key={w.aTag}
              world={w}
              onClick={() => handleSelectWorld(w)}
              onZap={(world) => setZapTarget({ eventId: world.eventId, pubkey: world.pubkey, title: world.title })}
              bookmarked={isCurated(w.aTag)}
              onBookmark={identity?.signer ? (world) => toggleBookmark(world.aTag) : undefined}
            />
          ))}
          {hasMore && (
            <div className="mt-2 flex justify-between items-center" style={{ color: 'var(--colour-dim)' }}>
              <span>Showing {visibleCount} of {filteredWorlds.length}</span>
              <button
                onClick={() => setVisibleCount((c) => c + 10)}
                className="cursor-pointer"
                style={{
                  color: 'var(--colour-highlight)',
                  background: 'none',
                  border: '1px solid var(--colour-dim)',
                  font: 'inherit',
                  padding: '2px 8px',
                }}
              >
                show more
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content warning confirmation */}
      {pendingWorld && (
        <DOSPanel
          title="CONTENT WARNING"
          onClose={() => setPendingWorld(null)}
        >
          <div className="mb-2" style={{ color: 'var(--colour-text)' }}>
            <span style={{ color: 'var(--colour-title)' }}>{pendingWorld.title}</span> contains the following content warnings:
          </div>
          <div className="mb-3 flex gap-1 flex-wrap">
            {pendingWorld.cw.map((cw) => (
              <span key={cw} style={{ color: 'var(--colour-error)' }}>[{cw}]</span>
            ))}
          </div>
          <div className="mb-3" style={{ color: 'var(--colour-dim)' }}>
            Do you want to continue?
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPendingWorld(null)}
              className="cursor-pointer"
              style={{ color: 'var(--colour-dim)', background: 'none', border: '1px solid var(--colour-dim)', font: 'inherit', padding: '2px 8px' }}
            >
              Cancel
            </button>
            <button
              onClick={() => { onSelectWorld(pendingWorld.slug); setPendingWorld(null); }}
              className="cursor-pointer"
              style={{ color: 'var(--colour-highlight)', background: 'none', border: '1px solid var(--colour-dim)', font: 'inherit', padding: '2px 8px' }}
            >
              Continue
            </button>
          </div>
        </DOSPanel>
      )}

      {/* Zap panel (world event) */}
      {zapTarget && (
        <TipPanel
          recipientPubkey={zapTarget.pubkey}
          recipientName={zapTarget.title}
          eventId={zapTarget.eventId}
          signer={identity?.signer}
          senderPubkey={identity?.pubkey}
          onClose={() => setZapTarget(null)}
        />
      )}

      {/* World creator panel (rendered as overlay) */}
      {worldCreatorNode}
    </div>
  );
}
