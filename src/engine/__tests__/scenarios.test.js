/**
 * Tests for scenarios.js — scenario storage, chain resolution, and apply.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadScenarios,
  saveScenarios,
  importScenariosFromData,
  resolveScenario,
  applyScenario,
} from '../scenarios.js';

// ── localStorage mock ─────────────────────────────────────────────────────

const storage = {};
const mockLocalStorage = {
  getItem:    (k) => storage[k] ?? null,
  setItem:    (k, v) => { storage[k] = v; },
  removeItem: (k) => { delete storage[k]; },
  clear:      () => { for (const k of Object.keys(storage)) delete storage[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });

// ── window.location mock ──────────────────────────────────────────────────

const reloadMock = vi.fn();
Object.defineProperty(globalThis, 'window', {
  value: { location: { reload: reloadMock } },
  writable: true,
  configurable: true,
});

// ── Helpers ───────────────────────────────────────────────────────────────

const SLUG = 'test-world';
const STORAGE_KEY = `folklore:scenarios:${SLUG}`;
const PK = '30078:aabbcc1122:test-world';

function makeScenario(id, tags = [], content = '') {
  return {
    tags: [
      ['d', `test-world:scenario:${id}`],
      ['t', 'test-world'],
      ['type', 'scenario'],
      ['title', id],
      ...tags,
    ],
    content,
  };
}

function ref(suffix) {
  return `${PK}:${suffix}`;
}

// ── Storage ───────────────────────────────────────────────────────────────

describe('loadScenarios / saveScenarios', () => {
  beforeEach(() => mockLocalStorage.clear());

  it('returns empty array when nothing stored', () => {
    expect(loadScenarios(SLUG)).toEqual([]);
  });

  it('roundtrips a scenario array', () => {
    const scenarios = [makeScenario('s1'), makeScenario('s2')];
    saveScenarios(SLUG, scenarios);
    expect(loadScenarios(SLUG)).toEqual(scenarios);
  });

  it('uses world-scoped storage key', () => {
    saveScenarios('world-a', [makeScenario('s1')]);
    saveScenarios('world-b', [makeScenario('s2')]);
    expect(loadScenarios('world-a')).toHaveLength(1);
    expect(loadScenarios('world-b')).toHaveLength(1);
    expect(loadScenarios('world-a')[0].tags[0][1]).toBe('test-world:scenario:s1');
  });

  it('returns empty array on corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(loadScenarios(SLUG)).toEqual([]);
  });
});

// ── importScenariosFromData ───────────────────────────────────────────────

describe('importScenariosFromData', () => {
  beforeEach(() => mockLocalStorage.clear());

  it('accepts a plain array', () => {
    const data = [makeScenario('a'), makeScenario('b')];
    const result = importScenariosFromData(SLUG, data);
    expect(result).toHaveLength(2);
    expect(loadScenarios(SLUG)).toHaveLength(2);
  });

  it('accepts { scenarios: [...] } object format', () => {
    const data = { scenarios: [makeScenario('a')] };
    const result = importScenariosFromData(SLUG, data);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for unrecognised format', () => {
    const result = importScenariosFromData(SLUG, { events: [] });
    expect(result).toEqual([]);
  });

  it('overwrites existing scenarios', () => {
    saveScenarios(SLUG, [makeScenario('old')]);
    importScenariosFromData(SLUG, [makeScenario('new')]);
    const stored = loadScenarios(SLUG);
    expect(stored).toHaveLength(1);
    expect(stored[0].tags[0][1]).toBe('test-world:scenario:new');
  });
});

// ── resolveScenario ───────────────────────────────────────────────────────

describe('resolveScenario — no chain', () => {
  it('returns scenario unchanged when no chain tag', () => {
    const s = makeScenario('s1', [['set-state', ref('quest:q1'), 'complete']]);
    expect(resolveScenario(s, [])).toBe(s); // same reference
  });
});

describe('resolveScenario — chain inheritance', () => {
  it('applies base set-state then override', () => {
    const base = makeScenario('base', [
      ['set-state', ref('quest:q1'), 'complete'],
      ['set-state', ref('quest:q2'), 'active'],
    ]);
    const child = makeScenario('child', [
      ['chain', 'test-world:scenario:base'],
      ['set-state', ref('quest:q2'), 'complete'], // override q2
      ['set-state', ref('quest:q3'), 'active'],
    ]);

    const resolved = resolveScenario(child, [base, child]);
    const states = resolved.tags.filter(t => t[0] === 'set-state');

    const stateMap = Object.fromEntries(states.map(t => [t[1], t[2]]));
    expect(stateMap[ref('quest:q1')]).toBe('complete'); // inherited
    expect(stateMap[ref('quest:q2')]).toBe('complete'); // overridden
    expect(stateMap[ref('quest:q3')]).toBe('active');   // child-only
  });

  it('unions give-item from base and child', () => {
    const base = makeScenario('base', [
      ['give-item', ref('item:sword')],
    ]);
    const child = makeScenario('child', [
      ['chain', 'test-world:scenario:base'],
      ['give-item', ref('item:shield')],
    ]);

    const resolved = resolveScenario(child, [base, child]);
    const items = resolved.tags.filter(t => t[0] === 'give-item').map(t => t[1]);
    expect(items).toContain(ref('item:sword'));
    expect(items).toContain(ref('item:shield'));
  });

  it('child place overrides base place', () => {
    const base = makeScenario('base', [['place', ref('place:start')]]);
    const child = makeScenario('child', [
      ['chain', 'test-world:scenario:base'],
      ['place', ref('place:throne')],
    ]);

    const resolved = resolveScenario(child, [base, child]);
    const places = resolved.tags.filter(t => t[0] === 'place');
    expect(places).toHaveLength(1);
    expect(places[0][1]).toBe(ref('place:throne'));
  });

  it('inherits base place when child has none', () => {
    const base = makeScenario('base', [['place', ref('place:start')]]);
    const child = makeScenario('child', [
      ['chain', 'test-world:scenario:base'],
    ]);

    const resolved = resolveScenario(child, [base, child]);
    const places = resolved.tags.filter(t => t[0] === 'place');
    expect(places).toHaveLength(1);
    expect(places[0][1]).toBe(ref('place:start'));
  });

  it('child set-counter overrides base set-counter for same name', () => {
    const base = makeScenario('base', [['set-counter', 'coins', '5']]);
    const child = makeScenario('child', [
      ['chain', 'test-world:scenario:base'],
      ['set-counter', 'coins', '20'],
    ]);

    const resolved = resolveScenario(child, [base, child]);
    const counters = resolved.tags.filter(t => t[0] === 'set-counter');
    expect(counters).toHaveLength(1);
    expect(counters[0][2]).toBe('20');
  });

  it('handles multi-level chains (grandparent → parent → child)', () => {
    const gp = makeScenario('gp', [['set-state', ref('quest:q1'), 'complete']]);
    const parent = makeScenario('parent', [
      ['chain', 'test-world:scenario:gp'],
      ['set-state', ref('quest:q2'), 'complete'],
    ]);
    const child = makeScenario('child', [
      ['chain', 'test-world:scenario:parent'],
      ['set-state', ref('quest:q3'), 'active'],
    ]);

    const resolved = resolveScenario(child, [gp, parent, child]);
    const states = resolved.tags.filter(t => t[0] === 'set-state');
    const stateMap = Object.fromEntries(states.map(t => [t[1], t[2]]));
    expect(stateMap[ref('quest:q1')]).toBe('complete');
    expect(stateMap[ref('quest:q2')]).toBe('complete');
    expect(stateMap[ref('quest:q3')]).toBe('active');
  });

  it('stops at depth 5 to prevent infinite loops', () => {
    // Each scenario chains to the next — only 6 levels, hits depth limit at 5
    const scenarios = Array.from({ length: 7 }, (_, i) =>
      makeScenario(`s${i}`, i < 6 ? [['chain', `test-world:scenario:s${i + 1}`]] : [])
    );
    // Should not throw
    expect(() => resolveScenario(scenarios[0], scenarios)).not.toThrow();
  });

  it('ignores chain ref that does not exist in allScenarios', () => {
    const s = makeScenario('s', [
      ['chain', 'test-world:scenario:nonexistent'],
      ['set-state', ref('quest:q1'), 'active'],
    ]);
    const resolved = resolveScenario(s, [s]);
    // Falls through — returns original scenario unchanged
    expect(resolved).toBe(s);
  });
});

// ── applyScenario ─────────────────────────────────────────────────────────

describe('applyScenario', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    reloadMock.mockClear();
  });

  function getWrittenPlayer() {
    const raw = mockLocalStorage.getItem(SLUG);
    return JSON.parse(raw)?.player;
  }

  it('writes fresh player state to localStorage', () => {
    const s = makeScenario('s1');
    applyScenario(s, SLUG);
    const player = getWrittenPlayer();
    expect(player).toBeDefined();
    expect(player.inventory).toEqual([]);
    expect(player.states).toEqual({});
    expect(player.counters).toEqual({});
  });

  it('calls window.location.reload()', () => {
    applyScenario(makeScenario('s1'), SLUG);
    expect(reloadMock).toHaveBeenCalledOnce();
  });

  it('sets player.place from place tag', () => {
    const placeRef = ref('place:callows-court');
    const s = makeScenario('s1', [['place', placeRef]]);
    applyScenario(s, SLUG);
    expect(getWrittenPlayer().place).toBe(placeRef);
  });

  it('populates player.states from set-state tags', () => {
    const q1 = ref('quest:callow-job-1');
    const q2 = ref('quest:callow-job-2');
    const s = makeScenario('s1', [
      ['set-state', q1, 'complete'],
      ['set-state', q2, 'active'],
    ]);
    applyScenario(s, SLUG);
    const { states } = getWrittenPlayer();
    expect(states[q1]).toBe('complete');
    expect(states[q2]).toBe('active');
  });

  it('populates player.inventory from give-item tags', () => {
    const item1 = ref('item:wallet');
    const item2 = ref('item:ticket');
    const s = makeScenario('s1', [
      ['give-item', item1],
      ['give-item', item2],
    ]);
    applyScenario(s, SLUG);
    expect(getWrittenPlayer().inventory).toEqual([item1, item2]);
  });

  it('does not duplicate items', () => {
    const item = ref('item:wallet');
    const s = makeScenario('s1', [
      ['give-item', item],
      ['give-item', item],
    ]);
    applyScenario(s, SLUG);
    expect(getWrittenPlayer().inventory).toHaveLength(1);
  });

  it('sets world-scoped counters from set-counter tags', () => {
    const s = makeScenario('s1', [
      ['set-counter', 'coins', '12'],
      ['set-counter', 'score', '5'],
    ]);
    applyScenario(s, SLUG);
    const { counters } = getWrittenPlayer();
    expect(counters[`${SLUG}:coins`]).toBe(12);
    expect(counters[`${SLUG}:score`]).toBe(5);
  });

  it('treats non-numeric counter value as 0', () => {
    const s = makeScenario('s1', [['set-counter', 'coins', 'notanumber']]);
    applyScenario(s, SLUG);
    expect(getWrittenPlayer().counters[`${SLUG}:coins`]).toBe(0);
  });

  it('resolves <PUBKEY> placeholder in refs when pubkey provided', () => {
    const REAL_PK = 'abc123def456';
    const s = makeScenario('s1', [
      ['place', '30078:<PUBKEY>:test-world:place:start'],
      ['set-state', '30078:<PUBKEY>:test-world:quest:q1', 'active'],
      ['give-item', '30078:<PUBKEY>:test-world:item:sword'],
      ['set-counter', 'coins', '5'],
    ]);
    applyScenario(s, SLUG, [], REAL_PK);
    const player = getWrittenPlayer();
    expect(player.place).toBe(`30078:${REAL_PK}:test-world:place:start`);
    expect(player.states[`30078:${REAL_PK}:test-world:quest:q1`]).toBe('active');
    expect(player.inventory[0]).toBe(`30078:${REAL_PK}:test-world:item:sword`);
  });

  it('leaves refs unchanged when no pubkey provided', () => {
    const s = makeScenario('s1', [
      ['place', '30078:<PUBKEY>:test-world:place:start'],
    ]);
    applyScenario(s, SLUG);
    expect(getWrittenPlayer().place).toBe('30078:<PUBKEY>:test-world:place:start');
  });

  it('resolves chain before applying', () => {
    const base = makeScenario('base', [
      ['set-state', ref('quest:q1'), 'complete'],
      ['set-counter', 'coins', '5'],
    ]);
    const child = makeScenario('child', [
      ['chain', 'test-world:scenario:base'],
      ['set-state', ref('quest:q2'), 'active'],
      ['set-counter', 'coins', '10'], // override
    ]);
    applyScenario(child, SLUG, [base, child]);
    const player = getWrittenPlayer();
    expect(player.states[ref('quest:q1')]).toBe('complete');
    expect(player.states[ref('quest:q2')]).toBe('active');
    expect(player.counters[`${SLUG}:coins`]).toBe(10);
  });

  it('starts fresh — does not inherit prior player state', () => {
    // Write dirty state first
    mockLocalStorage.setItem(SLUG, JSON.stringify({
      player: { place: ref('place:old'), states: { x: 'seen' }, inventory: ['old'], counters: {} },
      'some-npc': { health: 3 },
    }));
    const s = makeScenario('s1', [['place', ref('place:new')]]);
    applyScenario(s, SLUG);
    const raw = JSON.parse(mockLocalStorage.getItem(SLUG));
    // Only player key — no NPC state carried over
    expect(Object.keys(raw)).toEqual(['player']);
    expect(raw.player.place).toBe(ref('place:new'));
    expect(raw.player.inventory).toEqual([]);
    expect(raw.player.states).toEqual({});
  });
});
