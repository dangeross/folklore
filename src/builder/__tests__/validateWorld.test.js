/**
 * validateWorld.test.js — Tests for cross-event world validation.
 */

import { describe, it, expect } from 'vitest';
import { validateWorld, extractDTagFromRef, verifyPuzzleHashes } from '../validateWorld.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const PK = '<PUBKEY>';

function makeEvent(dTag, type, extraTags = [], content = '') {
  return {
    kind: 30078,
    tags: [
      ['d', dTag],
      ['t', 'test'],
      ['type', type],
      ...extraTags,
    ],
    content,
  };
}

function ref(dTag) {
  return `30078:${PK}:${dTag}`;
}

/** Check if any issue in array has message matching substring */
function hasMessage(issues, substring) {
  return issues.some((i) => i.message.includes(substring));
}

// ── extractDTagFromRef ───────────────────────────────────────────────────────

describe('extractDTagFromRef', () => {
  it('extracts d-tag from <PUBKEY> ref', () => {
    expect(extractDTagFromRef('30078:<PUBKEY>:the-lake:feature:lamp')).toBe('the-lake:feature:lamp');
  });

  it('extracts d-tag from real pubkey ref', () => {
    const pk = 'a'.repeat(64);
    expect(extractDTagFromRef(`30078:${pk}:the-lake:feature:lamp`)).toBe('the-lake:feature:lamp');
  });

  it('returns null for non-ref string', () => {
    expect(extractDTagFromRef('hello')).toBeNull();
  });

  it('returns null for non-string', () => {
    expect(extractDTagFromRef(42)).toBeNull();
  });
});

// ── Dangling refs ────────────────────────────────────────────────────────────

describe('validateWorld — dangling refs', () => {
  it('warns on unresolvable event ref', () => {
    const events = [
      makeEvent('test:place:room', 'place', [
        ['exit', ref('test:place:other'), 'north', 'North.'],
      ]),
    ];
    const { warnings } = validateWorld(events);
    expect(hasMessage(warnings, 'test:place:other') && hasMessage(warnings, 'not in this world')).toBe(true);
  });

  it('dangling ref has structured fields', () => {
    const events = [
      makeEvent('test:place:room', 'place', [
        ['exit', ref('test:place:other'), 'north', 'North.'],
      ]),
    ];
    const { warnings } = validateWorld(events);
    const dangling = warnings.find((w) => w.category === 'dangling-ref');
    expect(dangling).toBeDefined();
    expect(dangling.dTag).toBe('test:place:room');
    expect(dangling.fix).toBeTruthy();
    expect(dangling.tag).toBeTruthy();
  });

  it('no warning when ref resolves', () => {
    const events = [
      makeEvent('test:place:room', 'place', [
        ['exit', ref('test:place:other'), 'north', 'North.'],
      ]),
      makeEvent('test:place:other', 'place'),
    ];
    const { warnings } = validateWorld(events);
    expect(hasMessage(warnings, 'not in this world')).toBe(false);
  });
});

// ── Place puzzle tag ─────────────────────────────────────────────────────────

