/**
 * Tests for consequence dispatch (Phase 19) and traverse action (Phase 20).
 */
import { describe, it, expect } from 'vitest';
import {
  ref, WORLD,
  makePlace, makeItem, makeConsequence, makePortal, makeRoamingNPC, makeNPC, makeFeature, makeWorldEvent,
  buildEvents, makeEngine,
} from './helpers.js';

describe('_executeConsequence', () => {
  it('respawns player to target place', () => {
    const start = makePlace('arena');
    const respawnPlace = makePlace('entrance');
    const consequence = makeConsequence('death', {
      respawn: `${WORLD}:place:entrance`,
      content: 'You died.',
    });

    const events = buildEvents(start, respawnPlace, consequence);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:arena`) });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    engine._executeConsequence(ref(`${WORLD}:consequence:death`));

    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:entrance`));
    expect(engine.player.state.place).toBe(ref(`${WORLD}:place:entrance`));
  });

  it('emits consequence content as narrative', () => {
    const start = makePlace('arena');
    const consequence = makeConsequence('death', {
      content: 'Darkness. Then the entrance tunnel.',
    });

    const events = buildEvents(start, consequence);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:arena`) });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    engine._executeConsequence(ref(`${WORLD}:consequence:death`));

    const narrative = engine.output.find((o) => o.text === 'Darkness. Then the entrance tunnel.');
    expect(narrative).toBeTruthy();
    expect(narrative.type).toBe('narrative');
  });

  it('drops inventory items at current place before clearing', () => {
    const sword = makeItem('sword');
    const shield = makeItem('shield');
    const arena = makePlace('arena');
    const entrance = makePlace('entrance');
    const consequence = makeConsequence('death', {
      respawn: `${WORLD}:place:entrance`,
      clears: ['inventory'],
    });

    const events = buildEvents(sword, shield, arena, entrance, consequence);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:arena`),
      inventory: [ref(`${WORLD}:item:sword`), ref(`${WORLD}:item:shield`)],
    });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    engine._executeConsequence(ref(`${WORLD}:consequence:death`));

    // Inventory should be empty
    expect(engine.player.state.inventory).toEqual([]);

    // Items should be on the ground at the arena (death location)
    const arenaItems = engine.player.getPlaceItems(ref(`${WORLD}:place:arena`));
    expect(arenaItems).toContain(ref(`${WORLD}:item:sword`));
    expect(arenaItems).toContain(ref(`${WORLD}:item:shield`));
  });

  it('clears states map', () => {
    const arena = makePlace('arena');
    const consequence = makeConsequence('death', { clears: ['states'] });

    const events = buildEvents(arena, consequence);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:arena`),
      states: { [ref(`${WORLD}:feature:lever`)]: 'pulled' },
    });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    engine._executeConsequence(ref(`${WORLD}:consequence:death`));

    expect(engine.player.state.states).toEqual({});
  });

  it('clears counters map', () => {
    const arena = makePlace('arena');
    const consequence = makeConsequence('death', { clears: ['counters'] });

    const events = buildEvents(arena, consequence);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:arena`),
      counters: { [`${ref(`${WORLD}:item:lantern`)}:battery`]: 47 },
    });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    engine._executeConsequence(ref(`${WORLD}:consequence:death`));

    expect(engine.player.state.counters).toEqual({});
  });

  it('clears multiple keys at once in fixed order', () => {
    const sword = makeItem('sword');
    const arena = makePlace('arena');
    const entrance = makePlace('entrance');
    const consequence = makeConsequence('death', {
      respawn: `${WORLD}:place:entrance`,
      clears: ['inventory', 'states', 'counters', 'cryptoKeys'],
      content: 'Total reset.',
    });

    const events = buildEvents(sword, arena, entrance, consequence);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:arena`),
      inventory: [ref(`${WORLD}:item:sword`)],
      states: { someRef: 'active' },
      counters: { someCounter: 10 },
      cryptoKeys: ['key123'],
    });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    engine._executeConsequence(ref(`${WORLD}:consequence:death`));

    expect(engine.player.state.inventory).toEqual([]);
    expect(engine.player.state.states).toEqual({});
    expect(engine.player.state.counters).toEqual({});
    expect(engine.player.state.cryptoKeys).toEqual([]);
    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:entrance`));

    // Sword dropped at arena
    const arenaItems = engine.player.getPlaceItems(ref(`${WORLD}:place:arena`));
    expect(arenaItems).toContain(ref(`${WORLD}:item:sword`));
  });

  it('gives items before clears (fixed execution order)', () => {
    const sword = makeItem('sword');
    const arena = makePlace('arena');
    const consequence = makeConsequence('death', {
      giveItems: [`${WORLD}:item:sword`],
      clears: ['inventory'],
    });

    const events = buildEvents(sword, arena, consequence);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:arena`),
      inventory: [],
    });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    engine._executeConsequence(ref(`${WORLD}:consequence:death`));

    // Sword was given, then inventory was cleared (dropped at arena)
    expect(engine.player.state.inventory).toEqual([]);
    const arenaItems = engine.player.getPlaceItems(ref(`${WORLD}:place:arena`));
    expect(arenaItems).toContain(ref(`${WORLD}:item:sword`));
  });

  it('consumes items before clears', () => {
    const sword = makeItem('sword');
    const shield = makeItem('shield');
    const arena = makePlace('arena');
    const consequence = makeConsequence('death', {
      consumeItems: [`${WORLD}:item:sword`],
      clears: ['inventory'],
    });

    const events = buildEvents(sword, shield, arena, consequence);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:arena`),
      inventory: [ref(`${WORLD}:item:sword`), ref(`${WORLD}:item:shield`)],
    });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    engine._executeConsequence(ref(`${WORLD}:consequence:death`));

    // Sword consumed (not dropped), shield dropped at arena
    expect(engine.player.state.inventory).toEqual([]);
    const arenaItems = engine.player.getPlaceItems(ref(`${WORLD}:place:arena`));
    expect(arenaItems).not.toContain(ref(`${WORLD}:item:sword`));
    expect(arenaItems).toContain(ref(`${WORLD}:item:shield`));
  });

  it('set-counter resets a world counter', () => {
    const arena = makePlace('arena');
    const respawnPlace = makePlace('entrance');
    const world = makeWorldEvent({
      extraTags: [
        ['counter', 'moves-act3', '0'],
        ['on-counter', 'down', 'moves-act3', '0', 'consequence', ref(`${WORLD}:consequence:caught`)],
      ],
    });
    const consequence = makeConsequence('caught', {
      respawn: `${WORLD}:place:entrance`,
      extraTags: [['set-counter', 'moves-act3', '40']],
    });

    const events = buildEvents(arena, respawnPlace, world, consequence);
    // Counter is initialized by engine from world event's counter tag
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:arena`) });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    engine._executeConsequence(ref(`${WORLD}:consequence:caught`));

    expect(engine.player.getCounter(`${WORLD}:world:moves-act3`)).toBe(40);
    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:entrance`));
  });

  it('is no-op for missing consequence ref', () => {
    const arena = makePlace('arena');
    const events = buildEvents(arena);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:arena`),
      inventory: [ref(`${WORLD}:item:sword`)],
    });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    // Should not throw
    engine._executeConsequence(ref(`${WORLD}:consequence:nonexistent`));

    // Nothing changed
    expect(engine.player.state.inventory).toEqual([ref(`${WORLD}:item:sword`)]);
    expect(engine.output).toEqual([]);
  });
});

describe('consequence dispatch sites', () => {
  it('NPC on-encounter fires consequence', () => {
    const entrance = makePlace('entrance');
    const arena = makePlace('arena', { npcs: [`${WORLD}:npc:grue`] });
    const grue = makeRoamingNPC('grue', {
      routes: [`${WORLD}:place:arena`],
      onEncounter: [['player', 'consequence', ref(`${WORLD}:consequence:death`)]],
    });
    const consequence = makeConsequence('death', {
      respawn: `${WORLD}:place:entrance`,
      clears: ['inventory'],
      content: 'The grue eats you.',
    });
    const sword = makeItem('sword');

    const events = buildEvents(entrance, arena, grue, consequence, sword);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:arena`),
      inventory: [ref(`${WORLD}:item:sword`)],
    });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    // Fire encounter manually
    engine._fireNpcEncounter(grue, ref(`${WORLD}:npc:grue`));

    // Player should be respawned at entrance
    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:entrance`));
    expect(engine.player.state.inventory).toEqual([]);

    // Sword dropped at arena
    const arenaItems = engine.player.getPlaceItems(ref(`${WORLD}:place:arena`));
    expect(arenaItems).toContain(ref(`${WORLD}:item:sword`));
  });

  it('on-counter crossing fires consequence', () => {
    const arena = makePlace('arena');
    const entrance = makePlace('entrance');
    const lantern = makeItem('lantern', {
      state: 'on',
      counters: [['battery', 200]],
      onMove: [['on', 'decrement', 'battery', '1']],
      onCounter: [['down', 'battery', '0', 'consequence', ref(`${WORLD}:consequence:lamp-dies`)]],
    });
    const consequence = makeConsequence('lamp-dies', {
      respawn: `${WORLD}:place:entrance`,
      content: 'The lantern dies. Darkness takes you.',
    });

    const events = buildEvents(arena, entrance, lantern, consequence);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:arena`),
      inventory: [ref(`${WORLD}:item:lantern`)],
      states: { [ref(`${WORLD}:item:lantern`)]: 'on' },
      counters: { [`${ref(`${WORLD}:item:lantern`)}:battery`]: 1 },
    });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    // Process on-move — battery goes from 1 → 0, crosses threshold
    engine.processOnMove();

    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:entrance`));
    const msg = engine.output.find((o) => o.text === 'The lantern dies. Darkness takes you.');
    expect(msg).toBeTruthy();
  });

  it('lethal portal fires consequence on requires failure', () => {
    const arena = makePlace('arena', {
      exits: ['north'],
      extraTags: [['exit', ref(`${WORLD}:place:chasm`), 'north', 'A narrow ledge.']],
    });
    const chasm = makePlace('chasm', { exits: ['south'] });
    const entrance = makePlace('entrance');
    const portal = makePortal('lethal-bridge', [
      [`${WORLD}:place:arena`, 'north', 'Across the chasm.'],
      [`${WORLD}:place:chasm`, 'south', 'Back.'],
    ], {
      requires: [[ref(`${WORLD}:feature:bridge`), 'built', 'The ledge crumbles beneath you.']],
      extraTags: [['consequence', ref(`${WORLD}:consequence:fell`)]],
    });
    const consequence = makeConsequence('fell', {
      respawn: `${WORLD}:place:entrance`,
      content: 'You fall into the darkness below.',
    });

    const events = buildEvents(arena, chasm, entrance, portal, consequence);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:arena`),
    });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    // Try to move north — requires fails, consequence should fire
    engine.handleMove('north');

    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:entrance`));
    const msg = engine.output.find((o) => o.text === 'You fall into the darkness below.');
    expect(msg).toBeTruthy();
    // The requires failure reason should also be emitted
    const reason = engine.output.find((o) => o.text === 'The ledge crumbles beneath you.');
    expect(reason).toBeTruthy();
  });
});

// ── Phase 20: traverse action ───────────────────────────────────────

describe('_traverse', () => {
  it('navigates player through a portal', () => {
    const arena = makePlace('arena', {
      extraTags: [['exit', ref(`${WORLD}:place:sanctum`), 'north', 'The sanctum.']],
    });
    const sanctum = makePlace('sanctum');
    const portal = makePortal('arena-to-sanctum', [
      [`${WORLD}:place:arena`, 'north', 'The sanctum.'],
      [`${WORLD}:place:sanctum`, 'south', 'The arena.'],
    ]);

    const events = buildEvents(arena, sanctum, portal);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:arena`) });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    engine._traverse(ref(`${WORLD}:portal:arena-to-sanctum`));

    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:sanctum`));
  });

  it('blocks traversal when portal requires fails', () => {
    const arena = makePlace('arena');
    const sanctum = makePlace('sanctum');
    const portal = makePortal('locked-gate', [
      [`${WORLD}:place:arena`, 'north', 'The sanctum.'],
      [`${WORLD}:place:sanctum`, 'south', 'The arena.'],
    ], {
      requires: [[ref(`${WORLD}:feature:lever`), 'pulled', 'The gate is locked.']],
    });

    const events = buildEvents(arena, sanctum, portal);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:arena`) });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    engine._traverse(ref(`${WORLD}:portal:locked-gate`));

    // Should stay in arena
    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:arena`));
    const msg = engine.output.find((o) => o.text === 'The gate is locked.');
    expect(msg).toBeTruthy();
  });

  it('is no-op for missing portal ref', () => {
    const arena = makePlace('arena');
    const events = buildEvents(arena);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:arena`) });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    engine._traverse(ref(`${WORLD}:portal:nonexistent`));

    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:arena`));
  });

  it('fires from on-interact', () => {
    const arena = makePlace('arena', {
      features: [`${WORLD}:feature:mirror`],
    });
    const sanctum = makePlace('sanctum');
    const portal = makePortal('mirror-portal', [
      [`${WORLD}:place:arena`, 'north', 'Through the mirror.'],
      [`${WORLD}:place:sanctum`, 'south', 'Back.'],
    ]);
    const mirror = makeFeature('mirror', {
      verbs: [['examine'], ['use', 'touch', 'enter']],
      nouns: [['mirror']],
      onInteract: [['use', 'traverse', ref(`${WORLD}:portal:mirror-portal`)]],
    });

    const events = buildEvents(arena, sanctum, portal, mirror);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:arena`) });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    engine.processFeatureInteract(mirror, ref(`${WORLD}:feature:mirror`), 'use', null);

    expect(engine.currentPlace).toBe(ref(`${WORLD}:place:sanctum`));
  });
});

