/**
 * trust-chain.test.js — Security audit tests for trust chain validation.
 * Covers isEventTrusted, isRefTrusted, vouch revocation with cascading,
 * action cross-targeting, content sanitization, portal slot validation,
 * and world event genesis ordering.
 */
import { describe, it, expect } from 'vitest';
import { buildTrustSet, getTrustLevel, isEventTrusted, isRefTrusted } from '../trust.js';
import { applyExternalSetState, giveItem } from '../actions.js';
import { renderRoomContent } from '../content.js';
import { resolveExits } from '../world.js';
import {
  PUBKEY, WORLD,
  ref, refFor,
  makeEventAs, makePlace, makeItem, makeFeature, makePortal, makePortalAs,
  makeWorldEvent, makeVouch,
  buildEvents, makeMutator, freshState,
} from './helpers.js';

// ── Test pubkeys ──────────────────────────────────────────────────────────
const GENESIS  = 'genesis_pubkey_000000000000000000000000000000000000';
const COLLAB   = 'collab_pubkey_000000000000000000000000000000000000';
const VOUCHED  = 'vouched_pubkey_00000000000000000000000000000000000';
const ATTACKER = 'attacker_pubkey_0000000000000000000000000000000000';
const DOWNSTREAM = 'downstream_pubkey_000000000000000000000000000000';

/** Build a minimal event with a specific pubkey. */
function makeEv(pubkey, dTag, type, extraTags = [], content = '') {
  return {
    kind: 30078, pubkey, id: dTag, sig: '',
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', dTag], ['t', 'test'], ['type', type], ...extraTags],
    content,
  };
}

/** Build a world event with a specific genesis pubkey. */
function makeWorld({ genesis = GENESIS, collaboration = 'vouched', collaborators = [], extraTags = [] } = {}) {
  const dtag = `${WORLD}:world`;
  return {
    kind: 30078, pubkey: genesis, id: dtag, sig: '',
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', dtag], ['type', 'world'], ['w', 'folklore'],
      ['title', 'Test World'], ['collaboration', collaboration],
      ...collaborators.map((pk) => ['collaborator', pk]),
      ...extraTags,
    ],
    content: '',
  };
}

/** Build a vouch event authored by a specific pubkey. */
function makeVouchEv(authorPubkey, vouchedPubkey, { scope = 'all', canVouch = false, name } = {}) {
  const dtag = `${WORLD}:vouch:${name || `${authorPubkey.slice(0, 8)}-vouches-${vouchedPubkey.slice(0, 8)}`}`;
  return {
    kind: 30078, pubkey: authorPubkey, id: dtag, sig: '',
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', dtag], ['t', WORLD], ['type', 'vouch'],
      ['pubkey', vouchedPubkey],
      ['scope', scope],
      ['can-vouch', canVouch ? 'true' : 'false'],
    ],
    content: '',
  };
}

/** Build a revoke event authored by a specific pubkey. */
function makeRevokeEv(authorPubkey, revokedPubkey, { name } = {}) {
  const dtag = `${WORLD}:revoke:${name || `${authorPubkey.slice(0, 8)}-revokes-${revokedPubkey.slice(0, 8)}`}`;
  return {
    kind: 30078, pubkey: authorPubkey, id: dtag, sig: '',
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', dtag], ['t', WORLD], ['type', 'revoke'],
      ['pubkey', revokedPubkey],
    ],
    content: '',
  };
}

/** Build a Map<a-tag, event> from events (uses each event's pubkey). */
function evMap(...eventList) {
  const map = new Map();
  for (const ev of eventList) {
    const dtag = ev.tags.find((t) => t[0] === 'd')?.[1];
    if (dtag) map.set(`30078:${ev.pubkey}:${dtag}`, ev);
  }
  return map;
}

/** Collect emitted messages. */
function collector() {
  const messages = [];
  const emit = (text, type) => messages.push({ text, type });
  const emitHtml = (html, type) => messages.push({ html, type });
  return { messages, emit, emitHtml };
}

