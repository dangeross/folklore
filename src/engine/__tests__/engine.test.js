import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../engine.js';
import {
  ref, PUBKEY, WORLD,
  makeEvent, makePlace, makeFeature, makeItem, makePortal, makeClue, makeNPC, makeDialogueNode, makeQuest, makeRecipe, makeWorldEvent,
  buildEvents, freshState, makeMutator,
} from './helpers.js';

const CONFIG = { GENESIS_PLACE: ref(`${WORLD}:place:start`), AUTHOR_PUBKEY: PUBKEY };

function createEngine(events, playerOverrides = {}) {
  const { npcStates, ...stateOverrides } = playerOverrides;
  const player = makeMutator(stateOverrides, npcStates || {});
  const eventsMap = Array.isArray(events) ? buildEvents(...events) : events;
  return new GameEngine({ events: eventsMap, player, config: CONFIG });
}

// ── Construction & position ──────────────────────────────────────────

describe('GameEngine construction', () => {
  it('starts at genesis place when no saved place', () => {
    const place = makePlace('start');
    const events = buildEvents(place);
    const engine = createEngine(events);
    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:start`));
  });

  it('restores saved place', () => {
    const start = makePlace('start');
    const cave = makePlace('cave');
    const events = buildEvents(start, cave);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:cave`) });
    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:cave`));
  });
});

// ── enterRoom ────────────────────────────────────────────────────────

describe('enterRoom', () => {
  it('emits title and content', () => {
    const place = makePlace('clearing');
    const events = buildEvents(place);
    const engine = createEngine(events);
    engine.enterRoom(ref(`${WORLD}:place:clearing`));
    const output = engine.flush();

    expect(output.some((e) => e.type === 'title' && e.text.includes('Clearing'))).toBe(true);
    expect(output.some((e) => e.type === 'narrative' || e.type === 'markdown')).toBe(true);
  });

  it('sets player place', () => {
    const place = makePlace('clearing');
    const events = buildEvents(place);
    const engine = createEngine(events);
    engine.enterRoom(ref(`${WORLD}:place:clearing`));
    expect(engine.player.state.place).toBe(ref(`${WORLD}:place:clearing`));
  });

  it('shows items not yet picked up', () => {
    const sword = makeItem('sword');
    const place = makePlace('room', { items: [`${WORLD}:item:sword`] });
    const events = buildEvents(place, sword);
    const engine = createEngine(events);
    engine.enterRoom(ref(`${WORLD}:place:room`));
    const output = engine.flush();

    expect(output.some((e) => e.type === 'item' && e.text.includes('Sword'))).toBe(true);
  });

  it('hides picked-up items', () => {
    const sword = makeItem('sword');
    const place = makePlace('room', { items: [`${WORLD}:item:sword`] });
    const events = buildEvents(place, sword);
    const engine = createEngine(events, { inventory: [ref(`${WORLD}:item:sword`)] });
    engine.enterRoom(ref(`${WORLD}:place:room`));
    const output = engine.flush();

    expect(output.some((e) => e.type === 'item' && e.text.includes('Sword'))).toBe(false);
  });

  it('hides features in hidden state', () => {
    const trap = makeFeature('trap', { state: 'hidden' });
    const place = makePlace('room', { features: [`${WORLD}:feature:trap`] });
    const events = buildEvents(place, trap);
    const engine = createEngine(events);
    engine.enterRoom(ref(`${WORLD}:place:room`));
    const output = engine.flush();

    expect(output.some((e) => e.type === 'feature')).toBe(false);
  });

  it('shows features not in hidden state', () => {
    const altar = makeFeature('altar', { state: 'dormant' });
    const place = makePlace('room', { features: [`${WORLD}:feature:altar`] });
    const events = buildEvents(place, altar);
    const engine = createEngine(events);
    engine.enterRoom(ref(`${WORLD}:place:room`));
    const output = engine.flush();

    expect(output.some((e) => e.type === 'feature' && e.text.includes('Altar'))).toBe(true);
  });

  it('shows exits', () => {
    const room1 = makePlace('room1', { exits: ['north'] });
    const room2 = makePlace('room2', { exits: ['south'] });
    const portal = makePortal('p1', [
      [`${WORLD}:place:room1`, 'north'],
      [`${WORLD}:place:room2`, 'south'],
    ]);
    const events = buildEvents(room1, room2, portal);
    const engine = createEngine(events);
    engine.enterRoom(ref(`${WORLD}:place:room1`));
    const output = engine.flush();

    expect(output.some((e) => e.type === 'exits' && e.text.includes('north'))).toBe(true);
  });

  it('shows gated content when requires fails', () => {
    const key = makeItem('key');
    const place = makePlace('vault');
    place.tags.push(['requires', ref(`${WORLD}:item:key`), '', 'The vault is sealed.']);
    const events = buildEvents(place, key);
    const engine = createEngine(events);
    engine.enterRoom(ref(`${WORLD}:place:vault`));
    const output = engine.flush();

    expect(output.some((e) => e.text === 'The vault is sealed.')).toBe(true);
    // Should NOT show the room content
    expect(output.some((e) => e.type === 'narrative' && e.text.includes('You are in'))).toBe(false);
  });
});

// ── handleCommand: built-ins ─────────────────────────────────────────

describe('handleCommand built-ins', () => {
  it('look re-renders current room', async () => {
    const place = makePlace('room');
    const events = buildEvents(place);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });
    engine.enterRoom(ref(`${WORLD}:place:room`));
    engine.flush();

    await engine.handleCommand('look');
    const output = engine.flush();
    expect(output.some((e) => e.type === 'title')).toBe(true);
  });

  it('inventory shows empty message', async () => {
    const place = makePlace('room');
    const events = buildEvents(place);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });

    await engine.handleCommand('i');
    const output = engine.flush();
    expect(output.some((e) => e.text === 'You are empty-handed.')).toBe(true);
  });

  it('inventory lists held items', async () => {
    const sword = makeItem('sword');
    const place = makePlace('room');
    const events = buildEvents(place, sword);
    const engine = createEngine(events, {
      place: ref(`${WORLD}:place:room`),
      inventory: [ref(`${WORLD}:item:sword`)],
    });

    await engine.handleCommand('inventory');
    const output = engine.flush();
    expect(output.some((e) => e.type === 'item' && e.text.includes('Sword'))).toBe(true);
  });
});

// ── handlePickup ─────────────────────────────────────────────────────

describe('handlePickup', () => {
  it('picks up an item from the room', async () => {
    const sword = makeItem('sword', { nouns: [['sword']] });
    const place = makePlace('room', { items: [`${WORLD}:item:sword`] });
    const events = buildEvents(place, sword);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });

    await engine.handleCommand('take sword');
    const output = engine.flush();

    expect(engine.player.hasItem(ref(`${WORLD}:item:sword`))).toBe(true);
    expect(output.some((e) => e.type === 'item' && e.text.includes('Taken'))).toBe(true);
  });

  it('initializes item state and counters on pickup', async () => {
    const lantern = makeItem('lantern', {
      state: 'off',
      counters: [['battery', 100]],
      nouns: [['lantern']],
    });
    const place = makePlace('room', { items: [`${WORLD}:item:lantern`] });
    const events = buildEvents(place, lantern);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });

    await engine.handleCommand('get lantern');

    expect(engine.player.getState(ref(`${WORLD}:item:lantern`))).toBe('off');
    expect(engine.player.getCounter(`${ref(`${WORLD}:item:lantern`)}:battery`)).toBe(100);
  });

  it('rejects picking up features', async () => {
    const lever = makeFeature('lever', { nouns: [['lever']] });
    const place = makePlace('room', { features: [`${WORLD}:feature:lever`] });
    const events = buildEvents(place, lever);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });

    await engine.handleCommand('take lever');
    const output = engine.flush();
    expect(output.some((e) => e.type === 'error')).toBe(true);
  });
});

// ── Movement ─────────────────────────────────────────────────────────

describe('movement', () => {
  it('moves to an adjacent room', async () => {
    const room1 = makePlace('room1', { exits: ['north'] });
    const room2 = makePlace('room2', { exits: ['south'] });
    const portal = makePortal('p1', [
      [`${WORLD}:place:room1`, 'north'],
      [`${WORLD}:place:room2`, 'south'],
    ]);
    const events = buildEvents(room1, room2, portal);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room1`) });
    engine.enterRoom(ref(`${WORLD}:place:room1`));
    engine.flush();

    await engine.handleCommand('north');
    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:room2`));
  });

  it('rejects movement through gated portal', async () => {
    const key = makeItem('key');
    const room1 = makePlace('room1', { exits: ['north'] });
    const room2 = makePlace('room2', { exits: ['south'] });
    const portal = makePortal('p1', [
      [`${WORLD}:place:room1`, 'north'],
      [`${WORLD}:place:room2`, 'south'],
    ], {
      requires: [[ref(`${WORLD}:item:key`), '', 'The door is locked.']],
    });
    const events = buildEvents(room1, room2, portal, key);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room1`) });
    engine.enterRoom(ref(`${WORLD}:place:room1`));
    engine.flush();

    await engine.handleCommand('north');
    const output = engine.flush();
    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:room1`));
    expect(output.some((e) => e.text === 'The door is locked.')).toBe(true);
  });

  it('rejects invalid direction', async () => {
    const room = makePlace('room');
    const events = buildEvents(room);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });
    engine.enterRoom(ref(`${WORLD}:place:room`));
    engine.flush();

    await engine.handleCommand('west');
    const output = engine.flush();
    expect(output.some((e) => e.type === 'error')).toBe(true);
  });
});

// ── processOnMove (counter decrement) ────────────────────────────────

describe('processOnMove', () => {
  it('decrements counter on move', async () => {
    const lantern = makeItem('lantern', {
      state: 'on',
      counters: [['battery', 100]],
      onMove: [['on', 'decrement', 'battery', '1']],
      nouns: [['lantern']],
    });
    const room1 = makePlace('room1', { exits: ['north'] });
    const room2 = makePlace('room2', { exits: ['south'] });
    const portal = makePortal('p1', [
      [`${WORLD}:place:room1`, 'north'],
      [`${WORLD}:place:room2`, 'south'],
    ]);
    const events = buildEvents(room1, room2, portal, lantern);
    const lanternRef = ref(`${WORLD}:item:lantern`);
    const engine = createEngine(events, {
      place: ref(`${WORLD}:place:room1`),
      inventory: [lanternRef],
      states: { [lanternRef]: 'on' },
      counters: { [`${lanternRef}:battery`]: 50 },
    });
    engine.enterRoom(ref(`${WORLD}:place:room1`));
    engine.flush();

    await engine.handleCommand('north');
    expect(engine.player.getCounter(`${lanternRef}:battery`)).toBe(49);
  });

  it('fires on-counter threshold crossing', async () => {
    const lantern = makeItem('lantern', {
      state: 'on',
      counters: [['battery', 100]],
      onMove: [['on', 'decrement', 'battery', '1']],
      onCounter: [['down', 'battery', '20', 'set-state', 'flickering']],
      transitions: [['on', 'flickering', 'The lantern flickers ominously.']],
      nouns: [['lantern']],
    });
    const room1 = makePlace('room1', { exits: ['north'] });
    const room2 = makePlace('room2', { exits: ['south'] });
    const portal = makePortal('p1', [
      [`${WORLD}:place:room1`, 'north'],
      [`${WORLD}:place:room2`, 'south'],
    ]);
    const events = buildEvents(room1, room2, portal, lantern);
    const lanternRef = ref(`${WORLD}:item:lantern`);
    const engine = createEngine(events, {
      place: ref(`${WORLD}:place:room1`),
      inventory: [lanternRef],
      states: { [lanternRef]: 'on' },
      counters: { [`${lanternRef}:battery`]: 21 }, // One move will cross threshold 20
    });
    engine.enterRoom(ref(`${WORLD}:place:room1`));
    engine.flush();

    await engine.handleCommand('north');
    const output = engine.flush();

    expect(engine.player.getCounter(`${lanternRef}:battery`)).toBe(20);
    expect(engine.player.getState(lanternRef)).toBe('flickering');
    expect(output.some((e) => e.text === 'The lantern flickers ominously.')).toBe(true);
  });
});

// ── Feature interaction ──────────────────────────────────────────────

describe('feature interaction', () => {
  it('processes on-interact set-state on self', async () => {
    const lever = makeFeature('lever', {
      state: 'up',
      nouns: [['lever']],
      verbs: [['pull', 'yank']],
      onInteract: [['pull', 'set-state', 'down']],
      transitions: [['up', 'down', 'You pull the lever down.']],
    });
    const place = makePlace('room', { features: [`${WORLD}:feature:lever`] });
    const events = buildEvents(place, lever);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });
    engine.enterRoom(ref(`${WORLD}:place:room`));
    engine.flush();

    await engine.handleCommand('pull lever');
    const output = engine.flush();

    expect(engine.player.getState(ref(`${WORLD}:feature:lever`))).toBe('down');
    expect(output.some((e) => e.text === 'You pull the lever down.')).toBe(true);
  });

  it('processes on-interact set-state on external portal', async () => {
    const lever = makeFeature('lever', {
      state: 'up',
      nouns: [['lever']],
      verbs: [['pull']],
      onInteract: [['pull', 'set-state', 'open', ref(`${WORLD}:portal:gate`)]],
      transitions: [['up', 'down', '']],
    });
    const gate = makePortal('gate', [
      [`${WORLD}:place:room`, 'east'],
      [`${WORLD}:place:hall`, 'west'],
    ], {
      state: 'locked',
      transitions: [['locked', 'open', 'The gate swings open!']],
    });
    const place = makePlace('room', { features: [`${WORLD}:feature:lever`] });
    const hall = makePlace('hall');
    const events = buildEvents(place, hall, lever, gate);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });
    engine.enterRoom(ref(`${WORLD}:place:room`));
    engine.flush();

    await engine.handleCommand('pull lever');
    const output = engine.flush();

    expect(engine.player.getState(ref(`${WORLD}:portal:gate`))).toBe('open');
    expect(output.some((e) => e.text === 'The gate swings open!')).toBe(true);
  });

  it('gives item via on-interact give-item', async () => {
    const chest = makeFeature('chest', {
      state: 'closed',
      nouns: [['chest']],
      verbs: [['open']],
      onInteract: [['open', 'give-item', ref(`${WORLD}:item:gem`)]],
      transitions: [['closed', 'open', 'You open the chest.']],
    });
    const gem = makeItem('gem');
    const place = makePlace('room', { features: [`${WORLD}:feature:chest`] });
    const events = buildEvents(place, chest, gem);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });
    engine.enterRoom(ref(`${WORLD}:place:room`));
    engine.flush();

    await engine.handleCommand('open chest');
    expect(engine.player.hasItem(ref(`${WORLD}:item:gem`))).toBe(true);
  });
});

// ── Item interaction ─────────────────────────────────────────────────

describe('item interaction', () => {
  it('toggles item state via on-interact', async () => {
    const lantern = makeItem('lantern', {
      state: 'off',
      nouns: [['lantern']],
      verbs: [['light', 'ignite']],
      onInteract: [['light', 'set-state', 'on']],
      transitions: [['off', 'on', 'The lantern blazes to life.']],
    });
    const place = makePlace('room');
    const events = buildEvents(place, lantern);
    const lanternRef = ref(`${WORLD}:item:lantern`);
    const engine = createEngine(events, {
      place: ref(`${WORLD}:place:room`),
      inventory: [lanternRef],
      states: { [lanternRef]: 'off' },
    });

    await engine.handleCommand('light lantern');
    const output = engine.flush();

    expect(engine.player.getState(lanternRef)).toBe('on');
    expect(output.some((e) => e.text === 'The lantern blazes to life.')).toBe(true);
  });
});

// ── Examine ──────────────────────────────────────────────────────────

describe('examine', () => {
  it('shows feature description', async () => {
    const altar = makeFeature('altar', {
      nouns: [['altar']],
      verbs: [['examine', 'x']],
      content: 'An ancient stone altar covered in runes.',
    });
    const place = makePlace('room', { features: [`${WORLD}:feature:altar`] });
    const events = buildEvents(place, altar);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });
    engine.enterRoom(ref(`${WORLD}:place:room`));
    engine.flush();

    await engine.handleCommand('x altar');
    const output = engine.flush();
    expect(output.some((e) => e.text === 'An ancient stone altar covered in runes.')).toBe(true);
  });

  it('shows description of item on the ground (dropped)', async () => {
    const vial = makeItem('vial', {
      nouns: [['vial', 'glass vial']],
      content: 'A small glass vial of clear liquid.',
    });
    const place = makePlace('room');
    const events = buildEvents(place, vial);
    const roomRef = ref(`${WORLD}:place:room`);
    const vialRef = ref(`${WORLD}:item:vial`);
    const engine = createEngine(events, {
      place: roomRef,
      npcStates: { [roomRef]: { inventory: [vialRef] } },
    });
    engine.enterRoom(roomRef);
    engine.flush();

    await engine.handleCommand('examine vial');
    const output = engine.flush();
    expect(output.some((e) => (e.text || e.html || '').includes('glass vial of clear liquid'))).toBe(true);
  });

  it('shows inventory item description and state', async () => {
    const lantern = makeItem('lantern', {
      nouns: [['lantern']],
      verbs: [['examine']],
      content: 'A brass lantern.',
    });
    const place = makePlace('room');
    const events = buildEvents(place, lantern);
    const lanternRef = ref(`${WORLD}:item:lantern`);
    const engine = createEngine(events, {
      place: ref(`${WORLD}:place:room`),
      inventory: [lanternRef],
      states: { [lanternRef]: 'on' },
    });

    await engine.handleCommand('examine lantern');
    const output = engine.flush();
    expect(output.some((e) => e.text === 'A brass lantern.')).toBe(true);
    expect(output.some((e) => e.text?.includes('currently on'))).toBe(true);
  });

  it('fires on-interact: examine on a feature', async () => {
    const inscription = makeFeature('inscription', {
      nouns: [['inscription']],
      state: 'unread',
      transitions: [['unread', 'read', 'The runes glow as you study them.']],
      onInteract: [['examine', 'set-state', 'read']],
      content: 'Faint runes are carved into the wall.',
    });
    const place = makePlace('room', { features: [`${WORLD}:feature:inscription`] });
    const engine = createEngine(buildEvents(place, inscription), { place: ref(`${WORLD}:place:room`) });
    engine.flush();
    await engine.handleCommand('examine inscription');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('runes glow'))).toBe(true);
  });

  it('fires on-interact: examine on a ground item', async () => {
    const note = makeItem('note', {
      nouns: [['note']],
      state: 'unread',
      transitions: [['unread', 'read', 'You read the note carefully.']],
      onInteract: [['examine', 'set-state', 'read']],
      content: 'A folded note.',
    });
    const place = makePlace('room');
    const roomRef = ref(`${WORLD}:place:room`);
    const noteRef = ref(`${WORLD}:item:note`);
    const engine = createEngine(buildEvents(place, note), {
      place: roomRef,
      npcStates: { [roomRef]: { inventory: [noteRef] } },
    });
    engine.flush();
    await engine.handleCommand('examine note');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('read the note carefully'))).toBe(true);
  });

  it('fires on-interact: examine on an inventory item', async () => {
    const locket = makeItem('locket', {
      nouns: [['locket']],
      state: 'closed',
      transitions: [['closed', 'open', 'The locket springs open to reveal a portrait.']],
      onInteract: [['examine', 'set-state', 'open']],
      content: 'A silver locket on a chain.',
    });
    const place = makePlace('room');
    const locketRef = ref(`${WORLD}:item:locket`);
    const engine = createEngine(buildEvents(place, locket), {
      place: ref(`${WORLD}:place:room`),
      inventory: [locketRef],
    });
    engine.flush();
    await engine.handleCommand('examine locket');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('springs open'))).toBe(true);
  });
});

// ── on-interact state guard ──────────────────────────────────────────

describe('on-interact state guard', () => {
  it('blocks action when state guard does not match current state', async () => {
    const bottle = makeItem('bottle', {
      state: 'empty',
      verbs: [['drink']],
      nouns: [['bottle']],
      transitions: [['full', 'empty', 'Last sip.'], ['empty', 'empty', 'Empty.']],
      extraTags: [['on-interact', 'drink', 'full', 'heal', '1']],
    });
    const room = makePlace('room', { items: [bottle] });
    const events = buildEvents(room, bottle);
    const bottleRef = ref(`${WORLD}:item:bottle`);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`), inventory: [bottleRef], states: { [bottleRef]: 'empty' } });
    engine.flush();
    await engine.handleCommand('drink bottle');
    const output = engine.flush();
    // Heal should NOT fire — bottle is empty, guard requires full
    expect(output.some((e) => e.text?.includes('Healed'))).toBe(false);
  });

  it('allows action when state guard matches current state', async () => {
    const bottle = makeItem('bottle', {
      state: 'full',
      verbs: [['drink']],
      nouns: [['bottle']],
      transitions: [['full', 'empty', 'Last sip.']],
      extraTags: [['on-interact', 'drink', 'full', 'heal', '1']],
    });
    const room = makePlace('room', { items: [bottle] });
    const events = buildEvents(room, bottle);
    const bottleRef = ref(`${WORLD}:item:bottle`);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`), inventory: [bottleRef], health: 5, maxHealth: 10 });
    engine.handleItemInteract('drink', 'bottle');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Healed'))).toBe(true);
  });

  it('allows action when state guard is blank (any state)', async () => {
    const bottle = makeItem('bottle', {
      state: 'empty',
      verbs: [['drink']],
      nouns: [['bottle']],
      transitions: [['empty', 'full', 'Refilled.']],
      extraTags: [['on-interact', 'drink', '', 'set-state', 'full']],
    });
    const room = makePlace('room', { items: [bottle] });
    const events = buildEvents(room, bottle);
    const bottleRef = ref(`${WORLD}:item:bottle`);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`), inventory: [bottleRef], states: { [bottleRef]: 'empty' } });
    engine.handleItemInteract('drink', 'bottle');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Refilled'))).toBe(true);
  });

  it('fires multiple actions with different state guards correctly', async () => {
    const bottle = makeItem('bottle', {
      state: 'full',
      verbs: [['drink']],
      nouns: [['bottle']],
      transitions: [['full', 'empty', 'Last sip.'], ['empty', 'empty', 'Empty.']],
      extraTags: [
        ['on-interact', 'drink', 'full', 'heal', '1'],
        ['on-interact', 'drink', 'full', 'set-state', 'empty'],
        ['on-interact', 'drink', 'empty', 'set-state', 'empty'],
      ],
    });
    const room = makePlace('room', { items: [bottle] });
    const events = buildEvents(room, bottle);
    const bottleRef = ref(`${WORLD}:item:bottle`);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`), inventory: [bottleRef], health: 5, maxHealth: 10 });
    engine.handleItemInteract('drink', 'bottle');
    const output = engine.flush();
    // First drink: full → heal fires, set-state empty fires
    expect(output.some((e) => e.text?.includes('Healed'))).toBe(true);
    expect(output.some((e) => e.text?.includes('Last sip'))).toBe(true);
  });
});

// ── Verb collision resolution ────────────────────────────────────────

describe('entity-local verb resolution', () => {
  it('uses the target entity canonical when verb alias collides across entities', async () => {
    // Both fence (feature) and recipe have "fix" as a verb alias.
    // "fix fence" should use the fence's canonical (fix), not the recipe's (assemble).
    const fence = makeFeature('fence', {
      verbs: [['fix', 'repair']],
      nouns: [['fence', 'broken fence']],
      state: 'broken',
      transitions: [['broken', 'fixed', 'You fixed the fence.']],
      onInteract: [['fix', 'set-state', 'fixed']],
    });
    const pickHead = makeItem('pick-head', { nouns: [['head', 'pick head']] });
    const handle = makeItem('handle', { nouns: [['handle']] });
    const pickaxe = makeItem('pickaxe', { nouns: [['pickaxe']] });
    const recipe = makeRecipe('assemble-pick', {
      verbs: [['assemble', 'fix', 'make']],
      nouns: [['pickaxe']],
      requires: [[ref(`${WORLD}:item:pick-head`), '', ''], [ref(`${WORLD}:item:handle`), '', '']],
      onComplete: [['', 'give-item', ref(`${WORLD}:item:pickaxe`)]],
      content: 'You assemble the pickaxe.',
    });
    const place = makePlace('start', { features: [`${WORLD}:feature:fence`], exits: ['north'] });
    const events = buildEvents(place, fence, pickHead, handle, pickaxe, recipe);
    const engine = createEngine(events);

    await engine.handleCommand('fix fence');
    const out = engine.flush();
    expect(out.some((e) => e.text === 'You fixed the fence.')).toBe(true);
  });

  it('fix pickaxe resolves to recipe canonical assemble', async () => {
    const fence = makeFeature('fence', {
      verbs: [['fix', 'repair']],
      nouns: [['fence']],
      state: 'broken',
      onInteract: [['fix', 'set-state', 'fixed']],
    });
    const pickHead = makeItem('pick-head', { nouns: [['head', 'pick head']] });
    const handle = makeItem('handle', { nouns: [['handle']] });
    const pickaxe = makeItem('pickaxe', { nouns: [['pickaxe']] });
    const recipe = makeRecipe('assemble-pick', {
      verbs: [['assemble', 'fix', 'make']],
      nouns: [['pickaxe']],
      requires: [[ref(`${WORLD}:item:pick-head`), '', ''], [ref(`${WORLD}:item:handle`), '', '']],
      onComplete: [['', 'give-item', ref(`${WORLD}:item:pickaxe`)]],
      content: 'You assemble the pickaxe.',
    });
    const place = makePlace('start', { features: [`${WORLD}:feature:fence`], exits: ['north'] });
    const events = buildEvents(place, fence, pickHead, handle, pickaxe, recipe);
    const player = makeMutator();
    const engine = new GameEngine({ events, player, config: CONFIG });

    // Give player the ingredients
    player.pickUp(ref(`${WORLD}:item:pick-head`));
    player.pickUp(ref(`${WORLD}:item:handle`));

    await engine.handleCommand('fix pickaxe');
    const out = engine.flush();
    // Recipe should fire (assemble canonical), not "can't do that"
    expect(out.some((e) => e.text === 'You assemble the pickaxe.' || e.text?.includes('Received'))).toBe(true);
  });
});

// ── Dialogue ─────────────────────────────────────────────────────────

describe('dialogue', () => {
  it('starts dialogue and shows options', async () => {
    const greetNode = makeDialogueNode('greet', {
      text: 'Hello, traveller.',
      options: [['Who are you?', `${WORLD}:dialogue:who`], ['Goodbye', '']],
    });
    const whoNode = makeDialogueNode('who', {
      text: 'I am the guardian.',
      options: [['Goodbye', '']],
    });
    const npc = makeNPC('guardian', {
      dialogue: [[ref(`${WORLD}:dialogue:greet`)]],
      extraTags: [['verb', 'talk', 'speak']],
    });
    const place = makePlace('room', { npcs: [`${WORLD}:npc:guardian`] });
    const events = buildEvents(place, npc, greetNode, whoNode);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });
    engine.enterRoom(ref(`${WORLD}:place:room`));
    engine.flush();

    // Start dialogue via talk verb
    await engine.handleCommand('talk guardian');
    const output = engine.flush();

    expect(engine.dialogueActive).not.toBeNull();
    expect(output.some((e) => e.type === 'dialogue' && e.text === 'Hello, traveller.')).toBe(true);
    expect(output.some((e) => e.type === 'dialogue-option' && e.text.includes('Who are you?'))).toBe(true);
  });

  it('handles dialogue choice navigation', async () => {
    const greetNode = makeDialogueNode('greet', {
      text: 'Hello.',
      options: [['Tell me more', `${WORLD}:dialogue:more`]],
    });
    const moreNode = makeDialogueNode('more', {
      text: 'There is much to tell.',
      options: [['Goodbye', '']],
    });
    const npc = makeNPC('sage', {
      dialogue: [[ref(`${WORLD}:dialogue:greet`)]],
    });
    const place = makePlace('room', { npcs: [`${WORLD}:npc:sage`] });
    const events = buildEvents(place, npc, greetNode, moreNode);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });

    // Need verb tag for 'talk' — add to NPC
    npc.tags.push(['verb', 'talk', 'speak']);

    engine.enterRoom(ref(`${WORLD}:place:room`));
    engine.flush();

    await engine.handleCommand('talk sage');
    engine.flush();

    await engine.handleCommand('1');
    const output = engine.flush();

    expect(output.some((e) => e.text === 'There is much to tell.')).toBe(true);
  });

  it('ends dialogue on option with no next node', async () => {
    const greetNode = makeDialogueNode('greet', {
      text: 'Hello.',
      options: [['Goodbye', '']],
    });
    const npc = makeNPC('sage', {
      dialogue: [[ref(`${WORLD}:dialogue:greet`)]],
    });
    const place = makePlace('room', { npcs: [`${WORLD}:npc:sage`] });
    const events = buildEvents(place, npc, greetNode);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });

    npc.tags.push(['verb', 'talk']);
    engine.enterRoom(ref(`${WORLD}:place:room`));
    engine.flush();

    await engine.handleCommand('talk sage');
    engine.flush();

    await engine.handleCommand('1');
    expect(engine.dialogueActive).toBeNull();
  });
});

// ── Unknown command ──────────────────────────────────────────────────

describe('unknown command', () => {
  it('emits error for unrecognised input', async () => {
    const place = makePlace('room');
    const events = buildEvents(place);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`) });
    engine.enterRoom(ref(`${WORLD}:place:room`));
    engine.flush();

    await engine.handleCommand('xyzzy');
    const output = engine.flush();
    expect(output.some((e) => e.type === 'error')).toBe(true);
  });
});

