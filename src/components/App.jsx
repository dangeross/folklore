import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRelay } from '../hooks/useRelay.js';
import { usePlayerState } from '../hooks/usePlayerState.js';
import { useSigner } from '../hooks/useSigner.js';
import { parseRoute, navigateToWorld, navigateToLobby, navigateToProfile, pinnedSlug } from '../services/router.js';
import { GameEngine } from '../engine/engine.js';
import { renderMarkdown } from '../engine/content.js';
import { PlayerStateMutator } from '../engine/player-state.js';
import { getTag, getTags } from '../engine/world.js';
import { resolveTheme, applyTheme, resetTheme, resolveEffects, applyEffects, resolveFont, resolveFontSize, resolveFontSizePanel, resolveCursor, applyFontAndCursor, loadFont } from '../services/theme.js';
import { buildTrustSet } from '../engine/trust.js';
import { interpolateHud } from '../engine/hud.js';
import { useStateBackup } from '../hooks/useStateBackup.js';
import { useNip65 } from '../hooks/useNip65.js';
import PaymentPanel from './PaymentPanel.jsx';
import Guide from './Guide.jsx';
import Landing from './Landing.jsx';
import BuildModeOverlay from '../builder/components/BuildModeOverlay.jsx';
import EventEditor from '../builder/components/EventEditor.jsx';
import DraftListPanel from '../builder/components/DraftListPanel.jsx';
import ModeDropdown from '../builder/components/ModeDropdown.jsx';
import WorldCreator from '../builder/components/WorldCreator.jsx';
import VouchPanel from '../builder/components/VouchPanel.jsx';
import TrustPanel from '../builder/components/TrustPanel.jsx';
import EventGraph from '../builder/components/EventGraph.jsx';
import MapOverlay from './MapOverlay.jsx';
import { publishReport, publishRevoke, deletePublishedEvent } from '../builder/eventBuilder.js';
import Lobby from './Lobby.jsx';
import AuthorProfile from './AuthorProfile.jsx';
import TipPanel from './TipPanel.jsx';
import SharePanel from './SharePanel.jsx';
import IdentityButton from './ui/IdentityButton.jsx';
import LoginPanel from './ui/LoginPanel.jsx';
import ProfileEditor from './ui/ProfileEditor.jsx';
import { loadDrafts, saveDraft, updateDraft, deleteDraft, clearDrafts, importEvents, exportDrafts, bulkPublish, retryFailed, loadAnswers } from '../builder/draftStore.js';
import { validateWorld, verifyPuzzleHashes } from '../builder/validateWorld.js';
import { useTypeahead } from '../hooks/useTypeahead.js';
import RelaySettingsPanel from './RelaySettingsPanel.jsx';
import PublishProgressPanel from '../builder/components/PublishProgressPanel.jsx';
import SoundToggle from './SoundToggle.jsx';
import { evaluateSoundTags, isAudioReady, playOneShotRef, loadSamples, hush as hushSound, stopPreview, setEventsMap } from '../services/sound.js';
import { importScenariosFromData } from '../engine/scenarios.js';

/** Map entry types to colour slots */
const TYPE_COLOUR = {
  command:          'text',
  narrative:        'text',
  title:            'title',
  error:            'error',
  exits:            'exits',
  'exits-untrusted':'error',
  'exits-open':     'dim',
  item:             'item',
  feature:          'dim',
  'clue-title':     'clue',
  clue:             'clue',
  'puzzle-title':   'puzzle',
  puzzle:           'puzzle',
  hint:             'puzzle',
  success:          'highlight',
  win:              'item',
  sealed:           'dim',
  npc:              'npc',
  'npc-title':      'npc',
  dialogue:         'npc',
  'dialogue-option':'npc',
  markdown:         'text',
  'media-markdown': 'text',
  'media-ascii':    'text',
  death:            'error',
  'death-separator':'dim',
  endgame:          'highlight',
  'endgame-separator':'dim',
  'endgame-prompt': 'dim',
};

/** Map entry types to extra CSS classes (layout, weight, etc.) */
const TYPE_CLASS = {
  command:          'mt-2',
  title:            'font-bold mt-3',
  exits:            'text-sm mt-1',
  'exits-untrusted':'text-sm',
  'exits-open':     'text-sm italic opacity-50',
  item:             'text-sm',
  feature:          'text-sm',
  'clue-title':     'font-bold mt-2',
  clue:             'italic',
  'puzzle-title':   'font-bold mt-2',
  puzzle:           'italic',
  hint:             'text-sm',
  success:          'font-bold',
  win:              'whitespace-pre-wrap mt-2',
  sealed:           'italic',
  npc:              'text-sm',
  'npc-title':      'font-bold mt-3',
  dialogue:         'italic',
  'dialogue-option':'text-sm',
  markdown:         'prose-dungeon mt-1',
  'media-markdown': 'prose-dungeon mt-1',
  'media-ascii':    'whitespace-pre font-mono text-sm mt-2 leading-none',
  'media-image':    'mt-2',
  death:            'font-bold text-center mt-4 mb-2 whitespace-pre-wrap',
  'death-separator':'text-center mt-1 mb-3 text-sm',
  endgame:          'text-center mt-4 mb-2 whitespace-pre-wrap italic',
  'endgame-separator':'text-center mt-1 mb-1 text-sm',
  'endgame-prompt': 'text-center mt-2 text-sm',
};