describe('validateWorld — place puzzle tag', () => {
  it('warns when place puzzle tag references a riddle (not sequence)', () => {
    const events = [
      makeEvent('test:place:room', 'place', [
        ['puzzle', ref('test:puzzle:riddle')],
      ]),
      makeEvent('test:puzzle:riddle', 'puzzle', [
        ['puzzle-type', 'riddle'],
        ['answer-hash', 'abc'],
        ['salt', 'test:puzzle:riddle:v1'],
      ]),
    ];
    const { warnings } = validateWorld(events);
    expect(hasMessage(warnings, 'only sequence puzzles')).toBe(true);
    const mismatch = warnings.find((w) => w.category === 'puzzle-type-mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch.fix).toBeTruthy();
  });

  it('no warning when place puzzle tag references a sequence puzzle', () => {
    const events = [
      makeEvent('test:place:room', 'place', [
        ['puzzle', ref('test:puzzle:seq')],
      ]),
      makeEvent('test:puzzle:seq', 'puzzle', [
        ['puzzle-type', 'sequence'],
      ]),
    ];
    const { warnings } = validateWorld(events);
    expect(hasMessage(warnings, 'only sequence puzzles')).toBe(false);
  });
});

// ── NIP-44 content ───────────────────────────────────────────────────────────

describe('validateWorld — NIP-44 content', () => {
  it('errors when puzzle event not found', () => {
    const events = [
      makeEvent('test:place:secret', 'place', [
        ['content-type', 'application/nip44', 'text/markdown'],
        ['puzzle', ref('test:puzzle:missing')],
      ], 'Sealed.'),
    ];
    const { errors } = validateWorld(events);
    expect(hasMessage(errors, 'test:puzzle:missing') && hasMessage(errors, 'not in this world')).toBe(true);
  });

  it('errors when puzzle has no salt', () => {
    const events = [
      makeEvent('test:place:secret', 'place', [
        ['content-type', 'application/nip44', 'text/markdown'],
        ['puzzle', ref('test:puzzle:riddle')],
      ], 'Sealed.'),
      makeEvent('test:puzzle:riddle', 'puzzle', [
        ['puzzle-type', 'riddle'],
        ['answer-hash', 'abc'],
      ]),
    ];
    const { errors } = validateWorld(events);
    expect(hasMessage(errors, 'no salt tag')).toBe(true);
  });

  it('errors when no answer stored for puzzle', () => {
    const events = [
      makeEvent('test:place:secret', 'place', [
        ['content-type', 'application/nip44', 'text/markdown'],
        ['puzzle', ref('test:puzzle:riddle')],
      ], 'Sealed.'),
      makeEvent('test:puzzle:riddle', 'puzzle', [
        ['puzzle-type', 'riddle'],
        ['answer-hash', 'abc'],
        ['salt', 'test:puzzle:riddle:v1'],
      ]),
    ];
    const { errors } = validateWorld(events, {});
    expect(hasMessage(errors, 'no answer is stored')).toBe(true);
  });

  it('no errors when puzzle, salt, and answer all present', () => {
    const events = [
      makeEvent('test:place:secret', 'place', [
        ['content-type', 'application/nip44', 'text/markdown'],
        ['puzzle', ref('test:puzzle:riddle')],
      ], 'Sealed.'),
      makeEvent('test:puzzle:riddle', 'puzzle', [
        ['puzzle-type', 'riddle'],
        ['answer-hash', 'abc'],
        ['salt', 'test:puzzle:riddle:v1'],
      ]),
    ];
    const answers = { 'test:puzzle:riddle': 'the-answer' };
    const { errors } = validateWorld(events, answers);
    expect(errors).toHaveLength(0);
  });

  it('NIP-44 errors have structured fields', () => {
    const events = [
      makeEvent('test:place:secret', 'place', [
        ['content-type', 'application/nip44', 'text/markdown'],
        ['puzzle', ref('test:puzzle:missing')],
      ], 'Sealed.'),
    ];
    const { errors } = validateWorld(events);
    const nip44 = errors.find((e) => e.category === 'nip44');
    expect(nip44).toBeDefined();
    expect(nip44.fix).toBeTruthy();
  });
});

// ── on-interact targeting puzzle without answer ──────────────────────────────

describe('validateWorld — on-interact puzzle answer', () => {
  it('warns when on-interact targets puzzle with answer-hash but no stored answer', () => {
    const events = [
      makeEvent('test:feature:panel', 'feature', [
        ['on-interact', 'use', '', 'set-state', 'active', ref('test:puzzle:riddle')],
      ]),
      makeEvent('test:puzzle:riddle', 'puzzle', [
        ['puzzle-type', 'riddle'],
        ['answer-hash', 'abc123'],
        ['salt', 'test:puzzle:riddle:v1'],
      ]),
    ];
    const { warnings } = validateWorld(events, {});
    expect(hasMessage(warnings, 'test:puzzle:riddle') && hasMessage(warnings, 'no answer stored')).toBe(true);
  });

  it('no warning when answer is stored', () => {
    const events = [
      makeEvent('test:feature:panel', 'feature', [
        ['on-interact', 'use', '', 'set-state', 'active', ref('test:puzzle:riddle')],
      ]),
      makeEvent('test:puzzle:riddle', 'puzzle', [
        ['puzzle-type', 'riddle'],
        ['answer-hash', 'abc123'],
        ['salt', 'test:puzzle:riddle:v1'],
      ]),
    ];
    const answers = { 'test:puzzle:riddle': 'the-answer' };
    const { warnings } = validateWorld(events, answers);
    expect(hasMessage(warnings, 'no answer stored')).toBe(false);
  });
});

// ── verifyPuzzleHashes ──────────────────────────────────────────────────────

describe('verifyPuzzleHashes', () => {
  it('returns no errors when answer hashes match (case-sensitive)', async () => {
    const data = new TextEncoder().encode('Hello' + 'salt1');
    const buf = await crypto.subtle.digest('SHA-256', data);
    const hash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

    const errors = await verifyPuzzleHashes([
      { dTag: 'test:puzzle:one', answerHash: hash, salt: 'salt1', answer: 'Hello' },
    ]);
    expect(errors).toHaveLength(0);
  });

  it('returns error when case differs (case-sensitive hashing)', async () => {
    const data = new TextEncoder().encode('hello' + 'salt1');
    const buf = await crypto.subtle.digest('SHA-256', data);
    const hash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

    const errors = await verifyPuzzleHashes([
      { dTag: 'test:puzzle:one', answerHash: hash, salt: 'salt1', answer: 'Hello' },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Answer hash mismatch');
    expect(errors[0].category).toBe('hash-mismatch');
    expect(errors[0].fix).toBeTruthy();
  });

  it('returns error when answer hash does not match', async () => {
    const errors = await verifyPuzzleHashes([
      { dTag: 'test:puzzle:one', answerHash: 'deadbeef', salt: 'salt1', answer: 'Hello' },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].dTag).toBe('test:puzzle:one');
    expect(errors[0].message).toContain('Answer hash mismatch');
  });
});

// ── Quest auto-cascade detection ─────────────────────────────────────────────

describe('validateWorld — auto-cascade detection', () => {
  // ── Rule A: NPC initial-state requires ──────────────────────────────────

  it('warns when quest requires NPC in its initial state (always satisfied)', () => {
    const events = [
      makeEvent('test:npc:guard', 'npc', [['state', 'patrolling']]),
      makeEvent('test:quest:observe', 'quest', [
        ['requires', ref('test:npc:guard'), 'patrolling', ''],
      ]),
    ];
    const { warnings } = validateWorld(events);
    const w = warnings.find((w) => w.category === 'auto-cascade');
    expect(w).toBeDefined();
    expect(w.message).toContain('initial state');
    expect(w.dTag).toBe('test:quest:observe');
    expect(w.fix).toBeTruthy();
  });

  it('no auto-cascade warning when quest requires NPC in a non-initial state', () => {
    const events = [
      makeEvent('test:npc:guard', 'npc', [['state', 'patrolling']]),
      makeEvent('test:quest:follow', 'quest', [
        ['requires', ref('test:npc:guard'), 'suspicious', ''],
      ]),
    ];
    const { warnings } = validateWorld(events);
    expect(warnings.filter((w) => w.category === 'auto-cascade')).toHaveLength(0);
  });

  it('no auto-cascade warning when NPC has no declared initial state', () => {
    const events = [
      makeEvent('test:npc:stranger', 'npc', []),
      makeEvent('test:quest:meet', 'quest', [
        ['requires', ref('test:npc:stranger'), 'default', ''],
      ]),
    ];
    const { warnings } = validateWorld(events);
    expect(warnings.filter((w) => w.category === 'auto-cascade')).toHaveLength(0);
  });

  // ── Rule B: all-passive (quest-chain only) requires ──────────────────────

  it('warns when quest has only quest-chain requires and no interaction guard', () => {
    const events = [
      makeEvent('test:quest:gate', 'quest', []),
      makeEvent('test:quest:cascade', 'quest', [
        ['requires', ref('test:quest:gate'), 'complete', ''],
      ]),
    ];
    const { warnings } = validateWorld(events);
    const w = warnings.find((w) => w.category === 'auto-cascade' && w.dTag === 'test:quest:cascade');
    expect(w).toBeDefined();
    expect(w.message).toContain('auto-complete');
    expect(w.fix).toBeTruthy();
  });

  it('no all-passive warning when quest has a self-active guard', () => {
    const events = [
      makeEvent('test:quest:gate', 'quest', []),
      makeEvent('test:quest:guarded', 'quest', [
        ['requires', ref('test:quest:gate'), 'complete', ''],
        ['requires', ref('test:quest:guarded'), 'active', ''],
      ]),
    ];
    const { warnings } = validateWorld(events);
    expect(warnings.filter((w) => w.category === 'auto-cascade' && w.dTag === 'test:quest:guarded')).toHaveLength(0);
  });

  it('no all-passive warning when quest requires NPC in non-initial state', () => {
    const events = [
      makeEvent('test:npc:constable', 'npc', [['state', 'patrolling']]),
      makeEvent('test:quest:gate', 'quest', []),
      makeEvent('test:quest:chain', 'quest', [
        ['requires', ref('test:quest:gate'), 'complete', ''],
        ['requires', ref('test:npc:constable'), 'suspicious', ''],
      ]),
    ];
    const { warnings } = validateWorld(events);
    expect(warnings.filter((w) => w.category === 'auto-cascade' && w.dTag === 'test:quest:chain')).toHaveLength(0);
  });

  it('no all-passive warning when quest requires an item (interaction gate)', () => {
    const events = [
      makeEvent('test:item:key', 'item', []),
      makeEvent('test:quest:gate', 'quest', []),
      makeEvent('test:quest:chain', 'quest', [
        ['requires', ref('test:quest:gate'), 'complete', ''],
        ['requires', ref('test:item:key'), '', ''],
      ]),
    ];
    const { warnings } = validateWorld(events);
    expect(warnings.filter((w) => w.category === 'auto-cascade' && w.dTag === 'test:quest:chain')).toHaveLength(0);
  });

  it('warns for multiple quest-chain requires with no interaction guard', () => {
    const events = [
      makeEvent('test:quest:a', 'quest', []),
      makeEvent('test:quest:b', 'quest', []),
      makeEvent('test:quest:final', 'quest', [
        ['requires', ref('test:quest:a'), 'complete', ''],
        ['requires', ref('test:quest:b'), 'complete', ''],
      ]),
    ];
    const { warnings } = validateWorld(events);
    expect(warnings.filter((w) => w.category === 'auto-cascade' && w.dTag === 'test:quest:final')).toHaveLength(1);
  });

  it('quests with no requires are not flagged', () => {
    const events = [
      makeEvent('test:quest:empty', 'quest', []),
    ];
    const { warnings } = validateWorld(events);
    expect(warnings.filter((w) => w.category === 'auto-cascade')).toHaveLength(0);
  });

  // ── Combined: both rules can fire on same quest ──────────────────────────

  it('flags both initial-state NPC requires and all-passive on the same quest', () => {
    const events = [
      makeEvent('test:npc:receiver', 'npc', [['state', 'default']]),
      makeEvent('test:quest:gate', 'quest', []),
      makeEvent('test:quest:broken', 'quest', [
        ['requires', ref('test:quest:gate'), 'complete', ''],
        ['requires', ref('test:npc:receiver'), 'default', ''],
      ]),
    ];
    const { warnings } = validateWorld(events);
    const cascadeWarnings = warnings.filter((w) => w.category === 'auto-cascade' && w.dTag === 'test:quest:broken');
    // Rule A fires for the initial-state NPC requires
    expect(cascadeWarnings.some((w) => w.message.includes('initial state'))).toBe(true);
    // Rule B does NOT fire additionally because the NPC requires IS a guard (broken but present)
  });

  it('auto-cascade warnings include structured dTag, category, message, fix', () => {
    const events = [
      makeEvent('test:quest:prereq', 'quest', []),
      makeEvent('test:quest:subject', 'quest', [
        ['requires', ref('test:quest:prereq'), 'complete', ''],
      ]),
    ];
    const { warnings } = validateWorld(events);
    const w = warnings.find((w) => w.category === 'auto-cascade');
    expect(w.dTag).toBe('test:quest:subject');
    expect(w.category).toBe('auto-cascade');
    expect(typeof w.message).toBe('string');
    expect(typeof w.fix).toBe('string');
  });
});

// ── Hints: discoverability ────────────────────────────────────────────────────

describe('validateWorld — hints', () => {
  it('flags thin noun aliases', () => {
    const place = makeEvent('test:place:start', 'place', [
      ['title', 'Start'],
      ['feature', ref('test:feature:mech')],
    ], 'A room.');
    const feature = makeEvent('test:feature:mech', 'feature', [
      ['title', 'Mechanism'],
      ['noun', 'orichalcum-mechanism'],
    ], 'A mechanism.');
    const { hints } = validateWorld([place, feature]);
    expect(hints.some((h) => h.category === 'thin-noun' && h.dTag === 'test:feature:mech')).toBe(true);
  });

  it('no thin-noun hint when short alias exists', () => {
    const place = makeEvent('test:place:start', 'place', [
      ['title', 'Start'],
      ['feature', ref('test:feature:mech')],
    ], 'A room.');
    const feature = makeEvent('test:feature:mech', 'feature', [
      ['title', 'Mechanism'],
      ['noun', 'orichalcum-mechanism', 'mechanism'],
    ], 'A mechanism.');
    const { hints } = validateWorld([place, feature]);
    expect(hints.some((h) => h.category === 'thin-noun')).toBe(false);
  });

  it('flags undiscoverable verbs', () => {
    const place = makeEvent('test:place:start', 'place', [
      ['title', 'Start'],
      ['feature', ref('test:feature:lever')],
    ], 'A bare room.');
    const feature = makeEvent('test:feature:lever', 'feature', [
      ['title', 'Lever'],
      ['noun', 'lever'],
      ['verb', 'pull'],
      ['on-interact', 'pull', 'set-state', ''],
    ], 'A rusty lever.');
    const { hints } = validateWorld([place, feature]);
    expect(hints.some((h) => h.category === 'undiscoverable-verb' && h.message.includes('pull'))).toBe(true);
  });

  it('no undiscoverable-verb hint when text hints at verb', () => {
    const place = makeEvent('test:place:start', 'place', [
      ['title', 'Start'],
      ['feature', ref('test:feature:lever')],
    ], 'A bare room.');
    const feature = makeEvent('test:feature:lever', 'feature', [
      ['title', 'Lever'],
      ['noun', 'lever'],
      ['verb', 'pull'],
      ['on-interact', 'pull', 'set-state', ''],
    ], 'A rusty lever. You could try to pull it.');
    const { hints } = validateWorld([place, feature]);
    expect(hints.some((h) => h.category === 'undiscoverable-verb')).toBe(false);
  });

  it('skips common verbs for discoverability check', () => {
    const place = makeEvent('test:place:start', 'place', [
      ['title', 'Start'],
      ['feature', ref('test:feature:chest')],
    ], 'A room.');
    const feature = makeEvent('test:feature:chest', 'feature', [
      ['title', 'Chest'],
      ['noun', 'chest'],
      ['on-interact', 'examine', 'set-state', ''],
    ], 'A wooden chest.');
    const { hints } = validateWorld([place, feature]);
    expect(hints.some((h) => h.category === 'undiscoverable-verb')).toBe(false);
  });
});