// ── Quest display types ──────────────────────────────────────────────────

describe('quest display types', () => {
  // Shared quest setup: 3 involves steps — puzzle, item, feature
  function makeQuestWorld(questType) {
    const puzzle = {
      kind: 30078, pubkey: PUBKEY, created_at: 1,
      tags: [['d', `${WORLD}:puzzle:p1`], ['type', 'puzzle'], ['title', 'Riddle']],
      content: 'Solve the riddle.',
    };
    const item = {
      kind: 30078, pubkey: PUBKEY, created_at: 1,
      tags: [['d', `${WORLD}:item:gem`], ['type', 'item'], ['title', 'Gem'], ['noun', 'gem']],
      content: 'A shiny gem.',
    };
    const feature = {
      kind: 30078, pubkey: PUBKEY, created_at: 1,
      tags: [['d', `${WORLD}:feature:altar`], ['type', 'feature'], ['title', 'Altar'], ['state', 'inactive']],
      content: 'An ancient altar.',
    };
    const place = makePlace('start', { puzzles: [`${WORLD}:puzzle:p1`], features: [`${WORLD}:feature:altar`] });
    const quest = makeQuest('test-quest', {
      questType,
      involves: [`${WORLD}:puzzle:p1`, `${WORLD}:item:gem`, `${WORLD}:feature:altar`],
      requires: [
        [ref(`${WORLD}:puzzle:p1`), 'solved', ''],
        [ref(`${WORLD}:item:gem`), '', ''],
        [ref(`${WORLD}:feature:altar`), 'active', ''],
      ],
    });
    return buildEvents(place, puzzle, item, feature, quest);
  }

  function getQuestOutput(engine) {
    engine._showQuestLog();
    return engine.flush().map((e) => e.text);
  }

  it('open (default) shows all step titles', () => {
    const events = makeQuestWorld(undefined);
    const player = makeMutator();
    const engine = new GameEngine({ events, player, config: CONFIG });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();
    player.setState(ref(`${WORLD}:quest:test-quest`), 'active');

    const lines = getQuestOutput(engine);
    expect(lines.some((l) => l.includes('✗ Riddle'))).toBe(true);
    expect(lines.some((l) => l.includes('✗ Gem'))).toBe(true);
    expect(lines.some((l) => l.includes('✗ Altar'))).toBe(true);
  });

  it('open shows completed steps with checkmark', () => {
    const events = makeQuestWorld('open');
    const player = makeMutator();
    player.markPuzzleSolved(ref(`${WORLD}:puzzle:p1`));
    const engine = new GameEngine({ events, player, config: CONFIG });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();
    player.setState(ref(`${WORLD}:quest:test-quest`), 'active');

    const lines = getQuestOutput(engine);
    expect(lines.some((l) => l.includes('✓ Riddle'))).toBe(true);
    expect(lines.some((l) => l.includes('✗ Gem'))).toBe(true);
    expect(lines.some((l) => l.includes('✗ Altar'))).toBe(true);
  });

  it('hidden shows ??? for uncompleted steps', () => {
    const events = makeQuestWorld('hidden');
    const player = makeMutator();
    player.markPuzzleSolved(ref(`${WORLD}:puzzle:p1`));
    const engine = new GameEngine({ events, player, config: CONFIG });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();
    player.setState(ref(`${WORLD}:quest:test-quest`), 'active');

    const lines = getQuestOutput(engine);
    expect(lines.some((l) => l.includes('✓ Riddle'))).toBe(true);
    expect(lines.filter((l) => l.includes('✗ ???')).length).toBe(2);
    expect(lines.some((l) => l.includes('Gem'))).toBe(false);
    expect(lines.some((l) => l.includes('Altar'))).toBe(false);
  });

  it('mystery hides uncompleted steps entirely', () => {
    const events = makeQuestWorld('mystery');
    const player = makeMutator();
    player.markPuzzleSolved(ref(`${WORLD}:puzzle:p1`));
    const engine = new GameEngine({ events, player, config: CONFIG });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();
    player.setState(ref(`${WORLD}:quest:test-quest`), 'active');

    const lines = getQuestOutput(engine);
    expect(lines.some((l) => l.includes('✓ Riddle'))).toBe(true);
    expect(lines.some((l) => l.includes('✗'))).toBe(false);
    expect(lines.some((l) => l.includes('Gem'))).toBe(false);
    expect(lines.some((l) => l.includes('Altar'))).toBe(false);
  });

  it('sequential shows only the next undone step', () => {
    const events = makeQuestWorld('sequential');
    const player = makeMutator();
    player.markPuzzleSolved(ref(`${WORLD}:puzzle:p1`));
    const engine = new GameEngine({ events, player, config: CONFIG });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();
    player.setState(ref(`${WORLD}:quest:test-quest`), 'active');

    const lines = getQuestOutput(engine);
    expect(lines.some((l) => l.includes('✓ Riddle'))).toBe(true);
    // Next undone step (Gem) should show title
    expect(lines.some((l) => l.includes('✗ Gem'))).toBe(true);
    // Remaining undone step (Altar) should be hidden
    expect(lines.some((l) => l.includes('Altar'))).toBe(false);
  });

  it('sequential with nothing done shows only first step', () => {
    const events = makeQuestWorld('sequential');
    const player = makeMutator();
    const engine = new GameEngine({ events, player, config: CONFIG });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();
    player.setState(ref(`${WORLD}:quest:test-quest`), 'active');

    const lines = getQuestOutput(engine);
    // Only first undone step shown
    expect(lines.some((l) => l.includes('✗ Riddle'))).toBe(true);
    expect(lines.some((l) => l.includes('Gem'))).toBe(false);
    expect(lines.some((l) => l.includes('Altar'))).toBe(false);
  });

  it('endgame hard — renders content, blocks commands', async () => {
    const events = makeQuestWorld('endgame');
    // Add closing prose to quest content
    const questRef = ref(`${WORLD}:quest:test-quest`);
    const questEvent = events.get(questRef);
    questEvent.content = 'The end. You won.';
    const player = makeMutator();
    // Satisfy all requires
    player.markPuzzleSolved(ref(`${WORLD}:puzzle:p1`));
    player.state.inventory.push(ref(`${WORLD}:item:gem`));
    player.setState(ref(`${WORLD}:feature:altar`), 'active');
    const engine = new GameEngine({ events, player, config: CONFIG });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();

    // Quest should auto-complete via _evalQuests (called from enterRoom state changes)
    engine._evalQuests();
    const output = engine.flush();
    const text = output.map((e) => e.html || e.text || '').join(' ');
    expect(text).toContain('The end. You won.');
    expect(engine.gameOver).toBe('hard');

    // Should show restart prompt
    expect(output.some((e) => (e.html || e.text || '').includes('restart'))).toBe(true);

    // Commands should be blocked
    await engine.handleCommand('look');
    const blocked = engine.flush();
    expect(blocked.some((e) => e.text?.includes('story is over'))).toBe(true);
  });

  it('endgame soft — renders content, commands still work', async () => {
    // Build with endgame open mode
    const quest = makeQuest('test-quest', {
      questType: 'endgame',
      requires: [[ref(`${WORLD}:puzzle:p1`), 'solved', '']],
      extraTags: [['quest-type', 'endgame', 'open']],  // override to add mode
    });
    // Remove the duplicate quest-type tag (makeQuest adds one, extraTags adds another)
    quest.tags = quest.tags.filter((t, i) => !(t[0] === 'quest-type' && t.length === 2 && i < quest.tags.length - 1));
    const puzzle = {
      kind: 30078, pubkey: PUBKEY, created_at: 1,
      tags: [['d', `${WORLD}:puzzle:p1`], ['type', 'puzzle'], ['title', 'Riddle']],
      content: 'Solve.',
    };
    const place = makePlace('start', { puzzles: [`${WORLD}:puzzle:p1`] });
    quest.content = 'You did it. Explore freely.';
    const events = buildEvents(place, puzzle, quest);
    const player = makeMutator();
    player.markPuzzleSolved(ref(`${WORLD}:puzzle:p1`));
    const engine = new GameEngine({ events, player, config: CONFIG });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();

    engine._evalQuests();
    const output = engine.flush();
    expect(output.some((e) => (e.html || e.text || '').includes('Explore freely'))).toBe(true);
    expect(output.some((e) => (e.html || e.text || '').includes('keep exploring'))).toBe(true);
    expect(engine.gameOver).toBe('soft');

    // Commands should still work
    await engine.handleCommand('look');
    const look = engine.flush();
    expect(look.some((e) => e.text?.includes('Start'))).toBe(true);
  });

  it('endgame excluded from quest log', () => {
    const events = makeQuestWorld('endgame');
    const player = makeMutator();
    const engine = new GameEngine({ events, player, config: CONFIG });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();

    const lines = getQuestOutput(engine);
    // Endgame quest should not appear in the log at all
    expect(lines.some((l) => l.includes('Test-quest'))).toBe(false);
    // With only endgame quests, should show "No quests"
    expect(lines.some((l) => l.includes('No quests') || l.includes('No quest'))).toBe(true);
  });

  it('quest on-complete fires give-item', () => {
    const reward = makeItem('reward', { nouns: [['reward']], content: 'A reward.' });
    const quest = makeQuest('reward-quest', {
      requires: [[ref(`${WORLD}:feature:altar`), 'active', '']],
      onComplete: [['', 'give-item', ref(`${WORLD}:item:reward`)]],
    });
    const feature = {
      kind: 30078, pubkey: PUBKEY, created_at: 1,
      tags: [['d', `${WORLD}:feature:altar`], ['type', 'feature'], ['title', 'Altar'], ['state', 'inactive']],
      content: 'An altar.',
    };
    const place = makePlace('start', { features: [`${WORLD}:feature:altar`] });
    const events = buildEvents(place, feature, reward, quest);
    const player = makeMutator();
    player.setState(ref(`${WORLD}:feature:altar`), 'active');
    const engine = new GameEngine({ events, player, config: CONFIG });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();

    engine._evalQuests();
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Quest complete'))).toBe(true);
    expect(player.hasItem(ref(`${WORLD}:item:reward`))).toBe(true);
  });
});