export default function App() {
  // ── Route state ──────────────────────────────────────────────────────────
  const [route, setRoute] = useState(parseRoute);

  useEffect(() => {
    function onNav() { setRoute(parseRoute()); }
    window.addEventListener('popstate', onNav);
    return () => window.removeEventListener('popstate', onNav);
  }, []);

  // Dynamic page titles
  // Reset theme to defaults on non-game routes (must be in effect, not render)
  useEffect(() => {
    if (route.page !== 'game') {
      resetTheme();
      hushSound();
      if (route.page === 'guide') {
        // Disable CRT effects entirely on guide pages
        const root = document.documentElement;
        root.style.setProperty('--effect-scanlines', '0');
        root.style.setProperty('--effect-vignette', '0.15');
        root.style.setProperty('--effect-glow', '0.1');
        root.style.setProperty('--effect-noise', '0');
      }
    }
  }, [route.page]);

  useEffect(() => {
    const titles = {
      landing: 'Folklore — Text Adventure Worlds',
      lobby: 'Explore — Folklore',
      guide: route.guidePage ? `${route.guidePage} — Folklore Guide` : 'Guide — Folklore',
      profile: 'Profile — Folklore',
      game: route.worldSlug ? `${route.worldSlug} — Folklore` : 'Folklore',
    };
    document.title = titles[route.page] || 'Folklore';
  }, [route]);

  const worldTag = route.worldSlug;
  const pubkeyPrefix = route.pubkeyPrefix ?? null;

  // ── Core hooks (worldTag-scoped) ─────────────────────────────────────────
  const { events, status, pool, relayStatus, publishUrls, updateRelays } = useRelay(worldTag);
  const player = usePlayerState(worldTag);
  const identity = useSigner();
  const nip65 = useNip65(identity?.pubkey, pool);
  const backup = useStateBackup({
    worldTag,
    signer: identity.signer,
    pool,
    playerState: player.state,
    npcStates: player.npcStates,
    replaceState: player.replaceState,
  });
  const [log, setLog] = useState([]);
  const [previewUnvouched, setPreviewUnvouched] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [generation, setGeneration] = useState(0);
  // Build mode state
  const [buildMode, setBuildMode] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const pendingImportRef = useRef(null); // { data } — queued from Lobby import
  const [editorState, setEditorState] = useState(null); // { eventType, draft?, initialTags?, ... }
  const [showWorldCreator, setShowWorldCreator] = useState(false);
  const [showZap, setShowZap] = useState(false);
  const [vouchTarget, setVouchTarget] = useState(null); // pubkey to vouch for
  const [drafts, setDrafts] = useState(() => loadDrafts(worldTag || ''));
  const draftAnswers = useMemo(() => loadAnswers(worldTag || ''), [worldTag, drafts]); // eslint-disable-line react-hooks/exhaustive-deps
  const [publishResult, setPublishResult] = useState(null); // { published, failed, errors, details }
  const [showRelaySettings, setShowRelaySettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showTrust, setShowTrust] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const engineRef = useRef(null);
  const inputRef = useRef(null);
  const prevWorldTag = useRef(worldTag);

  // Reset state when world changes (SPA navigation between worlds)
  useEffect(() => {
    if (prevWorldTag.current !== worldTag) {
      prevWorldTag.current = worldTag;
      setLog([]);
      setBuildMode(false);
      setShowDrafts(false);
      setEditorState(null);
      setShowWorldCreator(false);
      setShowZap(false);
      setVouchTarget(null);
      setPublishResult(null);
      setShowRelaySettings(false);
      setShowTrust(false);
      setPreviewUnvouched(false);
      setGeneration(g => g + 1);
      engineRef.current = null;
      setDrafts(loadDrafts(worldTag || ''));
    }
  }, [worldTag]);
  const logEndRef = useRef(null);
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const draftRef = useRef('');

  // Reset game state when world changes
  const prevWorldRef = useRef(worldTag);
  useEffect(() => {
    if (prevWorldRef.current !== worldTag) {
      prevWorldRef.current = worldTag;
      engineRef.current = null;
      setLog([]);
      setGeneration((g) => g + 1);
      setDrafts(loadDrafts(worldTag || ''));
      // clientMode removed — collaboration mode is read from the world event, no user switching
    }
  }, [worldTag]);

  // Reset build mode on world change; auto-enable only for draft-only worlds
  useEffect(() => {
    setBuildMode(false);
  }, [worldTag]);
  useEffect(() => {
    if (status === 'ready' && drafts.length > 0 && events.size === 0 && !buildMode) setBuildMode(true);
  }, [status, drafts.length, events.size]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open drafts panel when pending import arrives from Lobby
  useEffect(() => {
    if (pendingImportRef.current && status === 'ready') {
      setBuildMode(true);
      setShowDrafts(true);
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sound: hush on entering build mode, restore ambient on exit
  useEffect(() => {
    if (buildMode) {
      hushSound();
    } else if (isAudioReady() && engineRef.current) {
      evaluateSoundTags(
        mergedEvents, engineRef.current.currentPlace,
        engineRef.current.player.state, engineRef.current.player.npcStates,
      );
    }
  }, [buildMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge drafts into events so the engine can preview unpublished content.
  // Draft events become synthetic events keyed by their a-tag, with the
  // current user's pubkey (or a placeholder). Relay events always win.
  const mergedEvents = useMemo(() => {
    if (drafts.length === 0) return events;
    const pubkey = identity.pubkey || '0'.repeat(64);
    const merged = new Map(events);
    // Build d-tag → existing a-tag lookup so drafts replace published events
    const dTagToATag = new Map();
    for (const [aTag, event] of events) {
      const dTag = event.tags?.find((t) => t[0] === 'd')?.[1];
      if (dTag) dTagToATag.set(dTag, aTag);
    }
    for (const draft of drafts) {
      const dTag = draft.tags?.find((t) => t[0] === 'd')?.[1];
      if (!dTag) continue;
      // Resolve <PUBKEY> placeholders in tags
      const resolvedTags = draft.tags.map((tag) =>
        tag.map((v) => (typeof v === 'string' ? v.replaceAll('<PUBKEY>', pubkey) : v))
      );
      // Use existing published key (if any) so portal refs stay connected.
      // Drafts always override the matching relay event in local preview.
      const existingKey = dTagToATag.get(dTag);
      const existingEvent = existingKey ? merged.get(existingKey) : null;
      const aTag = existingKey || `30078:${pubkey}:${dTag}`;
      const effectivePubkey = existingEvent ? existingEvent.pubkey : pubkey;
      merged.set(aTag, {
        kind: 30078,
        pubkey: effectivePubkey,
        id: `draft-${draft._draft?.id || dTag}`,
        sig: '',
        created_at: Math.floor((draft._draft?.updatedAt || Date.now()) / 1000),
        tags: resolvedTags,
        content: draft.content || '',
        _isDraft: true,
      });
    }
    return merged;
  }, [events, drafts, identity.pubkey]);

  // Keep sound service events map in sync for one-shot resolution
  useEffect(() => { setEventsMap(mergedEvents); }, [mergedEvents]);

  // Resolve world event config by scanning events for type=world
  const worldConfig = useMemo(() => {
    if (mergedEvents.size === 0 || !worldTag) return null;

    // Find the world event: d-tag = "<slug>:world" or "<slug>", type = "world"
    // If multiple world events exist, prefer the first one seen (genesis).
    // A competing world event from a different author is ignored.
    const expectedDTag = `${worldTag}:world`;
    let worldEvent = null;
    const candidates = [];
    for (const [, ev] of mergedEvents) {
      const dTag = ev.tags.find((t) => t[0] === 'd')?.[1];
      const typeTag = ev.tags.find((t) => t[0] === 'type')?.[1];
      if (typeTag === 'world' && (dTag === expectedDTag || dTag === worldTag)) {
        candidates.push(ev);
      }
    }
    if (candidates.length === 0) return null;
    // If URL includes a pubkey prefix, filter to matching author.
    // Fall back to all candidates if none match (graceful degradation).
    const filtered = pubkeyPrefix
      ? candidates.filter((ev) => ev.pubkey.startsWith(pubkeyPrefix))
      : candidates;
    const finalist = filtered.length > 0 ? filtered : candidates;
    // Pick the oldest world event (lowest created_at) as genesis — attacker's
    // newer event won't override the original author
    finalist.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    worldEvent = finalist[0];
    if (!worldEvent) return null;

    const authorPubkey = worldEvent.pubkey;
    const startRef = getTag(worldEvent, 'start');
    const genesisPlace = startRef || `30078:${authorPubkey}:${worldTag}:place:clearing`;
    const inventoryRefs = getTags(worldEvent, 'inventory').map((t) => t[1]);
    const title = getTag(worldEvent, 'title') || worldTag;
    const cwTags = getTags(worldEvent, 'cw').map((t) => t[1]);

    return { genesisPlace, inventoryRefs, title, cwTags, worldEvent, authorPubkey };
  }, [mergedEvents, worldTag, pubkeyPrefix]);

  // Once the world loads, normalize the URL to include the author pubkey prefix.
  // Uses replaceState (no navigation, no popstate) so the pinned URL is bookmarkable/shareable.
  useEffect(() => {
    if (!worldConfig || !worldTag) return;
    const prefix = worldConfig.authorPubkey.slice(0, 8);
    if (!pubkeyPrefix || pubkeyPrefix !== prefix) {
      window.history.replaceState({}, '', `/w/${pinnedSlug(worldTag, worldConfig.authorPubkey)}`);
    }
  }, [worldConfig, worldTag, pubkeyPrefix]);

  // Build trust set from world event + vouch events
  const trustInfo = useMemo(() => {
    if (!worldConfig?.worldEvent) return null;
    const trustSet = buildTrustSet(worldConfig.worldEvent, mergedEvents);
    const collaboration = trustSet.collaboration || 'open';
    // Determine effective client mode from collaboration + preview toggle
    let effectiveMode;
    if (collaboration === 'closed') {
      effectiveMode = 'canonical';
    } else if (collaboration === 'vouched') {
      effectiveMode = previewUnvouched ? 'explorer' : 'community';
    } else {
      effectiveMode = 'community';
    }
    // Check if current user can preview unvouched content
    const userPk = identity?.pubkey;
    const canPreview = userPk && (
      userPk === trustSet.genesisPubkey ||
      trustSet.collaborators?.has(userPk) ||
      trustSet.vouched?.get(userPk)?.canVouch
    );
    return { trustSet, effectiveMode, collaboration, canPreviewUnvouched: !!canPreview };
  }, [worldConfig, mergedEvents, previewUnvouched, identity?.pubkey]);

  // Apply theme, effects, font, and cursor from world event (game pages only)
  useEffect(() => {
    if (route.page !== 'game') return;
    const we = worldConfig?.worldEvent || null;
    applyTheme(resolveTheme(we));
    applyEffects(resolveEffects(we));
    const fontFamily = resolveFont(we);
    const fontSize = resolveFontSize(we);
    const fontSizePanel = resolveFontSizePanel(we);
    const cursorStyle = resolveCursor(we);
    applyFontAndCursor(fontFamily, cursorStyle, fontSize, fontSizePanel);
    loadFont(we);

    // Toggle flicker class on #root
    const root = document.getElementById('root');
    if (root) {
      const effects = resolveEffects(we);
      root.classList.toggle('flicker-active', effects.flicker > 0);
    }

    // Set cursor class on body
    document.body.classList.remove('cursor-beam', 'cursor-block', 'cursor-underline');
    document.body.classList.add(`cursor-${cursorStyle}`);
  }, [worldConfig]);

  // Lazily create or update engine with latest events
  const getEngine = useCallback(() => {
    const mutator = new PlayerStateMutator(player.state, player.npcStates);
    const authorPubkey = worldConfig?.authorPubkey || '';
    const genesisPlace = worldConfig?.genesisPlace || '';
    const trustSet = trustInfo?.trustSet || null;
    const effectiveMode = trustInfo?.effectiveMode || 'community';
    if (!engineRef.current) {
      engineRef.current = new GameEngine({
        events: mergedEvents,
        player: mutator,
        config: { GENESIS_PLACE: genesisPlace, AUTHOR_PUBKEY: authorPubkey, trustSet, clientMode: effectiveMode, previewUnvouched },
      });
    } else {
      engineRef.current.events = mergedEvents;
      engineRef.current.player = mutator;
      engineRef.current.config = { ...engineRef.current.config, AUTHOR_PUBKEY: authorPubkey, trustSet, clientMode: effectiveMode, previewUnvouched };
    }
    return engineRef.current;
  }, [mergedEvents, player.state, worldConfig, trustInfo]);

  // Flush engine output into React log state and commit player state
  // Active transition effect state
  const [transitionEffect, setTransitionEffect] = useState(null);
  const gameContainerRef = useRef(null);

  const commitEngine = useCallback((engine) => {
    const entries = engine.flush();
    const logEntries = [];
    let shouldRestart = false;
    let shouldClear = false;
    let transition = null;
    let themeOverride = null;

    for (const entry of entries) {
      if (entry.type === 'sound' && entry.sound) {
        playOneShotRef(entry.sound, entry.volume);
      } else if (entry.type === 'restart') {
        shouldRestart = true;
      } else if (entry.type === 'report' && entry.report) {
        if (identity?.signer && pool) {
          const slug = worldTag;
          const r = entry.report;
          const shortTarget = r.targetRef.split(':').pop().slice(0, 8);
          const shortReporter = identity.pubkey.slice(0, 8);
          publishReport({ pool, signer: identity.signer, worldSlug: slug, targetRef: r.targetRef, reason: r.reason, shortTarget, shortReporter });
        }
      } else if (entry.type === 'transition') {
        transition = entry;
        if (entry.clear) shouldClear = true;
      } else if (entry.type === 'theme-override') {
        themeOverride = entry;
      } else if (entry.type === 'map') {
        setShowMap((prev) => !prev);
      } else {
        logEntries.push(entry);
      }
    }

    if (shouldRestart) {
      player.reset();
      setLog([]);
      window.location.reload();
      return;
    }

    // Apply place theme override
    if (themeOverride) {
      if (themeOverride.colours) {
        // Merge world theme + place overrides
        const worldTheme = worldConfig ? resolveTheme(worldConfig.worldEvent) : {};
        applyTheme({ ...worldTheme, ...themeOverride.colours });
      } else if (worldConfig) {
        // Reset to world-only theme
        applyTheme(resolveTheme(worldConfig.worldEvent));
      }
    }

    // Handle transition effect
    if (transition?.effect) {
      const duration = transition.duration || 800;
      setTransitionEffect(transition.effect);
      // Set CSS variable for animation duration
      if (gameContainerRef.current) {
        gameContainerRef.current.style.setProperty('--transition-duration', `${duration}ms`);
      }
      // Clear log if requested (during the transition)
      if (shouldClear) setLog([]);
      // Add new entries after a brief delay (mid-transition)
      setTimeout(() => {
        if (logEntries.length > 0) setLog((prev) => [...prev, ...logEntries]);
      }, duration * 0.4);
      // Remove effect class after animation
      setTimeout(() => setTransitionEffect(null), duration);
    } else {
      if (shouldClear) setLog([]);
      if (logEntries.length > 0) setLog((prev) => [...prev, ...logEntries]);
    }

    player.replaceState(engine.getPlayerState(), engine.player.npcStates);
  }, [player, worldConfig]);

  useEffect(() => {
    // Delay scroll to account for mobile keyboard animation
    const timer = setTimeout(() => {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [log]);

  // Keep input focused (skip when builder panels are open, or on touch devices to avoid keyboard popup)
  const panelOpen = showDrafts || editorState || showLogin || showProfileEditor;
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  // Ghost-text typeahead
  const typeahead = useTypeahead(inputValue, engineRef.current, mergedEvents);

  useEffect(() => {
    if (!panelOpen && !isTouchDevice) inputRef.current?.focus();
  }, [status, log, panelOpen]);

  useEffect(() => {
    if (isTouchDevice) return;
    function refocus(e) {
      if (panelOpen) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      inputRef.current?.focus();
    }
    document.addEventListener('mouseup', refocus);
    return () => document.removeEventListener('mouseup', refocus);
  }, [panelOpen]);

  // Initial room on ready (mergedEvents includes drafts in build mode)
  useEffect(() => {
    // Wait for 'expanded' (world relay EOSE) so all events are present before
    // rendering the initial room — prevents exits/items missing on first load.
    // Falls back to 'ready' only in build mode (drafts, no relay expansion).
    const isLoaded = status === 'expanded' || (buildMode && status === 'ready');
    if (isLoaded && worldConfig && mergedEvents.size > 0 && log.length === 0) {
      const engine = getEngine();

      // If the engine fell back to genesis because events loaded incrementally
      // (e.g. first relay EOSE with few events, more arrive later), and the
      // player's saved place is now present in mergedEvents, restore it.
      const savedPlace = player.state.place;
      if (savedPlace && mergedEvents.has(savedPlace) && engine.currentPlace !== savedPlace) {
        engine.currentPlace = savedPlace;
      }

      // Defer if the start place event hasn't arrived yet (world relays may
      // still be expanding after EOSE fires from the default relays).
      const startDtag = engine.currentPlace;
      if (!startDtag || !mergedEvents.get(startDtag)) return;

      engine.reconcileCounterLow();

      // Give starting inventory on new game
      const isNewGame = !player.state.place && player.state.inventory.length === 0;
      if (isNewGame && worldConfig?.inventoryRefs) {
        for (const ref of worldConfig.inventoryRefs) {
          if (!engine.player.hasItem(ref)) {
            engine.player.pickUp(ref);
            const itemEvent = mergedEvents.get(ref);
            if (itemEvent) {
              const defaultState = getTag(itemEvent, 'state');
              if (defaultState) engine.player.setState(ref, defaultState);
              for (const ct of getTags(itemEvent, 'counter')) {
                engine.player.setCounter(`${ref}:${ct[1]}`, parseInt(ct[2], 10));
              }
            }
          }
        }
      }

      engine.enterRoom(engine.currentPlace);
      commitEngine(engine);
      // Start sound on initial room entry (not in build mode)
      if (isAudioReady() && !buildMode) {
        evaluateSoundTags(mergedEvents, engine.currentPlace, engine.player.state, engine.player.npcStates);
      }
    }
  }, [status, generation, mergedEvents, buildMode]);

  // Re-enter room when preview mode changes (trust config updated)
  useEffect(() => {
    if ((status !== 'ready' && status !== 'expanded') || log.length === 0) return;
    const engine = getEngine(); // updates engine config with new trustInfo
    engine.enterRoom(engine.currentPlace);
    commitEngine(engine);
    if (isAudioReady() && !buildMode) {
      evaluateSoundTags(mergedEvents, engine.currentPlace, engine.player.state, engine.player.npcStates);
    }
  }, [previewUnvouched]); // eslint-disable-line react-hooks/exhaustive-deps

  function acceptTypeahead() {
    if (!typeahead) return false;
    inputRef.current.value = typeahead.accept;
    setInputValue(typeahead.accept);
    // Move cursor to end
    const len = typeahead.accept.length;
    inputRef.current.setSelectionRange(len, len);
    return true;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const val = inputRef.current.value;
    if (!val.trim()) return;
    inputRef.current.value = '';
    setInputValue('');
    if (isTouchDevice) inputRef.current.blur();
    const engine = getEngine();
    if (!engine.dialogueActive && !engine.puzzleActive) {
      const hist = historyRef.current;
      if (hist.length === 0 || hist[hist.length - 1] !== val) {
        hist.push(val);
      }
    }
    historyIndexRef.current = -1;
    draftRef.current = '';
    await engine.handleCommand(val);
    commitEngine(engine);
    // Update sound layers after state changes (not in build mode)
    if (isAudioReady() && !buildMode) {
      evaluateSoundTags(mergedEvents, engine.currentPlace, engine.player.state, engine.player.npcStates);
    }
  }

  // Expose command sender for preview testing (dev only)
  if (import.meta.env.DEV) {
    window.__engine = () => getEngine();
    window.__sendCommand = async (cmd) => {
      const engine = getEngine();
      await engine.handleCommand(cmd);
      commitEngine(engine);
      if (isAudioReady() && !buildMode) {
        evaluateSoundTags(mergedEvents, engine.currentPlace, engine.player.state, engine.player.npcStates);
      }
    };
  }

  function onKeyDown(e) {
    // Tab accepts the ghost-text suggestion (desktop)
    if (e.key === 'Tab') {
      e.preventDefault();
      acceptTypeahead();
      return;
    }

    const hist = historyRef.current;
    if (hist.length === 0) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndexRef.current === -1) {
        draftRef.current = inputRef.current.value;
        historyIndexRef.current = hist.length - 1;
      } else if (historyIndexRef.current > 0) {
        historyIndexRef.current--;
      }
      inputRef.current.value = hist[historyIndexRef.current];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndexRef.current === -1) return;
      if (historyIndexRef.current < hist.length - 1) {
        historyIndexRef.current++;
        inputRef.current.value = hist[historyIndexRef.current];
      } else {
        historyIndexRef.current = -1;
        inputRef.current.value = draftRef.current;
      }
    }
  }

  // Derive UI state
  const engine = engineRef.current;
  const puzzleActive = engine?.puzzleActive ?? null;
  const dialogueActive = engine?.dialogueActive ?? null;
  const paymentActive = engine?.paymentActive ?? null;
  const craftingActive = engine?.craftingActive ?? null;
  // Title: relay world event → draft world event → slug → fallback
  const worldTitle = useMemo(() => {
    if (worldConfig?.title) return worldConfig.title;
    // Check drafts for a world event title (pre-publish)
    const worldDraft = drafts.find((d) => d.tags?.find((t) => t[0] === 'type')?.[1] === 'world');
    const draftTitle = worldDraft?.tags?.find((t) => t[0] === 'title')?.[1];
    return draftTitle || worldTag || 'folklore';
  }, [worldConfig, drafts, worldTag]);
  // effectiveMode is derived from collaboration + preview toggle in trustInfo
  const effectiveMode = trustInfo?.effectiveMode || 'community';

  // Noise overlay — always present, controlled by --effect-noise CSS property
  const noiseOverlay = <div className="noise-overlay" aria-hidden="true" />;

  // ── Profile route ──────────────────────────────────────────────────────
  if (route.page === 'profile') {
    return <>{noiseOverlay}<AuthorProfile npub={route.npub} pubkeyHex={route.pubkeyHex} identity={identity} pool={pool} /></>;
  }

  // ── Non-game routes: reset theme to defaults (moved to effect below) ──

  // ── Guide route ──────────────────────────────────────────────────────
  if (route.page === 'guide') {
    return <Guide guidePage={route.guidePage} identity={identity} />;
  }

  // ── Landing route ──────────────────────────────────────────────────────
  if (route.page === 'landing') {
    return <>{noiseOverlay}<Landing identity={identity} /></>;
  }

  // ── Lobby route ────────────────────────────────────────────────────────
  if (route.page === 'lobby') {
    return (
      <>{noiseOverlay}<Lobby
        identity={identity}
        pool={pool}
        onSelectWorld={(slug) => navigateToWorld(slug)}
        onImportToWorld={(slug, data) => {
          pendingImportRef.current = { data };
          navigateToWorld(slug);
        }}
        onCreateWorld={() => setShowWorldCreator(true)}
        showWorldCreator={showWorldCreator}
        worldCreatorNode={showWorldCreator && (
          <WorldCreator
            onClose={() => setShowWorldCreator(false)}
            onSaveDrafts={(worldSlug, templates) => {
              for (const tmpl of templates) {
                saveDraft(worldSlug, tmpl);
              }
              setShowWorldCreator(false);
              // Auto-enter build mode on the new world
              setBuildMode(true);
              navigateToWorld(worldSlug);
            }}
          />
        )}
      /></>
    );
  }

  return (
    <>
    {noiseOverlay}
    <div ref={gameContainerRef}
         className={`max-w-2xl mx-auto p-6 flex flex-col h-dvh game-text game-container${transitionEffect ? ` transition-${transitionEffect}` : ''}`}
         style={{ backgroundColor: 'var(--colour-bg)', color: 'var(--colour-text)', position: 'relative' }}>
      <div className="text-sm mb-2 flex justify-between items-center shrink-0" style={{ color: 'var(--colour-dim)' }}>
        <span className="flex items-center min-w-0">
          <button
            onClick={navigateToLobby}
            className="cursor-pointer shrink-0"
            style={{ color: 'var(--colour-dim)', background: 'none', border: 'none', font: 'inherit', padding: 0 }}
          >w</button>
          <span className="shrink-0">{' / '}</span>
          <span className="truncate" style={{ color: 'var(--colour-title)' }}>{worldTitle}</span>
          {worldConfig?.authorPubkey && worldConfig?.worldEvent?.id && (
            <button
              onClick={() => setShowZap(true)}
              className="cursor-pointer"
              style={{
                color: 'var(--colour-item)',
                background: 'none',
                border: '1px solid var(--colour-dim)',
                font: 'inherit',
                padding: '0 4px',
                fontSize: '0.6rem',
                marginLeft: '0.5em',
              }}
            >
              <span className="hidden sm:inline">tip</span>
              <span className="sm:hidden">⚡</span>
            </button>
          )}
          {(status !== 'ready' && status !== 'expanded') ? <span style={{ color: 'var(--colour-dim)' }}>{' | '}{status}</span> : ''}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <ModeDropdown
            collaboration={trustInfo?.collaboration}
            canPreviewUnvouched={trustInfo?.canPreviewUnvouched}
            previewUnvouched={previewUnvouched}
            onTogglePreview={() => setPreviewUnvouched(p => !p)}
            buildMode={buildMode}
            onToggleBuild={() => setBuildMode(!buildMode)}
            showBuildOption={identity.isProperIdentity || drafts.length > 0}
            draftsCount={drafts.length}
            onOpenDrafts={() => setShowDrafts(true)}
            relayStatus={relayStatus}
            onOpenRelaySettings={() => setShowRelaySettings(true)}
            onShare={identity?.signer ? () => setShowShare(true) : null}
          />
          <SoundToggle onAudioReady={async () => {
            if (engineRef.current) {
              await loadSamples(mergedEvents);
              if (!buildMode) {
                evaluateSoundTags(
                  mergedEvents, engineRef.current.currentPlace,
                  engineRef.current.player.state, engineRef.current.player.npcStates,
                );
              }
            }
          }} />
          <IdentityButton identity={identity} onClick={() => setShowLogin(!showLogin)} />
        </span>
      </div>
      {previewUnvouched && (
        <div className="text-xs mb-1" style={{ color: 'var(--colour-error)' }}>
          Preview mode — showing unvouched content for review.
        </div>
      )}
      {/* HUD — persistent counter display from world event */}
      {worldConfig?.worldEvent && (() => {
        const hudTags = (worldConfig.worldEvent.tags || []).filter(t => t[0] === 'hud');
        if (hudTags.length === 0) return null;
        const worldDtag = worldConfig.worldEvent.tags.find(t => t[0] === 'd')?.[1];
        return (
          <div className="text-xs mb-1 font-mono" style={{ color: 'var(--colour-dim)' }}>
            {hudTags.map((tag, i) => (
              <div key={i}>{interpolateHud(tag[1] || '', worldDtag, player?.state)}</div>
            ))}
          </div>
        );
      })()}

      {showProfileEditor && (
        <ProfileEditor
          identity={identity}
          pool={pool}
          publishUrls={publishUrls}
          nip65WriteRelays={nip65.writeRelays}
          onClose={() => setShowProfileEditor(false)}
        />
      )}

      {showLogin && (
        <LoginPanel
          identity={identity}
          onClose={() => setShowLogin(false)}
          onEditProfile={() => setShowProfileEditor(true)}
        >
          {backup.canBackup && (
            <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--colour-dim)' }}>
              <div className="mb-1" style={{ color: 'var(--colour-dim)' }}>State Backup:</div>
              <div className="flex gap-2">
                <button
                  onClick={async () => { await backup.saveToRelay(); }}
                  disabled={backup.saving}
                  className="cursor-pointer"
                  style={{ color: 'var(--colour-highlight)', background: 'none', border: '1px solid var(--colour-dim)', font: 'inherit', padding: '2px 8px' }}
                >
                  {backup.saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={async () => {
                    const res = await backup.loadFromRelay();
                    if (res.ok) {
                      setShowLogin(false);
                      engineRef.current = null;
                      setLog([]);
                      setGeneration((g) => g + 1);
                    }
                  }}
                  disabled={backup.loading}
                  className="cursor-pointer"
                  style={{ color: 'var(--colour-highlight)', background: 'none', border: '1px solid var(--colour-dim)', font: 'inherit', padding: '2px 8px' }}
                >
                  {backup.loading ? 'Loading...' : 'Restore'}
                </button>
              </div>
              {backup.lastSaved && (
                <div className="mt-1" style={{ color: 'var(--colour-dim)' }}>
                  Last saved: {backup.lastSaved.toLocaleTimeString()}
                </div>
              )}
            </div>
          )}
          {backup.error && (
            <div className="mt-2" style={{ color: 'var(--colour-error)' }}>
              {backup.error}
            </div>
          )}
        </LoginPanel>
      )}

      {/* Map overlay */}
      {showMap && worldConfig?.worldEvent && (
        <MapOverlay
          events={mergedEvents}
          playerState={player.state}
          mapMode={getTag(worldConfig.worldEvent, 'map')}
          currentPlace={engine?.currentPlace}
          onClose={() => setShowMap(false)}
        />
      )}

      {paymentActive && (
        <PaymentPanel
          payment={paymentActive}
          onPaid={() => {
            const engine = getEngine();
            engine.completePayment(paymentActive.dtag);
            commitEngine(engine);
          }}
          onClose={() => {
            if (engineRef.current) {
              engineRef.current.paymentActive = null;
            }
            // Force re-render
            setLog((prev) => [...prev]);
          }}
        />
      )}

      {/* Zap world author */}
      {showZap && worldConfig?.authorPubkey && (
        <TipPanel
          recipientPubkey={worldConfig.authorPubkey}
          recipientName={worldTitle}
          eventId={worldConfig.worldEvent?.id}
          signer={identity?.signer}
          senderPubkey={identity?.pubkey}
          onClose={() => setShowZap(false)}
        />
      )}

      {/* Vouch panel */}
      {vouchTarget && identity?.signer && (
        <VouchPanel
          targetPubkey={vouchTarget}
          worldSlug={worldTag}
          signer={identity.signer}
          pool={pool}
          events={mergedEvents}
          trustSet={trustInfo?.trustSet}
          clientMode={trustInfo?.effectiveMode}
          onClose={() => setVouchTarget(null)}
        />
      )}

      {/* Trust panel */}
      {showTrust && trustInfo?.trustSet && (
        <TrustPanel
          trustSet={trustInfo.trustSet}
          worldSlug={worldTag}
          identityPubkey={identity?.pubkey}
          signer={identity?.signer}
          pool={pool}
          onClose={() => setShowTrust(false)}
        />
      )}

      {/* Relay settings */}
      {showRelaySettings && (
        <RelaySettingsPanel
          worldSlug={worldTag}
          relayStatus={relayStatus}
          worldRelays={worldConfig?.worldEvent?.tags?.filter((t) => t[0] === 'relay').map((t) => t[1]) || []}
          nip65Read={nip65.readRelays}
          nip65Write={nip65.writeRelays}
          onRelayChange={updateRelays}
          onClose={() => setShowRelaySettings(false)}
        />
      )}

      {/* Share on NOSTR */}
      {showShare && (
        <SharePanel
          worldSlug={worldTag}
          worldTitle={worldConfig?.title}
          worldContent={worldConfig?.worldEvent?.content}
          worldAuthorPubkey={worldConfig?.authorPubkey}
          identity={identity}
          pool={pool}
          writeRelays={nip65.writeRelays}
          publishUrls={publishUrls}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* Publish results */}
      {publishResult && (
        <PublishProgressPanel
          result={publishResult}
          zIndex={undefined}
          onClose={() => setPublishResult(null)}
          onRetryFailed={async () => {
            const updated = await retryFailed(publishResult, pool);
            setPublishResult(updated);
          }}
        />
      )}

      {/* Build mode — event graph */}
      {buildMode && status === 'ready' && (
        <EventGraph
          events={mergedEvents}
          currentPlace={engineRef.current?.currentPlace || player.state.place}
          pubkey={identity.pubkey}
          trustSet={trustInfo?.trustSet}
          answers={draftAnswers}
          clientMode={trustInfo?.effectiveMode}
          onEditEvent={(aTag) => {
            const event = mergedEvents.get(aTag);
            if (!event) return;
            const eventType = getTag(event, 'type') || 'place';
            setEditorState({
              eventType,
              eventTemplate: { kind: 30078, tags: [...event.tags], content: event.content || '' },
              originalEvent: event,
            });
          }}
          onNewEvent={(eventType) => setEditorState({ eventType })}
          onNewPortal={(placeRef, slot, destRef) => {
            const initialTags = [['exit', placeRef, slot, '']];
            if (destRef) initialTags.push(['exit', destRef, '', '']);
            setEditorState({ eventType: 'portal', initialTags });
          }}
          onVouch={identity?.signer ? (targetPubkey) => setVouchTarget(targetPubkey) : null}
          onRevoke={identity?.signer && pool && (() => {
            const ts = trustInfo?.trustSet;
            if (!ts || !identity?.pubkey) return false;
            if (identity.pubkey === ts.genesisPubkey) return true;
            if (ts.collaborators?.has(identity.pubkey)) return true;
            if (ts.vouched?.get(identity.pubkey)?.canVouch) return true;
            return false;
          })() ? async (targetPubkey) => {
            if (!confirm(`Revoke all content by ${targetPubkey.slice(0, 12)}...? This will hide their events from all players.`)) return;
            const result = await publishRevoke({ pool, signer: identity.signer, worldSlug: worldTag, targetPubkey });
            if (result.ok) { alert('Revocation published.'); }
            else { alert('Failed to publish revocation: ' + result.error); }
          } : null}
          onOpenDrafts={() => setShowDrafts(true)}
          onOpenTrust={identity?.pubkey && trustInfo?.trustSet ? () => setShowTrust(true) : null}
          draftsCount={drafts.length}
          onClose={() => setBuildMode(false)}
          onImportScenarios={
            (identity?.pubkey && trustInfo?.trustSet && (
              identity.pubkey === trustInfo.trustSet.genesisPubkey ||
              trustInfo.trustSet.collaborators?.has(identity.pubkey)
            )) || (drafts.length > 0 && mergedEvents.size === drafts.length)
              ? (data) => { importScenariosFromData(worldTag, data); }
              : undefined
          }
        />
      )}

      {/* Draft list panel */}
      {showDrafts && (
        <DraftListPanel
          drafts={drafts}
          events={mergedEvents}
          worldSlug={worldTag}
          pendingImportData={pendingImportRef.current?.data || null}
          onPendingImportConsumed={() => { pendingImportRef.current = null; }}
          zIndex={undefined}
          onClose={() => setShowDrafts(false)}
          onEdit={(draft) => {
            const eventType = draft.tags?.find((t) => t[0] === 'type')?.[1] || 'place';
            setEditorState({ eventType, eventTemplate: draft });
            setShowDrafts(false);
          }}
          onDelete={(id) => {
            deleteDraft(worldTag, id);
            setDrafts(loadDrafts(worldTag));
          }}
          onPublish={(draft) => {
            const eventType = draft.tags?.find((t) => t[0] === 'type')?.[1] || 'place';
            setEditorState({ eventType, eventTemplate: draft, showPreview: true });
            setShowDrafts(false);
          }}
          onNew={() => {
            setEditorState({ eventType: 'place' });
            setShowDrafts(false);
          }}
          onImport={(data) => {
            const result = importEvents(worldTag, data);
            setDrafts(loadDrafts(worldTag));
            // TODO: show result.imported / result.skipped feedback
          }}
          onExport={() => {
            const data = exportDrafts(worldTag);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${worldTag}-drafts.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          onBulkPublish={async (onProgress) => {
            if (!identity.signer || !identity.pubkey) return;
            // Pre-flight world validation
            const currentDrafts = loadDrafts(worldTag);
            const answers = loadAnswers(worldTag);
            const worldCheck = validateWorld(currentDrafts, answers);
            // Also verify puzzle answer hashes
            const hashErrors = await verifyPuzzleHashes(worldCheck.puzzlesToVerify || []);
            const allErrors = [...worldCheck.errors, ...hashErrors];
            if (allErrors.length > 0) {
              const msgs = allErrors.map((e) => `${e.dTag}: ${e.message}${e.fix ? `\n  → ${e.fix}` : ''}`);
              alert(`Cannot publish — ${allErrors.length} error(s):\n\n${msgs.join('\n')}`);
              return;
            }
            const result = await bulkPublish(worldTag, identity.pubkey, identity.signer, pool, { onProgress });
            setDrafts(loadDrafts(worldTag));
            setPublishResult(result);
          }}
          onDeleteAll={() => {
            clearDrafts(worldTag);
            setDrafts([]);
            if (events.size === 0) {
              setShowDrafts(false);
              setBuildMode(false);
              setTimeout(() => navigateToLobby(), 0);
            }
            // else: stay in drafts panel so user can import again
          }}
          onImportScenarios={
            (identity?.pubkey && trustInfo?.trustSet && (
              identity.pubkey === trustInfo.trustSet.genesisPubkey ||
              trustInfo.trustSet.collaborators?.has(identity.pubkey)
            )) || (drafts.length > 0 && mergedEvents.size === drafts.length)
              ? (data) => { importScenariosFromData(worldTag, data); }
              : undefined
          }
        />
      )}

      {/* Event editor */}
      {editorState && (
        <EventEditor
          eventType={editorState.eventType}
          worldSlug={worldTag}
          pubkey={identity.pubkey}
          signer={identity.signer}
          pool={pool}
          events={mergedEvents}
          eventTemplate={editorState.eventTemplate || null}
          originalEvent={editorState.originalEvent || null}
          initialTags={editorState.initialTags || []}
          zIndex={undefined}
          startInPreview={editorState.showPreview || false}
          onDeletePublished={identity?.signer ? async (event) => {
            const result = await deletePublishedEvent({ pool, signer: identity.signer, event });
            if (result.ok) {
              setGeneration((g) => g + 1);
            } else {
              console.error('[delete]', result.error);
            }
          } : null}
          onSaveDraft={(eventTemplate) => {
            const draftId = editorState.eventTemplate?._draft?.id;
            if (draftId) {
              updateDraft(worldTag, draftId, eventTemplate);
            } else {
              saveDraft(worldTag, eventTemplate);
            }
            setDrafts(loadDrafts(worldTag));
          }}
          onPublished={() => {
            // If was a draft, remove it
            const draftId = editorState.eventTemplate?._draft?.id;
            if (draftId) {
              deleteDraft(worldTag, draftId);
              setDrafts(loadDrafts(worldTag));
            }
          }}
          onClose={() => { stopPreview(); setEditorState(null); }}
        />
      )}

      {status === 'connecting' && <p>Connecting to relay...</p>}
      {status === 'failed' && <p style={{ color: 'var(--colour-error)' }}>Failed to connect to any relay.</p>}

      <div className="flex-1 overflow-y-auto mb-4">
        {log.map((entry, i) => {
          const colourSlot = TYPE_COLOUR[entry.type] || 'text';
          const extraClass = TYPE_CLASS[entry.type] || '';
          const style = { color: `var(--colour-${colourSlot})` };

          if (entry.type === 'death-separator') {
            return <p key={i} className={extraClass} style={style}>{'─'.repeat(40)}</p>;
          }
          if (entry.html) {
            return <div key={i} className={extraClass} style={style} dangerouslySetInnerHTML={{ __html: entry.html }} />;
          }
          // Render narrative/prose types through markdown for italic/bold support
          const mdTypes = new Set(['narrative', 'puzzle', 'clue', 'dialogue', 'win', 'endgame']);
          if (entry.text && mdTypes.has(entry.type)) {
            const html = renderMarkdown(entry.text);
            if (html !== entry.text) {
              return <div key={i} className={extraClass} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
            }
          }
          return <p key={i} className={extraClass} style={style}>{entry.text}</p>;
        })}
        <div ref={logEndRef} />
      </div>

      {status === 'ready' && (
        <form onSubmit={onSubmit} className="flex gap-2 shrink-0 pb-1" autoComplete="off">
          <span style={{ color: craftingActive ? 'var(--colour-puzzle)' : 'var(--colour-text)' }}>
            {dialogueActive ? '#' : puzzleActive ? '?' : craftingActive ? '+' : '>'}
          </span>
          {/* Ghost-text wrapper */}
          <div className="relative flex-1 flex items-center font-mono overflow-hidden">
            {/* Ghost layer — sits behind the input, same font metrics */}
            {typeahead && (
              <div
                aria-hidden="true"
                className="absolute inset-0 flex items-center pointer-events-none whitespace-pre select-none"
                style={{ color: 'transparent' }}
              >
                {inputValue}
                <span style={{ color: 'var(--colour-text)', opacity: 0.45 }}>
                  {typeahead.ghost}
                </span>
              </div>
            )}
            <input
              ref={inputRef}
              type="text"
              className="w-full bg-transparent border-none outline-none font-mono"
              style={{ color: craftingActive ? 'var(--colour-puzzle)' : 'var(--colour-text)' }}
              placeholder={dialogueActive ? 'Choose an option...' : puzzleActive ? 'Enter your answer...' : craftingActive ? 'Select an item...' : ''}
              onKeyDown={onKeyDown}
              onChange={(e) => setInputValue(e.target.value)}
              autoFocus={!isTouchDevice}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck="false"
            />
          </div>
          {/* Accept button — visible on touch only when a suggestion is available */}
          {typeahead && isTouchDevice && (
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); acceptTypeahead(); inputRef.current?.focus(); }}
              className="shrink-0 font-mono px-1 opacity-50 active:opacity-100"
              style={{ color: 'var(--colour-text)' }}
              aria-label="Accept suggestion"
            >
              →
            </button>
          )}
        </form>
      )}
    </div>
    </>
  );
}
