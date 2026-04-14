/**
 * sound.js — Stateful sound playback system using Strudel.
 *
 * Sound tags reference `type: sound` events by a-tag. The client resolves
 * the sound event, reads its tags (note, oscillator, slow, fast, room,
 * delay, pan, crush), and builds a Strudel chain.
 *
 * Uses @strudel/web's initStrudel() for WebAudio synthesis.
 * Progressive enhancement — errors caught silently.
 *
 * Pure build/decompile functions live in sound-builder.js.
 */

import {
  buildStrudelCodeFromEvent,
  buildStrudelCodeFromTags,
  parseSoundEventParams,
  decompileStrudelCode,
} from './sound-builder.js';
import { getTag, getTags, getDefaultState, aTagOf } from '../engine/world.js';

// Re-export pure functions so existing importers don't break
export { buildStrudelCodeFromTags, decompileStrudelCode };

// ── State machine ────────────────────────────────────────────────────
// States: UNINIT → IDLE → AMBIENT → PREVIEW
//                    ↓       ↓
//                  MUTED   MUTED
const State = { UNINIT: 'uninit', IDLE: 'idle', AMBIENT: 'ambient', PREVIEW: 'preview', MUTED: 'muted' };
let state = State.UNINIT;

let currentBpm = 120;
let strudelReady = null; // promise from initStrudel
let strudelModule = null; // cached @strudel/web module

// Currently playing pattern id (for skip-if-unchanged)
let activePatternId = null;
// Crossfade gap between ambient transitions (ms)
const CROSSFADE_MS = 150;
// Set of effect IDs that have already fired (to detect new ones)
let firedEffects = new Set();
// First evaluation flag — suppress effect one-shots on initial load
let firstEval = true;
// Reference to events map (set on each evaluateSoundTags call)
let eventsMap = null;

const MUTE_KEY = 'folklore:sound-muted';

/**
 * Initialize Strudel. Must be called from a user gesture (click).
 */
export async function initAudio() {
  if (state !== State.UNINIT) return true;
  try {
    strudelModule = await import('@strudel/web');
    strudelReady = strudelModule.initStrudel();
    await strudelReady;
    // Expose evaluate for dev testing
    if (import.meta.env.DEV) window.__strudelEval = strudelModule.evaluate;
    state = State.IDLE;
    localStorage.setItem(MUTE_KEY, 'false');
    _setupVisibilityHandling();
    return true;
  } catch (e) {
    console.warn('Sound init failed:', e);
    return false;
  }
}

