/**
 * Landing — front page of folklore.
 *
 * Warm, inviting introduction: tagline, pillars, curated worlds.
 * Uses the Tide's End coastal theme shared with the Guide.
 */

import React, { useState } from 'react';
import { navigateToLobby, navigateToGuide, navigateToWorld } from '../services/router.js';
import { useWorldDiscovery } from '../hooks/useWorldDiscovery.js';
import { APP_PUBKEY } from '../config.js';
import { TIDE_THEME as T } from '../services/guideTheme.js';
import WorldCard from './WorldCard.jsx';
import DOSPanel from './ui/DOSPanel.jsx';
import IdentityButton from './ui/IdentityButton.jsx';
import LoginPanel from './ui/LoginPanel.jsx';
import ProfileEditor from './ui/ProfileEditor.jsx';

const PILLARS = [
  {
    title: 'Build',
    text: 'Create your own text adventures with a visual builder. Places, items, characters, puzzles — assembled from simple building blocks. No code needed.',
  },
  {
    title: 'Explore',
    text: 'Discover worlds crafted by players and creators. Step into stories, solve puzzles, meet characters. Every world is different — and every visit is yours.',
  },
  {
    title: 'Worlds',
    text: 'You own what you create. No platform lock-in. No gatekeepers. Your worlds live on open relays, accessible to everyone, forever.',
  },
];

