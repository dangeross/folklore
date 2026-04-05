import { describe, it, expect } from 'vitest';
import { runWalkthrough, smokeTest } from '../walkthrough.js';
import {
  ref, PUBKEY, WORLD,
  makePlace, makeFeature, makeItem, makePortal,
  buildEvents, makeEvent,
} from './helpers.js';

// ── Test world factory ───────────────────────────────────────────────────────

function makeWorld({ extraTags = [] } = {}) {
  return makeEvent(`${WORLD}:world`, [
    ['type', 'world'],
    ['title', 'Test World'],
    ['w', 'folklore'],
    ['start', ref(`${WORLD}:place:start`)],
    ...extraTags,
  ], 'A test world.');
}

function buildTestWorld() {
  const world = makeWorld();
  const start = makePlace('start', {
    features: [`${WORLD}:feature:sign`],
    items: [`${WORLD}:item:key`],
    exits: ['north'],
  });
  const cave = makePlace('cave', { exits: ['south'] });
  const sign = makeFeature('sign', {
    state: 'unread',
    transitions: [['unread', 'read', 'The sign says: go north.']],
    verbs: [['examine', 'read', 'look at']],
    nouns: [['sign', 'wooden sign']],
    onInteract: [['examine', 'set-state', '']],
    content: 'A wooden sign.',
  });
  const key = makeItem('key', {
    nouns: [['key', 'brass key']],
    content: 'A brass key.',
  });
  const portal = makePortal('start-to-cave', [
    [`${WORLD}:place:start`, 'north', 'A dark cave entrance.'],
    [`${WORLD}:place:cave`, 'south', 'Daylight to the south.'],
  ]);
  return buildEvents(world, start, cave, sign, key, portal);
}

// ── Walkthrough Runner ───────────────────────────────────────────────────────

describe('runWalkthrough', () => {
  it('passes when all expect substrings match', async () => {
    const events = buildTestWorld();
    const walkthrough = [
      { input: 'look', expect: ['Start', 'Sign'] },
    ];
    const result = await runWalkthrough(events, walkthrough);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0].pass).toBe(true);
  });

  it('fails when expect substring not found', async () => {
    const events = buildTestWorld();
    const walkthrough = [
      { input: 'look', expect: ['dragon'] },
    ];
    const result = await runWalkthrough(events, walkthrough);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0].errors[0]).toContain('dragon');
  });

  it('fails when reject substring is found', async () => {
    const events = buildTestWorld();
    const walkthrough = [
      { input: 'look', expect: ['Start'], reject: ['sign'] },
    ];
    const result = await runWalkthrough(events, walkthrough);
    expect(result.failed).toBe(1);
    expect(result.results[0].errors.some((e) => e.includes('sign'))).toBe(true);
  });

  it('handles movement and tracks coverage', async () => {
    const events = buildTestWorld();
    const walkthrough = [
      { input: 'north', expect: ['Cave'] },
      { input: 'south', expect: ['Start'] },
    ];
    const result = await runWalkthrough(events, walkthrough);
    expect(result.passed).toBe(2);
    expect(result.coverage.placesVisited).toBe(2);
    expect(result.coverage.placesTotal).toBe(2);
    expect(result.coverage.unvisited).toHaveLength(0);
  });

  it('tracks unvisited places', async () => {
    const events = buildTestWorld();
    const walkthrough = [
      { input: 'look', expect: ['Start'] },
    ];
    const result = await runWalkthrough(events, walkthrough);
    expect(result.coverage.placesVisited).toBe(1);
    expect(result.coverage.unvisited).toHaveLength(1);
  });

  it('handles item pickup and state changes', async () => {
    const events = buildTestWorld();
    const walkthrough = [
      { input: 'take key', expect: ['Taken'] },
      { input: 'examine sign', expect: ['sign'] },
    ];
    const result = await runWalkthrough(events, walkthrough);
    expect(result.passed).toBe(2);
  });

  it('returns error for missing world event', async () => {
    const place = makePlace('start');
    const events = buildEvents(place);
    const result = await runWalkthrough(events, [{ input: 'look' }]);
    expect(result.failed).toBe(0);
    expect(result.results[0].errors[0]).toContain('No world event');
  });

  it('expect matching is case-insensitive', async () => {
    const events = buildTestWorld();
    const walkthrough = [
      { input: 'look', expect: ['SIGN', 'START'] },
    ];
    const result = await runWalkthrough(events, walkthrough);
    expect(result.passed).toBe(1);
  });
});

// ── Smoke Tester ─────────────────────────────────────────────────────────────

