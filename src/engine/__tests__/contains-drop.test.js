/**
 * Tests for contains (containers) and drop command.
 */
import { describe, it, expect } from 'vitest';
import { makePlace, makeItem, makeFeature, buildEvents, makeEngine, ref, WORLD } from './helpers.js';

describe('contains — item containers', () => {
  function setup() {
    const sack = makeItem('sack', {
      nouns: [['sack']],
      extraTags: [
        ['contains', ref(`${WORLD}:item:bread`), '', ''],
        ['contains', ref(`${WORLD}:item:garlic`), '', ''],
      ],
    });
    const bread = makeItem('bread', { nouns: [['bread']] });
    const garlic = makeItem('garlic', { nouns: [['garlic']] });
    const place = makePlace('start', { items: [`${WORLD}:item:sack`] });
    const events = buildEvents(place, sack, bread, garlic);
    return makeEngine(events, { place: ref(`${WORLD}:place:start`) });
  }

  it('take X from Y extracts item from ground container', async () => {
    const engine = setup();
    engine.enterRoom();
    await engine.handleCommand('take sack');
    await engine.handleCommand('take bread from sack');
    expect(engine.player.hasItem(ref(`${WORLD}:item:bread`))).toBe(true);
  });

  it('take all from Y extracts all items', async () => {
    const engine = setup();
    engine.enterRoom();
    await engine.handleCommand('take sack');
    await engine.handleCommand('take all from sack');
    expect(engine.player.hasItem(ref(`${WORLD}:item:bread`))).toBe(true);
    expect(engine.player.hasItem(ref(`${WORLD}:item:garlic`))).toBe(true);
  });
});

describe('contains — feature containers with state gate', () => {
  function setup() {
    const chest = makeFeature('chest', {
      state: 'closed',
      nouns: [['chest']],
      verbs: [['open']],
      transitions: [['closed', 'open', 'You open the chest.']],
      onInteract: [['open', 'set-state', 'open']],
      extraTags: [
        ['contains', ref(`${WORLD}:item:key`), 'open', 'The chest is closed.'],
      ],
    });
    const key = makeItem('key', { nouns: [['key']] });
    const place = makePlace('start', { features: [`${WORLD}:feature:chest`] });
    const events = buildEvents(place, chest, key);
    return makeEngine(events, { place: ref(`${WORLD}:place:start`) });
  }

  it('blocks take when feature is in wrong state', async () => {
    const engine = setup();
    engine.enterRoom();
    const output = engine.flush();
    await engine.handleCommand('take key from chest');
    const msgs = engine.flush();
    expect(msgs.some((m) => m.text.includes('closed'))).toBe(true);
    expect(engine.player.hasItem(ref(`${WORLD}:item:key`))).toBe(false);
  });

  it('allows take when feature is in correct state', async () => {
    const engine = setup();
    engine.enterRoom();
    engine.flush();
    await engine.handleCommand('open chest');
    engine.flush();
    await engine.handleCommand('take key from chest');
    expect(engine.player.hasItem(ref(`${WORLD}:item:key`))).toBe(true);
  });
});

describe('drop command', () => {
  it('moves item from inventory to ground', async () => {
    const sword = makeItem('sword', { nouns: [['sword']] });
    const place = makePlace('start', {});
    const events = buildEvents(place, sword);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:start`),
      inventory: [ref(`${WORLD}:item:sword`)],
    });
    engine.enterRoom();
    engine.flush();
    await engine.handleCommand('drop sword');
    expect(engine.player.hasItem(ref(`${WORLD}:item:sword`))).toBe(false);
    const msgs = engine.flush();
    expect(msgs.some((m) => m.text.includes('drop') || m.text.includes('Sword'))).toBe(true);
  });

  it('errors when item not in inventory', async () => {
    const place = makePlace('start', {});
    const events = buildEvents(place);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:start`) });
    engine.enterRoom();
    engine.flush();
    await engine.handleCommand('drop sword');
    const msgs = engine.flush();
    expect(msgs.some((m) => m.type === 'error')).toBe(true);
  });
});

