/**
 * Puzzle mixin — adds puzzle, counter, and on-move methods to GameEngine prototype.
 */

import { getTag, getTags, findTransition, getDefaultState, checkRequires } from './world.js';
import { isEventTrusted } from './trust.js';
import { derivePrivateKey } from './nip44-client.js';
import { giveItem } from './actions.js';

export function mixPuzzle(Engine) {
  Engine.prototype.handlePuzzleAnswer = async function(answer) {
    if (!this.puzzleActive) return;

    // Allow the player to leave the puzzle
    const trimmed = answer.trim().toLowerCase();
    if (['back', 'leave', 'cancel', 'quit', 'exit'].includes(trimmed)) {
      this.puzzleActive = null;
      this._emit('You pause and step back.', 'narrative');
      return;
    }

    const puzzleEvent = this.events.get(this.puzzleActive);
    if (!puzzleEvent) return;

    const expectedHash = getTag(puzzleEvent, 'answer-hash');
    const salt = getTag(puzzleEvent, 'salt');

    const data = new TextEncoder().encode(answer.trim() + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (hashHex !== expectedHash) {
      this._emit('That is not the answer.', 'error');
      // Fire on-fail tags (riddle/cipher only)
      this._firePuzzleOnFail(puzzleEvent, this.puzzleActive);
      return;
    }

    this._emit('Correct!', 'success');
    this.player.markPuzzleSolved(this.puzzleActive);

    // Auto-derive and store NIP-44 crypto key from puzzle answer + salt
    const derivedPrivKey = await derivePrivateKey(
      answer.trim(),
      salt
    );
    this.player.addCryptoKey(derivedPrivKey);

    for (const tag of getTags(puzzleEvent, 'on-complete')) {
      const action = tag[2];
      const value = tag[3];
      const extRef = tag[4];
      // tag[5] is the external event ref for counter actions (add/set/sub-counter)
      this._dispatchAction({
        action, target: value, extRef,
        selfDtag: this.puzzleActive, selfEvent: puzzleEvent,
        opts: { extraRef: tag[5] },
      });
    }

    this.puzzleActive = null;
  };

  /**
   * Fire on-fail tags on a puzzle after a wrong answer.
   * Shape: ["on-fail", "", "<action>", "<target?>", "<ext-ref?>"]
   * Only valid on riddle and cipher puzzle types.
   */
  Engine.prototype._firePuzzleOnFail = function(puzzleEvent, puzzleDtag) {
    for (const tag of getTags(puzzleEvent, 'on-fail')) {
      const action = tag[2];
      const value = tag[3];
      const extRef = tag[4];

      if (action === 'deal-damage') {
        // Puzzle damage uses distinct message format ("You take X damage")
        const amount = parseInt(value, 10) || 1;
        const prevHealth = this.player.getHealth();
        if (prevHealth != null) {
          this.player.dealDamage(amount);
          this._emit(`You take ${amount} damage. (HP: ${this.player.getHealth()})`, 'error');
          this._evalPlayerHealthTriggers(prevHealth, this.player.getHealth());
        }
      } else {
        this._dispatchAction({
          action, target: value, extRef,
          selfDtag: puzzleDtag, selfEvent: puzzleEvent,
        });
      }
    }
  };

  /**
   * Apply a counter action on an event.
   *
   * On-interact tag positions:
   *   increment/decrement:                  [verb, "", action, counterName, externalRef?]
   *   set-counter / add/sub/mul/div-counter: [verb, "", action, counterName, amount, externalRef?]
   *
   * @param {string} action — 'decrement'|'increment'|'set-counter'|'add-counter'|'sub-counter'|'mul-counter'|'div-counter'
   * @param {string} eventDtag — the event this tag is declared on (self)
   * @param {string} counterName — counter name (position 4 in tag)
   * @param {string} valueOrRef — position 5: numeric amount for set/add/sub/mul/div-counter, or external ref for inc/dec
   * @param {Object} event — the event object (for on-counter evaluation)
   * @param {string} [externalRef] — position 6: external event ref for set/add/sub/mul/div-counter
   */
  Engine.prototype._applyCounterAction = function(action, eventDtag, counterName, valueOrRef, event, externalRef) {
    if (!counterName) return;

    // Resolve target: external ref overrides self
    let targetDtag = eventDtag;
    let targetEvent = event;

    // Check local counter first, then fall back to world-scoped counter
    if (!externalRef) {
      const localKey = `${eventDtag}:${counterName}`;
      if (this.player.getCounter(localKey) === undefined) {
        // No local counter — check world event for player-owned counter
        const worldEvent = this._findWorldEvent();
        if (worldEvent) {
          const worldDtag = getTag(worldEvent, 'd');
          const worldKey = `${worldDtag}:${counterName}`;
          if (this.player.getCounter(worldKey) !== undefined) {
            targetDtag = worldDtag;
            targetEvent = worldEvent;
          }
        }
      }
    }
    const isArithmetic = action === 'add-counter' || action === 'sub-counter' || action === 'mul-counter' || action === 'div-counter';
    if ((action === 'set-counter' || isArithmetic) && externalRef) {
      // set/add/sub/mul/div-counter: position 5 = amount, position 6 = external ref
      targetDtag = externalRef;
      targetEvent = this.events.get(externalRef);
      // Security: verify external target author is trusted
      if (this.config.trustSet && targetEvent && isEventTrusted(targetEvent, this.config.trustSet, this.config.clientMode) === 'hidden') return;
    } else if ((action === 'increment' || action === 'decrement') && valueOrRef && this.events.has(valueOrRef)) {
      // increment/decrement (deprecated): position 4 = external ref (if it resolves to an event)
      targetDtag = valueOrRef;
      targetEvent = this.events.get(valueOrRef);
      // Security: verify external target author is trusted
      if (this.config.trustSet && targetEvent && isEventTrusted(targetEvent, this.config.trustSet, this.config.clientMode) === 'hidden') return;
      valueOrRef = null; // not a numeric value
    }

    const key = `${targetDtag}:${counterName}`;
    const current = this.player.getCounter(key);
    if (current === undefined && action !== 'set-counter') return;

    let newVal;
    if (action === 'decrement') {
      // Deprecated: use sub-counter with amount "1"
      if (current <= 0) return;
      newVal = Math.max(0, current - 1);
    } else if (action === 'increment') {
      // Deprecated: use add-counter with amount "1"
      newVal = (current || 0) + 1;
    } else if (action === 'set-counter') {
      newVal = parseInt(valueOrRef, 10) || 0;
    } else if (action === 'add-counter') {
      const amount = parseInt(valueOrRef, 10) || 0;
      newVal = (current || 0) + amount;
    } else if (action === 'sub-counter') {
      const amount = parseInt(valueOrRef, 10) || 0;
      newVal = Math.max(0, (current || 0) - amount);
    } else if (action === 'mul-counter') {
      const amount = parseInt(valueOrRef, 10) || 1;
      newVal = (current || 0) * amount;
    } else if (action === 'div-counter') {
      const amount = parseInt(valueOrRef, 10) || 1;
      if (amount === 0) return; // guard against divide-by-zero
      newVal = Math.floor((current || 0) / amount);
    }

    this.player.setCounter(key, newVal);

    // Evaluate on-counter threshold crossing
    if (!targetEvent || current === undefined) return;

    for (const ct of getTags(targetEvent, 'on-counter')) {
      // Support both new shape (with direction) and legacy (without)
      // New:    ["on-counter", "down", "battery", "20", "set-state", "flickering"]
      // Legacy: ["on-counter", "battery", "20", "set-state", "flickering"]
      const hasDirection = ct[1] === 'down' || ct[1] === 'up';
      const direction = hasDirection ? ct[1] : 'down';
      const ctCounter = hasDirection ? ct[2] : ct[1];
      if (ctCounter !== counterName) continue;
      const threshold = parseInt(hasDirection ? ct[3] : ct[2], 10);
      const ctAction = hasDirection ? ct[4] : ct[3];
      const ctTarget = hasDirection ? ct[5] : ct[4];

      let crossed = false;
      if (direction === 'down' && newVal < current) {
        // Downward: was above threshold, now at-or-below
        crossed = current > threshold && newVal <= threshold;
      } else if (direction === 'up' && newVal > current) {
        // Upward: was below threshold, now at-or-above
        crossed = current < threshold && newVal >= threshold;
      }

      if (crossed) {
        if (ctAction === 'set-state' && ctTarget) {
          // Counter threshold set-state: set directly if no transition
          const currentState = this.player.getState(targetDtag);
          const transition = findTransition(targetEvent, currentState, ctTarget);
          if (transition) {
            this.player.setState(targetDtag, transition.to);
            if (transition.text) this._emit(transition.text, 'narrative');
          } else {
            this.player.setState(targetDtag, ctTarget);
          }
        } else {
          this._dispatchAction({
            action: ctAction, target: ctTarget,
            selfDtag: targetDtag, selfEvent: targetEvent,
          });
        }
      }
    }
  };

  /**
   * Globally evaluate all sequence puzzles — fires regardless of current room.
   * Mirrors _evalQuests: iterates the full seqPuzzle index, checks requires,
   * fires on-complete actions for newly satisfied puzzles.
   */
  Engine.prototype._evalSequencePuzzles = function() {
    for (const { event, dtag } of this._getSeqPuzzleList()) {
      if (this.player.isPuzzleSolved(dtag)) continue;

      const reqResult = checkRequires(event, this.player.state, this.events);
      if (!reqResult.allowed) continue;

      // All requires pass — puzzle solved!
      this.player.markPuzzleSolved(dtag);
      this._emit('Something clicks into place.', 'success');

      for (const tag of getTags(event, 'on-complete')) {
        const action = tag[2];
        const value  = tag[3];
        const extRef = tag[4];

        if (action === 'set-state' && extRef) {
          const targetEvent = this.events.get(extRef);
          if (!targetEvent) continue;
          if (this.config.trustSet && isEventTrusted(targetEvent, this.config.trustSet, this.config.clientMode) === 'hidden') continue;
          const targetType = getTag(targetEvent, 'type');
          const currentState = this.player.getState(extRef) ?? getDefaultState(targetEvent);
          if (currentState !== value) {
            this.player.setState(extRef, value);
            const transition = findTransition(targetEvent, currentState, value);
            if (transition?.text) this._emit(transition.text, 'narrative');
          }
        } else if (action === 'set-state' && value) {
          // Self set-state (no extRef)
          this.player.setState(dtag, value);
        } else if (action === 'give-item' && value) {
          if (!this.player.hasItem(value)) {
            giveItem(value, this.events, this.player, (t, ty) => this._emit(t, ty), this.config.trustSet, this.config.clientMode);
          }
        } else if (action === 'consume-item' && value) {
          if (this.player.hasItem(value)) {
            this.player.removeItem(value);
          }
        } else if (action === 'sound' && value) {
          this._emitSound(value, extRef || '1');
        }
      }
    }
  };

  Engine.prototype.processOnMove = function() {
    // Item on-move: fires for each inventory item matching state guard
    for (const dtag of this.player.state.inventory) {
      const item = this.events.get(dtag);
      if (!item) continue;
      const currentState = this.player.getState(dtag) ?? getDefaultState(item);

      for (const tag of getTags(item, 'on-move')) {
        const guard = tag[1] || '';
        if (guard && guard !== currentState) continue;

        this._dispatchAction({
          action: tag[2], target: tag[3], extRef: tag[4],
          selfDtag: dtag, selfEvent: item,
        });
      }
    }

    // World on-move: global triggers, state-guarded on world state
    const worldEvent = this._findWorldEvent();
    if (worldEvent) {
      const worldDtag = getTag(worldEvent, 'd');
      const worldState = this.player.getState(worldDtag) ?? getDefaultState(worldEvent);
      for (const tag of getTags(worldEvent, 'on-move')) {
        const guard = tag[1] || '';
        if (guard && guard !== worldState) continue;
        this._dispatchAction({
          action: tag[2], target: tag[3], extRef: tag[4],
          selfDtag: worldDtag, selfEvent: worldEvent,
        });
      }
    }
  };
}
