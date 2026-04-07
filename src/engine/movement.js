/**
 * Movement mixin — adds movement and exit resolution methods to GameEngine prototype.
 */

import {
  getTag, getTags, resolveExits, resolveExitsWithTrust, checkRequires, checkRequiresCounter,
} from './world.js';
import { getTrustLevel } from './trust.js';

export function mixMovement(Engine) {
  // ── Trust-aware exit resolution ──────────────────────────────────────

  /**
   * Returns { exits, hiddenByTrust } for a place.
   * Without trust set, hiddenByTrust is always empty.
   */
  Engine.prototype._resolveRoomExits = function(dtag) {
    const portals = this._getPortalIndex().get(dtag) ?? [];
    const { trustSet, clientMode } = this.config;
    if (trustSet) {
      return resolveExitsWithTrust(
        this.events, dtag, this.player.state,
        trustSet, clientMode || 'community', getTrustLevel, portals,
      );
    }
    const { exits: raw, allClaimedSlots } = resolveExits(this.events, dtag, this.player.state, portals);
    return {
      exits: raw.map((e) => ({ ...e, trusted: true, trustLevel: 'trusted', contested: false })),
      hiddenByTrust: [],
      allClaimedSlots,
    };
  };

  // ── Exit display (spec 6.7) ─────────────────────────────────────────

  /**
   * Emit exit lines for a room. Handles:
   * - Trusted exits listed normally
   * - Multiple trusted on same slot → `slot (N paths)`
   * - Unverified-only slot → listed with `[unverified]` marker
   * - `[+N unverified]` hint when trusted portal exists but hidden alternatives do too
   */
  Engine.prototype._emitExits = function(dtag) {
    const { exits, hiddenByTrust, allClaimedSlots } = this._resolveRoomExits(dtag);
    if (exits.length === 0 && hiddenByTrust.length === 0) return;

    // Group visible exits by slot
    const slotGroups = {};
    for (const exit of exits) {
      if (!slotGroups[exit.slot]) slotGroups[exit.slot] = [];
      slotGroups[exit.slot].push(exit);
    }

    // Count hidden exits per slot (for [+N unverified] hint)
    const hiddenPerSlot = {};
    for (const exit of hiddenByTrust) {
      hiddenPerSlot[exit.slot] = (hiddenPerSlot[exit.slot] || 0) + 1;
    }

    const labels = [];
    const unverifiedOnlySlots = [];

    for (const [slot, slotExits] of Object.entries(slotGroups)) {
      const trustedCount = slotExits.filter((e) => e.trustLevel === 'trusted').length;
      const unverifiedCount = slotExits.filter((e) => e.trustLevel === 'unverified').length;

      if (trustedCount > 1) {
        // Multiple trusted portals on same slot → disambiguation needed
        labels.push(`${slot} (${trustedCount} paths)`);
      } else if (trustedCount === 1 && unverifiedCount === 0) {
        // Single trusted, no unverified visible — simple
        labels.push(slot);
      } else if (trustedCount === 1 && unverifiedCount > 0) {
        // Trusted wins the slot, but unverified exist — just show the slot
        labels.push(slot);
      } else if (trustedCount === 0 && unverifiedCount > 0) {
        // Only unverified on this slot
        unverifiedOnlySlots.push({ slot, count: unverifiedCount });
      }
    }

    // Emit the main exits line
    if (labels.length > 0) {
      this._emit(`Exits: ${labels.join(', ')}`, 'exits');
    }

    // Unverified-only slots (open + community or vouched + explorer)
    if (unverifiedOnlySlots.length > 0) {
      const isOpen = this._isOpenWorld();
      for (const { slot, count } of unverifiedOnlySlots) {
        if (isOpen) {
          // Open worlds: show as normal exits, no labels
          labels.push(slot);
        } else {
          const prefix = labels.length > 0 ? '       ' : 'Exits: ';
          if (count === 1) {
            this._emit(`${prefix}${slot} (unverified)`, 'exits-untrusted');
          } else {
            this._emit(`${prefix}${slot} (${count} unverified paths)`, 'exits-untrusted');
          }
        }
      }
    }

    // [+N unverified] hints for slots that have a trusted portal but also unverified/hidden alternatives
    // Only shown in community/explorer mode — in canonical mode, hidden portals are fully invisible
    // In open worlds, skip these hints (all content shown as-is)
    const mode = this.config.clientMode || 'community';
    if (mode !== 'canonical' && !this._isOpenWorld()) {
      // Count hidden-by-trust exits per slot
      for (const [slot, count] of Object.entries(hiddenPerSlot)) {
        if (slotGroups[slot]?.some((e) => e.trustLevel === 'trusted')) {
          this._emit(`[+${count} unverified path${count > 1 ? 's' : ''} ${slot} — type "look ${slot}" to see]`, 'exits-untrusted');
        }
      }
      // Count visible unverified exits on slots that also have a trusted exit
      for (const [slot, slotExits] of Object.entries(slotGroups)) {
        if (hiddenPerSlot[slot]) continue; // already emitted above
        const unverifiedOnSlot = slotExits.filter((e) => e.trustLevel === 'unverified').length;
        const hasTrusted = slotExits.some((e) => e.trustLevel === 'trusted');
        if (hasTrusted && unverifiedOnSlot > 0) {
          this._emit(`[+${unverifiedOnSlot} unverified path${unverifiedOnSlot > 1 ? 's' : ''} ${slot} — type "look ${slot}" to see]`, 'exits-untrusted');
        }
      }
    }

    // Contested trusted portals — show details
    for (const [slot, slotExits] of Object.entries(slotGroups)) {
      const trusted = slotExits.filter((e) => e.trustLevel === 'trusted');
      if (trusted.length > 1) {
        for (let i = 0; i < trusted.length; i++) {
          const label = trusted[i].label || `path ${i + 1}`;
          this._emit(`  ${slot} ${i + 1}: ${label}`, 'exits');
        }
      }
    }

    // Open exit slots — declared on place but no portal connects.
    // Only shown in community/explorer mode where a stranger's portal might fill
    // the slot. In canonical mode (closed worlds) there is nothing to discover.
    const clientMode = this.config.clientMode;
    const showUnexplored = clientMode === 'community' || clientMode === 'explorer';
    if (showUnexplored) {
      const visibleClaimedSlots = new Set(Object.keys(slotGroups));
      const placeEvent = this.events.get(dtag);
      // Only slot-declaration exits ["exit", "direction"] — skip old-format extended
      // exits ["exit", "30078:...", "direction", "label"] where t[1] is an a-tag ref.
      const declaredSlots = placeEvent
        ? getTags(placeEvent, 'exit').map((t) => t[1]).filter((s) => s && !s.startsWith('30078:'))
        : [];
      const openSlots = declaredSlots.filter((s) => !visibleClaimedSlots.has(s) && !allClaimedSlots.has(s));
      if (openSlots.length > 0) {
        if (labels.length > 0 || unverifiedOnlySlots.length > 0) {
          this._emit(`       ${openSlots.join(', ')} (unexplored)`, 'exits-open');
        } else {
          this._emit(`Exits: ${openSlots.join(', ')} (unexplored)`, 'exits-open');
        }
      }
    }
  };

  /**
   * Handle `look <direction>` — shows full list of all portals on a slot.
   * Examination only, never navigates. Shows trusted and hidden portals.
   */
  Engine.prototype.handleLookDirection = function(direction) {
    const { exits, hiddenByTrust } = this._resolveRoomExits(this.currentPlace);
    const mode = this.config.clientMode || 'community';

    // Collect portals on this slot — in canonical mode, hidden portals stay invisible
    const allOnSlot = [
      ...exits.filter((e) => e.slot === direction),
      ...(mode !== 'canonical' ? hiddenByTrust.filter((e) => e.slot === direction) : []),
    ];

    if (allOnSlot.length === 0) {
      this._emit(`Nothing leads ${direction}.`, 'narrative');
      return;
    }

    this._emit(`Paths ${direction}:`, 'narrative');
    for (let i = 0; i < allOnSlot.length; i++) {
      const exit = allOnSlot[i];
      const label = exit.label || `path ${i + 1}`;
      const pubkey = exit.portalEvent.pubkey;
      const shortPk = pubkey.slice(0, 12) + '...';

      let indicator;
      if (exit.trustLevel === 'trusted') {
        indicator = '(trusted)';
      } else {
        indicator = '(unverified)';
      }

      // Show cw tags if present
      const cwTags = getTags(exit.portalEvent, 'cw');
      const cwWarning = cwTags.length > 0 ? ` [cw: ${cwTags.map((t) => t[1]).join(', ')}]` : '';

      const type = exit.trustLevel === 'trusted' ? 'exits' : 'exits-untrusted';
      this._emit(`  ${i + 1}. ${label} ${indicator} [${shortPk}]${cwWarning}`, type);
    }

    // Allow numeric selection after viewing the list
    if (allOnSlot.length > 1) {
      const hasUnverified = allOnSlot.some((e) => e.trustLevel !== 'trusted');
      this.pendingChoice = { direction, exits: allOnSlot, unverified: hasUnverified };
    }
  };

  // ── Movement ──────────────────────────────────────────────────────────

  /**
   * Handle movement — spec 6.7 contested exit model.
   *
   * - One trusted portal → navigate immediately
   * - Multiple trusted → disambiguation list
   * - One trusted + unverified → navigate trusted, show [+N unverified] hint
   * - Unverified only → short list (max 5) with trust indicators, require choice
   * - Unverified portal → navigate directly (open worlds) or after choice (preview mode)
   */
  Engine.prototype.handleMove = function(direction, choiceIndex = null) {
    const { exits: allExits, hiddenByTrust } = this._resolveRoomExits(this.currentPlace);
    const matchingExits = allExits.filter((e) => e.slot === direction);
    if (matchingExits.length === 0) { this._emit("You can't go that way.", 'error'); return; }

    // Pre-filter by requires before trust disambiguation.
    // Portals with a consequence tag bypass this — they are traps that fire on requires failure.
    const routableExits = matchingExits.filter((e) => {
      const isTrap = e.portalEvent.tags.some((t) => t[0] === 'consequence');
      if (isTrap) return true;
      if (!checkRequires(e.portalEvent, this.player.state, this.events).allowed) return false;
      if (!checkRequiresCounter(e.portalEvent, null, this.player.state, this.events).allowed) return false;
      return true;
    });
    if (routableExits.length === 0) {
      const req = checkRequires(matchingExits[0].portalEvent, this.player.state, this.events);
      if (!req.allowed) { this._emit(req.reason, 'error'); return; }
      const rcReq = checkRequiresCounter(matchingExits[0].portalEvent, null, this.player.state, this.events);
      this._emit(rcReq.reason, 'error');
      return;
    }

    const trustedExits = routableExits.filter((e) => e.trustLevel === 'trusted');
    const unverifiedExits = routableExits.filter((e) => e.trustLevel === 'unverified');

    let exit;

    if (trustedExits.length === 1 && unverifiedExits.length === 0) {
      // Simple case: one trusted portal, navigate immediately
      exit = trustedExits[0];
    } else if (trustedExits.length === 1 && unverifiedExits.length > 0) {
      // Trusted wins the slot — navigate, hint about unverified after arrival
      exit = trustedExits[0];
      // We'll emit the hint after enterRoom below
    } else if (trustedExits.length > 1) {
      // Multiple trusted — disambiguation
      if (choiceIndex === null) {
        this._emit(`Multiple paths ${direction}:`, 'narrative');
        for (let i = 0; i < trustedExits.length; i++) {
          const label = trustedExits[i].label || `path ${i + 1}`;
          this._emit(`  ${i + 1}. ${label} (trusted)`, 'exits');
        }
        this.pendingChoice = { direction, exits: trustedExits };
        return;
      }
      if (choiceIndex < 1 || choiceIndex > trustedExits.length) {
        this._emit(`Choose 1-${trustedExits.length}.`, 'error');
        return;
      }
      exit = trustedExits[choiceIndex - 1];
    } else if (unverifiedExits.length > 0) {
      if (this.config.previewUnvouched) {
        // Preview mode — navigate directly (single) or after choice (multiple), no confirmation
        if (unverifiedExits.length === 1 && choiceIndex === null) {
          exit = unverifiedExits[0];
        } else if (choiceIndex === null) {
          this._emit(`Multiple paths ${direction}:`, 'narrative');
          for (let i = 0; i < unverifiedExits.length; i++) {
            const label = unverifiedExits[i].label || `path ${i + 1}`;
            const pk = unverifiedExits[i].portalEvent.pubkey.slice(0, 12) + '...';
            this._emit(`  ${i + 1}. ${label} (unverified) [${pk}]`, 'exits-untrusted');
          }
          this.pendingChoice = { direction, exits: unverifiedExits, unverified: true };
          return;
        } else if (choiceIndex >= 1 && choiceIndex <= unverifiedExits.length) {
          exit = unverifiedExits[choiceIndex - 1];
        } else {
          this._emit(`Choose 1-${unverifiedExits.length}.`, 'error');
          return;
        }
      } else {
        // Normal mode — list + confirmation required
        if (choiceIndex === null) {
          const heading = unverifiedExits.length === 1
            ? `Unverified path ${direction}:`
            : `Multiple paths ${direction}:`;
          this._emit(heading, 'narrative');
          const shown = unverifiedExits.slice(0, 5);
          for (let i = 0; i < shown.length; i++) {
            const label = shown[i].label || `path ${i + 1}`;
            const pk = shown[i].portalEvent.pubkey.slice(0, 12) + '...';
            this._emit(`  ${i + 1}. ${label} (unverified) [${pk}]`, 'exits-untrusted');
          }
          if (unverifiedExits.length > 5) {
            this._emit(`  + ${unverifiedExits.length - 5} more — type "look ${direction}" to see all`, 'exits-untrusted');
          }
          this.pendingChoice = { direction, exits: unverifiedExits, unverified: true };
          return;
        }
        if (choiceIndex < 1 || choiceIndex > unverifiedExits.length) {
          this._emit(`Choose 1-${unverifiedExits.length}.`, 'error');
          return;
        }
        // Navigate to selected unverified portal
        exit = unverifiedExits[choiceIndex - 1];
      }
    }

    const req = checkRequires(exit.portalEvent, this.player.state, this.events);
    if (!req.allowed) {
      // Lethal portal — fires consequence instead of blocking (spec §2.11)
      const consequenceTag = exit.portalEvent.tags.find((t) => t[0] === 'consequence');
      if (consequenceTag && consequenceTag[1]) {
        this._emit(req.reason, 'narrative');
        this._executeConsequence(consequenceTag[1]);
      } else {
        this._emit(req.reason, 'error');
      }
      return;
    }

    // Fire portal sound effects on traversal
    for (const tag of getTags(exit.portalEvent, 'sound')) {
      const soundRef = tag[1];
      const role = tag[2];
      if (role === 'effect' && soundRef?.startsWith('30078:')) {
        this._emitSound(soundRef, tag[3]);
      }
    }

    // Emit transition metadata from portal before entering room
    this._emitTransition(exit.portalEvent);

    // Record portal traversal for map
    const portalDtag = exit.portalEvent?.tags?.find((t) => t[0] === 'd')?.[1];
    const portalRef = portalDtag ? `30078:${exit.portalEvent.pubkey}:${portalDtag}` : null;
    if (portalRef) this.player.recordPortalUsed(portalRef);

    this.player.incrementMoveCount();
    this.processOnMove();
    this._processNpcOnMove();
    this.enterRoom(exit.destinationDTag, { isMoving: true });
  };

  // ── Traverse action ──────────────────────────────────────────────────

  /**
   * Traverse a portal programmatically (spec action: traverse).
   * Resolves the destination from the portal's exit tags relative to the
   * player's current place, checks requires, then navigates.
   */
  Engine.prototype._traverse = function(portalRef) {
    const portal = this.events.get(portalRef);
    if (!portal) return;

    // Check requires on the portal
    const req = checkRequires(portal, this.player.state, this.events);
    if (!req.allowed) {
      this._emit(req.reason, 'error');
      return;
    }

    // Find the exit that leads AWAY from the current place
    const exitTags = getTags(portal, 'exit');
    let destinationDTag = null;
    for (const tag of exitTags) {
      const placeRef = tag[1];
      if (placeRef !== this.currentPlace) {
        destinationDTag = placeRef;
        break;
      }
    }

    if (!destinationDTag) return;

    // Emit transition metadata from portal
    this._emitTransition(portal);

    // Record portal traversal for map
    this.player.recordPortalUsed(portalRef);

    this.player.incrementMoveCount();
    this.processOnMove();
    this._processNpcOnMove();
    this.enterRoom(destinationDTag, { isMoving: true });
  };

  /**
   * Emit transition metadata from a portal event.
   * Tags: transition-effect, transition-duration, transition-clear
   */
  Engine.prototype._emitTransition = function(portalEvent) {
    if (!portalEvent) return;
    const effect = getTag(portalEvent, 'transition-effect');
    const duration = getTag(portalEvent, 'transition-duration');
    const clear = getTag(portalEvent, 'transition-clear');
    if (effect || clear) {
      this.output.push({
        type: 'transition',
        effect: effect || null,
        duration: parseInt(duration, 10) || 800,
        clear: clear === 'true',
      });
    }
  };
}