describe('on-drop — place trigger', () => {
  function setup() {
    const coin = makeItem('coin', { nouns: [['coin']], state: 'normal', transitions: [['normal', 'deposited', 'The coin sinks into the well.']] });
    const place = makePlace('well-house', {
      extraTags: [
        ['on-drop', ref(`${WORLD}:item:coin`), '', 'set-state', 'deposited', ref(`${WORLD}:item:coin`)],
      ],
    });
    const events = buildEvents(place, coin);
    return makeEngine(events, {
      place: ref(`${WORLD}:place:well-house`),
      inventory: [ref(`${WORLD}:item:coin`)],
    });
  }

  it('fires on-drop trigger when item is dropped in the room', async () => {
    const engine = setup();
    engine.enterRoom();
    engine.flush();
    await engine.handleCommand('drop coin');
    expect(engine.player.hasItem(ref(`${WORLD}:item:coin`))).toBe(false);
    expect(engine.player.getState(ref(`${WORLD}:item:coin`))).toBe('deposited');
    const msgs = engine.flush();
    expect(msgs.some((m) => m.text?.includes('sinks'))).toBe(true);
  });

  it('does not fire when item-ref does not match', async () => {
    const engine = setup();
    const sword = makeItem('sword', { nouns: [['sword']] });
    engine.events.set(ref(`${WORLD}:item:sword`), sword);
    engine.player.pickUp(ref(`${WORLD}:item:sword`));
    engine.enterRoom();
    engine.flush();
    await engine.handleCommand('drop sword');
    expect(engine.player.hasItem(ref(`${WORLD}:item:sword`))).toBe(false);
    // sword state unchanged — on-drop only targets coin
    expect(engine.player.getState(ref(`${WORLD}:item:sword`))).toBeFalsy();
  });

  it('respects state guard — does not fire when place state does not match', async () => {
    const coin = makeItem('coin2', { nouns: [['coin']] });
    const place = makePlace('guarded', {
      state: 'locked',
      extraTags: [
        ['on-drop', ref(`${WORLD}:item:coin2`), 'open', 'set-state', 'deposited', ref(`${WORLD}:item:coin2`)],
      ],
    });
    const events = buildEvents(place, coin);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:guarded`),
      inventory: [ref(`${WORLD}:item:coin2`)],
    });
    engine.enterRoom();
    engine.flush();
    await engine.handleCommand('drop coin');
    // Item still drops, but on-drop action doesn't fire (state guard 'open' not met)
    expect(engine.player.hasItem(ref(`${WORLD}:item:coin2`))).toBe(false);
    expect(engine.player.getState(ref(`${WORLD}:item:coin2`))).toBeFalsy();
  });
});

describe('on-drop — feature trigger (targeted)', () => {
  function setup({ featState = 'open' } = {}) {
    const coin = makeItem('coin', { nouns: [['coin']] });
    const chest = makeFeature('chest', {
      state: featState,
      nouns: [['chest']],
      transitions: [['closed', 'open', 'You open the chest.']],
      extraTags: [
        ['on-drop', ref(`${WORLD}:item:coin`), 'open', 'consume-item', ref(`${WORLD}:item:coin`)],
      ],
    });
    const place = makePlace('start', { features: [`${WORLD}:feature:chest`] });
    const events = buildEvents(place, chest, coin);
    return makeEngine(events, {
      place: ref(`${WORLD}:place:start`),
      inventory: [ref(`${WORLD}:item:coin`)],
    });
  }

  it('fires on-drop on feature when explicitly targeted and state guard passes', async () => {
    const engine = setup({ featState: 'open' });
    engine.enterRoom();
    engine.flush();
    await engine.handleCommand('drop coin in chest');
    // consume-item fires — coin removed from inventory and not on ground
    expect(engine.player.hasItem(ref(`${WORLD}:item:coin`))).toBe(false);
  });

  it('blocks with "You can\'t do that." when state guard fails', async () => {
    const engine = setup({ featState: 'closed' });
    engine.enterRoom();
    engine.flush();
    await engine.handleCommand('drop coin in chest');
    expect(engine.player.hasItem(ref(`${WORLD}:item:coin`))).toBe(true); // still held
    const msgs = engine.flush();
    expect(msgs.some((m) => m.text?.includes("can't"))).toBe(true);
  });

  it('drops on floor when no matching on-drop for item', async () => {
    const engine = setup({ featState: 'open' });
    const sword = makeItem('sword', { nouns: [['sword']] });
    engine.events.set(ref(`${WORLD}:item:sword`), sword);
    engine.player.pickUp(ref(`${WORLD}:item:sword`));
    engine.enterRoom();
    engine.flush();
    await engine.handleCommand('drop sword in chest');
    // No on-drop for sword — item just drops to floor
    expect(engine.player.hasItem(ref(`${WORLD}:item:sword`))).toBe(false);
  });

  it('errors when feature is not found', async () => {
    const engine = setup();
    engine.enterRoom();
    engine.flush();
    await engine.handleCommand('drop coin in barrel');
    const msgs = engine.flush();
    expect(msgs.some((m) => m.type === 'error')).toBe(true);
    expect(engine.player.hasItem(ref(`${WORLD}:item:coin`))).toBe(true);
  });
});

describe('on-drop — counter actions', () => {
  it('decrement fires when item is dropped in a place', async () => {
    const coin = makeItem('coin', { nouns: [['coin']], counters: [['gold', 5]] });
    const place = makePlace('well', {
      extraTags: [
        ['on-drop', ref(`${WORLD}:item:coin`), '', 'decrement', 'gold', ref(`${WORLD}:item:coin`)],
      ],
    });
    const events = buildEvents(place, coin);
    // Counter key uses full a-tag of the item as prefix
    const coinRef = ref(`${WORLD}:item:coin`);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:well`),
      inventory: [coinRef],
      counters: { [`${coinRef}:gold`]: 5 },
    });
    engine.enterRoom();
    engine.flush();
    await engine.handleCommand('drop coin');
    expect(engine.player.state.counters[`${coinRef}:gold`]).toBe(4);
  });

  it('increment fires when item is dropped on a feature', async () => {
    const gem = makeItem('gem', { nouns: [['gem']], counters: [['score', 0]] });
    const pedestal = makeFeature('pedestal', {
      nouns: [['pedestal']],
      extraTags: [
        ['on-drop', ref(`${WORLD}:item:gem`), '', 'increment', 'score', ref(`${WORLD}:item:gem`)],
      ],
    });
    const place = makePlace('start', { features: [`${WORLD}:feature:pedestal`] });
    const events = buildEvents(place, pedestal, gem);
    // Counter key uses full a-tag of the item as prefix
    const gemRef = ref(`${WORLD}:item:gem`);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:start`),
      inventory: [gemRef],
      counters: { [`${gemRef}:score`]: 0 },
    });
    engine.enterRoom();
    engine.flush();
    await engine.handleCommand('drop gem on pedestal');
    expect(engine.player.state.counters[`${gemRef}:score`]).toBe(1);
  });
});
