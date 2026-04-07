/**
 * GameEngine — central orchestrator for the NOSTR dungeon game.
 * No React imports. Plain JS class.
 */

import {
  getTag, getTags, checkRequires,
  getDefaultState, findTransition,
} from './world.js';
import { isRefTrusted, isEventTrusted } from './trust.js';
import { derivePrivateKey } from './nip44-client.js';
import { renderRoomContent, renderMarkdown } from './content.js';
import { stripArticles, findInventoryItem } from './parser.js';
import {
  applyExternalSetState, giveItem,
} from './actions.js';
import { initNpcState, findRoamingNpcsAtPlace } from './npc.js';
import { mixCombat } from './combat.js';
import { mixDialogue } from './dialogue.js';
import { mixCrafting } from './crafting.js';
import { mixQuest } from './quest.js';
import { mixPuzzle } from './puzzle.js';
import { mixNpcEncounter } from './npc-encounter.js';
import { mixMovement } from './movement.js';
import { mixConsequence } from './consequence.js';
import { mixReport } from './report.js';
import { mixContainer } from './container.js';
import { mixInteraction } from './interaction.js';
import { mixCommand } from './command.js';

/**
 * Generate natural-language presence text for a feature title.
 * Handles plurals, "The " prefix, possessives, and vowel articles.
 */
function featurePresenceText(title) {
  const words = title.trim().split(/\s+/);
  const lastWord = words[words.length - 1];

  // "The X" / "the X" → "There is/are the X here."
  if (title.startsWith('The ') || title.startsWith('the ')) {
    const rest = title.slice(4); // strip leading "The "
    const restLast = rest.trim().split(/\s+/).pop();
    const restPlural = restLast.endsWith('s') && !restLast.endsWith("'s") && !restLast.endsWith('ss');
    return restPlural
      ? `There are the ${rest} here.`
      : `There is the ${rest} here.`;
  }

  // Plural: last word ends with 's' (but not possessive "'s" or double-s like "compass")
  const isPlural = lastWord.endsWith('s') && !lastWord.endsWith("'s") && !lastWord.endsWith('ss');
  if (isPlural) {
    return `There are ${title} here.`;
  }

  // Vowel article: "an"
  const firstChar = title.charAt(0).toLowerCase();
  if ('aeiou'.includes(firstChar)) {
    return `There is an ${title} here.`;
  }

  return `There is a ${title} here.`;
}

export class GameEngine {
  /**
   * @param {Object} opts
   * @param {Map} opts.events — Map<a-tag, event>
   * @param {import('./player-state.js').PlayerStateMutator} opts.player
   * @param {{ GENESIS_PLACE: string, AUTHOR_PUBKEY: string, trustSet?: Object, clientMode?: string }} opts.config
   */
  constructor({ events, player, config }) {
    this.events = events;
    this.player = player;
    this.config = config;

    // Restore position from saved state, or start at genesis.
    // If saved place no longer exists in events (e.g. identity change), reset to start.
    const savedPlace = player.state.place;
    this.currentPlace = (savedPlace && events.has(savedPlace)) ? savedPlace : config.GENESIS_PLACE;
    this.puzzleActive = null;
    this.dialogueActive = null;
    this.paymentActive = null;   // { dtag, lnurl, amount, unit, description }
    this.pendingChoice = null;  // { direction, exits } — disambiguation list awaiting numeric input
    this.craftingActive = null; // { recipeDtag, step, itemRequires } — ordered crafting mode
    this.combatTarget = null;  // NPC dtag during a combat round
    this.gameOver = null;      // null | 'hard' | 'soft' — endgame quest state
    this.pendingReport = null; // { targetRef, title, author } — awaiting reason text

    // Initialize player health from world event if not already set
    if (player.getHealth() == null) {
      const worldEvent = this._findWorldEvent(events);
      const hp = worldEvent ? parseInt(getTag(worldEvent, 'health') || '0', 10) : 0;
      const maxHp = worldEvent ? parseInt(getTag(worldEvent, 'max-health') || '0', 10) : 0;
      if (hp > 0 || maxHp > 0) {
        player.setHealth(hp || maxHp || 10);
        player.setMaxHealth(maxHp || hp || 10);
      }
    }

    // Initialize world-scoped counters (player-owned)
    {
      const worldEvent = this._findWorldEvent(events);
      if (worldEvent) {
        const worldDtag = getTag(worldEvent, 'd');
        for (const ct of getTags(worldEvent, 'counter')) {
          const key = `${worldDtag}:${ct[1]}`;
          if (player.getCounter(key) === undefined) {
            player.setCounter(key, parseInt(ct[2], 10) || 0);
          }
        }
      }
    }

    /** @type {Array<{text?: string, html?: string, type: string}>} */
    this.output = [];
  }

