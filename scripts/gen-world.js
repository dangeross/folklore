#!/usr/bin/env node
/**
 * gen-world.js — Synthetic world generator for scaling tests.
 *
 * Generates a valid folklore world JSON importable via the builder.
 * Places are arranged in a W×H grid connected by cardinal exits via
 * proper portal events (one portal per edge, bidirectional).
 * Items, NPCs, and recipes are distributed across the grid.
 *
 * Usage:
 *   node scripts/gen-world.js [options]
 *
 * Options:
 *   --width  N      Grid width  (default: 15)
 *   --height N      Grid height (default: 15)
 *   --items  N      Number of items to scatter (default: 40)
 *   --npcs   N      Number of NPCs to place    (default: 20)
 *   --recipes N     Number of craft recipes     (default: 10)
 *   --slug   NAME   World slug (default: stress-test)
 *   --out    FILE   Output path (default: docs/worlds/<slug>.json)
 *
 * Approximate event counts (places + portals dominate):
 *   15×15  → ~650 events    (Colossal Cave scale)
 *   30×30  → ~2,600 events  (×4)
 *   50×50  → ~7,200 events  (×10)
 *   150×150 → ~65,000 events (×100)
 *   475×475 → ~650,000 events (×1000)
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : def;
}

const WIDTH    = parseInt(getArg('width',   '15'), 10);
const HEIGHT   = parseInt(getArg('height',  '15'), 10);
const N_ITEMS  = parseInt(getArg('items',   '40'), 10);
const N_NPCS   = parseInt(getArg('npcs',    '20'), 10);
const N_RECIPES= parseInt(getArg('recipes', '10'), 10);
const SLUG     = getArg('slug', 'stress-test');
const OUT      = getArg('out', resolve(__dirname, `../docs/worlds/${SLUG}.json`));
const PUBKEY   = '<PUBKEY>';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ref = (dtag) => `30078:${PUBKEY}:${dtag}`;

let _seed = 42;
function rand(n) { _seed = (_seed * 1664525 + 1013904223) & 0xffffffff; return Math.abs(_seed) % n; }
function pick(arr) { return arr[rand(arr.length)]; }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const ROOM_NAMES = [
  'Cavern', 'Passage', 'Chamber', 'Hall', 'Tunnel', 'Vault', 'Alcove',
  'Grotto', 'Shaft', 'Gallery', 'Nave', 'Atrium', 'Crypt', 'Foyer',
  'Rotunda', 'Annex', 'Recess', 'Corridor', 'Antechamber', 'Sanctum',
  'Lair', 'Warren', 'Den', 'Pit', 'Basin', 'Nook', 'Hollow', 'Cellar',
];
const ADJECTIVES = [
  'Dark', 'Narrow', 'Wet', 'Dusty', 'Echoing', 'Forgotten', 'Ancient',
  'Crumbling', 'Vast', 'Low', 'Winding', 'Hidden', 'Stone', 'Mossy',
  'Flooded', 'Frozen', 'Scorched', 'Collapsed', 'Cavernous', 'Damp',
  'Gloomy', 'Luminous', 'Ruined', 'Carved', 'Hewn', 'Rough', 'Smooth',
];
const ITEM_NAMES = [
  'lantern', 'key', 'rope', 'coin', 'gem', 'axe', 'torch', 'map',
  'scroll', 'flask', 'dagger', 'crown', 'ring', 'shard', 'orb',
  'compass', 'lens', 'seal', 'token', 'amulet', 'rune', 'vial',
  'cog', 'lever', 'spool', 'crystal', 'disk', 'hook', 'lock', 'pin',
  'bone', 'feather', 'stone', 'powder', 'wire', 'gear', 'valve', 'chip',
];
const NPC_NAMES = [
  'guard', 'merchant', 'ghost', 'troll', 'sprite', 'hermit', 'oracle',
  'golem', 'thief', 'wizard', 'wanderer', 'sentinel', 'shade', 'imp',
  'wraith', 'crawler', 'warden', 'spirit', 'hunter', 'keeper',
];

// ── Build events ─────────────────────────────────────────────────────────────

const events = [];

function placeId(r, c) { return `${SLUG}:place:r${r}c${c}`; }
function portalId(r1, c1, r2, c2) { return `${SLUG}:portal:r${r1}c${c1}-r${r2}c${c2}`; }

// 1. World event
events.push({
  kind: 30078,
  tags: [
    ['d', `${SLUG}:world`],
    ['t', SLUG],
    ['type', 'world'],
    ['title', `Stress Test ${WIDTH}×${HEIGHT}`],
    ['author', 'gen-world.js'],
    ['version', '1.0.0'],
    ['lang', 'en'],
    ['collaboration', 'closed'],
    ['w', 'folklore'],
    ['start', ref(placeId(0, 0))],
    ['counter', 'moves', '0'],
    ['on-move', '', 'increment', 'moves'],
    ['hud', 'Moves: {{moves}}'],
  ],
  content: `A ${WIDTH}×${HEIGHT} synthetic world. ${N_ITEMS} items, ${N_NPCS} NPCs, ${N_RECIPES} recipes.`,
});

// 2. Places — W×H grid
// Exit tags on place events declare available slots only (no destination).
// Destinations are on portal events.
const usedNames = new Set();
function uniqueName() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const name = `${pick(ADJECTIVES)} ${pick(ROOM_NAMES)}`;
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
  }
  return `Room ${usedNames.size}`;
}

// Build a lookup array for fast place event access when attaching items/NPCs
const placeEvents = [];
for (let r = 0; r < HEIGHT; r++) {
  placeEvents.push([]);
  for (let c = 0; c < WIDTH; c++) {
    const dtag = placeId(r, c);
    const name = uniqueName();
    const tags = [
      ['d', dtag],
      ['t', SLUG],
      ['type', 'place'],
      ['title', name],
    ];
    // Declare exit slots — portals may only use declared slots
    if (r > 0)          tags.push(['exit', 'north']);
    if (r < HEIGHT - 1) tags.push(['exit', 'south']);
    if (c > 0)          tags.push(['exit', 'west']);
    if (c < WIDTH - 1)  tags.push(['exit', 'east']);

    const ev = { kind: 30078, tags, content: `You are in the ${name.toLowerCase()}.` };
    placeEvents[r].push(ev);
    events.push(ev);
  }
}

// 3. Portals — one per grid edge (bidirectional)
// Horizontal edges: (r,c) ↔ (r,c+1) via east/west
// Vertical edges:   (r,c) ↔ (r+1,c) via south/north
let portalCount = 0;
for (let r = 0; r < HEIGHT; r++) {
  for (let c = 0; c < WIDTH; c++) {
    // South edge: (r,c) → (r+1,c)
    if (r < HEIGHT - 1) {
      events.push({
        kind: 30078,
        tags: [
          ['d', portalId(r, c, r + 1, c)],
          ['t', SLUG],
          ['type', 'portal'],
          ['title', `Passage r${r}c${c}↔r${r+1}c${c}`],
          ['exit', ref(placeId(r,     c)), 'south', ''],
          ['exit', ref(placeId(r + 1, c)), 'north', ''],
        ],
      });
      portalCount++;
    }
    // East edge: (r,c) → (r,c+1)
    if (c < WIDTH - 1) {
      events.push({
        kind: 30078,
        tags: [
          ['d', portalId(r, c, r, c + 1)],
          ['t', SLUG],
          ['type', 'portal'],
          ['title', `Passage r${r}c${c}↔r${r}c${c+1}`],
          ['exit', ref(placeId(r, c    )), 'east', ''],
          ['exit', ref(placeId(r, c + 1)), 'west', ''],
        ],
      });
      portalCount++;
    }
  }
}

// 4. Items — scatter across random places
const usedItems = new Set();
function uniqueItem() {
  const available = ITEM_NAMES.filter((n) => !usedItems.has(n));
  if (available.length === 0) return `item-${usedItems.size}`;
  const n = pick(available); usedItems.add(n); return n;
}

const itemDtags = [];
for (let i = 0; i < N_ITEMS; i++) {
  const name = uniqueItem();
  const dtag = `${SLUG}:item:${name}-${i}`;
  itemDtags.push(dtag);

  const hasCounter = i % 4 === 0;
  const tags = [
    ['d', dtag],
    ['t', SLUG],
    ['type', 'item'],
    ['title', name.charAt(0).toUpperCase() + name.slice(1)],
    ['noun', name],
    ['state', 'unused'],
    ['transition', 'unused', 'used', `You use the ${name}.`],
    ['on-interact', 'use', '', 'set-state', 'used'],
  ];
  if (hasCounter) {
    tags.push(['counter', 'charge', '10']);
    tags.push(['on-move', 'unused', 'decrement', 'charge']);
  }

  const r = rand(HEIGHT), c = rand(WIDTH);
  placeEvents[r][c].tags.push(['item', ref(dtag)]);
  events.push({ kind: 30078, tags, content: `A ${name} of unclear purpose.` });
}

// 5. NPCs — place in random rooms
for (let i = 0; i < N_NPCS; i++) {
  const name = `${pick(NPC_NAMES)}-${i}`;
  const dtag = `${SLUG}:npc:${name}`;
  const r = rand(HEIGHT), c = rand(WIDTH);
  const tags = [
    ['d', dtag],
    ['t', SLUG],
    ['type', 'npc'],
    ['title', name.charAt(0).toUpperCase() + name.slice(1)],
    ['noun', name],
    ['health', '4'],
    ['damage', '1'],
    ['hit-chance', '0.6'],
    ['on-attacked', '', 'deal-damage', '2'],
  ];
  placeEvents[r][c].tags.push(['npc', ref(dtag)]);
  events.push({ kind: 30078, tags, content: `A ${name} watches you warily.` });
}

// 6. Recipes — combine pairs of items
const shuffledItems = shuffle(itemDtags);
for (let i = 0; i < N_RECIPES && i * 2 + 1 < shuffledItems.length; i++) {
  const ing1 = shuffledItems[i * 2];
  const ing2 = shuffledItems[i * 2 + 1];
  const resultName = `crafted-${i}`;
  const resultDtag = `${SLUG}:item:${resultName}`;
  const recipeDtag = `${SLUG}:recipe:craft-${i}`;

  events.push({
    kind: 30078,
    tags: [
      ['d', resultDtag], ['t', SLUG], ['type', 'item'],
      ['title', `Crafted Item ${i}`], ['noun', resultName],
    ],
    content: `Something you crafted.`,
  });
  events.push({
    kind: 30078,
    tags: [
      ['d', recipeDtag], ['t', SLUG], ['type', 'recipe'],
      ['title', `Craft ${resultName}`],
      ['verb', `craft-${i}`], ['noun', resultName],
      ['ingredient', ref(ing1)], ['ingredient', ref(ing2)],
      ['result', ref(resultDtag)],
    ],
    content: `Combine to create ${resultName}.`,
  });
}

// ── Walkthrough ───────────────────────────────────────────────────────────────
// Walk south to the bottom row, then east to the far corner
const walkthrough = [];
for (let r = 0; r < HEIGHT - 1; r++) walkthrough.push({ input: 'south', expect: [] });
for (let c = 0; c < WIDTH  - 1; c++) walkthrough.push({ input: 'east',  expect: [] });
walkthrough.push({ input: 'look',      expect: [] });
walkthrough.push({ input: 'inventory', expect: [] });

// ── Output ────────────────────────────────────────────────────────────────────

const world = { answers: {}, walkthrough, events };
writeFileSync(OUT, JSON.stringify(world, null, 2));

const type = (t) => events.filter((e) => e.tags.find((x) => x[0] === 'type')?.[1] === t).length;
console.log(`Generated ${SLUG}:`);
console.log(`  ${events.length} total events`);
console.log(`  ${type('place')} places (${WIDTH}×${HEIGHT} grid)`);
console.log(`  ${portalCount} portals (${HEIGHT*(WIDTH-1) + WIDTH*(HEIGHT-1)} edges)`);
console.log(`  ${type('item')} items  (${N_ITEMS} base + ${N_RECIPES} crafted)`);
console.log(`  ${type('npc')} NPCs`);
console.log(`  ${type('recipe')} recipes`);
console.log(`  Written to ${OUT}`);
