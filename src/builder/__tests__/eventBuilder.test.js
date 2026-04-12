/**
 * eventBuilder.test.js — Tests for event template building and validation.
 */

import { describe, it, expect } from 'vitest';
import { slugify, buildDTag, buildATag, buildEventTemplate, validateEvent } from '../eventBuilder.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTemplate(overrides = {}) {
  return {
    kind: 30078,
    tags: [
      ['d', 'the-lake:place:clearing'],
      ['t', 'the-lake'],
      ['type', 'place'],
      ['title', 'Forest Clearing'],
      ['exit', 'north'],
    ],
    content: 'A sunlit clearing in the forest.',
    ...overrides,
  };
}

/** Check if any issue in array has message matching substring */
function hasMessage(issues, substring) {
  return issues.some((i) => i.message.includes(substring));
}

// ── slugify ──────────────────────────────────────────────────────────────────

describe('slugify', () => {
  it('lowercases and replaces spaces', () => {
    expect(slugify('Forest Clearing')).toBe('forest-clearing');
  });

  it('strips special characters', () => {
    expect(slugify("The King's Chamber!")).toBe('the-king-s-chamber');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });
});

// ── buildDTag / buildATag ────────────────────────────────────────────────────

describe('buildDTag', () => {
  it('joins components with colons', () => {
    expect(buildDTag('the-lake', 'place', 'Forest Clearing')).toBe('the-lake:place:forest-clearing');
  });
});

describe('buildATag', () => {
  it('builds 30078:pubkey:dtag format', () => {
    expect(buildATag('abc123', 'the-lake:place:clearing')).toBe('30078:abc123:the-lake:place:clearing');
  });
});

// ── buildEventTemplate ───────────────────────────────────────────────────────

describe('buildEventTemplate', () => {
  it('puts identity tags first', () => {
    const tmpl = buildEventTemplate({
      eventType: 'place',
      worldSlug: 'the-lake',
      dTag: 'the-lake:place:clearing',
      tags: [['title', 'Forest Clearing'], ['exit', 'north']],
      content: 'A sunlit clearing.',
    });
    expect(tmpl.tags[0]).toEqual(['d', 'the-lake:place:clearing']);
    expect(tmpl.tags[1]).toEqual(['t', 'the-lake']);
    expect(tmpl.tags[2]).toEqual(['type', 'place']);
    expect(tmpl.tags[3]).toEqual(['title', 'Forest Clearing']);
  });

  it('skips duplicate identity tags from user tags', () => {
    const tmpl = buildEventTemplate({
      eventType: 'item',
      worldSlug: 'the-lake',
      dTag: 'the-lake:item:key',
      tags: [['d', 'should-be-skipped'], ['title', 'Key']],
      content: '',
    });
    const dTags = tmpl.tags.filter((t) => t[0] === 'd');
    expect(dTags).toHaveLength(1);
    expect(dTags[0][1]).toBe('the-lake:item:key');
  });
});

// ── validateEvent: identity tags ─────────────────────────────────────────────

describe('validateEvent — identity tags', () => {
  it('passes a valid place template', () => {
    const result = validateEvent(makeTemplate());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when d-tag is missing', () => {
    const tmpl = makeTemplate({ tags: [['t', 'the-lake'], ['type', 'place'], ['title', 'X'], ['exit', 'n']] });
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    expect(hasMessage(result.errors, 'Missing d-tag')).toBe(true);
  });

  it('fails when d-tag value is empty', () => {
    const tmpl = makeTemplate();
    tmpl.tags[0] = ['d', ''];
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    expect(hasMessage(result.errors, 'D-tag value is empty')).toBe(true);
  });

  it('fails when t-tag is missing', () => {
    const tmpl = makeTemplate({ tags: [['d', 'x:place:y'], ['type', 'place'], ['title', 'X'], ['exit', 'n']] });
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    expect(hasMessage(result.errors, 'Missing t-tag (world)')).toBe(true);
  });

  it('fails when type tag is missing', () => {
    const tmpl = makeTemplate({ tags: [['d', 'x:place:y'], ['t', 'the-lake'], ['title', 'X']] });
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
  });
});