  /**
   * Check if inventory is full (max-inventory on world event).
   * If full, shows blocked message and fires on-inventory-full triggers.
   * Returns true if blocked.
   */
  _checkInventoryFull() {
    const worldEvent = this._findWorldEvent();
    if (!worldEvent) return false;
    const maxTag = getTags(worldEvent, 'max-inventory')[0];
    if (!maxTag) return false;
    const maxItems = parseInt(maxTag[1], 10);
    if (isNaN(maxItems) || this.player.state.inventory.length < maxItems) return false;

    // Inventory full — block and show message
    const message = maxTag[2] || "You're carrying too much.";
    this._emit(message, 'error');

    // Fire on-inventory-full triggers
    const worldDtag = getTag(worldEvent, 'd');
    for (const tag of getTags(worldEvent, 'on-inventory-full')) {
      const action = tag[2];
      const actionTarget = tag[3];
      const extRef = tag[4];
      this._dispatchAction({
        action, target: actionTarget, extRef,
        selfDtag: worldDtag, selfEvent: worldEvent,
      });
    }
    return true;
  }

  /**
   * Give item with inventory cap check.
   * Returns true if item was given, false if blocked by cap.
   */
  _giveItemChecked(itemRef) {
    if (this.player.hasItem(itemRef)) return true; // already has it
    if (this._checkInventoryFull()) return false;
    giveItem(itemRef, this.events, this.player, (t, ty) => this._emit(t, ty), this.config.trustSet, this.config.clientMode);
    return true;
  }

  /** Find the world event in the events map. */
  _findWorldEvent(evts) {
    for (const [, event] of (evts || this.events)) {
      if (getTag(event, 'type') === 'world') return event;
    }
    return null;
  }

  // In open worlds, don't label content as unverified (spec 6.9)
  _isOpenWorld() {
    return this.config.trustSet?.collaboration === 'open';
  }

  _uvLabel(trustLevel) {
    if (this._isOpenWorld()) return '';
    return trustLevel === 'unverified' ? ' (unverified)' : '';
  }

  // ── Output helpers ────────────────────────────────────────────────────

  _emit(text, type = 'narrative') {
    this.output.push({ text, type });
  }

  _emitHtml(html, type = 'narrative') {
    this.output.push({ html, type });
  }

  _emitSound(pattern, volume = 1.0) {
    this.output.push({ sound: pattern, volume: parseFloat(volume) || 1.0, type: 'sound' });
  }


  // ── Unified action dispatcher ───────────────────────────────────────