/** Suspend/resume AudioContext when the page is hidden (background, screen off). */
let _visibilityListenerAdded = false;
function _setupVisibilityHandling() {
  if (_visibilityListenerAdded) return;
  _visibilityListenerAdded = true;
  document.addEventListener('visibilitychange', () => {
    try {
      const ctx = strudelModule?.getAudioContext?.();
      if (!ctx) return;
      if (document.hidden) {
        ctx.suspend();
      } else if (state !== State.MUTED) {
        ctx.resume();
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[sound] visibility suspend/resume error:', e.message);
    }
  });
}

export function isAudioReady() { return state !== State.UNINIT; }
export function isMuted() { return state === State.MUTED; }

/** Set the events map for one-shot sound resolution (called from App on events change). */
export function setEventsMap(events) { eventsMap = events; }

/**
 * Load all samples from sound events on world init.
 * Collects sample tags, dedupes by name, calls Strudel's samples().
 */
// Known preset aliases for sample libraries
const SAMPLE_PRESETS = {
  dirt: 'github:tidalcycles/Dirt-Samples',
  classic: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/vcsl.json',
};

export async function loadSamples(events) {
  if (state === State.UNINIT || !strudelModule) return;

  // 1. Load preset sample libraries from world event ["samples", "<preset-or-url>"]
  for (const [, event] of events) {
    if (getTag(event, 'type') !== 'world') continue;
    for (const tag of getTags(event, 'samples')) {
      const val = tag[1];
      if (!val) continue;
      const url = SAMPLE_PRESETS[val] || val;
      try {
        await strudelModule.samples(url);
        console.log(`Loaded sample library: ${val}`);
      } catch (e) {
        console.warn(`Sample library "${val}" failed:`, e.message || e);
      }
    }
    break;
  }

  // 2. Load custom samples from sound events ["sample", "<name>", "<url>"]
  const sampleMap = {};
  for (const [, event] of events) {
    if (getTag(event, 'type') !== 'sound') continue;
    for (const tag of getTags(event, 'sample')) {
      if (tag[1] && tag[2]) sampleMap[tag[1]] = tag[2];
    }
  }
  if (Object.keys(sampleMap).length > 0) {
    try {
      await strudelModule.samples(sampleMap);
    } catch (e) {
      console.warn('Custom sample loading failed:', e.message || e);
    }
  }
}

export function setMuted(val) {
  if (state === State.UNINIT) return;
  localStorage.setItem(MUTE_KEY, String(val));
  if (val) {
    _stopPatterns();
    state = State.MUTED;
  } else {
    state = State.IDLE;
  }
}

export function toggleMute() {
  setMuted(state !== State.MUTED);
  return state === State.MUTED;
}

/**
 * Stop all sound and suspend audio (for mute).
 * Also resets activePatternId so ambient restarts on next evaluateSoundTags call.
 */
export function hush() {
  _quietAudio();
  activePatternId = null;
  if (state !== State.UNINIT) state = State.IDLE;
}

/**
 * Stop current patterns without suspending AudioContext.
 * Resets activePatternId so ambient restarts (e.g. after preview).
 */
function _stopPatterns() {
  _quietAudio();
  activePatternId = null;
}

/**
 * Silence the audio engine only — does NOT reset activePatternId.
 * Used internally during crossfades so the ID tracker stays valid,
 * preventing re-evaluation when the same layers are still in scope.
 */
function _quietAudio() {
  try { strudelModule?.hush(); } catch (e) { if (import.meta.env.DEV) console.warn('[sound] hush error:', e.message); }
}

/**
 * Collect and evaluate all sound tags in scope.
 * Sound tags now reference `type: sound` events by a-tag.
 */
export function evaluateSoundTags(events, currentPlace, playerState, npcStates = {}) {
  if (state === State.UNINIT || state === State.MUTED || state === State.PREVIEW) return;
  eventsMap = events;

  // Ensure AudioContext is running
  try {
    const ctx = strudelModule?.getAudioContext?.();
    if (ctx?.state === 'suspended') ctx.resume();
  } catch (e) { if (import.meta.env.DEV) console.warn('[sound] AudioContext resume error:', e.message); }

  const placeEvent = events.get(currentPlace);
  if (!placeEvent) return;

  // Collect all sound tags + bpm in scope
  const inScope = [];

  // 1. World event (global BPM)
  for (const [, event] of events) {
    if (getTag(event, 'type') === 'world') {
      collectBpm(event);
      collectSoundTags(event, aTagOf(event), null, inScope);
      break;
    }
  }

  // 2. Current place (bpm override + sound tags)
  collectBpm(placeEvent);
  collectSoundTags(placeEvent, currentPlace, null, inScope);

  // 3. Features in place
  for (const tag of getTags(placeEvent, 'feature')) {
    const ref = tag[1];
    const event = events.get(ref);
    if (!event) continue;
    const state = playerState.states?.[ref] ?? getDefaultState(event);
    if (state === 'hidden') continue;
    collectSoundTags(event, ref, state, inScope);
  }

  // 4. NPCs in place (static)
  for (const tag of getTags(placeEvent, 'npc')) {
    const ref = tag[1];
    const event = events.get(ref);
    if (!event) continue;
    const npcState = npcStates[ref];
    collectSoundTags(event, ref, npcState?.state, inScope);
  }

  // 5. Clues in place (effect sounds on reveal)
  for (const tag of getTags(placeEvent, 'clue')) {
    const ref = tag[1];
    const event = events.get(ref);
    if (!event) continue;
    // Clue is "in scope" if it's been seen (unified states map, phase 11)
    const seen = playerState.states?.[ref] === 'seen';
    if (seen) collectSoundTags(event, ref, null, inScope);
  }

  // 6. Puzzles in place
  for (const tag of getTags(placeEvent, 'puzzle')) {
    const ref = tag[1];
    const event = events.get(ref);
    if (!event) continue;
    const solved = playerState.states?.[ref] === 'solved';
    collectSoundTags(event, ref, solved ? 'solved' : 'unsolved', inScope);
  }

  // 7. Items in inventory
  for (const ref of playerState.inventory || []) {
    const event = events.get(ref);
    if (!event) continue;
    const state = playerState.states?.[ref];
    collectSoundTags(event, ref, state, inScope);
  }

  // Filter passing layers, handle effects
  const layers = [];
  const activeEffectIds = new Set();
  for (const { id, role, volume, soundRef, stateGate, currentState, extRef } of inScope) {
    // Resolve state: external ref overrides self state
    const effectiveState = extRef
      ? (playerState.states?.[extRef] ?? getDefaultState(eventsMap.get(extRef)))
      : currentState;
    if (stateGate && effectiveState !== stateGate) continue;
    if (role === 'effect') {
      activeEffectIds.add(id);
      if (!firedEffects.has(id) && soundRef) {
        // Suppress one-shots on first evaluation (page load)
        if (!firstEval) {
          playOneShotRef(soundRef, parseFloat(volume) || 1.0);
        }
        firedEffects.add(id);
      }
      continue;
    }
    if (!soundRef) continue;
    layers.push({ id, soundRef, volume: parseFloat(volume) || 0.5, role });
  }
  // Clean up effects no longer in scope
  for (const id of firedEffects) {
    if (!activeEffectIds.has(id)) firedEffects.delete(id);
  }

  // Build a combined pattern ID to detect changes
  const newPatternId = layers.map((l) => l.id).sort().join('|');

  if (newPatternId === activePatternId) return;
  activePatternId = newPatternId;

  firstEval = false;

  if (layers.length === 0) {
    _stopPatterns();
    return;
  }

  // Crossfade: ramp down old, start new, ramp up
  _crossfadeTransition(layers);
}

/**
 * Play a one-shot sound via superdough.
 * Fires individual notes/samples without interfering with ambient.
 */
export async function playOneShotRef(soundRef, volume = 1.0) {
  if (state === State.UNINIT || state === State.MUTED || !soundRef) return;

  if (!eventsMap) return;
  const soundEvent = eventsMap.get(soundRef);
  if (!soundEvent) return;

  const parsed = parseSoundEventParams(soundEvent, volume);
  if (!parsed) return;
  const { params, notePattern, sample, noise, oscillator } = parsed;
  const duration = (params.sustain || 0.3) + (params.release || 0.2);

  const superdough = window.strudelScope?.superdough;
  const getCtx = strudelModule?.getAudioContext || window.strudelScope?.getAudioContext;
  const ctx = getCtx?.();
  if (!superdough || !ctx) {
    if (import.meta.env.DEV) console.warn('[sound] superdough not available for one-shot');
    return;
  }

  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const now = ctx.currentTime;
    if (sample) {
      await superdough({ ...params, s: sample }, now, duration);
    } else if (noise) {
      await superdough({ ...params, s: 'white' }, now, duration);
    } else if (oscillator && !notePattern) {
      await superdough({ ...params }, now, duration);
    } else if (notePattern) {
      const notes = notePattern.trim().split(/\s+/).filter((n) => n !== '~');
      const spacing = duration + 0.05;
      for (let i = 0; i < notes.length; i++) {
        await superdough({ ...params, note: notes[i] }, now + i * spacing, duration);
      }
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[sound] one-shot error:', e.message || e);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────
// getTag, getTags, getDefaultState, aTagOf imported from ../engine/world.js

function collectBpm(event) {
  const bpm = getTag(event, 'bpm');
  if (bpm) currentBpm = parseInt(bpm, 10) || 120;
}

/**
 * Collect sound tags from an event.
 * 4-element: ["sound", "<ref>", "<role>", "<volume>"]
 * 6-element: ["sound", "<ref>", "<role>", "<volume>", "<ext-ref|''>", "<state>"]
 *   ext-ref blank = check hosting event's state; non-blank = check that event's state.
 */
function collectSoundTags(event, eventRef, currentState, inScope) {
  for (const tag of getTags(event, 'sound')) {
    const soundRef = tag[1];  // a-tag ref to type:sound event
    // Skip old-format sound tags (role in position 1 instead of a-tag ref)
    if (!soundRef || !soundRef.startsWith('30078:')) continue;
    const role      = tag[2];        // ambient, layer, effect
    const volume    = tag[3];        // 0.0-1.0
    const extRef    = tag[4] || null; // ext-ref or blank (self)
    const stateGate = tag[5];        // state to check (optional)
    // ambient/layer: ID keyed on the sound itself (not the hosting event) so the
    // same sound at the same volume across multiple rooms is one continuous layer —
    // no cut or restart when moving between rooms that share a sound.
    // Volume is included so a change in volume between rooms triggers a rebuild.
    //
    // effect: ID includes the hosting event so re-entering any room re-fires the
    // one-shot, and the same sound in two different rooms fires independently.
    const id = (role === 'effect')
      ? `${eventRef}:${role}:${soundRef}:${extRef || ''}:${stateGate || ''}`
      : `${soundRef}:${role}:${volume}:${extRef || ''}:${stateGate || ''}`;
    inScope.push({ id, role, volume, soundRef, stateGate, currentState, extRef });
  }
}

/**
 * Build Strudel code from a `type: sound` event's tags.
 * Tags are applied in declaration order to build the chain.
 */
function buildStrudelCodeFromRef(soundRef, volume) {
  if (!eventsMap) return null;
  const soundEvent = eventsMap.get(soundRef);
  if (!soundEvent) return null;
  return buildStrudelCodeFromEvent(soundEvent, volume);
}

/**
 * Preview a sound from builder tags — evaluates and plays.
 * Returns true if playback started.
 */
export async function previewSound(tags, rawCode = null) {
  // Auto-init audio if not ready (preview button counts as user gesture)
  if (state === State.UNINIT) {
    const ok = await initAudio();
    if (!ok) return false;
  }
  try {
    const ctx = strudelModule?.getAudioContext?.();
    if (ctx?.state === 'suspended') await ctx.resume();
    await strudelReady;
    const code = rawCode || (tags ? buildStrudelCodeFromTags(tags) : null);
    if (!code) return false;
    // Stop ambient and prevent re-evaluation during preview
    _stopPatterns();
    state = State.PREVIEW;
    await strudelModule.evaluate(code);
    return true;
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[sound] preview error:', e.message || e);
    return false;
  }
}

/**
 * Stop sound preview. Ambient resumes on next evaluateSoundTags call.
 */
export function stopPreview() {
  _stopPatterns();
  if (state === State.PREVIEW) state = State.IDLE;
}

/**
 * Play a one-shot from builder tags (for Effect preview button).
 * Uses superdough directly — doesn't interfere with ambient.
 */
export async function playOneShotFromTags(tags, volume = 1.0) {
  if (state === State.UNINIT || state === State.MUTED) return;
  const fakeEvent = { tags: tags.map((t) => [...t]) };
  const parsed = parseSoundEventParams(fakeEvent, volume);
  if (!parsed) return;
  const { params, notePattern, sample, noise, oscillator } = parsed;
  const duration = (params.sustain || 0.3) + (params.release || 0.2);

  const superdough = window.strudelScope?.superdough;
  const getCtx = strudelModule?.getAudioContext || window.strudelScope?.getAudioContext;
  const ctx = getCtx?.();
  if (!superdough || !ctx) return;
  if (ctx.state === 'suspended') await ctx.resume();
  const now = ctx.currentTime;

  try {
    if (sample) {
      await superdough({ ...params, s: sample }, now, duration);
    } else if (noise) {
      await superdough({ ...params, s: 'white' }, now, duration);
    } else if (oscillator && !notePattern) {
      await superdough({ ...params }, now, duration);
    } else if (notePattern) {
      const notes = notePattern.trim().split(/\s+/).filter((n) => n !== '~');
      const spacing = duration + 0.05;
      for (let i = 0; i < notes.length; i++) {
        await superdough({ ...params, note: notes[i] }, now + i * spacing, duration);
      }
    }
  } catch (e) {
    console.warn('One-shot preview error:', e.message || e);
  }
}

/**
 * Crossfade transition: silence audio, brief gap for reverb tail, start new.
 * Uses _quietAudio() (not _stopPatterns()) so activePatternId is preserved —
 * any redundant evaluateSoundTags call during the gap will see a matching ID
 * and return early, preventing cascading restarts.
 */
function _crossfadeTransition(layers) {
  // Capture the ID this transition was started for. Passed into playLayers so
  // it can bail if hush() or a newer transition reset activePatternId before
  // the async evaluate completes.
  const expectedId = activePatternId;
  if (state === State.AMBIENT) {
    // Silence the current pattern and wait for reverb tail before starting new one
    _quietAudio();
    setTimeout(() => {
      // Bail if hushed/muted/navigated away, or if a newer transition took over
      if (state !== State.AMBIENT || activePatternId !== expectedId) return;
      playLayers(layers, expectedId);
    }, CROSSFADE_MS);
  } else {
    // State is IDLE — Strudel is already stopped (hushSound was called before state
    // became IDLE). Do NOT call _quietAudio() here: a hush() immediately before
    // evaluate() races with the scheduler start and silences the new pattern.
    playLayers(layers, expectedId);
  }
}

/**
 * Build and play combined pattern using stack().
 */
async function playLayers(layers, expectedPatternId) {
  try {
    await strudelReady;

    // Bail if hush() reset activePatternId, or a newer transition took over.
    // Using activePatternId (not state) as the guard avoids false-bailing on
    // the initial play where state is still IDLE before evaluate runs.
    if (state === State.UNINIT || state === State.MUTED) return;
    if (activePatternId !== expectedPatternId) return;

    const expressions = layers
      .map((l) => buildStrudelCodeFromRef(l.soundRef, l.volume))
      .filter(Boolean);
    if (expressions.length === 0) {
      // Sound events not yet in eventsMap (relay still delivering). Reset so
      // evaluateSoundTags will retry when mergedEvents updates with them.
      if (activePatternId === expectedPatternId) activePatternId = null;
      return;
    }

    const pattern = expressions.length === 1
      ? expressions[0]
      : `stack(${expressions.join(', ')})`;

    // Apply world/place BPM via .cpm() (cycles per minute = bpm/4 at 4/4 time).
    // setbpm() does not exist in @strudel/web's eval scope.
    const code = `${pattern}.cpm(${currentBpm / 4})`;

    await strudelModule.evaluate(code);

    // Two cases where we need to react after evaluate completes:
    //
    // 1. hush() was called during evaluate (activePatternId = null, state = IDLE):
    //    evaluate may have restarted the scheduler — silence it.
    //
    // 2. A newer transition started (activePatternId changed to a different non-null
    //    value): its own evaluate will overwrite the pattern naturally, so don't
    //    call _quietAudio() here — that would stop the newer transition's scheduler.
    if (activePatternId === null || state === State.UNINIT || state === State.MUTED) {
      _quietAudio();
      return;
    }
    if (activePatternId !== expectedPatternId) {
      // Newer transition took over; let it complete without interference.
      return;
    }

    state = State.AMBIENT;
  } catch (e) {
    console.warn('[sound] play error:', e.message || e);
  }
}