// ── validateEvent: event refs ────────────────────────────────────────────────

describe('validateEvent — event refs', () => {
  it('passes well-formed event refs', () => {
    const pubkey = 'a'.repeat(64);
    const tmpl = makeTemplate();
    tmpl.tags.push(['requires', `30078:${pubkey}:the-lake:item:key`, '', '']);
    expect(validateEvent(tmpl).valid).toBe(true);
  });

  it('fails malformed event refs (short pubkey)', () => {
    const tmpl = makeTemplate();
    tmpl.tags.push(['requires', '30078:short:the-lake:item:key', '', '']);
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    expect(hasMessage(result.errors, 'Invalid event ref')).toBe(true);
  });
});

// ── validateEvent: schema-based checks ───────────────────────────────────────

describe('validateEvent — schema checks', () => {
  it('fails when title is missing on a place', () => {
    const tmpl = makeTemplate({ tags: [['d', 'x:place:y'], ['t', 'the-lake'], ['type', 'place'], ['exit', 'n']], content: 'A room.' });
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    expect(hasMessage(result.errors, 'Missing title tag')).toBe(true);
  });

  it('fails when title is missing on an item', () => {
    const tmpl = makeTemplate({
      tags: [['d', 'x:item:key'], ['t', 'the-lake'], ['type', 'item']],
      content: 'A key.',
    });
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    expect(hasMessage(result.errors, 'Missing title tag')).toBe(true);
  });

  it('does not require title on portal', () => {
    const pubkey = 'a'.repeat(64);
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:portal:gate'], ['t', 'the-lake'], ['type', 'portal'],
        ['exit', `30078:${pubkey}:x:place:a`, 'north', ''],
      ],
    });
    const result = validateEvent(tmpl);
    expect(hasMessage(result.errors, 'Missing title tag')).toBe(false);
  });

  it('fails when portal has no exit', () => {
    const tmpl = makeTemplate({
      tags: [['d', 'x:portal:gate'], ['t', 'the-lake'], ['type', 'portal']],
    });
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    expect(hasMessage(result.errors, 'Portal must have at least one exit')).toBe(true);
  });

  it('fails when trigger has no action selected', () => {
    const tmpl = makeTemplate();
    tmpl.tags.push(['on-interact', 'examine', '', '', '', '']);
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    expect(hasMessage(result.errors, 'no action type selected')).toBe(true);
  });

  it('passes when trigger has action selected', () => {
    const tmpl = makeTemplate();
    tmpl.tags.push(['on-interact', 'examine', '', 'set-state', 'examined', '']);
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(true);
  });

  it('fails when content is empty on a place', () => {
    const tmpl = makeTemplate({ content: '' });
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    expect(hasMessage(result.errors, 'Missing content')).toBe(true);
  });

  it('does not require content on portal', () => {
    const pubkey = 'a'.repeat(64);
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:portal:gate'], ['t', 'the-lake'], ['type', 'portal'],
        ['exit', `30078:${pubkey}:x:place:a`, 'north', ''],
      ],
      content: '',
    });
    const result = validateEvent(tmpl);
    expect(hasMessage(result.errors, 'Missing content')).toBe(false);
  });

  it('fails on required field empty (requires ref)', () => {
    const tmpl = makeTemplate();
    tmpl.tags.push(['requires', '', '', '']);
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    expect(hasMessage(result.errors, '"ref" is required')).toBe(true);
  });
});

// ── validateEvent: warnings ──────────────────────────────────────────────────