  /**
   * Dispatch a single action from an on-* trigger tag.
   *
   * @param {Object} params
   * @param {string} params.action — action type (set-state, give-item, etc.)
   * @param {string} [params.target] — primary action argument (state value, item ref, damage amount, counter name, etc.)
   * @param {string} [params.extRef] — secondary argument (external event ref, counter value, etc.)
   * @param {string} params.selfDtag — d-tag of the event declaring this trigger
   * @param {Object} params.selfEvent — the event declaring this trigger
   * @param {Object} [params.opts] — extra context from the call site
   * @param {Object} [params.opts.sourceNpc] — NPC event for deal-damage source
   * @param {string} [params.opts.sourceNpcDtag] — NPC d-tag for deal-damage source
   * @param {boolean} [params.opts.isNpcSelf] — true when set-state self means NPC state
   * @param {string} [params.opts.extraRef] — extra arg (e.g. tag[6] for set-counter)
   * @returns {boolean} true if an action was dispatched
   */
  _dispatchAction({ action, target, extRef, selfDtag, selfEvent, opts = {} }) {
    if (!action) return false;

    switch (action) {
      case 'set-state': {
        if (!target) return false;
        if (extRef) {
          // External target
          const result = applyExternalSetState(
            extRef, target, this.events, this.player,
            (t, ty) => this._emit(t, ty),
            (h, ty) => this._emitHtml(h, ty),
            this.config.trustSet, this.config.clientMode,
          );
          if (result.puzzleActivated) this.puzzleActive = result.puzzleActivated;
          return result.acted;
        }
        // Self — NPC or regular entity
        if (opts.isNpcSelf && selfDtag) {
          const ns = this.player.getNpcState(selfDtag);
          if (ns && ns.state !== target) {
            const transition = findTransition(selfEvent, ns.state, target);
            this.player.setNpcState(selfDtag, { ...ns, state: target });
            this.player.setState(selfDtag, target);
            if (transition?.text) this._emit(transition.text, 'narrative');
          }
          return true;
        }
        // Regular self set-state
        const currentState = this.player.getState(selfDtag) ?? getDefaultState(selfEvent);
        const transition = findTransition(selfEvent, currentState, target);
        if (transition) {
          if (transition.from !== transition.to) {
            this.player.setState(selfDtag, transition.to);
          }
          if (transition.text) this._emit(transition.text, 'narrative');
          return true;
        }
        return false;
      }

      case 'give-item': {
        const itemRef = target || extRef;
        if (!itemRef) return false;
        if (!this.player.hasItem(itemRef)) {
          this._giveItemChecked(itemRef);
        }
        return true;
      }

      case 'consume-item': {
        const consumeDtag = target || extRef || selfDtag;
        if (consumeDtag && this.player.hasItem(consumeDtag)) {
          this.player.removeItem(consumeDtag);
        }
        return true;
      }

      case 'deal-damage': {
        const amount = parseInt(target, 10) || 1;
        this._dealDamageToPlayer(amount, opts.sourceNpc || null, opts.sourceNpcDtag || null);
        return true;
      }

      case 'deal-damage-npc': {
        // target is NPC dtag or "" (resolve to combatTarget)
        // Weapon event comes from opts or selfEvent
        const weaponEvent = opts.weaponEvent || selfEvent;
        this._dealDamageToNpc(target || '', weaponEvent);
        return true;
      }

      case 'heal': {
        const amount = parseInt(target, 10) || 1;
        this._healPlayer(amount);
        return true;
      }

      case 'consequence': {
        const cRef = target || extRef;
        if (cRef) this._executeConsequence(cRef);
        return true;
      }

      case 'traverse': {
        const pRef = target || extRef;
        if (pRef) this._traverse(pRef);
        return true;
      }

      case 'sound': {
        if (!target) return false;
        // Trust check on sound ref
        if (this.config.trustSet && target.startsWith('30078:')) {
          if (isRefTrusted(target, this.events, this.config.trustSet, this.config.clientMode) === 'hidden') return false;
        }
        this._emitSound(target, extRef);
        return true;
      }

      case 'activate': {
        const activateRef = target;
        if (!activateRef) return false;
        if (this.config.trustSet && isRefTrusted(activateRef, this.events, this.config.trustSet, this.config.clientMode) === 'hidden') return false;
        const activateEvent = this.events.get(activateRef);
        if (!activateEvent) return false;
        const activateType = getTag(activateEvent, 'type');
        if (activateType === 'recipe') {
          this._attemptCraft(activateEvent, activateRef);
        } else if (activateType === 'puzzle') {
          if (this.player.isPuzzleSolved(activateRef)) {
            this._emit('You have already solved this.', 'narrative');
          } else {
            const puzzleTitle = getTag(activateEvent, 'title');
            this._emit(`\n${puzzleTitle ? puzzleTitle + ':' : 'A riddle appears:'}`, 'puzzle-title');
            this._emit(activateEvent.content, 'puzzle');
            this._emit('Type your answer (or "back" to leave)...', 'hint');
            this.puzzleActive = activateRef;
          }
        } else if (activateType === 'payment') {
          this._activatePayment(activateRef, activateEvent);
        }
        return true;
      }

      case 'increment':
      case 'decrement':
      case 'set-counter':
      case 'add-counter':
      case 'sub-counter':
      case 'mul-counter':
      case 'div-counter': {
        this._applyCounterAction(action, selfDtag, target, extRef, selfEvent, opts.extraRef);
        return true;
      }

      case 'steals-item': {
        if (selfDtag) this._npcStealsItem(selfDtag, target);
        return true;
      }

      case 'deposits': {
        if (selfDtag) this._npcDeposits(selfDtag, opts.placeDtag || this.currentPlace);
        return true;
      }

      case 'flees': {
        if (selfEvent && selfDtag) this._npcFlees(selfEvent, selfDtag);
        return true;
      }

      default:
        return false;
    }
  }