// ── World on-interact (global verb dispatcher) ───────────────────────────

describe('world on-interact', () => {
  it('fires world on-interact when no local handler matches', async () => {
    const world = makeWorldEvent({
      start: ref(`${WORLD}:place:start`),
      extraTags: [
        ['on-interact', 'xyzzy', '', 'traverse', ref(`${WORLD}:portal:magic`)],
      ],
    });
    const events = buildEvents(
      makePlace('start', { exits: ['north'] }),
      makePlace('secret', { exits: ['south'] }),
      makePortal('magic', [['test-world:place:start', 'north'], ['test-world:place:secret', 'south']]),
      world,
    );
    const engine = createEngine(events, { place: ref(`${WORLD}:place:start`) });
    engine.flush();
    await engine.handleCommand('xyzzy');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Secret'))).toBe(true);
  });

  it('local handler takes priority over world on-interact', async () => {
    const world = makeWorldEvent({
      start: ref(`${WORLD}:place:start`),
      extraTags: [
        ['on-interact', 'pull', '', 'traverse', ref(`${WORLD}:portal:magic`)],
      ],
    });
    const events = buildEvents(
      makePlace('start', { features: [`${WORLD}:feature:lever`], exits: ['north'] }),
      makeFeature('lever', {
        verbs: [['pull']],
        nouns: [['lever']],
        state: 'off',
        transitions: [['off', 'on', 'You pull the lever.']],
        onInteract: [['pull', 'set-state', 'on']],
      }),
      makePlace('secret', { exits: ['south'] }),
      makePortal('magic', [['test-world:place:start', 'north'], ['test-world:place:secret', 'south']]),
      world,
    );
    const engine = createEngine(events, { place: ref(`${WORLD}:place:start`) });
    engine.flush();
    await engine.handleCommand('pull lever');
    const output = engine.flush();
    // Local handler fired — lever pulled, NOT traversed to secret
    expect(output.some((e) => e.text?.includes('pull the lever'))).toBe(true);
    expect(output.some((e) => e.text?.includes('Secret'))).toBe(false);
  });

  it('respects requires on target portal', async () => {
    const world = makeWorldEvent({
      start: ref(`${WORLD}:place:start`),
      extraTags: [
        ['on-interact', 'xyzzy', '', 'traverse', ref(`${WORLD}:portal:magic`)],
      ],
    });
    const events = buildEvents(
      makePlace('start', { exits: ['north'] }),
      makePlace('secret', { exits: ['south'] }),
      makePortal('magic', [['test-world:place:start', 'north'], ['test-world:place:secret', 'south']], {
        requires: [[ref(`${WORLD}:place:start`), 'visited', 'Nothing happens.']],
      }),
      world,
    );
    const engine = createEngine(events, { place: ref(`${WORLD}:place:start`) });
    engine.flush();
    // Start place not in 'visited' state — requires should fail
    await engine.handleCommand('xyzzy');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Nothing happens'))).toBe(true);
    expect(output.some((e) => e.text?.includes('Secret'))).toBe(false);
  });

  it('world on-interact with state guard', async () => {
    const world = makeWorldEvent({
      start: ref(`${WORLD}:place:start`),
      extraTags: [
        ['state', 'normal'],
        ['on-interact', 'xyzzy', 'enchanted', 'traverse', ref(`${WORLD}:portal:magic`)],
      ],
    });
    const events = buildEvents(
      makePlace('start', { exits: ['north'] }),
      makePlace('secret', { exits: ['south'] }),
      makePortal('magic', [['test-world:place:start', 'north'], ['test-world:place:secret', 'south']]),
      world,
    );
    // World is in 'normal' state, guard requires 'enchanted' — should not fire
    const engine = createEngine(events, { place: ref(`${WORLD}:place:start`) });
    engine.flush();
    await engine.handleCommand('xyzzy');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Secret'))).toBe(false);
  });
});

