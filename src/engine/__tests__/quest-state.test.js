/**
 * Tests for quest state as set-state target and dialogue guard.
 *
 * Covers three bugs fixed together:
 *  1. applyExternalSetState silently ignored quest targets
 *  2. resolveDialogueEntry never passed quest-gated dialogue entries
 *  3. _showQuestLog showed all quests as active (not just state=active ones)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  makeEngine, makePlace, makePortal, makeFeature, makeNPC,
  makeDialogueNode, makeQuest, makeClue, buildEvents, ref, WORLD,
} from './helpers.js';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeWorld() {
  // Clue required to complete quests — never seen in tests, so quests won't
  // auto-complete via _evalQuests and their state stays under test control.
  const blocker = makeClue('blocker');
  const questA = makeQuest('quest-a', {
    involves: [],
    requires: [[ref(`${WORLD}:clue:blocker`), 'visible', '']],
  });
  const questB = makeQuest('quest-b', {
    involves: [],
    requires: [[ref(`${WORLD}:clue:blocker`), 'visible', '']],
  });

  // Feature that sets quest-a to active on interact
  const lever = makeFeature('lever', {
    verbs: [['pull']],
    onInteract: [['pull', 'set-state', 'active', ref(`${WORLD}:quest:quest-a`)]],
  });

  // NPC with two dialogue entries:
  //   entry-default — no guard (always shown)
  //   entry-gated   — only when quest-a is active
  const dialogDefault = makeDialogueNode('entry-default', { text: 'Hello.' });
  const dialogGated   = makeDialogueNode('entry-gated',   { text: 'Glad you did it.' });

  const npc = makeNPC('guide', {
    dialogue: [
      [ref(`${WORLD}:dialogue:entry-default`)],
      [ref(`${WORLD}:dialogue:entry-gated`), ref(`${WORLD}:quest:quest-a`), 'active'],
    ],
  });

  const place = makePlace('start', {
    features: [`${WORLD}:feature:lever`],
    npcs: [`${WORLD}:npc:guide`],
    exits: ['north'],
  });

  const portal = makePortal('start-loop', [
    [`${WORLD}:place:start`, 'north', ''],
    [`${WORLD}:place:start`, 'south', ''],
  ]);

  const events = buildEvents(place, portal, lever, npc, dialogDefault, dialogGated, questA, questB, blocker);
  const engine = makeEngine(events);
  engine.enterRoom(ref(`${WORLD}:place:start`));
  engine.flush();
  return { engine, events, questA, questB, lever, npc };
}

// ── 1. set-state on quest target ──────────────────────────────────────────

describe('set-state quest target', () => {
  it('sets quest state to active via on-interact action', () => {
    const { engine } = makeWorld();
    const questRef = ref(`${WORLD}:quest:quest-a`);

    expect(engine.player.getState(questRef)).toBeUndefined();
    engine.handleCommand('pull lever');
    expect(engine.player.getState(questRef)).toBe('active');
  });

  it('can set quest state to complete', () => {
    const { engine } = makeWorld();
    const questRef = ref(`${WORLD}:quest:quest-a`);

    engine.player.setState(questRef, 'active');
    engine._dispatchAction({
      action: 'set-state',
      target: 'complete',
      extRef: questRef,
      selfDtag: 'test',
      selfEvent: null,
    });
    expect(engine.player.getState(questRef)).toBe('complete');
  });

  it('does not emit text when setting quest state', () => {
    const { engine } = makeWorld();
    const questRef = ref(`${WORLD}:quest:quest-a`);
    const output = [];
    engine._emit = (t) => output.push(t);

    engine._dispatchAction({
      action: 'set-state',
      target: 'active',
      extRef: questRef,
      selfDtag: 'test',
      selfEvent: null,
    });
    // No narrative text should be emitted for quest state changes
    expect(output.filter(t => typeof t === 'string' && t.length > 0)).toHaveLength(0);
  });
});

// ── 2. dialogue gated on quest state ─────────────────────────────────────

describe('dialogue guard on quest state', () => {
  it('uses default dialogue before quest is active', () => {
    const { engine } = makeWorld();
    const npcRef = ref(`${WORLD}:npc:guide`);
    const npcEvent = engine.events.get(npcRef);

    const entry = engine.resolveDialogueEntry(npcEvent);
    expect(entry).toBe(ref(`${WORLD}:dialogue:entry-default`));
  });

  it('switches to gated dialogue once quest is active', () => {
    const { engine } = makeWorld();
    const questRef = ref(`${WORLD}:quest:quest-a`);
    const npcRef = ref(`${WORLD}:npc:guide`);
    const npcEvent = engine.events.get(npcRef);

    engine.player.setState(questRef, 'active');
    const entry = engine.resolveDialogueEntry(npcEvent);
    expect(entry).toBe(ref(`${WORLD}:dialogue:entry-gated`));
  });

  it('falls back to default dialogue if quest is not yet active', () => {
    const { engine } = makeWorld();
    const questRef = ref(`${WORLD}:quest:quest-a`);
    const npcRef = ref(`${WORLD}:npc:guide`);
    const npcEvent = engine.events.get(npcRef);

    // Explicitly a different state — should not match 'active' guard
    engine.player.setState(questRef, 'complete');
    // entry-gated requires active, not complete — falls back to default
    // (last unguarded entry wins)
    const entry = engine.resolveDialogueEntry(npcEvent);
    // Both entries evaluated: default always passes, gated requires active (not complete)
    // Since gated is listed after default and doesn't pass, result is default
    expect(entry).toBe(ref(`${WORLD}:dialogue:entry-default`));
  });

  it('full chain: pull lever → quest active → dialogue switches', () => {
    const { engine } = makeWorld();
    const questRef = ref(`${WORLD}:quest:quest-a`);
    const npcRef   = ref(`${WORLD}:npc:guide`);
    const npcEvent = engine.events.get(npcRef);

    // Before action
    expect(engine.resolveDialogueEntry(npcEvent)).toBe(ref(`${WORLD}:dialogue:entry-default`));

    // Trigger action
    engine.handleCommand('pull lever');
    expect(engine.player.getState(questRef)).toBe('active');

    // After action
    expect(engine.resolveDialogueEntry(npcEvent)).toBe(ref(`${WORLD}:dialogue:entry-gated`));
  });
});

// ── 3. quest log only shows active/complete quests ────────────────────────

describe('quest log filtering', () => {
  it('shows nothing when quests exist but none are active or complete', () => {
    const { engine } = makeWorld();
    engine._showQuestLog();
    const lines = engine.flush().map((e) => e.text).filter(Boolean);
    // Quests with no state (not yet activated) produce no output
    expect(lines.filter((l) => l.includes('Quest-a') || l.includes('Quest-b'))).toHaveLength(0);
  });

  it('shows quest in active list when state is active', () => {
    const { engine } = makeWorld();
    const questRef = ref(`${WORLD}:quest:quest-a`);
    engine.player.setState(questRef, 'active');

    const output = [];
    engine._emit = (t) => output.push(t);
    engine._emitHtml = (t) => output.push(t);

    engine._showQuestLog();
    const text = output.join(' ');
    expect(text).toContain('Active quests');
    expect(text).toContain('Quest-a');
    expect(text).not.toContain('Quest-b'); // quest-b has no state
  });

  it('shows quest in completed list when state is complete', () => {
    const { engine } = makeWorld();
    const questRef = ref(`${WORLD}:quest:quest-a`);
    engine.player.setState(questRef, 'complete');

    const output = [];
    engine._emit = (t) => output.push(t);
    engine._emitHtml = (t) => output.push(t);

    engine._showQuestLog();
    const text = output.join(' ');
    expect(text).toContain('Completed');
    expect(text).toContain('Quest-a');
  });

  it('does not show quests with undefined state', () => {
    const { engine } = makeWorld();
    // No states set — both quests have undefined state

    const output = [];
    engine._emit = (t) => output.push(t);
    engine._emitHtml = (t) => output.push(t);

    engine._showQuestLog();
    const text = output.join(' ');
    expect(text).not.toContain('Quest-a');
    expect(text).not.toContain('Quest-b');
  });
});

// ── on-complete set-counter with external ref ──────────────────────────────
describe('quest on-complete set-counter with external ref', () => {
  /**
   * Regression: quest.js only read tag[4] as extRef, so set-counter's 5th
   * element (the external event ref) was silently dropped.  _applyCounterAction
   * therefore targeted the wrong event (world fallback) instead of the named
   * external event, leaving that event's counter un-reset.
   */
  it('resets an external event counter when on-complete fires', () => {
    // Feature (e.g. a pot) with a counter named "total" initialised to 3
    const pot = makeFeature('pot', {
      state: 'simmering',
      extraTags: [['counter', 'total', '3']],
    });
    const potRef = ref(`${WORLD}:feature:pot`);

    // Quest auto-completes (no requires), fires set-counter total 0 on pot
    const quest = makeQuest('order-1', {
      requires: [],
      onComplete: [
        ['', 'set-counter', 'total', '0', potRef],
      ],
    });
    const questRef = ref(`${WORLD}:quest:order-1`);

    const place = makePlace('start', { features: [`${WORLD}:feature:pot`] });

    const events = buildEvents(pot, quest, place);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:start`) });

    // Manually initialise the pot's counter in player state (as engine would on room entry)
    engine.player.setCounter(`${potRef}:total`, 3);

    // Enter the room so the engine has a currentPlace; then eval quests
    engine.currentPlace = ref(`${WORLD}:place:start`);
    engine._evalQuests();

    // Quest should be complete
    expect(engine.player.getState(questRef)).toBe('complete');
    // Pot's total counter should now be 0, not 3
    expect(engine.player.getCounter(`${potRef}:total`)).toBe(0);
  });

  it('falls back to world event when no external ref is given', () => {
    // World event with a "potato" counter — engine constructor auto-initialises it
    const worldEvent = {
      kind: 30078,
      pubkey: 'testpubkey0000000000000000000000000000000000000000000000000000',
      created_at: 1,
      tags: [
        ['d', `${WORLD}:world`],
        ['type', 'world'],
        ['title', 'Test'],
        ['counter', 'potato', '2'],
      ],
      content: '',
    };
    // World counters are keyed by bare d-tag, not full a-tag ref
    const worldCounterKey = `${WORLD}:world:potato`;

    const quest = makeQuest('order-1', {
      requires: [],
      onComplete: [
        // no external ref — should fall back to world counter
        ['', 'set-counter', 'potato', '0'],
      ],
    });
    const questRef = ref(`${WORLD}:quest:order-1`);
    const place = makePlace('start', {});

    const events = buildEvents(worldEvent, quest, place);
    // Engine constructor auto-initialises world counters from world event tags
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:start`) });

    // Verify the engine seeded the counter correctly from the world event
    expect(engine.player.getCounter(worldCounterKey)).toBe(2);

    engine.currentPlace = ref(`${WORLD}:place:start`);
    engine._evalQuests();

    expect(engine.player.getState(questRef)).toBe('complete');
    // Counter should have been reset to 0 via world event fallback
    expect(engine.player.getCounter(worldCounterKey)).toBe(0);
  });
});