  /**
   * Return and clear the output buffer.
   */
  flush() {
    const out = this.output;
    this.output = [];
    return out;
  }

  /**
   * Return the player state snapshot for committing to React.
   */
  getPlayerState() {
    return this.player.state;
  }

  // ── Convenience getters ───────────────────────────────────────────────

  get place() {
    return this.events.get(this.currentPlace);
  }

  /**
   * Resolve exits for the current place with trust filtering.
   * Returns { exits, hiddenByTrust } when trust is active.
   */
  get exitData() {
    return this._resolveRoomExits(this.currentPlace);
  }

  /** Shortcut: visible exits only (for movement). */
  get exits() {
    return this.exitData.exits;
  }

  // ── Room entry ────────────────────────────────────────────────────────

  enterRoom(dtag, { isMoving = false } = {}) {
    const room = this.events.get(dtag);
    if (!room) { this._emit("You can't go that way.", 'error'); return; }
    this.currentPlace = dtag;
    this.player.setPlace(dtag);
    this.puzzleActive = null;
    this.dialogueActive = null;
    this.pendingChoice = null;

    // Emit place colour overrides (if any)
    const placeColours = getTags(room, 'colour');
    if (placeColours.length > 0) {
      const overrides = {};
      for (const tag of placeColours) {
        if (tag[1] && tag[2]) overrides[tag[1]] = tag[2];
      }
      this.output.push({ type: 'theme-override', colours: overrides });
    } else {
      // Reset to world-only theme
      this.output.push({ type: 'theme-override', colours: null });
    }

    const title = getTag(room, 'title') || dtag;
    this._emit(`\n— ${title} —`, 'title');

    // Check place requires
    const placeReq = checkRequires(room, this.player.state, this.events);
    if (!placeReq.allowed) {
      this._emit(placeReq.reason, 'narrative');
      const { exits: roomExits } = this._resolveRoomExits(dtag);
      if (roomExits.length > 0) {
        const slots = [...new Set(roomExits.map((e) => e.slot))];
        this._emit(`Exits: ${slots.join(', ')}`, 'exits');
      }
      return;
    }

    // Render content
    const contentEntries = renderRoomContent(room, this.player.state.cryptoKeys);
    for (const entry of contentEntries) {
      if (entry.html) {
        this._emitHtml(entry.html, entry.type);
      } else {
        this._emit(entry.text, entry.type);
      }
    }

    // Seed place items on first visit (from room's item tags)
    this._seedPlaceItems(dtag, room);

    // Initialize feature counters on first visit
    for (const ref of getTags(room, 'feature')) {
      const feature = this.events.get(ref[1]);
      if (!feature) continue;
      for (const ct of getTags(feature, 'counter')) {
        const key = `${ref[1]}:${ct[1]}`;
        if (this.player.getCounter(key) === undefined) {
          this.player.setCounter(key, parseInt(ct[2], 10) || 0);
        }
      }
    }

    // Items — show what's on the ground at this place (skip if requires not met)
    const placeItems = this.player.getPlaceItems(dtag) || [];
    for (const itemDtag of placeItems) {
      const item = this.events.get(itemDtag);
      if (!item) continue;
      const itemTrust = this.config.trustSet ? isEventTrusted(item, this.config.trustSet, this.config.clientMode) : 'trusted';
      if (itemTrust === 'hidden') continue;
      const itemReq = checkRequires(item, this.player.state, this.events);
      if (!itemReq.allowed) continue;
      const uv = this._uvLabel(itemTrust);
      this._emit(`You see: ${getTag(item, 'title')}${uv}`, 'item');
    }

    // Features (skip hidden)
    for (const ref of getTags(room, 'feature')) {
      const fDTag = ref[1];  // full a-tag
      const feature = this.events.get(fDTag);
      if (!feature) continue;
      const fTrust = this.config.trustSet ? isEventTrusted(feature, this.config.trustSet, this.config.clientMode) : 'trusted';
      if (fTrust === 'hidden') continue;
      const fDefaultState = getDefaultState(feature);
      const fCurrentState = this.player.getState(fDTag) ?? fDefaultState;
      if (fCurrentState === 'hidden') continue;
      const fUv = this._uvLabel(fTrust);
      this._emit(`${featurePresenceText(getTag(feature, 'title'))}${fUv}`, 'feature');
    }

    // Static NPCs (placed by the room)
    for (const ref of getTags(room, 'npc')) {
      const npcDTag = ref[1];  // full a-tag
      const npc = this.events.get(npcDTag);
      if (!npc) continue;
      const npcTrust = this.config.trustSet ? isEventTrusted(npc, this.config.trustSet, this.config.clientMode) : 'trusted';
      if (npcTrust === 'hidden') continue;
      // Skip roaming NPCs here — they're handled below
      if (getTags(npc, 'route').length > 0) continue;
      const npcReq = checkRequires(npc, this.player.state, this.events);
      if (!npcReq.allowed) continue;
      const npcUv = this._uvLabel(npcTrust);
      this.player.ensureNpcState(npcDTag, initNpcState(npc));
      this._emit(`${getTag(npc, 'title')} is here.${npcUv}`, 'npc');
      // Fire on-encounter triggers only on actual movement, not on look
      if (isMoving) {
        this._fireNpcEncounter(npc, npcDTag);
      }
    }

    // Clues — display if requires pass and not already seen
    for (const ref of getTags(room, 'clue')) {
      const clueDTag = ref[1];
      const clue = this.events.get(clueDTag);
      if (!clue) continue;
      const clueTrust = this.config.trustSet ? isEventTrusted(clue, this.config.trustSet, this.config.clientMode) : 'trusted';
      if (clueTrust === 'hidden') continue;
      const clueState = this.player.getState(clueDTag) ?? getDefaultState(clue);
      if (clueState === 'hidden') continue;
      if (this.player.isClueSeen(clueDTag)) continue;
      const clueReq = checkRequires(clue, this.player.state, this.events);
      if (!clueReq.allowed) continue;
      this.player.markClueSeen(clueDTag);
      this._emit(`\n${getTag(clue, 'title')}:`, 'clue-title');
      this._emit(clue.content, 'clue');
    }

    // Roaming NPCs — check if any are currently at this place
    const roamingHere = findRoamingNpcsAtPlace(
      this.events, dtag, this.player.getMoveCount(),
      (npcDtag) => this.player.getNpcState(npcDtag),
      this._getRoamingNpcList(),
    );
    for (const { npcEvent, npcDtag } of roamingHere) {
      const roamTrust = this.config.trustSet ? isEventTrusted(npcEvent, this.config.trustSet, this.config.clientMode) : 'trusted';
      if (roamTrust === 'hidden') continue;
      const npcReq = checkRequires(npcEvent, this.player.state, this.events);
      if (!npcReq.allowed) continue;
      // Ensure NPC state is initialized
      this.player.ensureNpcState(npcDtag, initNpcState(npcEvent));
      const roamUv = this._uvLabel(roamTrust);
      this._emit(`${getTag(npcEvent, 'title')} is here.${roamUv}`, 'npc');
      // Fire on-encounter triggers only on actual movement, not on look
      if (isMoving) {
        this._fireNpcEncounter(npcEvent, npcDtag);
      }
    }

    // Place on-enter triggers (only on actual movement)
    if (isMoving) {
      for (const tag of getTags(room, 'on-enter')) {
        if (tag[1] && tag[1] !== 'player') continue;
        // State guard at position 2 (blank = any state)
        const stateGuard = tag[2] || '';
        if (stateGuard) {
          const placeState = this.player.getState(dtag) ?? getDefaultState(room);
          if (placeState !== stateGuard) continue;
        }
        const action = tag[3];
        const actionTarget = tag[4];
        const extTarget = tag[5];

        this._dispatchAction({
          action,
          target: actionTarget,
          extRef: extTarget,
          selfDtag: dtag,
          selfEvent: room,
        });
      }
    }

    // Re-evaluate quests and sequence puzzles after on-enter state changes
    if (isMoving) {
      this._evalSequencePuzzles();
      this._evalQuests();
    }

    // Exits — spec 6.7 contested exit model
    this._emitExits(dtag);
  }