describe('validateEvent — warnings', () => {
  it('warns when place has no exits', () => {
    const tmpl = makeTemplate({
      tags: [['d', 'x:place:y'], ['t', 'the-lake'], ['type', 'place'], ['title', 'X']],
      content: 'A room.',
    });
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(true); // warning, not error
    expect(hasMessage(result.warnings, 'no exits')).toBe(true);
  });

  it('warns when item has no noun', () => {
    const tmpl = makeTemplate({
      tags: [['d', 'x:item:key'], ['t', 'the-lake'], ['type', 'item'], ['title', 'Key']],
      content: 'A rusty key.',
    });
    const result = validateEvent(tmpl);
    expect(hasMessage(result.warnings, 'no noun')).toBe(true);
  });

  it('warns when transitions exist without initial state', () => {
    const tmpl = makeTemplate();
    tmpl.tags.push(['transition', 'off', 'on', 'It lights up.']);
    const result = validateEvent(tmpl);
    expect(hasMessage(result.warnings, 'no initial state')).toBe(true);
  });

  it('warns about unexpected tags for event type', () => {
    const tmpl = makeTemplate();
    tmpl.tags.push(['health', '100']); // health not valid on place
    const result = validateEvent(tmpl);
    expect(hasMessage(result.warnings, '"health" is not expected')).toBe(true);
  });

  it('no warnings on well-formed item', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'the-lake:item:key'], ['t', 'the-lake'], ['type', 'item'],
        ['title', 'Key'], ['noun', 'key'],
      ],
      content: 'A rusty key.',
    });
    const result = validateEvent(tmpl);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns when verb has no matching on-interact', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:feature:panel'], ['t', 'the-lake'], ['type', 'feature'],
        ['title', 'Panel'], ['noun', 'panel'],
        ['verb', 'examine'],
        ['verb', 'use', 'decode'],
        ['on-interact', 'examine', 'set-state', 'lit'],
        // no on-interact for 'use'
      ],
      content: 'A panel.',
    });
    const result = validateEvent(tmpl);
    expect(hasMessage(result.warnings, 'Verb "use"') && hasMessage(result.warnings, 'no matching on-interact')).toBe(true);
  });

  it('does not warn when verb is examine (built-in fallback)', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:feature:lamp'], ['t', 'the-lake'], ['type', 'feature'],
        ['title', 'Lamp'], ['noun', 'lamp'],
        ['verb', 'examine'],
      ],
      content: 'A lamp.',
    });
    const result = validateEvent(tmpl);
    expect(hasMessage(result.warnings, 'Verb "examine"')).toBe(false);
  });

  it('warns when on-interact has too many elements', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:feature:lamp'], ['t', 'the-lake'], ['type', 'feature'],
        ['title', 'Lamp'], ['noun', 'lamp'],
        ['verb', 'examine'],
        ['on-interact', 'examine', '', 'set-state', 'visible', '30078:<PUBKEY>:x:clue:y', 'extra-field', 'another-extra'],
      ],
      content: 'A lamp.',
    });
    const result = validateEvent(tmpl);
    expect(hasMessage(result.warnings, 'on-interact') && hasMessage(result.warnings, 'extra elements')).toBe(true);
  });

  it('errors when NIP-44 content-type has no puzzle tag', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:place:secret'], ['t', 'the-lake'], ['type', 'place'],
        ['title', 'Secret Room'], ['exit', 'north'],
        ['content-type', 'application/nip44', 'text/markdown'],
      ],
      content: 'Sealed content.',
    });
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    expect(hasMessage(result.errors, 'NIP-44') && hasMessage(result.errors, 'puzzle tag')).toBe(true);
  });

  it('no error when NIP-44 content-type has puzzle tag', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:place:secret'], ['t', 'the-lake'], ['type', 'place'],
        ['title', 'Secret Room'], ['exit', 'north'],
        ['content-type', 'application/nip44', 'text/markdown'],
        ['puzzle', 'x:puzzle:riddle'],
      ],
      content: 'Sealed content.',
    });
    const result = validateEvent(tmpl);
    expect(hasMessage(result.errors, 'NIP-44')).toBe(false);
  });
});

// ── validateEvent: on-counter direction ───────────────────────────────────────