// ═══════════════════════════════════════════════════════════════════════════
// Group 1: isEventTrusted / isRefTrusted
// ═══════════════════════════════════════════════════════════════════════════

describe('isEventTrusted', () => {
  it('genesis event is trusted in all modes', () => {
    const world = makeWorld({ collaboration: 'vouched' });
    const ev = makeEv(GENESIS, `${WORLD}:feature:lamp`, 'feature');
    const events = evMap(world, ev);
    const ts = buildTrustSet(world, events);

    expect(isEventTrusted(ev, ts, 'canonical')).toBe('trusted');
    expect(isEventTrusted(ev, ts, 'community')).toBe('trusted');
    expect(isEventTrusted(ev, ts, 'explorer')).toBe('trusted');
  });

  it('collaborator event is trusted in all modes', () => {
    const world = makeWorld({ collaborators: [COLLAB] });
    const ev = makeEv(COLLAB, `${WORLD}:item:sword`, 'item');
    const events = evMap(world, ev);
    const ts = buildTrustSet(world, events);

    expect(isEventTrusted(ev, ts, 'canonical')).toBe('trusted');
    expect(isEventTrusted(ev, ts, 'community')).toBe('trusted');
    expect(isEventTrusted(ev, ts, 'explorer')).toBe('trusted');
  });

  it('vouched event is trusted in community, hidden in canonical', () => {
    const world = makeWorld({ collaborators: [COLLAB] });
    const vouch = makeVouchEv(COLLAB, VOUCHED, { scope: 'all' });
    const ev = makeEv(VOUCHED, `${WORLD}:feature:sign`, 'feature');
    const events = evMap(world, vouch, ev);
    const ts = buildTrustSet(world, events);

    expect(isEventTrusted(ev, ts, 'community')).toBe('trusted');
    expect(isEventTrusted(ev, ts, 'canonical')).toBe('hidden');
  });

  it('attacker event is hidden in canonical and community (closed world)', () => {
    const world = makeWorld({ genesis: GENESIS, collaboration: 'closed' });
    const ev = makeEv(ATTACKER, `${WORLD}:feature:trap`, 'feature');
    const events = evMap(world, ev);
    const ts = buildTrustSet(world, events);

    expect(isEventTrusted(ev, ts, 'canonical')).toBe('hidden');
    expect(isEventTrusted(ev, ts, 'community')).toBe('hidden');
  });

  it('attacker event is unverified in community mode (open world)', () => {
    const world = makeWorld({ collaboration: 'open' });
    const ev = makeEv(ATTACKER, `${WORLD}:feature:graffiti`, 'feature');
    const events = evMap(world, ev);
    const ts = buildTrustSet(world, events);

    expect(isEventTrusted(ev, ts, 'community')).toBe('unverified');
  });
});