  // ── Trust-aware exit resolution (see movement.js mixin) ─────────────

  // ── Exit display (see movement.js mixin) ───────────────────────────

  // ── Place items (see interaction.js mixin) ──────────────────────────

  // ── Container (see container.js mixin) ──────────────────────────────

  // ── Interaction (see interaction.js mixin) ─────────────────────────

  // ── On-move processing (see puzzle.js mixin) ────────────────────────

  // ── Movement (see movement.js mixin) ──────────────────────────────

  // ── Traverse action (see movement.js mixin) ────────────────────────

  // ── Combat actions (see combat.js mixin) ────────────────────────────

  // ── Health triggers (see consequence.js mixin) ─────────────────────

  // ── Counter actions (see puzzle.js mixin) ───────────────────────────

  // ── Consequence execution (see consequence.js mixin) ───────────────

  // ── NPC encounter (see npc-encounter.js mixin) ─────────────────────

  /**
   * NPC flees — emits flee message.
   * The actual movement is handled by the caller via set-state + roams-when:
   *   ["on-encounter", "player", "set-state", "fled"]
   *   ["on-encounter", "player", "flees"]
   *   ["roams-when", "fled"]
   * The set-state activates roaming, and the NPC naturally moves to a
   * different route place on the next move. flees just emits the message.
   */
  _npcFlees(npcEvent, npcDtag) {
    const npcTitle = getTag(npcEvent, 'title') || 'Someone';
    this._emit(`${npcTitle} flees!`, 'npc');
  }