// ── Place on-interact ────────────────────────────────────────────────────

describe('place on-interact', () => {
  it('fires place on-interact for a bare verb', async () => {
    const start = makePlace('start', {
      exits: ['north'],
      extraTags: [
        ['on-interact', 'xyzzy', '', 'traverse', ref(`${WORLD}:portal:magic`)],
      ],
    });
    const secret = makePlace('secret', { exits: ['south'] });
    const portal = makePortal('magic', [
      [`${WORLD}:place:start`, 'north'],
      [`${WORLD}:place:secret`, 'south'],
    ]);
    const engine = createEngine(buildEvents(start, secret, portal), { place: ref(`${WORLD}:place:start`) });
    engine.flush();
    await engine.handleCommand('xyzzy');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Secret'))).toBe(true);
  });

  it('place on-interact only fires in the right room', async () => {
    const start = makePlace('start', {
      exits: ['north'],
      extraTags: [
        ['on-interact', 'xyzzy', '', 'traverse', ref(`${WORLD}:portal:magic`)],
      ],
    });
    const other = makePlace('other', { exits: ['south'] });
    const secret = makePlace('secret', { exits: ['east'] });
    const portal = makePortal('magic', [
      [`${WORLD}:place:start`, 'north'],
      [`${WORLD}:place:secret`, 'south'],
    ]);
    const engine = createEngine(buildEvents(start, other, secret, portal), { place: ref(`${WORLD}:place:other`) });
    engine.flush();
    // Player is in 'other', not 'start' — place on-interact should not fire
    await engine.handleCommand('xyzzy');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Secret'))).toBe(false);
  });

  it('place on-interact takes priority over world on-interact', async () => {
    const world = makeWorldEvent({
      start: ref(`${WORLD}:place:start`),
      extraTags: [
        ['on-interact', 'xyzzy', '', 'traverse', ref(`${WORLD}:portal:world-dest`)],
      ],
    });
    const start = makePlace('start', {
      exits: ['north'],
      extraTags: [
        ['on-interact', 'xyzzy', '', 'traverse', ref(`${WORLD}:portal:place-dest`)],
      ],
    });
    const placeRoom = makePlace('place-room', { exits: ['south'] });
    const worldRoom = makePlace('world-room', { exits: ['south'] });
    const placeDest = makePortal('place-dest', [
      [`${WORLD}:place:start`, 'north'],
      [`${WORLD}:place:place-room`, 'south'],
    ]);
    const worldDest = makePortal('world-dest', [
      [`${WORLD}:place:start`, 'north'],
      [`${WORLD}:place:world-room`, 'south'],
    ]);
    const engine = createEngine(buildEvents(start, placeRoom, worldRoom, placeDest, worldDest, world), { place: ref(`${WORLD}:place:start`) });
    engine.flush();
    await engine.handleCommand('xyzzy');
    const output = engine.flush();
    // Place handler fires: should arrive in place-room, not world-room
    expect(output.some((e) => e.text?.includes('Place-room'))).toBe(true);
    expect(output.some((e) => e.text?.includes('World-room'))).toBe(false);
  });

  it('place on-interact respects state guard', async () => {
    const start = makePlace('start', {
      exits: ['north'],
      extraTags: [
        ['state', 'normal'],
        ['on-interact', 'xyzzy', 'enchanted', 'traverse', ref(`${WORLD}:portal:magic`)],
      ],
    });
    const secret = makePlace('secret', { exits: ['south'] });
    const portal = makePortal('magic', [
      [`${WORLD}:place:start`, 'north'],
      [`${WORLD}:place:secret`, 'south'],
    ]);
    const engine = createEngine(buildEvents(start, secret, portal), { place: ref(`${WORLD}:place:start`) });
    engine.flush();
    // Place is in 'normal' state — guard requires 'enchanted', should not fire
    await engine.handleCommand('xyzzy');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Secret'))).toBe(false);
  });

  it('place on-interact fires when state guard matches', async () => {
    const start = makePlace('start', {
      exits: ['north'],
      extraTags: [
        ['state', 'enchanted'],
        ['on-interact', 'xyzzy', 'enchanted', 'traverse', ref(`${WORLD}:portal:magic`)],
      ],
    });
    const secret = makePlace('secret', { exits: ['south'] });
    const portal = makePortal('magic', [
      [`${WORLD}:place:start`, 'north'],
      [`${WORLD}:place:secret`, 'south'],
    ]);
    const engine = createEngine(buildEvents(start, secret, portal), {
      place: ref(`${WORLD}:place:start`),
      states: { [`${WORLD}:place:start`]: 'enchanted' },
    });
    engine.flush();
    await engine.handleCommand('xyzzy');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Secret'))).toBe(true);
  });

  it('place on-interact set-state changes place state', async () => {
    const start = makePlace('start', {
      exits: ['north'],
      extraTags: [
        ['state', 'dark'],
        ['transition', 'dark', 'lit', 'The room fills with light.'],
        ['on-interact', 'light', '', 'set-state', 'lit'],
      ],
    });
    const engine = createEngine(buildEvents(start), { place: ref(`${WORLD}:place:start`) });
    engine.flush();
    await engine.handleCommand('light');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('fills with light'))).toBe(true);
  });
});

