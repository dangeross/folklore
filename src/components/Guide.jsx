/**
 * Guide — Tutorial documentation pages.
 *
 * Renders markdown guide pages with sidebar navigation,
 * themed to match the Tide's End coastal palette.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { marked } from 'marked';
import { navigateToGuide, navigateToLobby, navigateToWorld } from '../services/router.js';
import { validateImport, importEvents, saveDraft, parseJsonLenient } from '../builder/draftStore.js';
import ImportPreviewPanel from '../builder/components/ImportPreviewPanel.jsx';
import WorldCreator from '../builder/components/WorldCreator.jsx';
import IdentityButton from './ui/IdentityButton.jsx';
import LoginPanel from './ui/LoginPanel.jsx';
import ProfileEditor from './ui/ProfileEditor.jsx';
import { TIDE_THEME } from '../services/guideTheme.js';

// Import all guide markdown files at build time
const guideModules = import.meta.glob('/docs/guide/*.md', { query: '?raw', import: 'default' });
// Import all tutorial JSON files at build time
const tutorialModules = import.meta.glob('/docs/guide/tutorials/*.json', { query: '?raw', import: 'default' });

const TUTORIALS = [
  { id: '01-getting-started', title: 'Getting Started', subtitle: 'Worlds, Places, Portals' },
  { id: '02-items-and-features', title: 'Items & Features', subtitle: 'Pickable objects, fixed things' },
  { id: '03-state-and-logic', title: 'State & Logic', subtitle: 'Transitions, Requires, Counters' },
  { id: '04-characters', title: 'Characters', subtitle: 'NPCs, Dialogue, Roaming' },
  { id: '05-puzzles', title: 'Puzzles & Secrets', subtitle: 'Riddles, Sequences, Clues' },
  { id: '06-quests', title: 'Quests', subtitle: 'Tracking, Quest types' },
  { id: '07-combat', title: 'Combat', subtitle: 'Weapons, Health, Death' },
  { id: '08-sound', title: 'Sound', subtitle: 'Ambient, Layers, Effects' },
  { id: '09-recipes', title: 'Recipes', subtitle: 'Crafting, Ingredients' },
  { id: '10-payments', title: 'Payments', subtitle: 'Lightning, LNURL gates' },
  { id: '11-endgame', title: 'Endgame', subtitle: 'Endings, Restart' },
];

const ADVANCED = [
  { id: 'authoring', title: 'Create Worlds with AI', subtitle: 'LLM-assisted authoring' },
  { id: 'lightning', title: 'Lightning & Tipping', subtitle: 'Bitcoin payments in folklore' },
  { id: '12-trust', title: 'Trust & Collaboration', subtitle: 'Vouching, moderation, open worlds' },
];

const SHOWCASES = [
  { id: 'cartographers-instrument', title: "The Cartographer's Instrument", subtitle: 'A musical puzzle world' },
  { id: 'the-courier', title: 'The Courier', subtitle: 'A logistics puzzle in five rooms' },
  { id: 'saturday', title: 'Saturday', subtitle: 'Counters, economy, budget decisions' },
];

const PAGES = [...TUTORIALS, ...SHOWCASES, ...ADVANCED];

const THEME = TIDE_THEME;

const GUIDE_CSS = `
  .guide-content {
    line-height: 1.7;
    font-size: 0.8rem;
  }
  .guide-content h1 {
    color: ${THEME.highlight};
    font-size: 1.3rem;
    margin: 1.5rem 0 0.75rem;
    border-bottom: 1px solid ${THEME.tableBorder};
    padding-bottom: 0.3rem;
  }
  .guide-content h2 {
    color: ${THEME.highlight};
    font-size: 1rem;
    margin: 1.2rem 0 0.5rem;
  }
  .guide-content h3 {
    color: ${THEME.accent};
    font-size: 0.85rem;
    margin: 1rem 0 0.4rem;
  }
  .guide-content p {
    margin: 0.5rem 0;
  }
  .guide-content ul, .guide-content ol {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }
  .guide-content li {
    margin: 0.25rem 0;
  }
  .guide-content code {
    background: ${THEME.codeBg};
    color: ${THEME.highlight};
    padding: 0.1rem 0.3rem;
    border-radius: 2px;
    font-size: 0.75rem;
  }
  .guide-content pre {
    background: ${THEME.codeBg};
    border: 1px solid ${THEME.tableBorder};
    padding: 0.75rem;
    overflow-x: auto;
    margin: 0.75rem 0;
    border-radius: 3px;
  }
  .guide-content pre code {
    background: none;
    padding: 0;
    color: ${THEME.text};
    font-size: 0.7rem;
  }
  .guide-content table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.75rem 0;
    font-size: 0.7rem;
  }
  .guide-content th {
    background: ${THEME.codeBg};
    color: ${THEME.highlight};
    text-align: left;
    padding: 0.3rem 0.5rem;
    border: 1px solid ${THEME.tableBorder};
  }
  .guide-content td {
    padding: 0.3rem 0.5rem;
    border: 1px solid ${THEME.tableBorder};
    vertical-align: top;
  }
  .guide-content blockquote {
    border-left: 3px solid ${THEME.accent};
    margin: 0.75rem 0;
    padding: 0.3rem 0.75rem;
    color: ${THEME.dim};
    font-style: italic;
  }
  .guide-content a {
    color: ${THEME.highlight};
    text-decoration: underline;
    text-decoration-color: ${THEME.tableBorder};
  }
  .guide-content a:hover {
    text-decoration-color: ${THEME.highlight};
  }
  .guide-content strong {
    color: ${THEME.highlight};
  }
  .guide-content hr {
    border: none;
    border-top: 1px solid ${THEME.tableBorder};
    margin: 1.5rem 0;
  }
  .guide-content img {
    max-width: 100%;
  }
  .guide-content ul {
    list-style: none;
  }
  .guide-content ul li::before {
    content: '·';
    color: ${THEME.accent};
    margin-right: 0.5em;
    margin-left: -1em;
  }
  .guide-content ol li::marker {
    color: ${THEME.accent};
  }

`;

function Sidebar({ currentPage, onNavigate, open, onToggle, onImport }) {
  return (
    <>
      {/* Mobile toggle — only visible on small screens */}
      <button
        className="cursor-pointer hover:opacity-80"
        style={{
          position: 'fixed', top: '0.5rem', left: '0.5rem', zIndex: 50,
          color: THEME.highlight, background: THEME.sidebarBg,
          border: `1px solid ${THEME.tableBorder}`,
          font: 'inherit', fontSize: '0.875rem', padding: '4px 8px',
          display: 'none',
        }}
        id="guide-sidebar-toggle"
        onClick={onToggle}
      >
        ☰
      </button>

      {/* Sidebar */}
      <div
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: '200px',
          backgroundColor: THEME.sidebarBg,
          borderRight: `1px solid ${THEME.tableBorder}`,
          padding: '1rem 0.75rem',
          overflowY: 'auto',
          transform: open ? 'translateX(0)' : undefined,
          transition: 'transform 0.2s ease',
          zIndex: 40,
        }}
        className="guide-sidebar"
      >
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => { window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); }}
            className="cursor-pointer hover:opacity-80"
            style={{ color: THEME.highlight, background: 'none', border: 'none', font: 'inherit', fontSize: '0.875rem' }}
          >
            folklore
          </button>
          <button
            onClick={onToggle}
            className="cursor-pointer hover:opacity-80 guide-sidebar-close"
            style={{
              color: THEME.dim, background: 'none', border: 'none',
              font: 'inherit', fontSize: '0.875rem', display: 'none',
            }}
          >
            ✕
          </button>
        </div>

        <button
          onClick={() => onNavigate(null)}
          className="block w-full text-left cursor-pointer hover:opacity-80 mb-3"
          style={{
            color: !currentPage ? THEME.highlight : THEME.text,
            background: 'none', border: 'none', font: 'inherit', fontSize: '0.8rem',
            fontWeight: !currentPage ? 'bold' : 'normal',
          }}
        >
          Guide
        </button>

        <div className="flex flex-col gap-0.5">
          {TUTORIALS.map((p) => {
            const active = currentPage === p.id;
            const num = p.id.split('-')[0];
            return (
              <button
                key={p.id}
                onClick={() => { onNavigate(p.id); if (window.innerWidth < 640) onToggle(); }}
                className="block w-full text-left cursor-pointer hover:opacity-80 px-2 py-1"
                style={{
                  color: active ? THEME.highlight : THEME.text,
                  background: active ? THEME.codeBg : 'none',
                  border: 'none', font: 'inherit', fontSize: '0.65rem',
                  borderLeft: active ? `2px solid ${THEME.highlight}` : '2px solid transparent',
                }}
              >
                <span style={{ color: THEME.dim, marginRight: '0.3em' }}>{num}.</span>
                {p.title}
              </button>
            );
          })}
        </div>

        {SHOWCASES.length > 0 && (
          <>
            <div style={{ borderTop: `1px solid ${THEME.tableBorder}`, margin: '0.75rem 0 0.5rem', paddingTop: '0.5rem' }}>
              <span style={{ color: THEME.highlight, fontSize: '0.7rem' }}>Showcase</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {SHOWCASES.map((p) => {
                const active = currentPage === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => { onNavigate(p.id); if (window.innerWidth < 640) onToggle(); }}
                    className="block w-full text-left cursor-pointer hover:opacity-80 px-2 py-1"
                    style={{
                      color: active ? THEME.highlight : THEME.text,
                      background: active ? THEME.codeBg : 'none',
                      border: 'none', font: 'inherit', fontSize: '0.65rem',
                      borderLeft: active ? `2px solid ${THEME.highlight}` : '2px solid transparent',
                    }}
                  >
                    {p.title}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {ADVANCED.length > 0 && (
          <>
            <div style={{ borderTop: `1px solid ${THEME.tableBorder}`, margin: '0.75rem 0 0.5rem', paddingTop: '0.5rem' }}>
              <span style={{ color: THEME.highlight, fontSize: '0.7rem' }}>Advanced</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {ADVANCED.map((p) => {
                const active = currentPage === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => { onNavigate(p.id); if (window.innerWidth < 640) onToggle(); }}
                    className="block w-full text-left cursor-pointer hover:opacity-80 px-2 py-1"
                    style={{
                      color: active ? THEME.highlight : THEME.text,
                      background: active ? THEME.codeBg : 'none',
                      border: 'none', font: 'inherit', fontSize: '0.65rem',
                      borderLeft: active ? `2px solid ${THEME.highlight}` : '2px solid transparent',
                    }}
                  >
                    {p.title}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Import world button */}
        <div style={{ borderTop: `1px solid ${THEME.tableBorder}`, marginTop: '0.75rem', paddingTop: '0.75rem' }}>
          <button
            onClick={() => { onImport(); if (window.innerWidth < 640) onToggle(); }}
            className="block w-full text-left cursor-pointer hover:opacity-80 px-2 py-1"
            style={{
              color: THEME.accent, background: 'none', border: 'none',
              font: 'inherit', fontSize: '0.65rem',
            }}
          >
            ↑ import world
          </button>
        </div>

      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 39,
            display: 'none',
          }}
          className="guide-overlay"
          onClick={onToggle}
        />
      )}

      {/* Mobile styles */}
      <style>{`
        @media (max-width: 639px) {
          #guide-sidebar-toggle { display: none !important; }
          .guide-sidebar { transform: translateX(${open ? '0' : '-100%'}) !important; }
          .guide-overlay { display: ${open ? 'block' : 'none'} !important; }
          .guide-main { margin-left: 0 !important; padding-left: 0 !important; padding-top: 0 !important; }
          .guide-header-burger { display: ${open ? 'none' : 'block'} !important; }
          .guide-sidebar-close { display: block !important; }
        }
      `}</style>
    </>
  );
}

function GuideTOC({ onNavigate }) {
  return (
    <div>
      <h1 style={{ color: THEME.highlight, fontSize: '1.3rem', marginBottom: '0.5rem', fontWeight: 'normal' }}>
        folklore guide
      </h1>
      <p style={{ color: THEME.dim, fontSize: '0.75rem', marginBottom: '0.75rem', maxWidth: 600 }}>
        Learn to build text adventure worlds. Each tutorial has a companion world you can import and explore.
      </p>
      <p style={{ color: THEME.text, fontSize: '0.75rem', marginBottom: '1.5rem', maxWidth: 600 }}>
        Ready to start? Click <span style={{ color: THEME.highlight }}>[build]</span> above to create your first world.
      </p>
      <div className="flex flex-col gap-1" style={{ maxWidth: 600 }}>
        {TUTORIALS.map((p) => {
          const num = p.id.split('-')[0];
          return (
            <button
              key={p.id}
              onClick={() => onNavigate(p.id)}
              className="text-left cursor-pointer hover:opacity-80 px-3 py-2"
              style={{
                color: THEME.text,
                background: 'none',
                border: `1px solid ${THEME.tableBorder}`,
                font: 'inherit', fontSize: '0.75rem',
              }}
            >
              <span style={{ color: THEME.highlight, marginRight: '0.5em' }}>
                {num}.
              </span>
              <strong style={{ color: THEME.text }}>{p.title}</strong>
              <span style={{ color: THEME.dim, marginLeft: '0.5em', fontSize: '0.65rem' }}>
                — {p.subtitle}
              </span>
            </button>
          );
        })}
      </div>

      {SHOWCASES.length > 0 && (
        <>
          <h2 style={{ color: THEME.highlight, fontSize: '1rem', marginTop: '2rem', marginBottom: '0.5rem', fontWeight: 'normal' }}>
            Showcase
          </h2>
          <p style={{ color: THEME.dim, fontSize: '0.75rem', marginBottom: '1rem', maxWidth: 600 }}>
            Complete worlds that demonstrate advanced mechanics working together.
          </p>
          <div className="flex flex-col gap-1" style={{ maxWidth: 600 }}>
            {SHOWCASES.map((p) => (
              <button
                key={p.id}
                onClick={() => onNavigate(p.id)}
                className="text-left cursor-pointer hover:opacity-80 px-3 py-2"
                style={{
                  color: THEME.text,
                  background: 'none',
                  border: `1px solid ${THEME.tableBorder}`,
                  font: 'inherit', fontSize: '0.75rem',
                }}
              >
                <strong style={{ color: THEME.text }}>{p.title}</strong>
                <span style={{ color: THEME.dim, marginLeft: '0.5em', fontSize: '0.65rem' }}>
                  — {p.subtitle}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {ADVANCED.length > 0 && (
        <>
          <h2 style={{ color: THEME.highlight, fontSize: '1rem', marginTop: '2rem', marginBottom: '0.5rem', fontWeight: 'normal' }}>
            Advanced
          </h2>
          <p style={{ color: THEME.dim, fontSize: '0.75rem', marginBottom: '1rem', maxWidth: 600 }}>
            Deeper topics: AI authoring, Lightning payments, trust and collaboration.
          </p>
          <div className="flex flex-col gap-1" style={{ maxWidth: 600 }}>
            {ADVANCED.map((p) => (
              <button
                key={p.id}
                onClick={() => onNavigate(p.id)}
                className="text-left cursor-pointer hover:opacity-80 px-3 py-2"
                style={{
                  color: THEME.text,
                  background: 'none',
                  border: `1px solid ${THEME.tableBorder}`,
                  font: 'inherit', fontSize: '0.75rem',
                }}
              >
                <strong style={{ color: THEME.text }}>{p.title}</strong>
                <span style={{ color: THEME.dim, marginLeft: '0.5em', fontSize: '0.65rem' }}>
                  — {p.subtitle}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LLMPromptSection() {
  const [copied, setCopied] = useState(false);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://flklr.com';
  const guideUrl = `${baseUrl}/guide/authoring`;

  const prompt = `You are authoring a folklore text adventure world. Folklore is a decentralised text adventure engine built on NOSTR.

Read the authoring guide and reference docs at: ${guideUrl}

Key files to follow:
1. Worked Example — creative process from concept to events
2. Authoring Guide — conventions, patterns, validation workflow
3. Design Spec — complete tag shapes and event types
4. Tag Reference — compact lookup table

Your output should be a valid JSON file with "events" array and optional "answers" and "walkthrough" keys. Use "<PUBKEY>" as a placeholder for the author's public key in all event references.

After generating the world, validate it using the API:
POST ${baseUrl}/api/validate
Content-Type: application/json

The user will describe their world concept. Ask clarifying questions about tone, mechanics, and scope before generating events.`;

  const handleCopy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(prompt).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy());
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      const ta = document.createElement('textarea');
      ta.value = prompt;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const claudeIcon = <svg width="14" height="14" viewBox="0 0 128 128" fill="currentColor" style={{ verticalAlign: 'middle' }}><path d="M32.4286 81.1404L52.8708 69.6696L53.2129 68.6699L52.8708 68.1174H51.8711L48.4509 67.9069L36.7696 67.5912L26.6406 67.1702L16.8273 66.6441L14.3543 66.1179L12.0391 63.066L12.2758 61.5401L14.3543 60.1457L17.3272 60.4088L23.9045 60.8561L33.7704 61.5401L40.9265 61.961L51.5291 63.066H53.2129L53.4496 62.382L52.8708 61.961L52.4236 61.5401L42.2156 54.6208L31.1658 47.3069L25.3778 43.0974L22.247 40.9664L20.6685 38.9669L19.9844 34.5995L22.8258 31.4688L26.6406 31.7318L27.6141 31.9949L31.4815 34.9679L39.7426 41.361L50.5293 49.3064L52.1079 50.6218L52.7393 50.1746L52.8182 49.8588L52.1079 48.6749L46.2409 38.0723L39.9794 27.2856L37.1906 22.8131L36.4539 20.1295C36.1908 19.0245 36.0067 18.1037 36.0067 16.9724L39.2427 12.5788L41.0317 12L45.3464 12.5788L47.1618 14.1573L49.8453 20.2874L54.1863 29.9428L60.9214 43.0711L62.8946 46.9648L63.947 50.5692L64.3416 51.6742H65.0257V51.0428L65.5781 43.6499L66.6042 34.5732L67.604 22.892L67.946 19.6033L69.5771 15.657L72.8132 13.5259L75.3388 14.7361L77.4173 17.7091L77.1279 19.6296L75.8913 27.6539L73.4709 40.2297L71.8923 48.6486H72.8132L73.8655 47.5963L78.1276 41.9398L85.2837 32.9947L88.4408 29.443L92.1241 25.5229L94.4919 23.6549H98.9644L102.253 28.5484L100.78 33.5998L96.1757 39.4404L92.3608 44.3865L86.8885 51.7531L83.4684 57.6463L83.7841 58.1199L84.5996 58.041L96.9649 55.4101L103.647 54.1999L111.619 52.8318L115.223 54.5156L115.618 56.2257L114.197 59.7248L105.673 61.8295L95.6758 63.829L80.7848 67.3544L80.6007 67.486L80.8111 67.7491L87.52 68.3805L90.3877 68.5383H97.4122L110.488 69.5118L113.908 71.7743L115.96 74.5368L115.618 76.6415L110.356 79.3251L103.253 77.6413L86.6781 73.6949L80.9953 72.2742H80.206V72.7478L84.9417 77.3782L93.6237 85.2183L104.489 95.321L105.042 97.8204L103.647 99.7936L102.174 99.5831L92.6239 92.4007L88.9407 89.1647L80.6007 82.1401H80.0482V82.8768L81.9687 85.6919L92.1241 100.951L92.6502 105.634L91.9136 107.16L89.2827 108.081L86.3887 107.555L80.4428 99.2148L74.3128 89.8224L69.3667 81.4035L68.7616 81.7455L65.8412 113.185L64.4732 114.79L61.3161 116L58.6852 114L57.2908 110.764L58.6852 104.371L60.3689 96.0314L61.737 89.4015L62.9735 81.1667L63.7102 78.4306L63.6576 78.2464L63.0525 78.3253L56.8435 86.8495L47.3985 99.6094L39.9267 107.607L38.1377 108.318L35.0332 106.713L35.3226 103.845L37.059 101.293L47.3985 88.1386L53.6338 79.9828L57.6591 75.2735L57.6328 74.5894H57.396L29.9293 92.427L25.0358 93.0584L22.931 91.0853L23.1941 87.8492L24.1939 86.7969L32.4549 81.1141Z"/></svg>;
  const chatgptIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: 'middle' }}><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm17.075 3.972L13.6 8.5l2.02-1.166a.076.076 0 0 1 .071 0l4.83 2.786a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.392-.681zM21.4 8.71l-.142-.085-4.779-2.758a.776.776 0 0 0-.785 0L9.843 9.235V6.903a.072.072 0 0 1 .033-.062l4.83-2.787a4.5 4.5 0 0 1 6.694 4.656zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.04a4.5 4.5 0 0 1 7.375-3.453l-.142.08L9.149 5.43a.795.795 0 0 0-.392.681zm1.097-2.365l2.602-1.5 2.607 1.5v3.005l-2.602 1.5-2.607-1.5z"/></svg>;
  const geminiIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: 'middle' }}><path d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z"/></svg>;

  const llms = [
    { name: 'Claude', url: 'https://claude.ai/new', colour: '#d4a574', icon: claudeIcon },
    { name: 'ChatGPT', url: 'https://chatgpt.com/', colour: '#74aa9c', icon: chatgptIcon },
    { name: 'Gemini', url: 'https://gemini.google.com/', colour: '#8b9dc3', icon: geminiIcon },
  ];

  return (
    <div className="guide-content" style={{ maxWidth: 700 }}>
      {/* System prompt */}
      <p style={{ color: THEME.dim, fontSize: '0.7rem', marginBottom: '0.5rem' }}>
        Copy this system prompt and paste it into the LLM:
      </p>
      <div style={{
        position: 'relative',
        background: THEME.codeBg,
        border: `1px solid ${THEME.tableBorder}`,
        padding: '0.5rem 0.75rem',
        marginBottom: '1.5rem',
        maxHeight: '200px',
        overflowY: 'auto',
      }}>
        <button
          onClick={handleCopy}
          className="cursor-pointer hover:opacity-80"
          style={{
            position: 'sticky', top: 0, float: 'right',
            color: copied ? THEME.accent : THEME.dim,
            background: THEME.codeBg,
            border: 'none', font: 'inherit', fontSize: '0.6rem',
            minWidth: '3rem', textAlign: 'right',
          }}
        >
          {copied ? 'copied!' : 'copy'}
        </button>
        <pre style={{
          color: THEME.text,
          fontSize: '0.6rem',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          margin: 0,
          padding: 0,
          border: 'none',
          background: 'none',
        }}>
          {prompt}
        </pre>
      </div>

      {/* LLM buttons */}
      <div className="flex gap-2 flex-wrap">
        {llms.map((llm) => (
          <a
            key={llm.name}
            href={llm.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-80 flex items-center gap-1.5"
            style={{
              color: THEME.bg,
              backgroundColor: llm.colour,
              padding: '0.4rem 1rem',
              fontSize: '0.75rem',
              textDecoration: 'none',
              border: 'none',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {llm.icon}
            {llm.name}
          </a>
        ))}
      </div>

    </div>
  );
}

function GuidePage({ pageId }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importPreview, setImportPreview] = useState(null);

  async function handleTutorialImport(filename) {
    const key = `/docs/guide/tutorials/${filename}`;
    const loader = tutorialModules[key];
    if (!loader) return;
    try {
      const raw = await loader();
      const data = parseJsonLenient(raw);
      // Detect world slug from the data
      const worldEvent = data.events?.find((e) => e.tags?.find((t) => t[0] === 'type')?.[1] === 'world');
      const detectedSlug = worldEvent?.tags?.find((t) => t[0] === 't')?.[1];
      if (!detectedSlug) return;
      const validation = validateImport(detectedSlug, data);
      setImportPreview({ validation, data, worldSlug: detectedSlug });
    } catch (e) {
      console.warn('Tutorial import error:', e);
    }
  }

  useEffect(() => {
    setLoading(true);
    const key = `/docs/guide/${pageId}.md`;
    const loader = guideModules[key];
    if (loader) {
      loader().then((raw) => {
        setContent(raw);
        setLoading(false);
      }).catch(() => {
        setContent('# Page not found');
        setLoading(false);
      });
    } else {
      setContent('# Page not found');
      setLoading(false);
    }
    window.scrollTo(0, 0);
  }, [pageId]);

  const html = useMemo(() => {
    if (!content) return '';
    let rendered = marked(content, { breaks: true });
    // Convert relative tutorial links (any JSON in tutorials/)
    rendered = rendered.replace(
      /<a href="tutorials\/([^"]+\.json)"[^>]*>([^<]+)<\/a>/g,
      '<a href="/guide/$1" class="tutorial-link" style="color:' + THEME.highlight + '">$2</a>'
    );
    // Convert standalone page ID references to links (not inside tags or filenames)
    for (const p of PAGES) {
      const re = new RegExp(`(?<![/\\w.-])(${p.id})(?![/\\w.\\-"<])`, 'g');
      rendered = rendered.replace(re, `<a href="/guide/${p.id}" style="color:${THEME.highlight};text-decoration:underline">${p.id}</a>`);
    }
    // Convert "02: Items and Features" style bold references to links
    for (const p of PAGES) {
      const num = p.id.split('-')[0];
      const re = new RegExp(`<strong>${num}:([^<]+)<\\/strong>`, 'g');
      rendered = rendered.replace(re, `<a href="/guide/${p.id}" style="color:${THEME.highlight};text-decoration:underline;font-weight:bold">${num}:$1</a>`);
    }
    return rendered;
  }, [content]);

  const idx = PAGES.findIndex((p) => p.id === pageId);
  const prev = idx > 0 ? PAGES[idx - 1] : null;
  const next = idx < PAGES.length - 1 ? PAGES[idx + 1] : null;

  if (loading) return <p style={{ color: THEME.dim }}>Loading...</p>;

  return (
    <div>
      <div
        className="guide-content"
        style={{ maxWidth: 700 }}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => {
          const link = e.target.closest('a[href^="/guide/"]');
          if (link) {
            e.preventDefault();
            const path = link.getAttribute('href');
            // Tutorial JSON link — trigger import
            const jsonMatch = path.match(/^\/guide\/([^/]+\.json)$/);
            if (jsonMatch) {
              handleTutorialImport(jsonMatch[1]);
              return;
            }
            // Guide page link — navigate
            const pageMatch = path.match(/^\/guide\/([a-z0-9-]+)/);
            if (pageMatch) navigateToGuide(pageMatch[1]);
          }
        }}
      />
      {/* LLM prompt section — only on authoring page */}
      {pageId === 'authoring' && <LLMPromptSection />}
      <div className="flex justify-between mt-6 pt-3" style={{ borderTop: `1px solid ${THEME.tableBorder}`, maxWidth: 700 }}>
        {prev ? (
          <button
            onClick={() => navigateToGuide(prev.id)}
            className="cursor-pointer hover:opacity-80"
            style={{ color: THEME.dim, background: 'none', border: 'none', font: 'inherit', fontSize: '0.7rem' }}
          >
            ← {prev.title}
          </button>
        ) : <span />}
        {next ? (
          <button
            onClick={() => navigateToGuide(next.id)}
            className="cursor-pointer hover:opacity-80"
            style={{ color: THEME.highlight, background: 'none', border: 'none', font: 'inherit', fontSize: '0.7rem' }}
          >
            {next.title} →
          </button>
        ) : <span />}
      </div>

      {/* Import preview panel */}
      {importPreview && (
        <ImportPreviewPanel
          validation={importPreview.validation}
          onConfirm={() => {
            importEvents(importPreview.worldSlug, importPreview.data);
            setImportPreview(null);
            navigateToWorld(importPreview.worldSlug);
          }}
          onClose={() => setImportPreview(null)}
        />
      )}
    </div>
  );
}

export default function Guide({ guidePage, identity }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const importFileRef = React.useRef(null);
  const buildRef = React.useRef(null);

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = parseJsonLenient(reader.result);
          const eventList = Array.isArray(data) ? data : (data.events ?? []);
          const worldEvent = eventList.find((ev) => ev.tags?.find((t) => t[0] === 'type')?.[1] === 'world');
          const detectedSlug = worldEvent?.tags?.find((t) => t[0] === 't')?.[1] || '';
          const validation = validateImport(detectedSlug || 'unknown', data);
          setImportPreview({ validation, data, worldSlug: detectedSlug });
        } catch { /* invalid JSON */ }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  }

  // Close build dropdown on outside click
  React.useEffect(() => {
    if (!buildOpen) return;
    const handler = (e) => { if (buildRef.current && !buildRef.current.contains(e.target)) setBuildOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [buildOpen]);

  const handleNavigate = (pageId) => {
    navigateToGuide(pageId);
    setSidebarOpen(false);
  };

  return (
    <div className="font-mono guide-root" style={{
      backgroundColor: THEME.bg,
      color: THEME.text,
      minHeight: '100vh',
      '--colour-bg': THEME.bg,
      '--colour-text': THEME.text,
      '--colour-dim': THEME.dim,
      '--colour-highlight': THEME.highlight,
      '--colour-title': THEME.highlight,
      '--colour-item': THEME.highlight,
      '--colour-error': '#c47070',
      '--colour-exits': THEME.accent,
      '--colour-clue': THEME.accent,
    }}>
      <style>{GUIDE_CSS}</style>
      <Sidebar
        currentPage={guidePage}
        onNavigate={handleNavigate}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onImport={() => importFileRef.current?.click()}
      />
      <input
        ref={importFileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImportFile}
      />
      <div className="guide-main" style={{ marginLeft: '200px' }}>
        {/* Header bar */}
        <div className="flex items-center justify-between gap-3 guide-header" style={{
          padding: '0.4rem 1rem',
          borderBottom: `1px solid ${THEME.tableBorder}`,
          position: 'sticky', top: 0, zIndex: 30,
          backgroundColor: THEME.bg,
        }}>
          <button
            className="cursor-pointer hover:opacity-80 guide-header-burger"
            style={{ color: THEME.highlight, background: 'none', border: 'none', font: 'inherit', fontSize: '0.875rem', display: 'none' }}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >☰</button>
          <div className="flex items-center gap-3" style={{ marginLeft: 'auto' }}>
          <div ref={buildRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setBuildOpen(!buildOpen)}
              className="cursor-pointer hover:opacity-80"
              style={{ color: THEME.highlight, background: 'none', border: 'none', font: 'inherit', fontSize: '14px' }}
            >
              [build]
            </button>
            {buildOpen && (
              <div className="font-mono text-xs" style={{
                position: 'absolute', right: 0, top: '100%', marginTop: '0.25rem',
                backgroundColor: 'var(--colour-bg)', border: '1px solid var(--colour-dim)',
                boxShadow: '2px 2px 0 var(--colour-dim)', zIndex: 100, minWidth: '10em',
              }}>
                <button
                  onClick={() => { setBuildOpen(false); navigateToLobby(); }}
                  className="block w-full text-left cursor-pointer hover:opacity-80 px-2 py-1"
                  style={{ color: THEME.accent, background: 'none', border: 'none', font: 'inherit' }}
                >
                  {'  '}explore
                </button>
                <div style={{ borderTop: '1px solid var(--colour-dim)' }}>
                  <button
                    onClick={() => { setBuildOpen(false); setShowCreator(true); }}
                    className="block w-full text-left cursor-pointer hover:opacity-80 px-2 py-1"
                    style={{ color: THEME.highlight, background: 'none', border: 'none', font: 'inherit' }}
                  >
                    {'  '}+ world
                  </button>
                  <button
                    onClick={() => { setBuildOpen(false); importFileRef.current?.click(); }}
                    className="block w-full text-left cursor-pointer hover:opacity-80 px-2 py-1"
                    style={{ color: THEME.highlight, background: 'none', border: 'none', font: 'inherit' }}
                  >
                    {'  '}import
                  </button>
                </div>
              </div>
            )}
          </div>
          <span style={{ '--colour-highlight': '#ffffff', '--colour-dim': THEME.dim, fontSize: '14px' }}>
            <IdentityButton identity={identity} onClick={() => setShowLogin(!showLogin)} />
          </span>
          </div>
        </div>

        <div style={{ padding: '1.5rem 2rem' }}>
          {guidePage ? (
            <GuidePage pageId={guidePage} />
          ) : (
            <GuideTOC onNavigate={handleNavigate} />
          )}
        </div>
      </div>

      {/* Import preview panel */}
      {importPreview && (
        <ImportPreviewPanel
          validation={importPreview.validation}
          onConfirm={() => {
            importEvents(importPreview.worldSlug, importPreview.data);
            setImportPreview(null);
            navigateToWorld(importPreview.worldSlug);
          }}
          onClose={() => setImportPreview(null)}
        />
      )}

      {/* World Creator panel */}
      {showCreator && (
        <WorldCreator
          onClose={() => setShowCreator(false)}
          onSaveDrafts={(worldSlug, templates) => {
            for (const tmpl of templates) saveDraft(worldSlug, tmpl);
            setShowCreator(false);
            navigateToWorld(worldSlug);
          }}
        />
      )}

      {/* Identity panels */}
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
    </div>
  );
}