  // ── Puzzle answer (see puzzle.js mixin) ──────────────────────────────

  // ── Dialogue system ───────────────────────────────────────────────────

  resolveDialogueEntry(npcEvent) {
    const dialogueTags = getTags(npcEvent, 'dialogue');
    let entryRef = null;

    for (const tag of dialogueTags) {
      const nodeRef = tag[1];
      const requiresRef = tag[2];
      const requiresState = tag[3];

      if (!requiresRef) {
        entryRef = nodeRef;
      } else {
        const reqEvent = this.events.get(requiresRef);
        const reqType = reqEvent ? getTag(reqEvent, 'type') : '';

        let passes = false;
        if (reqType === 'dialogue') {
          passes = requiresState === 'visited' && this.player.isDialogueVisited(requiresRef);
        } else if (reqType === 'clue') {
          passes = this.player.isClueSeen(requiresRef);
        } else if (reqType === 'item') {
          const hasIt = this.player.hasItem(requiresRef);
          if (!requiresState) {
            passes = hasIt;
          } else {
            passes = hasIt && this.player.getState(requiresRef) === requiresState;
          }
        } else if (reqType === 'puzzle') {
          passes = requiresState === 'solved' && this.player.isPuzzleSolved(requiresRef);
        } else if (reqType === 'feature' || reqType === 'npc' || reqType === 'place' || reqType === 'portal') {
          // Fall back to default state when player hasn't set it yet
          const currentState = this.player.getState(requiresRef) ?? getDefaultState(reqEvent);
          passes = requiresState && currentState === requiresState;
        } else if (reqType === 'quest') {
          const currentState = this.player.getState(requiresRef);
          passes = requiresState && currentState === requiresState;
        }

        if (passes) entryRef = nodeRef;
      }
    }

    return entryRef || null;  // entryRef is already a full a-tag
  }

  // ── Dialogue (see dialogue.js mixin) ────────────────────────────────

  // ── Payment ─────────────────────────────────────────────────────────