describe('validateEvent — on-counter direction', () => {
  it('passes when direction is "down"', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:feature:lamp'], ['t', 'the-lake'], ['type', 'feature'],
        ['title', 'Lamp'], ['noun', 'lamp'],
        ['counter', 'battery', '100'],
        ['on-counter', 'down', 'battery', '0', 'set-state', 'dead'],
      ],
      content: 'A lamp.',
    });
    const result = validateEvent(tmpl);
    expect(hasMessage(result.errors, 'direction must be')).toBe(false);
  });

  it('passes when direction is "up"', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:feature:lamp'], ['t', 'the-lake'], ['type', 'feature'],
        ['title', 'Lamp'], ['noun', 'lamp'],
        ['counter', 'charge', '0'],
        ['on-counter', 'up', 'charge', '100', 'set-state', 'full'],
      ],
      content: 'A lamp.',
    });
    const result = validateEvent(tmpl);
    expect(hasMessage(result.errors, 'direction must be')).toBe(false);
  });

  it('errors when direction is missing (counter name in position 1)', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:feature:lamp'], ['t', 'the-lake'], ['type', 'feature'],
        ['title', 'Lamp'], ['noun', 'lamp'],
        ['counter', 'battery', '100'],
        ['on-counter', 'battery', '0', 'set-state', 'dead'],
      ],
      content: 'A lamp.',
    });
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    const issue = result.errors.find((e) => e.category === 'invalid-direction');
    expect(issue).toBeDefined();
    expect(issue.message).toContain('"battery"');
    expect(issue.fix).toContain('"down"');
  });

  it('errors when direction is empty', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:feature:lamp'], ['t', 'the-lake'], ['type', 'feature'],
        ['title', 'Lamp'], ['noun', 'lamp'],
        ['on-counter', '', 'battery', '0', 'set-state', 'dead'],
      ],
      content: 'A lamp.',
    });
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    expect(hasMessage(result.errors, 'direction must be')).toBe(true);
  });
});

// ── validateEvent: on-complete/on-fail blank trigger-target ──────────────────

describe('validateEvent — on-complete/on-fail blank trigger-target', () => {
  it('passes when on-complete trigger-target is blank', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:puzzle:riddle'], ['t', 'the-lake'], ['type', 'puzzle'],
        ['puzzle-type', 'riddle'], ['answer-hash', 'abc'], ['salt', 'xyz'],
        ['on-complete', '', 'set-state', 'solved'],
      ],
    });
    const result = validateEvent(tmpl);
    expect(hasMessage(result.errors, 'trigger-target must be blank')).toBe(false);
  });

  it('errors when on-complete trigger-target has a value', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:puzzle:riddle'], ['t', 'the-lake'], ['type', 'puzzle'],
        ['puzzle-type', 'riddle'], ['answer-hash', 'abc'], ['salt', 'xyz'],
        ['on-complete', 'solved', 'set-state', 'open'],
      ],
    });
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    const issue = result.errors.find((e) => e.category === 'trigger-target-not-blank');
    expect(issue).toBeDefined();
    expect(issue.message).toContain('"solved"');
    expect(issue.fix).toContain('empty string');
  });

  it('errors when on-fail trigger-target has a value', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:puzzle:riddle'], ['t', 'the-lake'], ['type', 'puzzle'],
        ['puzzle-type', 'riddle'], ['answer-hash', 'abc'], ['salt', 'xyz'],
        ['on-fail', 'wrong', 'decrement', 'attempts'],
      ],
    });
    const result = validateEvent(tmpl);
    expect(result.valid).toBe(false);
    const issue = result.errors.find((e) => e.category === 'trigger-target-not-blank');
    expect(issue).toBeDefined();
    expect(issue.message).toContain('"wrong"');
  });

  it('passes when on-fail trigger-target is blank', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:puzzle:riddle'], ['t', 'the-lake'], ['type', 'puzzle'],
        ['puzzle-type', 'riddle'], ['answer-hash', 'abc'], ['salt', 'xyz'],
        ['on-fail', '', 'decrement', 'attempts'],
      ],
    });
    const result = validateEvent(tmpl);
    expect(hasMessage(result.errors, 'trigger-target must be blank')).toBe(false);
  });
});

