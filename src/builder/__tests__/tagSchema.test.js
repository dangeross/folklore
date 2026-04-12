/**
 * tagSchema.test.js — Tests for tag schema completeness and conversion functions.
 *
 * Verifies that TAG_SCHEMAS and TAGS_BY_EVENT_TYPE cover all spec-defined
 * tags and event types, and that valuesToTag / tagToValues round-trip correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  TAG_SCHEMAS,
  TAGS_BY_EVENT_TYPE,
  TRIGGER_ACTIONS,
  getTagSchema,
  valuesToTag,
  tagToValues,
} from '../tagSchema.js';

// ── Spec-defined event types ────────────────────────────────────────────────

const SPEC_EVENT_TYPES = [
  'place', 'portal', 'item', 'feature', 'clue', 'puzzle', 'recipe',
  'payment', 'npc', 'dialogue', 'consequence', 'world', 'vouch', 'quest',
];

describe('TAGS_BY_EVENT_TYPE completeness', () => {
  it('has an entry for every spec-defined event type', () => {
    for (const type of SPEC_EVENT_TYPES) {
      expect(TAGS_BY_EVENT_TYPE).toHaveProperty(type);
      expect(Array.isArray(TAGS_BY_EVENT_TYPE[type])).toBe(true);
    }
  });

  it('all referenced tag names exist in TAG_SCHEMAS', () => {
    for (const [eventType, tags] of Object.entries(TAGS_BY_EVENT_TYPE)) {
      for (const tagName of tags) {
        expect(TAG_SCHEMAS, `TAG_SCHEMAS missing '${tagName}' (used by ${eventType})`).toHaveProperty(tagName);
      }
    }
  });
});

// ── Spec-defined type options ───────────────────────────────────────────────

describe('type tag options', () => {
  it('includes all spec-defined event types', () => {
    const typeSchema = TAG_SCHEMAS.type;
    const options = typeSchema.fields[0].options;
    for (const type of SPEC_EVENT_TYPES) {
      expect(options, `type options missing '${type}'`).toContain(type);
    }
  });
});

// ── Spec-defined action types ───────────────────────────────────────────────

const SPEC_ACTION_TYPES = [
  'set-state', 'traverse', 'give-item', 'consume-item',
  'deal-damage', 'deal-damage-npc', 'heal', 'consequence',
  'steals-item', 'deposits', 'flees',
  'add-counter', 'sub-counter', 'mul-counter', 'div-counter', 'set-counter',
  'decrement', 'increment', // deprecated
  'sound', 'activate', 'start-dialogue',
];

describe('action type options on triggers', () => {
  const triggerTags = [
    'on-interact', 'on-enter', 'on-encounter', 'on-attacked',
    'on-health', 'on-player-health', 'on-move', 'on-counter', 'on-complete',
  ];

  for (const tagName of triggerTags) {
    it(`${tagName} action options match TRIGGER_ACTIONS matrix`, () => {
      const schema = TAG_SCHEMAS[tagName];
      expect(schema).toBeDefined();
      const actionField = schema.fields.find((f) => f.name === 'action');
      expect(actionField).toBeDefined();
      const expected = TRIGGER_ACTIONS[tagName];
      expect(expected, `TRIGGER_ACTIONS missing '${tagName}'`).toBeDefined();
      expect(actionField.options).toEqual(expected);
    });

    it(`${tagName} action options are all valid spec action types`, () => {
      const schema = TAG_SCHEMAS[tagName];
      const actionField = schema.fields.find((f) => f.name === 'action');
      for (const action of actionField.options) {
        expect(SPEC_ACTION_TYPES, `'${action}' on ${tagName} is not a spec action type`).toContain(action);
      }
    });
  }

  it('TRIGGER_ACTIONS covers all trigger tags', () => {
    for (const tagName of triggerTags) {
      expect(TRIGGER_ACTIONS).toHaveProperty(tagName);
    }
  });

  it('every action in TRIGGER_ACTIONS is a valid spec action type', () => {
    for (const [trigger, actions] of Object.entries(TRIGGER_ACTIONS)) {
      for (const action of actions) {
        expect(SPEC_ACTION_TYPES, `'${action}' in ${trigger} is not a spec action type`).toContain(action);
      }
    }
  });
});

// ── Spec-required tags per event type ───────────────────────────────────────

describe('place tags', () => {
  const placeTags = TAGS_BY_EVENT_TYPE.place;
  it.each([
    'title', 'content-type', 'exit', 'item', 'feature', 'npc', 'clue',
    'noun', 'state', 'transition', 'requires', 'requires-not',
    'on-enter', 'on-player-health', 'media', 'cw', 'puzzle',
  ])('includes %s', (tag) => {
    expect(placeTags).toContain(tag);
  });
});

describe('portal tags', () => {
  const portalTags = TAGS_BY_EVENT_TYPE.portal;
  it.each(['exit', 'state', 'transition', 'requires', 'requires-not', 'consequence', 'cw'])(
    'includes %s', (tag) => { expect(portalTags).toContain(tag); }
  );
});

describe('npc tags', () => {
  const npcTags = TAGS_BY_EVENT_TYPE.npc;
  it.each([
    'title', 'noun', 'verb', 'state', 'transition', 'dialogue',
    'on-interact', 'on-encounter', 'on-attacked', 'on-health',
    'on-player-health', 'on-enter', 'on-move', 'on-counter', 'counter',
    'speed', 'order', 'route', 'stash', 'roams-when', 'inventory',
    'health', 'damage', 'hit-chance', 'requires', 'requires-not',
  ])('includes %s', (tag) => {
    expect(npcTags).toContain(tag);
  });
});

describe('consequence tags', () => {
  const cTags = TAGS_BY_EVENT_TYPE.consequence;
  it.each(['respawn', 'clears', 'give-item', 'consume-item', 'deal-damage'])(
    'includes %s', (tag) => { expect(cTags).toContain(tag); }
  );
});

describe('vouch tags', () => {
  const vTags = TAGS_BY_EVENT_TYPE.vouch;
  it.each(['pubkey', 'scope', 'can-vouch'])(
    'includes %s', (tag) => { expect(vTags).toContain(tag); }
  );
});

describe('quest tags', () => {
  const qTags = TAGS_BY_EVENT_TYPE.quest;
  it.each(['title', 'involves', 'requires', 'requires-not'])(
    'includes %s', (tag) => { expect(qTags).toContain(tag); }
  );
});

// ── Tag shape: field counts ─────────────────────────────────────────────────

describe('tag shapes', () => {
  it('requires has 3 fields (ref, state, desc)', () => {
    expect(TAG_SCHEMAS.requires.fields).toHaveLength(3);
  });

  it('on-interact has 5 fields (verb, state-guard, action, target, event-ref)', () => {
    expect(TAG_SCHEMAS['on-interact'].fields).toHaveLength(5);
  });

  it('on-enter has 5 fields (trigger, state-guard, action, target, event-ref)', () => {
    expect(TAG_SCHEMAS['on-enter'].fields).toHaveLength(5);
  });

  it('on-counter has 5 fields (direction, counter, threshold, action, target)', () => {
    expect(TAG_SCHEMAS['on-counter'].fields).toHaveLength(5);
  });

  it('content-type has 2 fields (value, plaintext-format)', () => {
    expect(TAG_SCHEMAS['content-type'].fields).toHaveLength(2);
  });

  it('transition has 3 fields (from, to, text)', () => {
    expect(TAG_SCHEMAS.transition.fields).toHaveLength(3);
  });

  it('exit has place variant with 1 field and portal variant with 3 fields', () => {
    expect(TAG_SCHEMAS.exit.variants.place.fields).toHaveLength(1);
    expect(TAG_SCHEMAS.exit.variants.portal.fields).toHaveLength(3);
  });

  it('colour has 2 fields (slot, hex)', () => {
    expect(TAG_SCHEMAS.colour.fields).toHaveLength(2);
  });
});

// ── getTagSchema variant resolution ─────────────────────────────────────────

describe('getTagSchema', () => {
  it('returns place variant for exit on place', () => {
    const schema = getTagSchema('exit', 'place');
    expect(schema.fields).toHaveLength(1);
    expect(schema.fields[0].name).toBe('slot');
  });

  it('returns portal variant for exit on portal', () => {
    const schema = getTagSchema('exit', 'portal');
    expect(schema.fields).toHaveLength(3);
    expect(schema.fields[0].name).toBe('place-ref');
  });

  it('returns non-variant schema as-is', () => {
    const schema = getTagSchema('title', 'place');
    expect(schema.fields).toHaveLength(1);
    expect(schema.fields[0].name).toBe('value');
  });

  it('returns null for unknown tag', () => {
    expect(getTagSchema('nonexistent', 'place')).toBeNull();
  });
});

// ── valuesToTag / tagToValues round-trip ─────────────────────────────────────

describe('valuesToTag', () => {
  it('builds a simple tag', () => {
    const fields = TAG_SCHEMAS.title.fields;
    const tag = valuesToTag('title', { value: 'The Cave' }, fields);
    expect(tag).toEqual(['title', 'The Cave']);
  });

  it('builds a multi-field tag', () => {
    const fields = TAG_SCHEMAS.transition.fields;
    const tag = valuesToTag('transition', { from: 'off', to: 'on', text: 'It lights up.' }, fields);
    expect(tag).toEqual(['transition', 'off', 'on', 'It lights up.']);
  });

  it('builds a tag with aliases', () => {
    const fields = TAG_SCHEMAS.noun.fields;
    const tag = valuesToTag('noun', { canonical: 'key', aliases: 'iron key, rusty key' }, fields);
    expect(tag).toEqual(['noun', 'key', 'iron key', 'rusty key']);
  });

  it('handles empty optional fields', () => {
    const fields = TAG_SCHEMAS.requires.fields;
    const tag = valuesToTag('requires', { ref: '30078:abc:item', state: '', desc: '' }, fields);
    expect(tag).toEqual(['requires', '30078:abc:item', '', '']);
  });

  it('builds on-interact with external event-ref', () => {
    const fields = TAG_SCHEMAS['on-interact'].fields;
    const tag = valuesToTag('on-interact', {
      verb: 'insert',
      'state-guard': '',
      action: 'set-state',
      target: 'amulet-placed',
      'event-ref': '30078:abc:feature:mechanism',
    }, fields);
    expect(tag).toEqual(['on-interact', 'insert', '', 'set-state', 'amulet-placed', '30078:abc:feature:mechanism']);
  });

  it('builds content-type with plaintext format', () => {
    const fields = TAG_SCHEMAS['content-type'].fields;
    const tag = valuesToTag('content-type', { value: 'application/nip44', 'plaintext-format': 'text/markdown' }, fields);
    expect(tag).toEqual(['content-type', 'application/nip44', 'text/markdown']);
  });
});

describe('tagToValues', () => {
  it('parses a simple tag', () => {
    const fields = TAG_SCHEMAS.title.fields;
    const values = tagToValues(['title', 'The Cave'], fields);
    expect(values).toEqual({ value: 'The Cave' });
  });

  it('parses a multi-field tag', () => {
    const fields = TAG_SCHEMAS.transition.fields;
    const values = tagToValues(['transition', 'off', 'on', 'It lights up.'], fields);
    expect(values).toEqual({ from: 'off', to: 'on', text: 'It lights up.' });
  });

  it('parses a tag with aliases', () => {
    const fields = TAG_SCHEMAS.noun.fields;
    const values = tagToValues(['noun', 'key', 'iron key', 'rusty key'], fields);
    expect(values).toEqual({ canonical: 'key', aliases: 'iron key, rusty key' });
  });

  it('handles missing optional trailing fields', () => {
    const fields = TAG_SCHEMAS.requires.fields;
    const values = tagToValues(['requires', '30078:abc:item'], fields);
    expect(values.ref).toBe('30078:abc:item');
    expect(values.state).toBe('');
    expect(values.desc).toBe('');
  });

  it('parses on-interact with external event-ref', () => {
    const fields = TAG_SCHEMAS['on-interact'].fields;
    const values = tagToValues(
      ['on-interact', 'insert', '', 'set-state', 'amulet-placed', '30078:abc:feature:mechanism'],
      fields
    );
    expect(values).toEqual({
      verb: 'insert',
      'state-guard': '',
      action: 'set-state',
      target: 'amulet-placed',
      'event-ref': '30078:abc:feature:mechanism',
    });
  });
});

// ── Round-trip ───────────────────────────────────────────────────────────────

describe('round-trip valuesToTag -> tagToValues', () => {
  const testCases = [
    { tagName: 'title', values: { value: 'My Place' } },
    { tagName: 'transition', values: { from: 'locked', to: 'open', text: 'The gate swings open.' } },
    { tagName: 'counter', values: { name: 'battery', initial: '300' } },
    { tagName: 'requires', values: { ref: '30078:pk:item:key', state: 'held', desc: 'You need the key.' } },
    { tagName: 'colour', values: { slot: 'bg', hex: '#1a1a2e' } },
    { tagName: 'scope', values: { value: 'portal' } },
  ];

  for (const { tagName, values } of testCases) {
    it(`round-trips ${tagName}`, () => {
      const fields = TAG_SCHEMAS[tagName].fields;
      const tag = valuesToTag(tagName, values, fields);
      const parsed = tagToValues(tag, fields);
      expect(parsed).toEqual(values);
    });
  }
});