  _activatePayment(dtag, paymentEvent) {
    // Security: verify payment event's author is trusted
    if (this.config.trustSet && isEventTrusted(paymentEvent, this.config.trustSet, this.config.clientMode) === 'hidden') {
      this._emit('Payment unavailable.', 'error');
      return;
    }

    const lnurl = getTag(paymentEvent, 'lnurl');
    const amount = getTag(paymentEvent, 'amount');
    const unit = getTag(paymentEvent, 'unit') || 'sats';

    if (!lnurl || !amount) {
      this._emit('Payment misconfigured.', 'error');
      return;
    }

    // Check if already completed
    const attempt = this.player.state.paymentAttempts?.[dtag];
    if (attempt?.status === 'complete') {
      this._emit('Already paid.', 'narrative');
      return;
    }

    this.paymentActive = {
      dtag,
      lnurl,
      amount,
      unit,
      description: paymentEvent.content || `Pay ${amount} ${unit}`,
    };
  }

  /**
   * Called by the UI when payment is confirmed.
   * Fires on-complete actions and marks payment as complete.
   */
  completePayment(dtag) {
    const paymentEvent = this.events.get(dtag);
    if (!paymentEvent) return;

    // Mark as complete
    this.player.setPaymentStatus(dtag, 'complete');

    // Fire on-complete actions
    for (const tag of getTags(paymentEvent, 'on-complete')) {
      const action = tag[2];
      const actionTarget = tag[3];
      const extRef = tag[4];

      if (action === 'set-state' && actionTarget && !extRef) {
        // Payment self-set: direct state set (no transition)
        this.player.setState(dtag, actionTarget);
      } else {
        this._dispatchAction({
          action, target: actionTarget, extRef,
          selfDtag: dtag, selfEvent: paymentEvent,
        });
      }
    }

    this.paymentActive = null;
  }

  // ── Resolve noun (see interaction.js mixin) ────────────────────────

  // ── Recipe helpers (see crafting.js mixin) ──────────────────────────

  /**
   * Rebuild all event-type indexes in a single O(n) pass.
   * Called lazily by any index accessor when this.events has been swapped.
   *
   * Indexes built:
   *   _portalIndex   — Map<placeDTag, portalEvent[]>    for resolveExits O(k)
   *   _recipeIndex   — { map: Map<verb, entry>, list }  for recipe lookups O(1)
   *   _roamingNpcIndex — { list }                       for roaming NPC scans O(k)
   *   _questIndex    — { list }                         for _evalQuests O(q)
   */
  _rebuildIndexes() {
    const ref = this.events;
    const portalMap = new Map();
    const recipeMap = new Map();
    const recipeList = [];
    const npcList = [];
    const questList = [];
    const seqPuzzleList = [];

    for (const [dtag, event] of ref) {
      const type = getTag(event, 'type');

      if (type === 'portal') {
        for (const tag of getTags(event, 'exit')) {
          const placeRef = tag[1];
          if (!placeRef) continue;
          if (!portalMap.has(placeRef)) portalMap.set(placeRef, []);
          portalMap.get(placeRef).push(event);
        }
      } else if (type === 'recipe') {
        recipeList.push({ event, dtag });
        for (const vt of getTags(event, 'verb')) {
          if (vt[1]) recipeMap.set(vt[1].toLowerCase(), { event, dtag, type: 'recipe' });
        }
      } else if (type === 'npc') {
        if (getTags(event, 'route').length > 0) npcList.push({ dtag, event });
      } else if (type === 'quest') {
        questList.push({ dtag, event });
      } else if (type === 'puzzle' && getTag(event, 'puzzle-type') === 'sequence') {
        seqPuzzleList.push({ dtag, event });
      }
    }

    this._portalIndex        = { ref, map: portalMap };
    this._recipeIndex        = { ref, map: recipeMap, list: recipeList };
    this._roamingNpcIndex    = { ref, list: npcList };
    this._questIndex         = { ref, list: questList };
    this._seqPuzzleIndex     = { ref, list: seqPuzzleList };
  }

  /** Check whether indexes are stale (events Map reference changed). */
  _indexesStale() {
    return !this._portalIndex || this._portalIndex.ref !== this.events;
  }

  /** Portal index: Map<placeDTag, portalEvent[]> */
  _getPortalIndex() {
    if (this._indexesStale()) this._rebuildIndexes();
    return this._portalIndex.map;
  }