// ── Inventory cap ────────────────────────────────────────────────────────

describe('inventory cap', () => {
  it('blocks pickup when inventory is full', async () => {
    const world = makeWorldEvent({
      start: ref(`${WORLD}:place:start`),
      extraTags: [['max-inventory', '2', 'Hands are full.']],
    });
    const events = buildEvents(
      makePlace('start', { items: [`${WORLD}:item:c`] }),
      makeItem('a'),
      makeItem('b'),
      makeItem('c'),
      world,
    );
    const engine = createEngine(events, {
      place: ref(`${WORLD}:place:start`),
      inventory: [ref(`${WORLD}:item:a`), ref(`${WORLD}:item:b`)],
    });
    engine.flush();
    await engine.handleCommand('take c');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Hands are full'))).toBe(true);
    expect(engine.player.hasItem(ref(`${WORLD}:item:c`))).toBe(false);
  });

  it('allows pickup when under cap', async () => {
    const world = makeWorldEvent({
      start: ref(`${WORLD}:place:start`),
      extraTags: [['max-inventory', '3', 'Hands are full.']],
    });
    const events = buildEvents(
      makePlace('start', { items: [`${WORLD}:item:c`] }),
      makeItem('a'),
      makeItem('b'),
      makeItem('c'),
      world,
    );
    const engine = createEngine(events, {
      place: ref(`${WORLD}:place:start`),
      inventory: [ref(`${WORLD}:item:a`), ref(`${WORLD}:item:b`)],
    });
    engine.flush();
    await engine.handleCommand('take c');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Taken'))).toBe(true);
    expect(engine.player.hasItem(ref(`${WORLD}:item:c`))).toBe(true);
  });

  it('blocks give-item when inventory is full', async () => {
    const world = makeWorldEvent({
      start: ref(`${WORLD}:place:start`),
      extraTags: [['max-inventory', '1', 'Too much.']],
    });
    const events = buildEvents(
      makePlace('start', { features: [`${WORLD}:feature:chest`] }),
      makeFeature('chest', {
        verbs: [['open']],
        nouns: [['chest']],
        onInteract: [['open', 'give-item', ref(`${WORLD}:item:gem`)]],
      }),
      makeItem('a'),
      makeItem('gem'),
      world,
    );
    const engine = createEngine(events, {
      place: ref(`${WORLD}:place:start`),
      inventory: [ref(`${WORLD}:item:a`)],
    });
    engine.flush();
    await engine.handleCommand('open chest');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Too much'))).toBe(true);
    expect(engine.player.hasItem(ref(`${WORLD}:item:gem`))).toBe(false);
  });

  it('fires on-inventory-full trigger when pickup blocked', async () => {
    const world = makeWorldEvent({
      start: ref(`${WORLD}:place:start`),
      extraTags: [
        ['max-inventory', '1', 'Hands full.'],
        ['on-inventory-full', '', 'set-state', 'annoyed', ref(`${WORLD}:feature:sign`)],
      ],
    });
    const sign = makeFeature('sign', { nouns: [['sign']], state: 'normal' });
    const events = buildEvents(
      makePlace('start', { items: [`${WORLD}:item:b`], features: [`${WORLD}:feature:sign`] }),
      makeItem('a'),
      makeItem('b'),
      sign,
      world,
    );
    const engine = createEngine(events, {
      place: ref(`${WORLD}:place:start`),
      inventory: [ref(`${WORLD}:item:a`)],
    });
    engine.flush();
    await engine.handleCommand('take b');
    const output = engine.flush();
    expect(output.some((e) => e.text?.includes('Hands full'))).toBe(true);
    expect(engine.player.getState(ref(`${WORLD}:feature:sign`))).toBe('annoyed');
  });
});