// ── validateEvent: structured issues ─────────────────────────────────────────

describe('validateEvent — structured issues', () => {
  it('errors have category and fix fields', () => {
    const tmpl = makeTemplate({ tags: [['t', 'the-lake'], ['type', 'place'], ['title', 'X'], ['exit', 'n']] });
    const result = validateEvent(tmpl);
    const missingD = result.errors.find((e) => e.message.includes('Missing d-tag'));
    expect(missingD).toBeDefined();
    expect(missingD.category).toBe('missing-tag');
    expect(missingD.fix).toBeTruthy();
  });

  it('warnings have category and fix fields', () => {
    const tmpl = makeTemplate({
      tags: [['d', 'x:item:key'], ['t', 'the-lake'], ['type', 'item'], ['title', 'Key']],
      content: 'A rusty key.',
    });
    const result = validateEvent(tmpl);
    const noNoun = result.warnings.find((w) => w.message.includes('no noun'));
    expect(noNoun).toBeDefined();
    expect(noNoun.category).toBe('missing-noun');
    expect(noNoun.fix).toBeTruthy();
  });

  it('invalid ref error includes tag field', () => {
    const tmpl = makeTemplate();
    tmpl.tags.push(['requires', '30078:short:the-lake:item:key', '', '']);
    const result = validateEvent(tmpl);
    const refError = result.errors.find((e) => e.message.includes('Invalid event ref'));
    expect(refError).toBeDefined();
    expect(refError.category).toBe('invalid-ref');
    expect(refError.tag).toBeTruthy();
  });
});

// ── validateEvent: on-health direction ────────────────────────────────────────

describe('validateEvent — on-health direction', () => {
  it('passes with valid on-health direction', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:npc:guard'], ['t', 'x'], ['type', 'npc'], ['title', 'Guard'],
        ['noun', 'guard'], ['health', '10'], ['damage', '2'],
        ['on-health', 'down', '50%', 'set-state', 'wounded'],
      ],
      content: 'A guard.',
    });
    const result = validateEvent(tmpl);
    expect(result.errors.filter((e) => e.category === 'invalid-direction')).toHaveLength(0);
  });

  it('errors when on-health has wrong direction', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:npc:guard'], ['t', 'x'], ['type', 'npc'], ['title', 'Guard'],
        ['noun', 'guard'], ['health', '10'], ['damage', '2'],
        ['on-health', '50%', 'set-state', 'wounded'],
      ],
      content: 'A guard.',
    });
    const result = validateEvent(tmpl);
    const dirErr = result.errors.find((e) => e.category === 'invalid-direction');
    expect(dirErr).toBeDefined();
    expect(dirErr.message).toContain('on-health');
  });

  it('errors when on-player-health has wrong direction', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:world'], ['t', 'x'], ['type', 'world'], ['title', 'X'],
        ['start', '30078:abc123def456abc123def456abc123def456abc123def456abc123def456abcd:x:place:start'],
        ['on-player-health', '0', 'consequence', '30078:abc123def456abc123def456abc123def456abc123def456abc123def456abcd:x:place:death'],
      ],
      content: '',
    });
    const result = validateEvent(tmpl);
    const dirErr = result.errors.find((e) => e.category === 'invalid-direction');
    expect(dirErr).toBeDefined();
    expect(dirErr.message).toContain('on-player-health');
  });
});

// ── validateEvent: invalid action type ────────────────────────────────────────