  /** Find a recipe whose verb tag matches the given verb (canonical). */
  _findRecipeByVerb(verb) {
    if (this._indexesStale()) this._rebuildIndexes();
    return this._recipeIndex.map.get(verb) ?? null;
  }

  /** Return cached list of all recipe events. */
  _getRecipeList() {
    if (this._indexesStale()) this._rebuildIndexes();
    return this._recipeIndex.list;
  }

  /** Return cached list of all roaming NPC events (those with route tags). */
  _getRoamingNpcList() {
    if (this._indexesStale()) this._rebuildIndexes();
    return this._roamingNpcIndex.list;
  }

  /** Return cached list of all quest events. */
  _getQuestList() {
    if (this._indexesStale()) this._rebuildIndexes();
    return this._questIndex.list;
  }

  /** Return cached list of all sequence puzzle events. */
  _getSeqPuzzleList() {
    if (this._indexesStale()) this._rebuildIndexes();
    return this._seqPuzzleIndex.list;
  }

  /** Check a single requires tag against player state. */
  _checkSingleRequire(reqTag) {
    const ref = reqTag[1];
    const reqState = reqTag[2];
    const refEvent = this.events.get(ref);
    if (!refEvent) return false;
    const type = getTag(refEvent, 'type');
    if (type === 'item') {
      if (!this.player.hasItem(ref)) return false;
      if (reqState) {
        const itemState = this.player.getState(ref);
        if (itemState !== reqState) return false;
      }
      return true;
    }
    // Feature/other state check
    const currentState = this.player.getState(ref) ?? getDefaultState(refEvent);
    if (reqState && currentState !== reqState) return false;
    return !reqState || currentState === reqState;
  }

  /** Handle ordered crafting step — player typed an item name. */
  _handleCraftStep(input) {
    if (!this.craftingActive) return false;

    const noun = stripArticles(input.trim().toLowerCase());
    const { recipeDtag, step, itemRequires } = this.craftingActive;
    const recipeEvent = this.events.get(recipeDtag);

    // Find item in inventory by noun
    const invMatch = findInventoryItem(this.events, this.player.state.inventory, noun);
    if (!invMatch) {
      this._emit("You don't have that.", 'error');
      return true; // consumed input but stay in crafting mode
    }

    // Check if this item matches the current step's requires ref
    const expectedRef = itemRequires[step][1];
    const expectedState = itemRequires[step][2];

    if (invMatch.dtag !== expectedRef) {
      this._emit("That's not right.", 'error');
      this._firePuzzleOnFail(recipeEvent, recipeDtag);
      this.craftingActive = null;
      return true;
    }

    // Check item state if required
    if (expectedState) {
      const itemState = this.player.getState(invMatch.dtag);
      if (itemState !== expectedState) {
        const desc = itemRequires[step][3] || "That item isn't in the right state.";
        this._emit(desc, 'error');
        this._firePuzzleOnFail(recipeEvent, recipeDtag);
        this.craftingActive = null;
        return true;
      }
    }

    // Advance
    const nextStep = step + 1;
    if (nextStep >= itemRequires.length) {
      // All items selected — fire on-complete
      this.craftingActive = null;
      this._fireCraftComplete(recipeEvent, recipeDtag);
    } else {
      this.craftingActive = { ...this.craftingActive, step: nextStep };
    }
    return true;
  }

  // ── Quest tracking (see quest.js mixin) ─────────────────────────────

  // ── Help (see command.js mixin) ─────────────────────────────────────

  // ── Unified interaction dispatch (see interaction.js mixin) ─────────

  // ── Reconcile counter-low (see command.js mixin) ───────────────────

  // ── Main command handler (see command.js mixin) ────────────────────

  // ── World on-interact (see command.js mixin) ──────────────────────

  // ── Report command (see report.js mixin) ────────────────────────────
}

// Apply mixins
mixMovement(GameEngine);
mixConsequence(GameEngine);
mixReport(GameEngine);
mixContainer(GameEngine);
mixInteraction(GameEngine);
mixCommand(GameEngine);
mixCombat(GameEngine);
mixDialogue(GameEngine);
mixCrafting(GameEngine);
mixQuest(GameEngine);
mixPuzzle(GameEngine);
mixNpcEncounter(GameEngine);