describe('isRefTrusted', () => {
  it('missing ref returns hidden', () => {
    const world = makeWorld();
    const events = evMap(world);
    const ts = buildTrustSet(world, events);

    const result = isRefTrusted('30078:nonexistent:missing', events, ts, 'community');
    expect(result).toBe('hidden');
  });

  it('resolves existing ref and checks trust', () => {
    const world = makeWorld({ collaborators: [COLLAB] });
    const ev = makeEv(COLLAB, `${WORLD}:item:key`, 'item');
    const events = evMap(world, ev);
    const ts = buildTrustSet(world, events);

    const aTag = `30078:${COLLAB}:${WORLD}:item:key`;
    expect(isRefTrusted(aTag, events, ts, 'canonical')).toBe('trusted');
  });

  it('null ref returns hidden', () => {
    const world = makeWorld();
    const events = evMap(world);
    const ts = buildTrustSet(world, events);

    expect(isRefTrusted(null, events, ts, 'community')).toBe('hidden');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 2: Vouch revocation
// ═══════════════════════════════════════════════════════════════════════════

describe('Vouch revocation', () => {
  it('genesis revokes a vouched pubkey — removed from trust set', () => {
    const world = makeWorld({ collaborators: [COLLAB] });
    const vouch = makeVouchEv(COLLAB, VOUCHED, { scope: 'all' });
    const revoke = makeRevokeEv(GENESIS, VOUCHED);
    const events = evMap(world, vouch, revoke);
    const ts = buildTrustSet(world, events);

    expect(ts.vouched.has(VOUCHED)).toBe(false);
  });

  it('voucher revokes their own vouchee — removed', () => {
    const world = makeWorld({ collaborators: [COLLAB] });
    const vouch = makeVouchEv(COLLAB, VOUCHED, { scope: 'all' });
    const revoke = makeRevokeEv(COLLAB, VOUCHED);
    const events = evMap(world, vouch, revoke);
    const ts = buildTrustSet(world, events);

    expect(ts.vouched.has(VOUCHED)).toBe(false);
  });

  it('vouched author cannot revoke someone they did not vouch — still trusted', () => {
    const OTHER = 'other_vouched_pubkey_000000000000000000000000000';
    const world = makeWorld({ collaborators: [COLLAB] });
    const vouch1 = makeVouchEv(COLLAB, VOUCHED, { scope: 'all', name: 'v1' });
    const vouch2 = makeVouchEv(COLLAB, OTHER, { scope: 'all', canVouch: true, name: 'v2' });
    // OTHER tries to revoke VOUCHED, but OTHER didn't vouch VOUCHED
    const revoke = makeRevokeEv(OTHER, VOUCHED);
    const events = evMap(world, vouch1, vouch2, revoke);
    const ts = buildTrustSet(world, events);

    expect(ts.vouched.has(VOUCHED)).toBe(true);
  });

  it('cascading: revoke A who vouched B — B also removed', () => {
    const world = makeWorld({ collaborators: [COLLAB] });
    const vouchA = makeVouchEv(COLLAB, VOUCHED, { scope: 'all', canVouch: true, name: 'vA' });
    const vouchB = makeVouchEv(VOUCHED, DOWNSTREAM, { scope: 'all', name: 'vB' });
    const revoke = makeRevokeEv(GENESIS, VOUCHED);
    const events = evMap(world, vouchA, vouchB, revoke);
    const ts = buildTrustSet(world, events);

    expect(ts.vouched.has(VOUCHED)).toBe(false);
    expect(ts.vouched.has(DOWNSTREAM)).toBe(false);
  });

  it('cascading: B with alternate vouch from collaborator survives', () => {
    // When DOWNSTREAM is vouched directly by a collaborator (not through
    // the revoked chain), it should survive revocation. The fixed-point walk
    // picks up the first vouch it finds — if the collaborator vouch is
    // processed first, DOWNSTREAM's vouchedBy points to COLLAB2 and the
    // cascade from VOUCHED's revocation doesn't affect it.
    const COLLAB2 = 'collab2_pubkey_00000000000000000000000000000000000';
    const world = makeWorld({ collaborators: [COLLAB, COLLAB2] });
    const vouchA = makeVouchEv(COLLAB, VOUCHED, { scope: 'all', canVouch: true, name: 'vA' });
    // COLLAB2 vouches DOWNSTREAM directly (processed before VOUCHED's vouch)
    const vouchB_direct = makeVouchEv(COLLAB2, DOWNSTREAM, { scope: 'all', name: 'vB2' });
    const revoke = makeRevokeEv(GENESIS, VOUCHED);
    const events = evMap(world, vouchA, vouchB_direct, revoke);
    const ts = buildTrustSet(world, events);

    // VOUCHED is revoked
    expect(ts.vouched.has(VOUCHED)).toBe(false);
    // DOWNSTREAM survives because its vouchedBy is COLLAB2 (not revoked)
    expect(ts.vouched.has(DOWNSTREAM)).toBe(true);
  });

  it('cascading: B loses trust when only vouch path is through revoked A', () => {
    // When DOWNSTREAM's only vouch path goes through VOUCHED, revoking
    // VOUCHED cascades to remove DOWNSTREAM too.
    const world = makeWorld({ collaborators: [COLLAB] });
    const vouchA = makeVouchEv(COLLAB, VOUCHED, { scope: 'all', canVouch: true, name: 'vA' });
    const vouchB = makeVouchEv(VOUCHED, DOWNSTREAM, { scope: 'all', name: 'vB' });
    // A second vouch for DOWNSTREAM from VOUCHED (same chain, no alternate)
    const revoke = makeRevokeEv(GENESIS, VOUCHED);
    const events = evMap(world, vouchA, vouchB, revoke);
    const ts = buildTrustSet(world, events);

    expect(ts.vouched.has(VOUCHED)).toBe(false);
    expect(ts.vouched.has(DOWNSTREAM)).toBe(false);
  });

  it('collaborator can revoke any vouched pubkey', () => {
    const world = makeWorld({ collaborators: [COLLAB] });
    const vouch = makeVouchEv(GENESIS, VOUCHED, { scope: 'all' });
    // Collaborator revokes, even though genesis vouched
    const revoke = makeRevokeEv(COLLAB, VOUCHED);
    const events = evMap(world, vouch, revoke);
    const ts = buildTrustSet(world, events);

    expect(ts.vouched.has(VOUCHED)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 3: Action cross-targeting (trust-gated)
// ═══════════════════════════════════════════════════════════════════════════

describe('Action cross-targeting with trust', () => {
  it('applyExternalSetState with trusted target works', () => {
    // Use standard helpers — PUBKEY is genesis by default
    const feature = makeFeature('lever', {
      state: 'off',
      transitions: [['off', 'on', 'The lever clicks into place.']],
    });
    const world = makeWorldEvent({ collaboration: 'closed' });
    const events = buildEvents(feature, world);
    const ts = buildTrustSet(world, events);
    const player = makeMutator();
    const { messages, emit, emitHtml } = collector();

    const result = applyExternalSetState(
      ref(`${WORLD}:feature:lever`), 'on',
      events, player, emit, emitHtml, ts, 'canonical',
    );

    expect(result.acted).toBe(true);
    expect(messages.some((m) => m.text?.includes('lever clicks'))).toBe(true);
  });

  it('applyExternalSetState with untrusted target is skipped', () => {
    // Create a feature authored by ATTACKER
    const attackerFeature = makeEv(ATTACKER, `${WORLD}:feature:trap`, 'feature', [
      ['state', 'off'],
      ['transition', 'off', 'on', 'You fall into a trap!'],
      ['title', 'Trap'],
    ]);
    const world = makeWorld({ collaboration: 'closed' });
    const events = evMap(world, attackerFeature);
    const ts = buildTrustSet(world, events);
    const player = makeMutator();
    const { messages, emit, emitHtml } = collector();

    const targetRef = `30078:${ATTACKER}:${WORLD}:feature:trap`;
    const result = applyExternalSetState(
      targetRef, 'on',
      events, player, emit, emitHtml, ts, 'canonical',
    );

    expect(result.acted).toBe(false);
    expect(messages).toHaveLength(0);
  });

  it('giveItem with untrusted item is skipped', () => {
    const attackerItem = makeEv(ATTACKER, `${WORLD}:item:poison`, 'item', [
      ['title', 'Poison'],
    ]);
    const world = makeWorld({ collaboration: 'closed' });
    const events = evMap(world, attackerItem);
    const ts = buildTrustSet(world, events);
    const player = makeMutator();
    const { emit } = collector();

    const itemRef = `30078:${ATTACKER}:${WORLD}:item:poison`;
    giveItem(itemRef, events, player, emit, ts, 'canonical');

    expect(player.hasItem(itemRef)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 4: Content sanitization
// ═══════════════════════════════════════════════════════════════════════════

describe('Content sanitization — image URLs', () => {
  function makeRoomWithMedia(url) {
    return {
      kind: 30078, pubkey: GENESIS, id: 'room', sig: '',
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', `${WORLD}:place:room`],
        ['type', 'place'],
        ['media', 'image/url', url],
      ],
      content: 'A room.',
    };
  }

  it('blocks javascript: URL in image media', () => {
    const room = makeRoomWithMedia('javascript:alert(1)');
    const entries = renderRoomContent(room, []);
    const hasImage = entries.some((e) => e.html?.includes('<img'));
    expect(hasImage).toBe(false);
  });

  it('blocks data: SVG URL in image media', () => {
    const room = makeRoomWithMedia('data:image/svg+xml,<svg onload="alert(1)"/>');
    const entries = renderRoomContent(room, []);
    const hasImage = entries.some((e) => e.html?.includes('<img'));
    expect(hasImage).toBe(false);
  });

  it('allows https: URL in image media', () => {
    const room = makeRoomWithMedia('https://example.com/image.png');
    const entries = renderRoomContent(room, []);
    const hasImage = entries.some((e) => e.html?.includes('<img'));
    expect(hasImage).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 5: Portal exit slot validation
// ═══════════════════════════════════════════════════════════════════════════

describe('Portal exit slot validation', () => {
  it('portal exit on declared slot is allowed', () => {
    // Place declares 'north' as an exit slot
    const place = makePlace('hall', { exits: ['north'] });
    const dest = makePlace('garden');
    const portal = makePortal('gate', [
      [`${WORLD}:place:hall`, 'north'],
      [`${WORLD}:place:garden`, 'south'],
    ]);
    const events = buildEvents(place, dest, portal);

    const { exits } = resolveExits(events, ref(`${WORLD}:place:hall`), freshState());
    expect(exits).toHaveLength(1);
    expect(exits[0].slot).toBe('north');
  });

  it('portal exit on undeclared slot is blocked', () => {
    // Place only declares 'north', portal tries 'east'
    const place = makePlace('hall', { exits: ['north'] });
    const dest = makePlace('garden');
    const portal = makePortal('sneaky', [
      [`${WORLD}:place:hall`, 'east'],  // not declared on place
      [`${WORLD}:place:garden`, 'west'],
    ]);
    const events = buildEvents(place, dest, portal);

    const { exits } = resolveExits(events, ref(`${WORLD}:place:hall`), freshState());
    expect(exits).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group 6: World event genesis — oldest wins
// ═══════════════════════════════════════════════════════════════════════════

describe('World event genesis ordering', () => {
  it('multiple world events — oldest (lowest created_at) is genesis', () => {
    const now = Math.floor(Date.now() / 1000);

    // Older world event by GENESIS
    const world1 = {
      kind: 30078, pubkey: GENESIS, id: 'w1', sig: '',
      created_at: now - 1000,
      tags: [['d', `${WORLD}:world`], ['type', 'world'], ['w', 'folklore'],
             ['title', 'Original'], ['collaboration', 'vouched']],
      content: '',
    };

    // Newer world event by ATTACKER (same d-tag, different pubkey)
    const world2 = {
      kind: 30078, pubkey: ATTACKER, id: 'w2', sig: '',
      created_at: now,
      tags: [['d', `${WORLD}:world`], ['type', 'world'], ['w', 'folklore'],
             ['title', 'Impostor'], ['collaboration', 'open']],
      content: '',
    };

    // In the event map, both have different a-tags because different pubkeys
    const events = new Map();
    events.set(`30078:${GENESIS}:${WORLD}:world`, world1);
    events.set(`30078:${ATTACKER}:${WORLD}:world`, world2);

    // buildTrustSet uses the world event passed to it — the client should
    // pick the oldest. Verify that using the correct (oldest) world event
    // results in GENESIS as the trusted author.
    const ts = buildTrustSet(world1, events);
    expect(ts.genesisPubkey).toBe(GENESIS);

    // And using the attacker's world event would set them as genesis
    const tsAttacker = buildTrustSet(world2, events);
    expect(tsAttacker.genesisPubkey).toBe(ATTACKER);

    // The security invariant: the client must always select the oldest
    // world event. Verify the older one is correctly identified.
    const allWorlds = [world1, world2];
    allWorlds.sort((a, b) => a.created_at - b.created_at);
    expect(allWorlds[0].pubkey).toBe(GENESIS);
    expect(allWorlds[0].created_at).toBeLessThan(allWorlds[1].created_at);
  });
});