describe('validateEvent — invalid action type', () => {
  it('errors when on-interact has unknown action', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:feature:lever'], ['t', 'x'], ['type', 'feature'], ['title', 'Lever'],
        ['noun', 'lever'], ['verb', 'pull'],
        ['on-interact', 'pull', '', 'toggle-state', 'open'],
      ],
      content: 'A rusty lever.',
    });
    const result = validateEvent(tmpl);
    const actionErr = result.errors.find((e) => e.category === 'invalid-action');
    expect(actionErr).toBeDefined();
    expect(actionErr.message).toContain('toggle-state');
  });

  it('passes with valid action type', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:feature:lever'], ['t', 'x'], ['type', 'feature'], ['title', 'Lever'],
        ['noun', 'lever'], ['verb', 'pull'],
        ['on-interact', 'pull', '', 'set-state', 'open'],
      ],
      content: 'A rusty lever.',
    });
    const result = validateEvent(tmpl);
    expect(result.errors.filter((e) => e.category === 'invalid-action')).toHaveLength(0);
  });
});

// ── validateEvent: invalid enum values ────────────────────────────────────────

describe('validateEvent — invalid enum values', () => {
  it('errors when theme preset is invalid', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:world'], ['t', 'x'], ['type', 'world'], ['title', 'X'],
        ['start', '30078:abc123def456abc123def456abc123def456abc123def456abc123def456abcd:x:place:start'],
        ['theme', 'terminal'],
      ],
      content: '',
    });
    const result = validateEvent(tmpl);
    const enumErr = result.errors.find((e) => e.category === 'invalid-enum' && e.message.includes('Theme'));
    expect(enumErr).toBeDefined();
    expect(enumErr.message).toContain('terminal');
    expect(enumErr.message).toContain('terminal-green');
  });

  it('passes with valid theme preset', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:world'], ['t', 'x'], ['type', 'world'], ['title', 'X'],
        ['start', '30078:abc123def456abc123def456abc123def456abc123def456abc123def456abcd:x:place:start'],
        ['theme', 'terminal-green'],
      ],
      content: '',
    });
    const result = validateEvent(tmpl);
    expect(result.errors.filter((e) => e.category === 'invalid-enum' && e.message.includes('Theme'))).toHaveLength(0);
  });

  it('errors when collaboration mode is invalid', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:world'], ['t', 'x'], ['type', 'world'], ['title', 'X'],
        ['start', '30078:abc123def456abc123def456abc123def456abc123def456abc123def456abcd:x:place:start'],
        ['collaboration', 'public'],
      ],
      content: '',
    });
    const result = validateEvent(tmpl);
    const enumErr = result.errors.find((e) => e.category === 'invalid-enum' && e.message.includes('Collaboration'));
    expect(enumErr).toBeDefined();
    expect(enumErr.message).toContain('public');
  });

  it('errors when effects bundle is invalid', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:world'], ['t', 'x'], ['type', 'world'], ['title', 'X'],
        ['start', '30078:abc123def456abc123def456abc123def456abc123def456abc123def456abcd:x:place:start'],
        ['effects', 'retro'],
      ],
      content: '',
    });
    const result = validateEvent(tmpl);
    const enumErr = result.errors.find((e) => e.category === 'invalid-enum' && e.message.includes('Effect'));
    expect(enumErr).toBeDefined();
  });

  it('errors when sound role is invalid', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:place:room'], ['t', 'x'], ['type', 'place'], ['title', 'Room'],
        ['exit', 'north'],
        ['sound', '30078:abc123def456abc123def456abc123def456abc123def456abc123def456abcd:x:sound:rain', 'background', '0.5'],
      ],
      content: 'A room.',
    });
    const result = validateEvent(tmpl);
    const enumErr = result.errors.find((e) => e.category === 'invalid-enum' && e.message.includes('Sound role'));
    expect(enumErr).toBeDefined();
    expect(enumErr.message).toContain('background');
  });

  it('passes with valid sound role', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:place:room'], ['t', 'x'], ['type', 'place'], ['title', 'Room'],
        ['exit', 'north'],
        ['sound', '30078:abc123def456abc123def456abc123def456abc123def456abc123def456abcd:x:sound:rain', 'ambient', '0.5'],
      ],
      content: 'A room.',
    });
    const result = validateEvent(tmpl);
    expect(result.errors.filter((e) => e.category === 'invalid-enum' && e.message.includes('Sound role'))).toHaveLength(0);
  });

  it('errors when colour slot is invalid', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:world'], ['t', 'x'], ['type', 'world'], ['title', 'X'],
        ['start', '30078:abc123def456abc123def456abc123def456abc123def456abc123def456abcd:x:place:start'],
        ['colour', 'background', '#000000'],
      ],
      content: '',
    });
    const result = validateEvent(tmpl);
    const enumErr = result.errors.find((e) => e.category === 'invalid-enum' && e.message.includes('Colour slot'));
    expect(enumErr).toBeDefined();
    expect(enumErr.message).toContain('background');
  });
});

