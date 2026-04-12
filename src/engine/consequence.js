/**
 * Consequence mixin — adds consequence execution, health triggers,
 * and heal methods to GameEngine prototype.
 */

import { getTag, getTags, getDefaultState, checkRequires } from './world.js';
import { isEventTrusted } from './trust.js';
import { applyExternalSetState } from './actions.js';
import { findRoamingNpcsAtPlace } from './npc.js';

export function mixConsequence(Engine) {
  /**
   * Resolve a health threshold — supports absolute integers and "N%" percentages.
   * @param {string} threshold — e.g. "0", "3", "50%"
   * @param {number} maxHealth — max health for percentage resolution
   * @returns {number}
   */
  Engine.prototype._resolveHealthThreshold = function(threshold, maxHealth) {
    if (typeof threshold === 'string' && threshold.endsWith('%')) {
      const pct = parseInt(threshold, 10);
      return Math.floor((pct / 100) * maxHealth);
    }
    return parseInt(threshold, 10) || 0;
  };

  /**
   * Evaluate on-health triggers on an NPC after health change.
   * Also handles legacy on-health-zero as alias for on-health down 0.
   */
  Engine.prototype._evalNpcHealthTriggers = function(npcEvent, npcDtag, prevHealth, newHealth) {
    const maxHealth = parseInt(getTag(npcEvent, 'health') || '1', 10);

    // Collect all health trigger tags: on-health + legacy on-health-zero
    const triggers = [];
    for (const tag of getTags(npcEvent, 'on-health')) {
      triggers.push({ direction: tag[1], threshold: tag[2], action: tag[3], target: tag[4], extRef: tag[5] });
    }
    // Legacy backwards compat
    for (const tag of getTags(npcEvent, 'on-health-zero')) {
      const hasBlank = tag[1] === '';
      triggers.push({
        direction: 'down',
        threshold: '0',
        action: hasBlank ? tag[2] : tag[1],
        target: hasBlank ? tag[3] : tag[2],
        extRef: hasBlank ? tag[4] : tag[3],
      });
    }

    for (const { direction, threshold, action, target, extRef } of triggers) {
      const threshVal = this._resolveHealthThreshold(threshold, maxHealth);
      let crossed = false;
      if (direction === 'down') {
        crossed = prevHealth > threshVal && newHealth <= threshVal;
      } else if (direction === 'up') {
        crossed = prevHealth < threshVal && newHealth >= threshVal;
      }
      if (!crossed) continue;

      this._fireHealthAction(action, target, extRef, npcEvent, npcDtag);
    }
  };

  /**
   * Evaluate on-player-health triggers after player health change.
   * Checks world event (global) + NPCs in current place (local).
   */
  Engine.prototype._evalPlayerHealthTriggers = function(prevHealth, newHealth) {
    const maxHealth = this.player.getMaxHealth() || 10;
    const sources = [];

    // World event (global)
    const worldEvent = this._findWorldEvent();
    if (worldEvent) sources.push(worldEvent);

    // NPCs in current place (local)
    // Static NPCs
    if (this.place) {
      for (const ref of getTags(this.place, 'npc')) {
        const npcEvent = this.events.get(ref[1]);
        if (npcEvent) sources.push(npcEvent);
      }
    }
    // Roaming NPCs
    const roaming = findRoamingNpcsAtPlace(
      this.events, this.currentPlace, this.player.getMoveCount(),
      (npcDtag) => this.player.getNpcState(npcDtag),
      this._getRoamingNpcList(),
    );
    for (const { npcEvent } of roaming) sources.push(npcEvent);

    for (const src of sources) {
      // on-player-health tags
      for (const tag of getTags(src, 'on-player-health')) {
        const direction = tag[1];
        const threshold = tag[2];
        const action = tag[3];
        const target = tag[4];
        const threshVal = this._resolveHealthThreshold(threshold, maxHealth);
        let crossed = false;
        if (direction === 'down') {
          crossed = prevHealth > threshVal && newHealth <= threshVal;
        } else if (direction === 'up') {
          crossed = prevHealth < threshVal && newHealth >= threshVal;
        }
        if (!crossed) continue;
        this._fireHealthAction(action, target, null, src, null);
      }
      // Legacy on-player-health-zero
      for (const tag of getTags(src, 'on-player-health-zero')) {
        const hasBlank = tag[1] === '';
        const action = hasBlank ? tag[2] : tag[1];
        const target = hasBlank ? tag[3] : tag[2];
        if (prevHealth > 0 && newHealth <= 0) {
          this._fireHealthAction(action, target, null, src, null);
        }
      }
    }
  };


  /**
   * Heal the player.
   */
  Engine.prototype._healPlayer = function(amount) {
    if (this.player.getHealth() == null) {
      // Initialize health if not set (world without health tag)
      this.player.setHealth(10);
      this.player.setMaxHealth(10);
    }
    const before = this.player.getHealth();
    this.player.heal(amount);
    const healed = this.player.getHealth() - before;
    if (healed > 0) {
      this._emit(`Healed ${healed} HP. (HP: ${this.player.getHealth()})`, 'item');
    }
  };

  // ── Consequence execution ────────────────────────────────────────────

  /**
   * Execute a consequence event (spec §2.11).
   * Fixed execution order regardless of tag declaration:
   *   [pre-flight: requires/requires-not] → transition → give-item → consume-item → deal-damage → set-counter → set-state → drop inventory → clears → content → respawn
   */
  Engine.prototype._executeConsequence = function(consequenceRef) {
    const event = this.events.get(consequenceRef);
    if (!event) return;

    // Security: verify consequence event's author is trusted
    if (this.config.trustSet && isEventTrusted(event, this.config.trustSet, this.config.clientMode) === 'hidden') return;

    // Pre-flight: requires / requires-not gate on the consequence itself
    const preReq = checkRequires(event, this.player.state, this.events);
    if (!preReq.allowed) return;

    // Transition effect (fires before any actions so the effect plays over what follows)
    const effect = getTag(event, 'transition-effect');
    const duration = getTag(event, 'transition-duration');
    const clear = getTag(event, 'transition-clear');
    if (effect || clear) {
      this.output.push({
        type: 'transition',
        effect: effect || null,
        duration: parseInt(duration, 10) || 800,
        clear: clear === 'true',
      });
    }

    const tags = event.tags;

    // 1. give-item
    for (const tag of tags.filter((t) => t[0] === 'give-item')) {
      this._giveItemChecked(tag[1]);
    }

    // 2. consume-item
    for (const tag of tags.filter((t) => t[0] === 'consume-item')) {
      const itemRef = tag[1];
      if (this.player.hasItem(itemRef)) {
        this.player.removeItem(itemRef);
      }
    }

    // 3. deal-damage
    for (const tag of tags.filter((t) => t[0] === 'deal-damage')) {
      const amount = parseInt(tag[1], 10) || 0;
      if (amount > 0) {
        const prevHealth = this.player.getHealth();
        this.player.dealDamage(amount);
        this._emit(`You take ${amount} damage. (HP: ${this.player.getHealth()})`, 'error');
        if (prevHealth != null) this._evalPlayerHealthTriggers(prevHealth, this.player.getHealth());
      }
    }

    // 3b. set-state — external state changes (e.g. NPC burning, clue revealed)
    for (const tag of tags.filter((t) => t[0] === 'set-counter')) {
      // ["set-counter", "counter-name", "value"] — sets world-scoped counter
      // ["set-counter", "counter-name", "value", "external-ref"] — sets external event's counter
      const counterName = tag[1];
      const value = tag[2];
      const extRef = tag[3] || null;
      if (!counterName || value === undefined) continue;
      const worldEvent = this._findWorldEvent();
      const worldDtag = worldEvent ? getTag(worldEvent, 'd') : null;
      this._applyCounterAction('set-counter', worldDtag, counterName, value, worldEvent, extRef);
    }

    for (const tag of tags.filter((t) => t[0] === 'set-state')) {
      const targetState = tag[1];
      const targetRef = tag[2];
      if (targetRef) {
        const result = applyExternalSetState(
          targetRef, targetState, this.events, this.player,
          (t, ty) => this._emit(t, ty),
          (h, ty) => this._emitHtml(h, ty),
          this.config.trustSet, this.config.clientMode,
        );
        if (result.puzzleActivated) this.puzzleActive = result.puzzleActivated;
      }
    }

    // 4-8. Process clears in fixed order
    const clearsSet = new Set(tags.filter((t) => t[0] === 'clears').map((t) => t[1]));

    // 4-5. Drop inventory to current place, then clear
    if (clearsSet.has('inventory')) {
      for (const itemDtag of this.player.state.inventory) {
        this.player.addPlaceItem(this.currentPlace, itemDtag);
      }
      this.player.state.inventory = [];
      clearsSet.delete('inventory');
    }

    // 6. clears states
    if (clearsSet.has('states')) {
      this.player.state.states = {};
      clearsSet.delete('states');
    }

    // 7. clears counters
    if (clearsSet.has('counters')) {
      this.player.state.counters = {};
      clearsSet.delete('counters');
    }

    // 8. Other clears in declaration order
    for (const key of clearsSet) {
      if (key === 'cryptoKeys') this.player.state.cryptoKeys = [];
      else if (key === 'dialogueVisited') this.player.state.dialogueVisited = {};
      else if (key === 'paymentAttempts') this.player.state.paymentAttempts = {};
      else if (key === 'visited') this.player.state.visited = [];
    }

    // 9. Content + 10. Respawn
    const respawnRef = getTag(event, 'respawn');
    if (event.content) {
      this._emit(event.content, respawnRef ? 'death' : 'narrative');
    }
    if (respawnRef) {
      this._emit('', 'death-separator');
      this.enterRoom(respawnRef);
    }
  };
}
