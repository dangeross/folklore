/**
 * Integration tests for the Saturday world — counter mechanic showcase.
 * Validates: earn coins (add-counter world fallback), gate (requires-counter),
 * spend coins (sub-counter world fallback), give-item, quest completion.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../engine.js';
import { PlayerStateMutator } from '../player-state.js';

// ── Load the world JSON ────────────────────────────────────────────────────

const PUBKEY = '0'.repeat(64);
const WORLD  = 'saturday';

function ref(dtag) {
  return `30078:${PUBKEY}:${dtag}`;
}

function makeEvent(dtag, tags, content = '') {
  return {
    kind: 30078,
    pubkey: PUBKEY,
    created_at: 1,
    tags: [['d', dtag], ...tags],
    content,
  };
}

// Inline minimal world that mirrors saturday.json structure
function buildSaturdayWorld() {
  const worldRef      = ref(`${WORLD}:world`);
  const homeRef       = ref(`${WORLD}:place:home`);
  const kitchenRef    = ref(`${WORLD}:place:kitchen`);
  const toyshopRef    = ref(`${WORLD}:place:toyshop`);
  const sinkRef       = ref(`${WORLD}:feature:sink`);
  const lawnRef       = ref(`${WORLD}:feature:lawn`);
  const floorRef      = ref(`${WORLD}:feature:floor`);
  const yoyoShelfRef  = ref(`${WORLD}:feature:yoyo-shelf`);
  const figShelfRef   = ref(`${WORLD}:feature:figure-shelf`);
  const carShelfRef   = ref(`${WORLD}:feature:car-shelf`);
  const yoyoItemRef   = ref(`${WORLD}:item:yo-yo`);
  const figItemRef    = ref(`${WORLD}:item:action-figure`);
  const carItemRef    = ref(`${WORLD}:item:rc-car`);
  const questRef      = ref(`${WORLD}:quest:mums-list`);
  const endgameRef    = ref(`${WORLD}:quest:best-saturday`);

  const world = makeEvent(`${WORLD}:world`, [
    ['type', 'world'],
    ['title', 'Saturday'],
    ['start', homeRef],
    ['collaboration', 'closed'],
    ['counter', 'coins', '0'],
  ]);

  const home = makeEvent(`${WORLD}:place:home`, [
    ['type', 'place'],
    ['title', 'Front Room'],
    ['feature', sinkRef],   // convenience: put all features in home for test
    ['feature', lawnRef],
    ['feature', floorRef],
    ['feature', yoyoShelfRef],
    ['feature', figShelfRef],
    ['feature', carShelfRef],
  ]);

  const sink = makeEvent(`${WORLD}:feature:sink`, [
    ['type', 'feature'],
    ['title', 'The Sink'],
    ['state', 'dirty'],
    ['noun', 'sink'],
    ['verb', 'wash'],
    ['on-interact', 'wash', 'dirty', 'add-counter', 'coins', '2'],
    ['on-interact', 'wash', 'dirty', 'set-state', 'done'],
    ['on-interact', 'wash', 'done', 'set-state', 'done'],
    ['transition', 'dirty', 'done', 'Washing done. (+2 coins)'],
    ['transition', 'done', 'done', 'Already done.'],
  ]);

  const lawn = makeEvent(`${WORLD}:feature:lawn`, [
    ['type', 'feature'],
    ['title', 'The Lawn'],
    ['state', 'long'],
    ['noun', 'lawn'],
    ['verb', 'mow'],
    ['on-interact', 'mow', 'long', 'add-counter', 'coins', '3'],
    ['on-interact', 'mow', 'long', 'set-state', 'done'],
    ['transition', 'long', 'done', 'Mowed. (+3 coins)'],
  ]);

  const floor = makeEvent(`${WORLD}:feature:floor`, [
    ['type', 'feature'],
    ['title', 'The Floor'],
    ['state', 'messy'],
    ['noun', 'floor'],
    ['verb', 'tidy'],
    ['on-interact', 'tidy', 'messy', 'add-counter', 'coins', '2'],
    ['on-interact', 'tidy', 'messy', 'set-state', 'done'],
    ['transition', 'messy', 'done', 'Tidied. (+2 coins)'],
  ]);

  const yoyoShelf = makeEvent(`${WORLD}:feature:yoyo-shelf`, [
    ['type', 'feature'],
    ['title', 'Yo-yo'],
    ['state', 'normal'],
    ['noun', 'yo-yo'],
    ['verb', 'buy'],
    ['requires-counter', 'buy', '', 'coins', '>=', '3', 'Not enough coins.'],
    ['on-interact', 'buy', 'normal', 'set-state', 'sold'],
    ['on-interact', 'buy', 'normal', 'sub-counter', 'coins', '3'],
    ['on-interact', 'buy', 'normal', 'give-item', yoyoItemRef],
    ['transition', 'normal', 'sold', 'You buy the yo-yo.'],
  ]);

  const figShelf = makeEvent(`${WORLD}:feature:figure-shelf`, [
    ['type', 'feature'],
    ['title', 'Action Figure'],
    ['state', 'normal'],
    ['noun', 'figure'],
    ['verb', 'buy'],
    ['requires-counter', 'buy', '', 'coins', '>=', '5', 'Not enough coins.'],
    ['on-interact', 'buy', 'normal', 'set-state', 'sold'],
    ['on-interact', 'buy', 'normal', 'sub-counter', 'coins', '5'],
    ['on-interact', 'buy', 'normal', 'give-item', figItemRef],
    ['transition', 'normal', 'sold', 'You buy the figure.'],
  ]);

  const carShelf = makeEvent(`${WORLD}:feature:car-shelf`, [
    ['type', 'feature'],
    ['title', 'Remote Control Car'],
    ['state', 'normal'],
    ['noun', 'car'],
    ['verb', 'buy'],
    ['requires-counter', 'buy', '', 'coins', '>=', '7', 'Need 7 coins.'],
    ['on-interact', 'buy', 'normal', 'set-state', 'sold'],
    ['on-interact', 'buy', 'normal', 'sub-counter', 'coins', '7'],
    ['on-interact', 'buy', 'normal', 'give-item', carItemRef],
    ['transition', 'normal', 'sold', 'You buy the RC car.'],
  ]);

  const yoyoItem  = makeEvent(`${WORLD}:item:yo-yo`,        [['type','item'],['title','Yo-yo']]);
  const figItem   = makeEvent(`${WORLD}:item:action-figure`,[['type','item'],['title','Action Figure']]);
  const carItem   = makeEvent(`${WORLD}:item:rc-car`,       [['type','item'],['title','Remote Control Car']]);

  const mumsList = makeEvent(`${WORLD}:quest:mums-list`, [
    ['type', 'quest'],
    ['title', "Mum's List"],
    ['requires', sinkRef,  'done', 'Wash up'],
    ['requires', lawnRef,  'done', 'Mow lawn'],
    ['requires', floorRef, 'done', 'Tidy room'],
    ['involves', sinkRef],
    ['involves', lawnRef],
    ['involves', floorRef],
  ]);

  const endgame = makeEvent(`${WORLD}:quest:best-saturday`, [
    ['type', 'quest'],
    ['quest-type', 'endgame'],
    ['title', 'Best Saturday'],
    ['requires', carShelfRef, 'sold', ''],
  ], 'Best Saturday.');

  const events = new Map();
  for (const ev of [world, home, sink, lawn, floor, yoyoShelf, figShelf, carShelf, yoyoItem, figItem, carItem, mumsList, endgame]) {
    const dtag = ev.tags.find(t => t[0] === 'd')[1];
    events.set(`30078:${PUBKEY}:${dtag}`, ev);
  }

  const player = new PlayerStateMutator({
    place: null, inventory: [], states: {}, counters: {}, cryptoKeys: [],
    dialogueVisited: {}, paymentAttempts: {}, visited: [], moveCount: 0,
  });

  const engine = new GameEngine({
    events,
    player,
    config: { GENESIS_PLACE: homeRef, AUTHOR_PUBKEY: PUBKEY },
  });

  engine.enterRoom(homeRef);
  engine.flush();

  return { engine, worldRef, homeRef, sinkRef, lawnRef, floorRef, yoyoShelfRef, figShelfRef, carShelfRef, yoyoItemRef, figItemRef, carItemRef, questRef, endgameRef };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Saturday — coin counter', () => {
  it('initialises world coins counter to 0', () => {
    const { engine } = buildSaturdayWorld();
    expect(engine.player.getCounter(`${WORLD}:world:coins`)).toBe(0);
  });

  it('add-counter falls back to world counter (no external ref in tag)', async () => {
    const { engine } = buildSaturdayWorld();
    await engine.handleCommand('wash sink');
    expect(engine.player.getCounter(`${WORLD}:world:coins`)).toBe(2);
  });

  it('each chore adds the right amount', async () => {
    const { engine } = buildSaturdayWorld();
    await engine.handleCommand('wash sink');   // +2
    await engine.handleCommand('mow lawn');    // +3
    await engine.handleCommand('tidy floor'); // +2
    expect(engine.player.getCounter(`${WORLD}:world:coins`)).toBe(7);
  });

  it('re-doing a chore does not add coins again', async () => {
    const { engine } = buildSaturdayWorld();
    await engine.handleCommand('wash sink');
    await engine.handleCommand('wash sink');
    expect(engine.player.getCounter(`${WORLD}:world:coins`)).toBe(2);
  });
});

describe('Saturday — requires-counter gate', () => {
  it('blocks purchase when coins insufficient', async () => {
    const { engine, yoyoShelfRef } = buildSaturdayWorld();
    const output = [];
    engine._emit = (t) => output.push(t);
    await engine.handleCommand('buy yo-yo');
    expect(output.some(t => /enough/i.test(t))).toBe(true);
    expect(engine.player.getState(yoyoShelfRef)).not.toBe('sold');
  });

  it('allows purchase when coins are sufficient', async () => {
    const { engine, yoyoShelfRef } = buildSaturdayWorld();
    await engine.handleCommand('wash sink');  // +2
    await engine.handleCommand('mow lawn');   // +3 → total 5
    engine.flush();
    await engine.handleCommand('buy yo-yo');  // costs 3
    expect(engine.player.getState(yoyoShelfRef)).toBe('sold');
  });
});

describe('Saturday — sub-counter on purchase', () => {
  it('deducts coins on purchase', async () => {
    const { engine } = buildSaturdayWorld();
    await engine.handleCommand('wash sink');   // +2
    await engine.handleCommand('mow lawn');    // +3 → 5
    await engine.handleCommand('tidy floor'); // +2 → 7
    engine.flush();
    await engine.handleCommand('buy car');
    expect(engine.player.getCounter(`${WORLD}:world:coins`)).toBe(0);
  });

  it('gives item to player on purchase', async () => {
    const { engine, yoyoItemRef } = buildSaturdayWorld();
    await engine.handleCommand('wash sink');   // +2
    await engine.handleCommand('mow lawn');    // +3 → 5
    engine.flush();
    await engine.handleCommand('buy yo-yo');   // costs 3
    expect(engine.player.hasItem(yoyoItemRef)).toBe(true);
    expect(engine.player.getCounter(`${WORLD}:world:coins`)).toBe(2);
  });

  it('can buy multiple items with remaining coins', async () => {
    const { engine, yoyoItemRef, figItemRef } = buildSaturdayWorld();
    // earn 7
    await engine.handleCommand('wash sink');
    await engine.handleCommand('mow lawn');
    await engine.handleCommand('tidy floor');
    engine.flush();
    await engine.handleCommand('buy yo-yo');   // costs 3, leaves 4
    await engine.handleCommand('buy figure');  // costs 5 — not enough
    engine.flush();
    expect(engine.player.hasItem(yoyoItemRef)).toBe(true);
    expect(engine.player.hasItem(figItemRef)).toBe(false);
    expect(engine.player.getCounter(`${WORLD}:world:coins`)).toBe(4);
  });
});

describe("Saturday — Mum's List quest", () => {
  it('completes when all three chores are done', async () => {
    const { engine, questRef } = buildSaturdayWorld();
    expect(engine.player.getState(questRef)).toBeUndefined();
    await engine.handleCommand('wash sink');
    await engine.handleCommand('mow lawn');
    await engine.handleCommand('tidy floor');
    expect(engine.player.getState(questRef)).toBe('complete');
  });

  it('does not complete with only two chores', async () => {
    const { engine, questRef } = buildSaturdayWorld();
    await engine.handleCommand('wash sink');
    await engine.handleCommand('mow lawn');
    expect(engine.player.getState(questRef)).not.toBe('complete');
  });
});

describe('Saturday — endgame', () => {
  it('triggers endgame when RC car is purchased', async () => {
    const { engine, endgameRef } = buildSaturdayWorld();
    // Earn all 7 coins
    await engine.handleCommand('wash sink');
    await engine.handleCommand('mow lawn');
    await engine.handleCommand('tidy floor');
    engine.flush();
    await engine.handleCommand('buy car');
    expect(engine.player.getState(endgameRef)).toBe('complete');
    expect(engine.gameOver).toBeTruthy();
  });
});