// ── validateEvent: numeric field validation ───────────────────────────────────

describe('validateEvent — numeric field validation', () => {
  it('errors when health is not a number', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:npc:guard'], ['t', 'x'], ['type', 'npc'], ['title', 'Guard'],
        ['noun', 'guard'], ['health', 'ten'], ['damage', '2'],
      ],
      content: 'A guard.',
    });
    const result = validateEvent(tmpl);
    const numErr = result.errors.find((e) => e.category === 'invalid-number' && e.message.includes('ten'));
    expect(numErr).toBeDefined();
    expect(numErr.fix).toContain('numeric');
  });

  it('passes when health is a valid number', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:npc:guard'], ['t', 'x'], ['type', 'npc'], ['title', 'Guard'],
        ['noun', 'guard'], ['health', '10'], ['damage', '2'],
      ],
      content: 'A guard.',
    });
    const result = validateEvent(tmpl);
    expect(result.errors.filter((e) => e.category === 'invalid-number')).toHaveLength(0);
  });

  it('errors when damage is not a number', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:npc:guard'], ['t', 'x'], ['type', 'npc'], ['title', 'Guard'],
        ['noun', 'guard'], ['health', '10'], ['damage', 'high'],
      ],
      content: 'A guard.',
    });
    const result = validateEvent(tmpl);
    const numErr = result.errors.find((e) => e.category === 'invalid-number' && e.message.includes('high'));
    expect(numErr).toBeDefined();
  });

  it('errors when counter initial value is not a number', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:feature:lever'], ['t', 'x'], ['type', 'feature'], ['title', 'Lever'],
        ['noun', 'lever'], ['counter', 'uses', 'full'],
      ],
      content: 'A lever.',
    });
    const result = validateEvent(tmpl);
    const numErr = result.errors.find((e) => e.category === 'invalid-number' && e.message.includes('full'));
    expect(numErr).toBeDefined();
  });

  it('errors when speed is not a number', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:npc:guard'], ['t', 'x'], ['type', 'npc'], ['title', 'Guard'],
        ['noun', 'guard'], ['health', '10'], ['damage', '2'], ['speed', 'fast'],
      ],
      content: 'A guard.',
    });
    const result = validateEvent(tmpl);
    const numErr = result.errors.find((e) => e.category === 'invalid-number' && e.message.includes('fast'));
    expect(numErr).toBeDefined();
  });

  it('accepts decimal numbers', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:npc:guard'], ['t', 'x'], ['type', 'npc'], ['title', 'Guard'],
        ['noun', 'guard'], ['health', '10'], ['damage', '2.5'],
      ],
      content: 'A guard.',
    });
    const result = validateEvent(tmpl);
    expect(result.errors.filter((e) => e.category === 'invalid-number')).toHaveLength(0);
  });

  it('errors when on-counter threshold is not a number', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:feature:lever'], ['t', 'x'], ['type', 'feature'], ['title', 'Lever'],
        ['noun', 'lever'], ['counter', 'uses', '3'],
        ['on-counter', 'down', 'uses', 'empty', 'set-state', 'broken'],
      ],
      content: 'A lever.',
    });
    const result = validateEvent(tmpl);
    const numErr = result.errors.find((e) => e.category === 'invalid-number' && e.message.includes('empty'));
    expect(numErr).toBeDefined();
  });

  it('errors when deal-damage action target is not a number', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:feature:trap'], ['t', 'x'], ['type', 'feature'], ['title', 'Trap'],
        ['noun', 'trap'], ['verb', 'touch'],
        ['on-interact', 'touch', '', 'deal-damage', 'lots'],
      ],
      content: 'A trap.',
    });
    const result = validateEvent(tmpl);
    const numErr = result.errors.find((e) => e.category === 'invalid-number' && e.message.includes('lots'));
    expect(numErr).toBeDefined();
    expect(numErr.message).toContain('deal-damage');
  });

  it('passes when deal-damage action target is a number', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:feature:trap'], ['t', 'x'], ['type', 'feature'], ['title', 'Trap'],
        ['noun', 'trap'], ['verb', 'touch'],
        ['on-interact', 'touch', '', 'deal-damage', '5'],
      ],
      content: 'A trap.',
    });
    const result = validateEvent(tmpl);
    expect(result.errors.filter((e) => e.category === 'invalid-number')).toHaveLength(0);
  });

  it('errors when heal action target is not a number', () => {
    const tmpl = makeTemplate({
      tags: [
        ['d', 'x:item:potion'], ['t', 'x'], ['type', 'item'], ['title', 'Potion'],
        ['noun', 'potion'], ['verb', 'drink'],
        ['on-interact', 'drink', '', 'heal', 'full'],
      ],
      content: 'A potion.',
    });
    const result = validateEvent(tmpl);
    const numErr = result.errors.find((e) => e.category === 'invalid-number' && e.message.includes('full'));
    expect(numErr).toBeDefined();
    expect(numErr.message).toContain('heal');
  });
});

