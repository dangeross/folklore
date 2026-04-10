#!/usr/bin/env node
/**
 * smoke-test.js — validate + smoke test a folklore world JSON in one command.
 *
 * Usage:
 *   node scripts/smoke-test.js <path-to-world.json> [--hints]
 *
 * Phases:
 *   1. Per-event schema validation (validateEvent)
 *   2. Cross-event validation (validateWorld + verifyPuzzleHashes)
 *   3. BFS smoke test: reachability, noun failures, orphans, discoverability
 *
 * Exit codes:
 *   0 — no errors (warnings/hints may still be present)
 *   1 — one or more errors found
 */

import { readFileSync } from 'fs';
import { resolve, basename } from 'path';
import { validateEvent } from '../src/builder/eventBuilder.js';
import { validateWorld, verifyPuzzleHashes } from '../src/builder/validateWorld.js';
import { smokeTest } from '../src/engine/walkthrough.js';

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));
const file = args[0];
const showHints = flags.has('--hints');

if (!file) {
  console.error('Usage: node scripts/smoke-test.js <world.json> [--hints]');
  process.exit(1);
}

// ── Colour helpers ───────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
  red:    s => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: s => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  dim:    s => isTTY ? `\x1b[2m${s}\x1b[0m`  : s,
  green:  s => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  bold:   s => isTTY ? `\x1b[1m${s}\x1b[0m`  : s,
  cyan:   s => isTTY ? `\x1b[36m${s}\x1b[0m` : s,
};

function levelColour(level, text) {
  if (level === 'error')   return c.red(text);
  if (level === 'warning') return c.yellow(text);
  return c.dim(text);
}

function levelPrefix(level) {
  if (level === 'error')   return c.red('  ✗');
  if (level === 'warning') return c.yellow('  ⚠');
  return c.dim('  ·');
}

// ── Load ─────────────────────────────────────────────────────────────────────

let events, answers;
try {
  const raw = readFileSync(resolve(file), 'utf8');
  const parsed = JSON.parse(raw);
  ({ events } = parsed);
  answers = parsed.answers || {};
} catch (err) {
  console.error(c.red(`Failed to read "${file}": ${err.message}`));
  process.exit(1);
}

if (!Array.isArray(events) || events.length === 0) {
  console.error(c.red('No events array found in file.'));
  process.exit(1);
}

const worldTitle = events.find(e => e.tags?.find(t => t[0] === 'type' && t[1] === 'world'))
  ?.tags?.find(t => t[0] === 'title')?.[1] ?? basename(file, '.json');

console.log('');
console.log(c.bold(`  ${worldTitle}`), c.dim(`(${basename(file)}, ${events.length} events)`));
console.log('');

// ── Build helpers ────────────────────────────────────────────────────────────

function getDTag(ev)    { return ev.tags?.find(t => t[0] === 'd')?.[1] ?? null; }
function getType(ev)    { return ev.tags?.find(t => t[0] === 'type')?.[1] ?? null; }

// Map dTag → event for type lookups
const eventByDTag = new Map(events.map(ev => [getDTag(ev), ev]));
const getEventType = dTag => getType(eventByDTag.get(dTag));

// Map a-tag → event for smoke tester
// a-tag format: 30078:<pubkey>:<dtag>
// pubkey may be on ev.pubkey (published events) or embedded in tag refs (JSON exports with <PUBKEY>)
function extractPubkey(events) {
  for (const ev of events) {
    if (ev.pubkey) return ev.pubkey;
    for (const tag of ev.tags || []) {
      for (let i = 1; i < tag.length; i++) {
        const val = tag[i];
        if (typeof val === 'string' && val.startsWith('30078:')) {
          return val.split(':')[1]; // e.g. '<PUBKEY>' or actual hex
        }
      }
    }
  }
  return null;
}

const pubkey = extractPubkey(events);
const eventsMap = new Map();
if (pubkey) {
  for (const ev of events) {
    const dTag = getDTag(ev);
    if (dTag) eventsMap.set(`30078:${pubkey}:${dTag}`, ev);
  }
}

// ── Phase 1 & 2: Validation ──────────────────────────────────────────────────

console.log(c.bold('  ── Validation ─────────────────────────────────────────'));

const issues = [];

// Per-event
for (const event of events) {
  const dTag = getDTag(event) || '?';
  const eventType = getType(event);
  const { errors, warnings } = validateEvent(event);
  for (const i of errors)   issues.push({ level: 'error',   dTag, eventType, ...i });
  for (const i of warnings) issues.push({ level: 'warning', dTag, eventType, ...i });
}

// Cross-event
const {
  errors: crossErrors,
  warnings: crossWarnings,
  hints: crossHints,
  puzzlesToVerify,
} = validateWorld(events, answers);

for (const i of crossErrors)         issues.push({ level: 'error',   eventType: getEventType(i.dTag), ...i });
for (const i of crossWarnings)       issues.push({ level: 'warning', eventType: getEventType(i.dTag), ...i });
for (const i of (crossHints || []))  issues.push({ level: 'hint',    eventType: getEventType(i.dTag), ...i });

// Puzzle hash verification
const hashErrors = await verifyPuzzleHashes(puzzlesToVerify || []);
for (const i of hashErrors) issues.push({ level: 'error', eventType: getEventType(i.dTag), ...i });