export default function Landing({ identity }) {
  const { worlds, status } = useWorldDiscovery('curated', APP_PUBKEY);
  const [pendingWorld, setPendingWorld] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);

  function handleWorldClick(world) {
    if (world.cw?.length > 0) {
      setPendingWorld(world);
    } else {
      navigateToWorld(world.slug);
    }
  }

  const cssVars = {
    '--colour-bg': T.bg,
    '--colour-text': T.text,
    '--colour-dim': T.dim,
    '--colour-highlight': T.highlight,
    '--colour-title': T.highlight,
    '--colour-item': T.accent,
    '--colour-error': '#c47070',
    '--colour-exits': T.dim,
    '--colour-clue': T.accent,
  };

  return (
    <div
      className="font-mono"
      style={{
        backgroundColor: T.bg,
        color: T.text,
        minHeight: '100vh',
        ...cssVars,
      }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto font-mono text-sm game-container" style={{ paddingBottom: 0 }}>
        <div className="flex items-center justify-between mb-4">
          <span style={{ color: T.highlight }}>folklore</span>
          <IdentityButton identity={identity} onClick={() => setShowLogin(!showLogin)} />
        </div>
      </div>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section
        className="flex flex-col items-center justify-center text-center px-6"
        style={{ minHeight: '55vh', maxWidth: 700, margin: '0 auto', position: 'relative', overflow: 'hidden' }}
      >
        {/* Starfield background */}
        <div
          aria-hidden="true"
          className="landing-stars"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        />
        <h1
          style={{
            color: T.highlight,
            fontSize: 'clamp(1.2rem, 4vw, 1.8rem)',
            fontWeight: 'normal',
            fontStyle: 'italic',
            marginBottom: '1rem',
            lineHeight: 1.3,
          }}
        >
          Adventures that are yours to keep
        </h1>
        <p style={{ color: T.text, fontSize: '0.8rem', marginBottom: '1rem', maxWidth: 480, lineHeight: 1.6 }}>
          Explore worlds crafted by anyone. Build your own. They're yours to keep.
        </p>
        <div style={{ color: T.dim, fontSize: '0.8rem', marginBottom: '2rem' }}>
          <span style={{ opacity: 0.5 }}>&gt;</span>
          <span className="landing-cursor" style={{ display: 'inline-block', width: '0.5em', height: '1em', backgroundColor: T.dim, marginLeft: '0.3em', verticalAlign: 'text-bottom' }} />
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => navigateToGuide()}
            className="cursor-pointer hover:opacity-80"
            style={{
              color: T.accent,
              background: 'none',
              border: `1px solid ${T.accent}`,
              font: 'inherit',
              fontSize: '0.8rem',
              padding: '0.5rem 1.5rem',
            }}
          >
            Build
          </button>
          <button
            onClick={() => navigateToLobby()}
            className="cursor-pointer hover:opacity-80"
            style={{
              color: T.highlight,
              background: 'none',
              border: `1px solid ${T.highlight}`,
              font: 'inherit',
              fontSize: '0.8rem',
              padding: '0.5rem 1.5rem',
            }}
          >
            Explore
          </button>
        </div>
      </section>

      {/* ── Pillars ────────────────────────────────────────── */}
      <section
        className="px-6 pb-8"
        style={{ maxWidth: 900, margin: '0 auto' }}
      >
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
        >
          {PILLARS.map((p) => (
            <div
              key={p.title}
              style={{
                border: `1px solid ${T.tableBorder}`,
                padding: '1.2rem',
              }}
            >
              <h3 style={{ color: T.highlight, fontSize: '1rem', marginBottom: '0.6rem', fontWeight: 'normal' }}>
                {p.title}
              </h3>
              <p style={{ color: T.dim, fontSize: '0.75rem', lineHeight: 1.7 }}>
                {p.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Curated Worlds ─────────────────────────────────── */}
      <section
        className="px-6 pb-8"
        style={{ maxWidth: 900, margin: '0 auto' }}
      >
        <h2 style={{ color: T.highlight, fontSize: '0.9rem', fontWeight: 'normal', marginBottom: '1rem' }}>
          Featured Worlds
        </h2>
        {status === 'loading' && (
          <p style={{ color: T.dim, fontSize: '0.7rem' }}>Searching relays...</p>
        )}
        {status === 'empty' && (
          <p style={{ color: T.dim, fontSize: '0.7rem' }}>No worlds found.</p>
        )}
        {worlds.length > 0 && (
          <div className="flex flex-col gap-3">
            {worlds.map((w) => (
              <WorldCard
                key={w.aTag || w.slug}
                world={w}
                onClick={() => handleWorldClick(w)}
              />
            ))}
          </div>
        )}
        <div className="mt-4">
          <button
            onClick={() => navigateToLobby()}
            className="cursor-pointer hover:opacity-80"
            style={{
              color: T.dim,
              background: 'none',
              border: 'none',
              font: 'inherit',
              fontSize: '0.7rem',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            Browse all worlds →
          </button>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer
        className="px-6 py-6 text-center"
        style={{ borderTop: `1px solid ${T.tableBorder}`, maxWidth: 900, margin: '0 auto' }}
      >
        <div className="flex justify-center gap-6" style={{ fontSize: '0.65rem' }}>
          <button
            onClick={() => navigateToGuide()}
            className="cursor-pointer hover:opacity-80"
            style={{ color: T.dim, background: 'none', border: 'none', font: 'inherit', fontSize: '0.65rem' }}
          >
            Guide
          </button>
          <button
            onClick={() => navigateToLobby()}
            className="cursor-pointer hover:opacity-80"
            style={{ color: T.dim, background: 'none', border: 'none', font: 'inherit', fontSize: '0.65rem' }}
          >
            Explore
          </button>
          <a
            href="https://github.com/dangeross/folklore"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-80"
            style={{ color: T.dim, textDecoration: 'none' }}
          >
            GitHub
          </a>
        </div>
        <a
          href="https://github.com/nostr-protocol/nostr"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#ffffff', fontSize: '0.55rem', marginTop: '0.75rem', display: 'inline-block', textDecoration: 'none', opacity: 0.7 }}
          className="hover:opacity-100"
        >
          Built on NOSTR
        </a>
      </footer>

      {/* ── Identity panels ────────────────────────────────── */}
      {showLogin && (
        <LoginPanel
          identity={identity}
          onClose={() => setShowLogin(false)}
          onEditProfile={() => setShowProfileEditor(true)}
        />
      )}
      {showProfileEditor && (
        <ProfileEditor
          identity={identity}
          onClose={() => setShowProfileEditor(false)}
        />
      )}

      {/* ── CW confirmation ────────────────────────────────── */}
      {pendingWorld && (
        <DOSPanel title="Content Warning" onClose={() => setPendingWorld(null)}>
          <p style={{ color: T.text, fontSize: '0.75rem', marginBottom: '0.5rem' }}>
            This world contains:
          </p>
          <div className="flex flex-wrap gap-1 mb-3">
            {pendingWorld.cw.map((tag) => (
              <span key={tag} style={{ color: '#c47070', fontSize: '0.7rem' }}>[{tag}]</span>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { navigateToWorld(pendingWorld.slug); setPendingWorld(null); }}
              className="cursor-pointer hover:opacity-80"
              style={{ color: T.highlight, background: 'none', border: `1px solid ${T.highlight}`, font: 'inherit', fontSize: '0.7rem', padding: '0.3rem 1rem' }}
            >
              Continue
            </button>
            <button
              onClick={() => setPendingWorld(null)}
              className="cursor-pointer hover:opacity-80"
              style={{ color: T.dim, background: 'none', border: `1px solid ${T.tableBorder}`, font: 'inherit', fontSize: '0.7rem', padding: '0.3rem 1rem' }}
            >
              Back
            </button>
          </div>
        </DOSPanel>
      )}

      <style>{`
        @keyframes cursor-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .landing-cursor { animation: cursor-blink 1s step-end infinite; }
        .landing-stars {
          background-image:
            radial-gradient(2px 2px at 3% 8%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 7% 42%, ${T.dim} 0%, transparent 100%),
            radial-gradient(3px 3px at 11% 76%, ${T.highlight} 0%, transparent 100%),
            radial-gradient(2px 2px at 14% 22%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 18% 58%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 22% 11%, ${T.dim} 0%, transparent 100%),
            radial-gradient(3px 3px at 25% 88%, ${T.highlight} 0%, transparent 100%),
            radial-gradient(2px 2px at 28% 35%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 32% 65%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 35% 4%, ${T.dim} 0%, transparent 100%),
            radial-gradient(3px 3px at 38% 48%, ${T.highlight} 0%, transparent 100%),
            radial-gradient(2px 2px at 41% 82%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 44% 18%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 47% 55%, ${T.dim} 0%, transparent 100%),
            radial-gradient(3px 3px at 50% 92%, ${T.highlight} 0%, transparent 100%),
            radial-gradient(2px 2px at 53% 30%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 56% 68%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 59% 12%, ${T.dim} 0%, transparent 100%),
            radial-gradient(3px 3px at 62% 45%, ${T.highlight} 0%, transparent 100%),
            radial-gradient(2px 2px at 65% 78%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 68% 25%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 71% 52%, ${T.dim} 0%, transparent 100%),
            radial-gradient(3px 3px at 74% 6%, ${T.highlight} 0%, transparent 100%),
            radial-gradient(2px 2px at 77% 85%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 80% 38%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 83% 62%, ${T.dim} 0%, transparent 100%),
            radial-gradient(3px 3px at 86% 15%, ${T.highlight} 0%, transparent 100%),
            radial-gradient(2px 2px at 89% 72%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 92% 48%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 95% 20%, ${T.dim} 0%, transparent 100%),
            radial-gradient(3px 3px at 97% 58%, ${T.highlight} 0%, transparent 100%),
            radial-gradient(2px 2px at 2% 95%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 16% 48%, ${T.dim} 0%, transparent 100%),
            radial-gradient(3px 3px at 33% 28%, ${T.highlight} 0%, transparent 100%),
            radial-gradient(2px 2px at 48% 72%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 58% 38%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 72% 88%, ${T.dim} 0%, transparent 100%),
            radial-gradient(3px 3px at 85% 32%, ${T.highlight} 0%, transparent 100%),
            radial-gradient(2px 2px at 93% 65%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 6% 62%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 20% 3%, ${T.dim} 0%, transparent 100%),
            radial-gradient(3px 3px at 43% 95%, ${T.highlight} 0%, transparent 100%),
            radial-gradient(2px 2px at 63% 52%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 78% 15%, ${T.dim} 0%, transparent 100%),
            radial-gradient(2px 2px at 91% 82%, ${T.dim} 0%, transparent 100%);
          opacity: 0.5;
        }
        @media (max-width: 639px) {
          .landing-pillars { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