// ── World counters ───────────────────────────────────────────────────────

describe('world counters', () => {
  it('initializes world counters from world event', () => {
    const world = makeWorldEvent({
      start: ref(`${WORLD}:place:start`),
      extraTags: [['counter', 'score', '0'], ['counter', 'moves', '10']],
    });
    const events = buildEvents(
      makePlace('start'),
      world,
    );
    const engine = createEngine(events, { place: ref(`${WORLD}:place:start`) });
    expect(engine.player.getCounter(`${WORLD}:world:score`)).toBe(0);
    expect(engine.player.getCounter(`${WORLD}:world:moves`)).toBe(10);
  });

  it('on-enter increment targets world counter', async () => {
    const world = makeWorldEvent({
      start: ref(`${WORLD}:place:start`),
      extraTags: [['counter', 'score', '0']],
    });
    const events = buildEvents(
      makePlace('start', { exits: ['north'] }),
      makePlace('room2', { exits: ['south'], extraTags: [
        ['on-enter', 'player', '', 'increment', 'score', '1'],
      ] }),
      makePortal('p1', [['test-world:place:start', 'north'], ['test-world:place:room2', 'south']]),
      world,
    );
    const engine = createEngine(events, { place: ref(`${WORLD}:place:start`) });
    engine.flush();
    await engine.handleCommand('north');
    engine.flush();
    expect(engine.player.getCounter(`${WORLD}:world:score`)).toBe(1);
  });

  it('on-counter fires on world counter threshold', async () => {
    const world = makeWorldEvent({
      start: ref(`${WORLD}:place:start`),
      extraTags: [
        ['counter', 'score', '0'],
        ['on-counter', 'up', 'score', '2', 'set-state', 'won'],
      ],
    });
    const events = buildEvents(
      makePlace('start', { features: [`${WORLD}:feature:btn`] }),
      makeFeature('btn', {
        verbs: [['press']],
        nouns: [['button']],
        onInteract: [['press', 'increment', 'score']],
      }),
      world,
    );
    const engine = createEngine(events, { place: ref(`${WORLD}:place:start`) });
    engine.flush();
    await engine.handleCommand('press button');
    engine.flush();
    expect(engine.player.getCounter(`${WORLD}:world:score`)).toBe(1);
    // Second press crosses threshold
    await engine.handleCommand('press button');
    engine.flush();
    expect(engine.player.getCounter(`${WORLD}:world:score`)).toBe(2);
    expect(engine.player.getState(`${WORLD}:world`)).toBe('won');
  });

  it('local counter takes priority over world counter with same name', async () => {
    const world = makeWorldEvent({
      start: ref(`${WORLD}:place:start`),
      extraTags: [['counter', 'charge', '0']],
    });
    const events = buildEvents(
      makePlace('start', { features: [`${WORLD}:feature:device`] }),
      makeFeature('device', {
        verbs: [['zap']],
        nouns: [['device']],
        onInteract: [['zap', 'increment', 'charge']],
        extraTags: [['counter', 'charge', '5']],
      }),
      world,
    );
    const engine = createEngine(events, { place: ref(`${WORLD}:place:start`) });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();
    // Both device and world have counter 'charge'
    const deviceRef = ref(`${WORLD}:feature:device`);
    expect(engine.player.getCounter(`${deviceRef}:charge`)).toBe(5);
    expect(engine.player.getCounter(`${WORLD}:world:charge`)).toBe(0);

    await engine.handleCommand('zap device');
    engine.flush();
    // Local counter should increment, world counter untouched
    expect(engine.player.getCounter(`${deviceRef}:charge`)).toBe(6);
    expect(engine.player.getCounter(`${WORLD}:world:charge`)).toBe(0);
  });
});