// ── Phase 22: increment / set-counter ───────────────────────────────

describe('counter actions', () => {
  it('increment increases counter by 1', () => {
    const arena = makePlace('arena', { features: [`${WORLD}:feature:lever`] });
    const lever = makeFeature('lever', {
      verbs: [['examine'], ['pull']],
      nouns: [['lever']],
      onInteract: [['pull', 'increment', 'pulls']],
      extraTags: [['counter', 'pulls', '0']],
    });

    const events = buildEvents(arena, lever);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:arena`) });
    engine.currentPlace = ref(`${WORLD}:place:arena`);

    // Init counter
    engine.player.setCounter(`${ref(`${WORLD}:feature:lever`)}:pulls`, 0);

    engine.processFeatureInteract(lever, ref(`${WORLD}:feature:lever`), 'pull', null);

    expect(engine.player.getCounter(`${ref(`${WORLD}:feature:lever`)}:pulls`)).toBe(1);
  });

  it('set-counter sets counter to specific value', () => {
    const arena = makePlace('arena', { features: [`${WORLD}:feature:forge`] });
    const forge = makeFeature('forge', {
      verbs: [['examine'], ['light']],
      nouns: [['forge']],
      onInteract: [['light', 'set-counter', 'heat', '3']],
      extraTags: [['counter', 'heat', '0']],
    });

    const events = buildEvents(arena, forge);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:arena`) });
    engine.currentPlace = ref(`${WORLD}:place:arena`);
    engine.player.setCounter(`${ref(`${WORLD}:feature:forge`)}:heat`, 0);

    engine.processFeatureInteract(forge, ref(`${WORLD}:feature:forge`), 'light', 'cold');

    expect(engine.player.getCounter(`${ref(`${WORLD}:feature:forge`)}:heat`)).toBe(3);
  });

  it('decrement from on-interact works', () => {
    const arena = makePlace('arena', { features: [`${WORLD}:feature:trough`] });
    const trough = makeFeature('trough', {
      verbs: [['examine'], ['drink']],
      nouns: [['trough']],
      onInteract: [['drink', 'decrement', 'drinks']],
      extraTags: [['counter', 'drinks', '3']],
    });

    const events = buildEvents(arena, trough);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:arena`) });
    engine.currentPlace = ref(`${WORLD}:place:arena`);
    engine.player.setCounter(`${ref(`${WORLD}:feature:trough`)}:drinks`, 3);

    engine.processFeatureInteract(trough, ref(`${WORLD}:feature:trough`), 'drink', 'full');

    expect(engine.player.getCounter(`${ref(`${WORLD}:feature:trough`)}:drinks`)).toBe(2);
  });

  it('decrement triggers on-counter threshold crossing', () => {
    const arena = makePlace('arena', { features: [`${WORLD}:feature:trough`] });
    const trough = makeFeature('trough', {
      state: 'full',
      verbs: [['drink']],
      nouns: [['trough']],
      onInteract: [['drink', 'decrement', 'drinks']],
      extraTags: [
        ['counter', 'drinks', '3'],
        ['on-counter', 'down', 'drinks', '0', 'set-state', 'empty'],
        ['transition', 'full', 'empty', 'The trough is empty.'],
      ],
    });

    const events = buildEvents(arena, trough);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:arena`) });
    engine.currentPlace = ref(`${WORLD}:place:arena`);
    engine.player.setCounter(`${ref(`${WORLD}:feature:trough`)}:drinks`, 1);
    engine.player.setState(ref(`${WORLD}:feature:trough`), 'full');

    engine.processFeatureInteract(trough, ref(`${WORLD}:feature:trough`), 'drink', 'full');

    // Counter crossed 0 threshold → state should be empty
    expect(engine.player.getCounter(`${ref(`${WORLD}:feature:trough`)}:drinks`)).toBe(0);
    expect(engine.player.getState(ref(`${WORLD}:feature:trough`))).toBe('empty');
    const msg = engine.output.find((o) => o.text === 'The trough is empty.');
    expect(msg).toBeTruthy();
  });
});