// Print validation issues
const validationIssues = issues.filter(i => showHints || i.level !== 'hint');
if (validationIssues.length === 0) {
  console.log(c.green('  ✓ No issues'));
} else {
  // Group by dTag for readability
  const byDTag = new Map();
  for (const i of validationIssues) {
    const key = i.dTag || '?';
    if (!byDTag.has(key)) byDTag.set(key, []);
    byDTag.get(key).push(i);
  }
  for (const [dTag, group] of byDTag) {
    const type = group[0].eventType ? c.dim(` [${group[0].eventType}]`) : '';
    console.log(`\n  ${c.cyan(dTag)}${type}`);
    for (const i of group) {
      console.log(`${levelPrefix(i.level)} ${levelColour(i.level, i.message)}`);
      if (i.fix && i.level !== 'hint') {
        console.log(`${c.dim('     fix:')} ${c.dim(i.fix)}`);
      }
    }
  }
}

const valErrors   = issues.filter(i => i.level === 'error').length;
const valWarnings = issues.filter(i => i.level === 'warning').length;
const valHints    = issues.filter(i => i.level === 'hint').length;

// ── Phase 3: Smoke test ──────────────────────────────────────────────────────

console.log('');
console.log(c.bold('  ── Smoke test ──────────────────────────────────────────'));

if (eventsMap.size === 0) {
  console.log(c.yellow('  ⚠ No events with pubkey — skipping smoke test'));
} else {
  const { reachable, unreachable, issues: smokeIssues, coverage } = await smokeTest(eventsMap);

  // Map smoke issue types to levels
  const SMOKE_ERRORS  = new Set(['noun-failure', 'unreachable']);
  const SMOKE_HINTS   = new Set(['thin-noun', 'undiscoverable-verb']);

  function smokeLevel(type) {
    if (SMOKE_ERRORS.has(type))  return 'error';
    if (SMOKE_HINTS.has(type))   return 'hint';
    return 'warning';
  }

  const visibleSmoke = smokeIssues.filter(i => {
    const level = smokeLevel(i.type);
    return showHints || level !== 'hint';
  });

  if (visibleSmoke.length === 0) {
    console.log(c.green('  ✓ No issues'));
  } else {
    // Group by place for readability
    const byPlace = new Map();
    for (const i of visibleSmoke) {
      const key = i.place || '(world)';
      if (!byPlace.has(key)) byPlace.set(key, []);
      byPlace.get(key).push(i);
    }
    for (const [place, group] of byPlace) {
      console.log(`\n  ${c.cyan(place)}`);
      for (const i of group) {
        const level = smokeLevel(i.type);
        console.log(`${levelPrefix(level)} ${levelColour(level, i.message)}`);
      }
    }
  }

  const smokeErrors   = smokeIssues.filter(i => smokeLevel(i.type) === 'error').length;
  const smokeWarnings = smokeIssues.filter(i => smokeLevel(i.type) === 'warning').length;
  const smokeHints    = smokeIssues.filter(i => smokeLevel(i.type) === 'hint').length;

  // ── Summary ────────────────────────────────────────────────────────────────

  const totalErrors   = valErrors + smokeErrors;
  const totalWarnings = valWarnings + smokeWarnings;
  const totalHints    = valHints + smokeHints;

  console.log('');
  console.log(c.bold('  ── Summary ──────────────────────────────────────────────'));

  // Reachability
  const reachLine = coverage.placesTotal > 0
    ? `${coverage.placesReachable}/${coverage.placesTotal} places reachable`
    : 'no places';
  const reachColour = unreachable.length === 0 ? c.green : c.red;
  console.log(`  ${reachColour(`✓ ${reachLine}`)}`);

  // Entities
  console.log(`  ${c.dim(`${coverage.entitiesChecked} entities checked`)}`);

  // Issue counts
  const errStr  = totalErrors   > 0 ? c.red(`${totalErrors} error${totalErrors > 1 ? 's' : ''}`)     : null;
  const warnStr = totalWarnings > 0 ? c.yellow(`${totalWarnings} warning${totalWarnings > 1 ? 's' : ''}`) : null;
  const hintStr = totalHints    > 0 ? c.dim(`${totalHints} hint${totalHints > 1 ? 's' : ''}`)        : null;
  const parts   = [errStr, warnStr, hintStr].filter(Boolean);

  if (parts.length === 0) {
    console.log(`  ${c.green('✓ Clean')}`);
  } else {
    console.log(`  ${parts.join(c.dim('  '))}`);
    if (totalHints > 0 && !showHints) {
      console.log(`  ${c.dim(`(run with --hints to show ${totalHints} hint${totalHints > 1 ? 's' : ''})`)} `);
    }
  }

  console.log('');
  process.exit(totalErrors > 0 ? 1 : 0);
}

// Fallback exit (no events map — only validation ran)
const totalErrors = valErrors;
console.log('');
console.log(c.bold('  ── Summary ──────────────────────────────────────────────'));
if (valErrors === 0) {
  console.log(`  ${c.green('✓ Clean')}`);
} else {
  console.log(`  ${c.red(`${valErrors} error${valErrors > 1 ? 's' : ''}`)}`);
}
console.log('');
process.exit(totalErrors > 0 ? 1 : 0);
