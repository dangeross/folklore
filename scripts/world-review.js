#!/usr/bin/env node
/**
 * world-review.js — compact narrative summary of a folklore world JSON
 * Usage: node scripts/world-review.js <path-to-world.json>
 * Output: plain text suitable for LLM analysis
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/world-review.js <world.json>'); process.exit(1); }

const { events } = JSON.parse(readFileSync(resolve(file), 'utf8'));

const byType = {};
for (const ev of events) {
  const tags = Object.fromEntries(
    ev.tags.reduce((acc, t) => {
      const k = t[0];
      if (!acc.find(([a]) => a === k)) acc.push([k, ev.tags.filter(x => x[0] === k)]);
      return acc;
    }, [])
  );
  const type = ev.tags.find(t => t[0] === 'type')?.[1] ?? 'unknown';
  const d = ev.tags.find(t => t[0] === 'd')?.[1] ?? '?';
  if (!byType[type]) byType[type] = [];
  byType[type].push({ d, content: ev.content, tags: ev.tags });
}

const get = (tags, key) => tags.find(t => t[0] === key)?.[1];
const getAll = (tags, key) => tags.filter(t => t[0] === key);

const lines = [];
const h = (s) => lines.push('', `### ${s}`, '');
const p = (s) => lines.push(s);

// ── WORLD ─────────────────────────────────────────────────────────────────
h('WORLD');
const world = byType['world']?.[0];
if (world) {
  p(`title: ${get(world.tags, 'title')}`);
  p(`description: ${world.content}`);
  p(`collaboration: ${get(world.tags, 'collaboration') ?? 'closed'}`);
}

// ── PLACES ────────────────────────────────────────────────────────────────
h('PLACES');
for (const pl of byType['place'] ?? []) {
  p(`[${pl.d}]`);
  p(`  title: ${get(pl.tags, 'title')}`);
  p(`  desc: ${pl.content?.slice(0, 120)}`);
  const exits = getAll(pl.tags, 'exit').map(t => t[1]).join(', ');
  if (exits) p(`  exits: ${exits}`);
  const features = getAll(pl.tags, 'feature').map(t => t[1]).join(', ');
  if (features) p(`  features: ${features}`);
  const npcs = getAll(pl.tags, 'npc').map(t => t[1]).join(', ');
  if (npcs) p(`  npcs: ${npcs}`);
  const puzzle = get(pl.tags, 'puzzle');
  if (puzzle) p(`  puzzle: ${puzzle}`);
  const onEnter = getAll(pl.tags, 'on-enter').map(t => t.slice(1).join(' ')).join(' | ');
  if (onEnter) p(`  on-enter: ${onEnter}`);
  const req = getAll(pl.tags, 'requires').map(t => `${t[1]} [${t[2]||'any'}] "${t[3]}"`).join('; ');
  if (req) p(`  requires: ${req}`);
}

// ── PORTALS ───────────────────────────────────────────────────────────────
h('PORTALS');
for (const po of byType['portal'] ?? []) {
  const from = get(po.tags, 'place');
  const to = get(po.tags, 'to');
  const slot = get(po.tags, 'slot');
  const toSlot = get(po.tags, 'to-slot');
  const req = getAll(po.tags, 'requires').map(t => `${t[1]}[${t[2]||'any'}]`).join(', ');
  const reqNot = getAll(po.tags, 'requires-not').map(t => `!${t[1]}[${t[2]||'any'}]`).join(', ');
  p(`[${po.d}] ${from} --${slot}--> ${to} (back:${toSlot})${req ? ' req:'+req : ''}${reqNot ? ' '+reqNot : ''}`);
  if (po.content) p(`  label: ${po.content}`);
}

// ── NPCS ──────────────────────────────────────────────────────────────────
h('NPCS');
for (const npc of byType['npc'] ?? []) {
  p(`[${npc.d}] ${get(npc.tags, 'title')}`);
  p(`  desc: ${npc.content?.slice(0, 100)}`);
  const dialogues = getAll(npc.tags, 'dialogue');
  for (const d of dialogues) {
    p(`  dialogue: ${d[1]}${d[2] ? ' (req:'+d[2]+')' : ''}${d[3] ? ' state:'+d[3] : ''}`);
  }
  const onInteracts = getAll(npc.tags, 'on-interact').map(t => t.slice(1).join(' '));
  for (const oi of onInteracts) p(`  on-interact: ${oi}`);
}

// ── DIALOGUE ──────────────────────────────────────────────────────────────
h('DIALOGUE TREES');
for (const dl of byType['dialogue'] ?? []) {
  p(`[${dl.d}]`);
  const req = getAll(dl.tags, 'requires').map(t => `${t[1]}[${t[2]||'any'}]`).join(', ');
  const reqNot = getAll(dl.tags, 'requires-not').map(t => `!${t[1]}[${t[2]||'any'}]`).join(', ');
  if (req) p(`  requires: ${req}`);
  if (reqNot) p(`  requires-not: ${reqNot}`);
  const onEnter = getAll(dl.tags, 'on-enter').map(t => t.slice(1).join(' ')).join(' | ');
  if (onEnter) p(`  on-enter: ${onEnter}`);
  p(`  text: "${dl.content?.slice(0, 120)}"`);
  for (const opt of getAll(dl.tags, 'option')) {
    p(`  > "${opt[1]}" -> ${opt[2] || '(end)'}`);
  }
}

// ── ITEMS ─────────────────────────────────────────────────────────────────
h('ITEMS');
for (const it of byType['item'] ?? []) {
  p(`[${it.d}] ${get(it.tags, 'title')}`);
  p(`  desc: ${it.content?.slice(0, 100)}`);
  const onInteracts = getAll(it.tags, 'on-interact').map(t => t.slice(1).join(' '));
  for (const oi of onInteracts) p(`  on-interact: ${oi}`);
  const req = getAll(it.tags, 'requires').map(t => `${t[1]}[${t[2]||'any'}]`).join(', ');
  if (req) p(`  requires: ${req}`);
}

// ── FEATURES ──────────────────────────────────────────────────────────────
h('FEATURES');
for (const ft of byType['feature'] ?? []) {
  p(`[${ft.d}] ${get(ft.tags, 'title')}`);
  p(`  desc: ${ft.content?.slice(0, 100)}`);
  const onInteracts = getAll(ft.tags, 'on-interact').map(t => t.slice(1).join(' '));
  for (const oi of onInteracts) p(`  on-interact: ${oi}`);
  const req = getAll(ft.tags, 'requires').map(t => `${t[1]}[${t[2]||'any'}]`).join(', ');
  if (req) p(`  requires: ${req}`);
  const state = get(ft.tags, 'state');
  if (state) p(`  initial-state: ${state}`);
}

// ── CLUES ─────────────────────────────────────────────────────────────────
h('CLUES');
for (const cl of byType['clue'] ?? []) {
  const state = get(cl.tags, 'state');
  p(`[${cl.d}]${state ? ' (state:'+state+')' : ''}`);
  p(`  "${cl.content?.slice(0, 140)}"`);
}

// ── PUZZLES ───────────────────────────────────────────────────────────────
h('PUZZLES');
for (const pz of byType['puzzle'] ?? []) {
  p(`[${pz.d}]`);
  p(`  type: ${get(pz.tags, 'puzzle-type')}`);
  p(`  title: ${get(pz.tags, 'title') ?? '(missing)'}`);
  p(`  desc: ${pz.content?.slice(0, 140)}`);
  const req = getAll(pz.tags, 'requires').map(t => `${t[1]}[${t[2]||'any'}]`).join(', ');
  if (req) p(`  requires: ${req}`);
  const onComplete = getAll(pz.tags, 'on-complete').map(t => t.slice(1).join(' ')).join(' | ');
  if (onComplete) p(`  on-complete: ${onComplete}`);
  const onFail = getAll(pz.tags, 'on-fail').map(t => t.slice(1).join(' ')).join(' | ');
  if (onFail) p(`  on-fail: ${onFail}`);
  const hint = get(pz.tags, 'hint');
  if (hint) p(`  hint: ${hint.slice(0, 100)}`);
  const answer = get(pz.tags, 'answer');
  if (answer) p(`  answer-hash: ${answer.slice(0, 20)}...`);
}

// ── SOUND ─────────────────────────────────────────────────────────────────
h('SOUND EVENTS');
for (const sn of byType['sound'] ?? []) {
  const sample = get(sn.tags, 'sample');
  const loop = get(sn.tags, 'loop');
  p(`[${sn.d}] sample:${sample} loop:${loop ?? 'no'}`);
}

console.log(lines.join('\n'));