describe('smokeTest', () => {
  it('discovers all reachable places', async () => {
    const events = buildTestWorld();
    const result = await smokeTest(events);
    expect(result.reachable).toHaveLength(2);
    expect(result.unreachable).toHaveLength(0);
  });

  it('finds unreachable places', async () => {
    const world = makeWorld();
    const start = makePlace('start');
    const island = makePlace('island'); // no portal connects here
    const events = buildEvents(world, start, island);
    const result = await smokeTest(events);
    expect(result.reachable).toHaveLength(1);
    expect(result.unreachable).toHaveLength(1);
    expect(result.issues.some((i) => i.type === 'unreachable' && i.entity === 'Island')).toBe(true);
  });

  it('detects missing noun tags', async () => {
    const world = makeWorld();
    const noNounFeature = makeFeature('altar', { content: 'An altar.' });
    // feature has no noun tag
    const start = makePlace('start', { features: [`${WORLD}:feature:altar`] });
    const events = buildEvents(world, start, noNounFeature);
    const result = await smokeTest(events);
    expect(result.issues.some((i) => i.type === 'missing-noun' && i.entity === 'Altar')).toBe(true);
  });

  it('reports coverage stats', async () => {
    const events = buildTestWorld();
    const result = await smokeTest(events);
    expect(result.coverage.placesReachable).toBe(2);
    expect(result.coverage.placesTotal).toBe(2);
    expect(result.coverage.entitiesChecked).toBeGreaterThan(0);
  });

  it('returns error for missing world event', async () => {
    const place = makePlace('start');
    const events = buildEvents(place);
    const result = await smokeTest(events);
    expect(result.issues[0].message).toContain('No world event');
  });

  it('flags thin noun aliases (only long compound names)', async () => {
    const world = makeWorld();
    const longNoun = makeFeature('mechanism', {
      nouns: [['orichalcum-mechanism']],
      content: 'A strange mechanism.',
    });
    const start = makePlace('start', { features: [`${WORLD}:feature:mechanism`] });
    const events = buildEvents(world, start, longNoun);
    const result = await smokeTest(events);
    expect(result.issues.some((i) => i.type === 'thin-noun' && i.entity === 'Mechanism')).toBe(true);
  });

  it('no thin-noun warning when short alias exists', async () => {
    const world = makeWorld();
    const goodNoun = makeFeature('mechanism', {
      nouns: [['orichalcum-mechanism', 'mechanism']],
      content: 'A strange mechanism.',
    });
    const start = makePlace('start', { features: [`${WORLD}:feature:mechanism`] });
    const events = buildEvents(world, start, goodNoun);
    const result = await smokeTest(events);
    expect(result.issues.some((i) => i.type === 'thin-noun')).toBe(false);
  });

  it('flags undiscoverable verbs not hinted in visible text', async () => {
    const world = makeWorld();
    const lever = makeFeature('lever', {
      nouns: [['lever']],
      verbs: [['pull']],
      onInteract: [['pull', 'set-state', '']],
      content: 'A rusty lever.',  // no mention of "pull"
    });
    const start = makePlace('start', { features: [`${WORLD}:feature:lever`] });
    start.content = 'A bare room.'; // no hint to pull
    const events = buildEvents(world, start, lever);
    const result = await smokeTest(events);
    expect(result.issues.some((i) => i.type === 'undiscoverable-verb' && i.verb === 'pull')).toBe(true);
  });

  it('no undiscoverable-verb warning when text hints at the verb', async () => {
    const world = makeWorld();
    const lever = makeFeature('lever', {
      nouns: [['lever']],
      verbs: [['pull']],
      onInteract: [['pull', 'set-state', '']],
      content: 'A rusty lever. You could try to pull it.',
    });
    const start = makePlace('start', { features: [`${WORLD}:feature:lever`] });
    const events = buildEvents(world, start, lever);
    const result = await smokeTest(events);
    expect(result.issues.some((i) => i.type === 'undiscoverable-verb')).toBe(false);
  });

  it('skips common verbs like examine and attack for discoverability', async () => {
    const world = makeWorld();
    const chest = makeFeature('chest', {
      nouns: [['chest']],
      onInteract: [['examine', 'set-state', '']],
      content: 'A wooden chest.',
    });
    const start = makePlace('start', { features: [`${WORLD}:feature:chest`] });
    const events = buildEvents(world, start, chest);
    const result = await smokeTest(events);
    expect(result.issues.some((i) => i.type === 'undiscoverable-verb')).toBe(false);
  });
});