// ── Arithmetic counter actions ──────────────────────────────────────

describe('arithmetic counter actions', () => {
  function makeForge(action, amount, extraTags = []) {
    const arena = makePlace('arena', { features: [`${WORLD}:feature:forge`] });
    const forge = makeFeature('forge', {
      verbs: [['examine'], ['pump']],
      nouns: [['forge']],
      onInteract: [[`pump`, action, 'heat', amount]],
      extraTags: [['counter', 'heat', '0'], ...extraTags],
    });
    const events = buildEvents(arena, forge);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:arena`) });
    engine.currentPlace = ref(`${WORLD}:place:arena`);
    engine.player.setCounter(`${ref(`${WORLD}:feature:forge`)}:heat`, 10);
    return engine;
  }

  it('add-counter adds the specified amount', () => {
    const engine = makeForge('add-counter', '5');
    engine.processFeatureInteract(
      engine.events.get(ref(`${WORLD}:feature:forge`)),
      ref(`${WORLD}:feature:forge`), 'pump', null
    );
    expect(engine.player.getCounter(`${ref(`${WORLD}:feature:forge`)}:heat`)).toBe(15);
  });

  it('sub-counter subtracts the specified amount and floors at 0', () => {
    const engine = makeForge('sub-counter', '4');
    engine.processFeatureInteract(
      engine.events.get(ref(`${WORLD}:feature:forge`)),
      ref(`${WORLD}:feature:forge`), 'pump', null
    );
    expect(engine.player.getCounter(`${ref(`${WORLD}:feature:forge`)}:heat`)).toBe(6);
  });

  it('sub-counter floors at 0, not negative', () => {
    const engine = makeForge('sub-counter', '20');
    engine.processFeatureInteract(
      engine.events.get(ref(`${WORLD}:feature:forge`)),
      ref(`${WORLD}:feature:forge`), 'pump', null
    );
    expect(engine.player.getCounter(`${ref(`${WORLD}:feature:forge`)}:heat`)).toBe(0);
  });

  it('mul-counter multiplies by the specified amount', () => {
    const engine = makeForge('mul-counter', '3');
    engine.processFeatureInteract(
      engine.events.get(ref(`${WORLD}:feature:forge`)),
      ref(`${WORLD}:feature:forge`), 'pump', null
    );
    expect(engine.player.getCounter(`${ref(`${WORLD}:feature:forge`)}:heat`)).toBe(30);
  });

  it('div-counter divides and floors the result', () => {
    const engine = makeForge('div-counter', '3');
    engine.player.setCounter(`${ref(`${WORLD}:feature:forge`)}:heat`, 7);
    engine.processFeatureInteract(
      engine.events.get(ref(`${WORLD}:feature:forge`)),
      ref(`${WORLD}:feature:forge`), 'pump', null
    );
    expect(engine.player.getCounter(`${ref(`${WORLD}:feature:forge`)}:heat`)).toBe(2);
  });

  it('div-counter with amount 0 is silently ignored', () => {
    const engine = makeForge('div-counter', '0');
    engine.processFeatureInteract(
      engine.events.get(ref(`${WORLD}:feature:forge`)),
      ref(`${WORLD}:feature:forge`), 'pump', null
    );
    // Counter unchanged
    expect(engine.player.getCounter(`${ref(`${WORLD}:feature:forge`)}:heat`)).toBe(10);
  });

  it('add-counter triggers on-counter threshold crossing', () => {
    const engine = makeForge('add-counter', '5', [
      ['state', 'cold'],
      ['transition', 'cold', 'hot', 'The forge roars to life.'],
      ['on-counter', 'up', 'heat', '12', 'set-state', 'hot'],
    ]);
    engine.player.setState(ref(`${WORLD}:feature:forge`), 'cold');
    engine.processFeatureInteract(
      engine.events.get(ref(`${WORLD}:feature:forge`)),
      ref(`${WORLD}:feature:forge`), 'pump', null
    );
    // 10 + 5 = 15 — crossed threshold of 12 upward
    expect(engine.player.getCounter(`${ref(`${WORLD}:feature:forge`)}:heat`)).toBe(15);
    expect(engine.player.getState(ref(`${WORLD}:feature:forge`))).toBe('hot');
    const msg = engine.output.find((o) => o.text === 'The forge roars to life.');
    expect(msg).toBeTruthy();
  });
});

// ── Phase 24: flees action ──────────────────────────────────────────

describe('flees action', () => {
  it('NPC flees emits message on encounter', () => {
    const armoury = makePlace('armoury');
    const arena = makePlace('arena');
    const rat = makeRoamingNPC('rat', {
      routes: [`${WORLD}:place:armoury`, `${WORLD}:place:arena`],
      roamsWhen: 'scared',
      state: 'idle',
      onEncounter: [['player', 'set-state', 'scared'], ['player', 'flees']],
    });

    const events = buildEvents(armoury, arena, rat);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:armoury`) });
    engine.currentPlace = ref(`${WORLD}:place:armoury`);
    engine.player.ensureNpcState(ref(`${WORLD}:npc:rat`), { state: 'idle', inventory: [], health: null });

    engine._fireNpcEncounter(rat, ref(`${WORLD}:npc:rat`));

    // Flees emits message
    const msg = engine.output.find((o) => o.text === 'Rat flees!');
    expect(msg).toBeTruthy();

    // set-state should have changed NPC state to 'scared' (activates roams-when)
    const npcState = engine.player.getNpcState(ref(`${WORLD}:npc:rat`));
    expect(npcState.state).toBe('scared');
  });
});