// ── validateEvent: d-tag conventions ──────────────────────────────────────────

describe('validateEvent — d-tag conventions', () => {
  it('errors when world event d-tag is not <slug>:world', () => {
    const tmpl = {
      kind: 30078,
      tags: [
        ['d', 'voidrun'],
        ['t', 'voidrun'],
        ['type', 'world'],
        ['title', 'Voidrun'],
        ['w', 'folklore'],
      ],
      content: '',
    };
    const result = validateEvent(tmpl);
    expect(hasMessage(result.errors, 'World event d-tag must be')).toBe(true);
    expect(result.errors.find((e) => e.category === 'invalid-dtag').fix).toContain('voidrun:world');
  });

  it('passes when world event d-tag follows convention', () => {
    const tmpl = {
      kind: 30078,
      tags: [
        ['d', 'voidrun:world'],
        ['t', 'voidrun'],
        ['type', 'world'],
        ['title', 'Voidrun'],
        ['w', 'folklore'],
      ],
      content: '',
    };
    const result = validateEvent(tmpl);
    expect(hasMessage(result.errors, 'World event d-tag must be')).toBe(false);
  });

  it('warns when non-world d-tag does not start with world slug', () => {
    const tmpl = {
      kind: 30078,
      tags: [
        ['d', 'random-tag'],
        ['t', 'voidrun'],
        ['type', 'place'],
        ['title', 'Some Place'],
        ['exit', 'north'],
      ],
      content: 'A place.',
    };
    const result = validateEvent(tmpl);
    expect(hasMessage(result.warnings, 'does not start with world slug')).toBe(true);
  });

  it('no warning when non-world d-tag follows convention', () => {
    const tmpl = {
      kind: 30078,
      tags: [
        ['d', 'voidrun:place:hub'],
        ['t', 'voidrun'],
        ['type', 'place'],
        ['title', 'Hub'],
        ['exit', 'north'],
      ],
      content: 'A hub.',
    };
    const result = validateEvent(tmpl);
    expect(hasMessage(result.warnings, 'does not start with world slug')).toBe(false);
  });
});