// ── Portal transitions ───────────────────────────────────────────────

describe('portal transitions', () => {
  it('portal with transition-effect emits transition output entry', async () => {
    const room1 = makePlace('room1', { exits: ['north'] });
    const room2 = makePlace('room2', { exits: ['south'] });
    const portal = makePortal('p1', [
      [`${WORLD}:place:room1`, 'north'],
      [`${WORLD}:place:room2`, 'south'],
    ], {
      extraTags: [
        ['transition-effect', 'blackout'],
        ['transition-duration', '1200'],
      ],
    });
    const events = buildEvents(room1, room2, portal);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room1`) });
    engine.enterRoom(ref(`${WORLD}:place:room1`));
    engine.flush();

    await engine.handleCommand('north');
    const output = engine.flush();

    const transition = output.find((e) => e.type === 'transition');
    expect(transition).toBeDefined();
    expect(transition.effect).toBe('blackout');
    expect(transition.duration).toBe(1200);
    expect(transition.clear).toBe(false);
  });

  it('portal with transition-clear emits transition with clear=true', async () => {
    const room1 = makePlace('room1', { exits: ['north'] });
    const room2 = makePlace('room2', { exits: ['south'] });
    const portal = makePortal('p1', [
      [`${WORLD}:place:room1`, 'north'],
      [`${WORLD}:place:room2`, 'south'],
    ], {
      extraTags: [
        ['transition-effect', 'fade'],
        ['transition-clear', 'true'],
      ],
    });
    const events = buildEvents(room1, room2, portal);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room1`) });
    engine.enterRoom(ref(`${WORLD}:place:room1`));
    engine.flush();

    await engine.handleCommand('north');
    const output = engine.flush();

    const transition = output.find((e) => e.type === 'transition');
    expect(transition).toBeDefined();
    expect(transition.effect).toBe('fade');
    expect(transition.clear).toBe(true);
  });

  it('portal without transition tags emits no transition entry', async () => {
    const room1 = makePlace('room1', { exits: ['north'] });
    const room2 = makePlace('room2', { exits: ['south'] });
    const portal = makePortal('p1', [
      [`${WORLD}:place:room1`, 'north'],
      [`${WORLD}:place:room2`, 'south'],
    ]);
    const events = buildEvents(room1, room2, portal);
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room1`) });
    engine.enterRoom(ref(`${WORLD}:place:room1`));
    engine.flush();

    await engine.handleCommand('north');
    const output = engine.flush();

    const transition = output.find((e) => e.type === 'transition');
    expect(transition).toBeUndefined();
  });
});

// ── Place colour overrides ───────────────────────────────────────────

describe('place colour overrides', () => {
  it('place with colour tags emits theme-override with colours object', () => {
    const place = makePlace('dungeon', {
      extraTags: [
        ['colour', 'bg', '#1a0000'],
        ['colour', 'text', '#ff4444'],
      ],
    });
    const events = buildEvents(place);
    const engine = createEngine(events);
    engine.enterRoom(ref(`${WORLD}:place:dungeon`));
    const output = engine.flush();

    const override = output.find((e) => e.type === 'theme-override');
    expect(override).toBeDefined();
    expect(override.colours).toEqual({ bg: '#1a0000', text: '#ff4444' });
  });

  it('place without colour tags emits theme-override with colours=null', () => {
    const place = makePlace('clearing');
    const events = buildEvents(place);
    const engine = createEngine(events);
    engine.enterRoom(ref(`${WORLD}:place:clearing`));
    const output = engine.flush();

    const override = output.find((e) => e.type === 'theme-override');
    expect(override).toBeDefined();
    expect(override.colours).toBeNull();
  });
});

// ── Container examine ──────────────────────────────────────────────────

describe('container examine', () => {
  const breadRef = ref(`${WORLD}:item:bread`);
  const sackRef = ref(`${WORLD}:item:sack`);

  function makeSackWorld() {
    const bread = makeItem('bread', { nouns: [['bread', 'loaf']], content: 'A crusty loaf.' });
    const sack = makeItem('sack', {
      nouns: [['sack', 'bag']],
      content: 'A brown sack.',
      extraTags: [['contains', breadRef, '', '']],
    });
    const place = makePlace('room', { items: [sackRef, breadRef] });
    return buildEvents(place, sack, bread);
  }

  it('shows container contents when examining held container', async () => {
    const events = makeSackWorld();
    const engine = createEngine(events, { place: ref(`${WORLD}:place:room`), inventory: [sackRef] });
    engine.enterRoom(ref(`${WORLD}:place:room`));
    engine.flush();

    await engine.handleCommand('examine sack');
    const output = engine.flush();
    const text = output.map((e) => e.text || e.html || '').join(' ');
    expect(text).toContain('A brown sack');
    expect(text).toContain('Bread');
  });

  it('hides already-taken items from container listing', async () => {
    const events = makeSackWorld();
    const engine = createEngine(events, {
      place: ref(`${WORLD}:place:room`),
      inventory: [sackRef, breadRef],
    });
    engine.enterRoom(ref(`${WORLD}:place:room`));
    engine.flush();

    await engine.handleCommand('examine sack');
    const output = engine.flush();
    const text = output.map((e) => e.text || e.html || '').join(' ');
    expect(text).toContain('A brown sack');
    expect(text).not.toContain('Bread');
  });
});

// ── Clue display and state ────────────────────────────────────────────────

describe('clue display', () => {
  const world = makeWorldEvent();

  it('displays place clue on room entry when requires pass', async () => {
    const clue = makeClue('hint', 'A useful hint.');
    const room = makePlace('start', { clues: [`${WORLD}:clue:hint`] });
    const roomRef = ref(`${WORLD}:place:start`);
    const engine = createEngine([world, room, clue], { GENESIS_PLACE: roomRef });
    engine.enterRoom(roomRef);
    const output = engine.flush();
    expect(output.some(e => (e.text || e.html || '').includes('A useful hint'))).toBe(true);
  });

  it('skips hidden clue on room entry', async () => {
    const clue = makeEvent(`${WORLD}:clue:hint`, [['type', 'clue'], ['title', 'Hint'], ['state', 'hidden']], 'Hidden text.');
    const room = makePlace('start', { clues: [`${WORLD}:clue:hint`] });
    const roomRef = ref(`${WORLD}:place:start`);
    const engine = createEngine([world, room, clue], { GENESIS_PLACE: roomRef });
    engine.enterRoom(roomRef);
    const output = engine.flush();
    expect(output.some(e => (e.text || e.html || '').includes('Hidden text'))).toBe(false);
  });

  it('does not re-display clue on second visit', async () => {
    const clue = makeClue('hint', 'Once only.');
    const room = makePlace('start', { clues: [`${WORLD}:clue:hint`] });
    const roomRef = ref(`${WORLD}:place:start`);
    const engine = createEngine([world, room, clue], { GENESIS_PLACE: roomRef });
    engine.enterRoom(roomRef);
    engine.flush();
    engine.enterRoom(roomRef);
    const output = engine.flush();
    expect(output.some(e => (e.text || e.html || '').includes('Once only'))).toBe(false);
  });

  it('set-state on clue respects requested state and displays', async () => {
    const clueRef = ref(`${WORLD}:clue:hint`);
    const clue = makeEvent(`${WORLD}:clue:hint`, [['type', 'clue'], ['title', 'Hint'], ['state', 'hidden']], 'Revealed text.');
    const feature = makeFeature('lever', {
      verbs: [['pull']],
      onInteract: [['pull', 'set-state', 'visible', clueRef]],
    });
    const room = makePlace('start', { features: [`${WORLD}:feature:lever`], clues: [`${WORLD}:clue:hint`] });
    const roomRef = ref(`${WORLD}:place:start`);
    const engine = createEngine([world, room, feature, clue], { GENESIS_PLACE: roomRef });
    engine.enterRoom(roomRef);
    engine.flush();
    await engine.handleCommand('pull lever');
    const output = engine.flush();
    expect(output.some(e => (e.text || e.html || '').includes('Revealed text'))).toBe(true);
    // markClueSeen fires after display — state is 'seen'
    expect(engine.player.getState(clueRef)).toBe('seen');
  });

  it('set-state on clue with failing requires sets state but does not display', async () => {
    const keyRef = ref(`${WORLD}:item:key`);
    const clueRef = ref(`${WORLD}:clue:locked`);
    const key = makeItem('key');
    const clue = makeEvent(`${WORLD}:clue:locked`, [
      ['type', 'clue'], ['title', 'Secret'], ['state', 'hidden'],
      ['requires', keyRef, '', 'You need the key.'],
    ], 'Secret text.');
    const feature = makeFeature('box', {
      verbs: [['open']],
      onInteract: [['open', 'set-state', 'visible', clueRef]],
    });
    const room = makePlace('start', { features: [`${WORLD}:feature:box`] });
    const roomRef = ref(`${WORLD}:place:start`);
    const engine = createEngine([world, room, feature, clue, key], { GENESIS_PLACE: roomRef });
    engine.enterRoom(roomRef);
    engine.flush();
    await engine.handleCommand('open box');
    const output = engine.flush();
    // State changed to 'visible' but content NOT shown (no key)
    expect(engine.player.getState(clueRef)).toBe('visible');
    expect(output.some(e => (e.text || e.html || '').includes('Secret text'))).toBe(false);
  });
});

// ── Exit routing: requires pre-filtering (#23) and claimed-slot messaging (#24) ──

describe('exit routing — requires pre-filter and claimed-slot messaging', () => {
  function makeWorld2() {
    return makeEvent(`${WORLD}:world`, [
      ['type', 'world'], ['title', 'Test'], ['w', 'folklore'],
      ['start', ref(`${WORLD}:place:start`)],
    ], '');
  }

  it('#24 — claims-but-hidden slot emits "You can\'t go that way." not "I don\'t understand"', async () => {
    // Portal with state: hidden — slot is declared on place but portal is invisible
    const room1 = makePlace('start', { exits: ['north'] });
    const room2 = makePlace('dest', { exits: ['south'] });
    const portal = makePortal('p', [
      [`${WORLD}:place:start`, 'north'],
      [`${WORLD}:place:dest`, 'south'],
    ], { state: 'hidden' });
    const engine = createEngine([makeWorld2(), room1, room2, portal], { place: ref(`${WORLD}:place:start`) });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();
    await engine.handleCommand('north');
    const out = engine.flush();
    expect(out.some((m) => m.text === "You can't go that way.")).toBe(true);
    expect(out.some((m) => m.text === "I don't understand that.")).toBe(false);
  });

  it('#23 — requires-blocked portal on slot emits failure reason, not disambiguation', async () => {
    const key = makeItem('key', { nouns: [['key']] });
    const keyRef = ref(`${WORLD}:item:key`);
    const room1 = makePlace('start', { exits: ['north'] });
    const room2 = makePlace('dest', { exits: ['south'] });
    const portal = makePortal('p', [
      [`${WORLD}:place:start`, 'north'],
      [`${WORLD}:place:dest`, 'south'],
    ], { requires: [[keyRef, '', 'You need the key.']] });
    // Player does not have key
    const engine = createEngine([makeWorld2(), room1, room2, portal, key], { place: ref(`${WORLD}:place:start`) });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();
    await engine.handleCommand('north');
    const out = engine.flush();
    expect(out.some((m) => m.text === 'You need the key.')).toBe(true);
    // Should NOT have navigated
    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:start`));
  });

  it('#23 — two portals on same slot, requires filters to one → navigate silently', async () => {
    const key = makeItem('key', { nouns: [['key']] });
    const keyRef = ref(`${WORLD}:item:key`);
    const room1 = makePlace('start', { exits: ['north'] });
    const room2 = makePlace('day-dest', { exits: ['south'] });
    const room3 = makePlace('night-dest', { exits: ['south'] });
    // day portal requires key; night portal requires NOT key
    const dayPortal = makePortal('day', [
      [`${WORLD}:place:start`, 'north'],
      [`${WORLD}:place:day-dest`, 'south'],
    ], { requires: [[keyRef, '', 'Only with the key.']] });
    const nightPortal = makePortal('night', [
      [`${WORLD}:place:start`, 'north'],
      [`${WORLD}:place:night-dest`, 'south'],
    ]);
    // Player has key → day portal passes, night portal also passes (no requires) → disambiguation
    // Player has no key → day portal blocked, night portal passes → silent route
    const engineNoKey = createEngine(
      [makeWorld2(), room1, room2, room3, dayPortal, nightPortal, key],
      { place: ref(`${WORLD}:place:start`) }
    );
    engineNoKey.enterRoom(ref(`${WORLD}:place:start`));
    engineNoKey.flush();
    await engineNoKey.handleCommand('north');
    // Should have navigated silently to night-dest
    expect(engineNoKey.currentPlace).toBe(ref(`${WORLD}:place:night-dest`));
  });

  it('#23 — two portals on same slot, both pass requires → disambiguation shown', async () => {
    const room1 = makePlace('start', { exits: ['north'] });
    const room2 = makePlace('dest-a', { exits: ['south'] });
    const room3 = makePlace('dest-b', { exits: ['south'] });
    const portalA = makePortal('pa', [
      [`${WORLD}:place:start`, 'north', 'Path A'],
      [`${WORLD}:place:dest-a`, 'south'],
    ]);
    const portalB = makePortal('pb', [
      [`${WORLD}:place:start`, 'north', 'Path B'],
      [`${WORLD}:place:dest-b`, 'south'],
    ]);
    const engine = createEngine([makeWorld2(), room1, room2, room3, portalA, portalB], { place: ref(`${WORLD}:place:start`) });
    engine.enterRoom(ref(`${WORLD}:place:start`));
    engine.flush();
    await engine.handleCommand('north');
    const out = engine.flush();
    // Should show disambiguation, not navigate
    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:start`));
    expect(out.some((m) => m.text?.includes('Multiple paths'))).toBe(true);
  });
});