describe('world on-move', () => {
  it('increments a world counter on every move', () => {
    const place = makePlace('hall');
    const world = makeWorldEvent({
      extraTags: [
        ['counter', 'moves', '0'],
        ['on-move', '', 'increment', 'moves'],
      ],
    });
    const events = buildEvents(place, world);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:hall`) });

    engine.processOnMove();
    engine.processOnMove();
    engine.processOnMove();

    const worldDtag = `${WORLD}:world`;
    expect(engine.player.getCounter(`${worldDtag}:moves`)).toBe(3);
  });

  it('world on-move respects state guard — fires only in matching state', () => {
    const place = makePlace('cave');
    const world = makeWorldEvent({
      extraTags: [
        ['state', 'open'],
        ['counter', 'ticks', '0'],
        ['on-move', 'closing', 'increment', 'ticks'],
      ],
    });
    const events = buildEvents(place, world);
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:cave`) });

    // World state is 'open' — guarded handler should NOT fire
    engine.processOnMove();
    expect(engine.player.getCounter(`${WORLD}:world:ticks`)).toBe(0);

    // Change world state to 'closing' — handler should now fire
    engine.player.setState(`${WORLD}:world`, 'closing');
    engine.processOnMove();
    expect(engine.player.getCounter(`${WORLD}:world:ticks`)).toBe(1);
  });

  it('world on-move fires independently of inventory', () => {
    const place = makePlace('hall');
    const world = makeWorldEvent({
      extraTags: [
        ['counter', 'moves', '0'],
        ['on-move', '', 'increment', 'moves'],
      ],
    });
    const events = buildEvents(place, world);
    // Empty inventory — world trigger should still fire
    const engine = makeEngine(events, { place: ref(`${WORLD}:place:hall`), inventory: [] });

    engine.processOnMove();
    expect(engine.player.getCounter(`${WORLD}:world:moves`)).toBe(1);
  });

  it('item on-move blank state guard fires in any state', () => {
    const place = makePlace('hall');
    const torch = makeItem('torch', {
      state: 'burning',
      counters: [['fuel', '10']],
      onMove: [['', 'decrement', 'fuel']],
    });
    const events = buildEvents(place, torch);
    const engine = makeEngine(events, {
      place: ref(`${WORLD}:place:hall`),
      inventory: [ref(`${WORLD}:item:torch`)],
      states: { [ref(`${WORLD}:item:torch`)]: 'burning' },
      counters: { [`${ref(`${WORLD}:item:torch`)}:fuel`]: 10 },
    });

    engine.processOnMove();
    expect(engine.player.getCounter(`${ref(`${WORLD}:item:torch`)}:fuel`)).toBe(9);
  });
});
