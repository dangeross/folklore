/**
 * Command mixin — adds the main command handler, help, world interaction,
 * and counter reconciliation to GameEngine prototype.
 */

import { getTag, getTags, checkRequires, getDefaultState } from './world.js';
import { stripArticles, buildVerbMap, parseInput } from './parser.js';
import { evalCounterLow } from './actions.js';
import { findRoamingNpcsAtPlace } from './npc.js';

export function mixCommand(Engine) {
  // ── Help ─────────────────────────────────────────────────────────────

  Engine.prototype._showHelp = function() {
    this._emit('Commands:', 'title');
    const cmds = [
      ['look (l)', 'Look around'],
      ['look &lt;direction&gt;', 'Examine exits in a direction'],
      ['go &lt;direction&gt;', 'Move (or just type the direction)'],
      ['examine &lt;thing&gt;', 'Examine something closely'],
      ['take &lt;item&gt;', 'Pick up an item'],
      ['take &lt;item&gt; from &lt;container&gt;', 'Take from a container'],
      ['drop &lt;item&gt;', 'Drop an item on the ground'],
      ['inventory (i)', 'Show what you are carrying'],
      ['talk &lt;someone&gt;', 'Talk to someone'],
      ['quests (q)', 'Show quest log'],
      ['restart', 'Start over (resets all progress)'],
      ...(this._findWorldEvent?.()?.tags?.find((t) => t[0] === 'map') ? [['map', 'Toggle map']] : []),
      ...(this.config.trustSet?.collaboration === 'open' ? [['report [thing]', 'Report content (open worlds)']] : []),
      ['help (h)', 'Show this help'],
    ];
    for (const [cmd, desc] of cmds) {
      this._emitHtml(`<span style="color:var(--colour-highlight)">${cmd}</span> <span style="color:var(--colour-dim)">— ${desc}</span>`, 'narrative');
    }

    // Show context-specific verbs from the current place + inventory
    const roamingHere = findRoamingNpcsAtPlace(
      this.events, this.currentPlace, this.player.getMoveCount(),
      (npcDtag) => this.player.getNpcState(npcDtag),
      this._getRoamingNpcList(),
    );
    const roamingEvents = roamingHere.map((r) => r.npcEvent);
    const verbMap = buildVerbMap(this.events, this.place, this.player.state.inventory, roamingEvents);

    // Collect unique canonical verbs (exclude built-ins)
    const builtIns = new Set(['examine', 'look', 'talk']);
    const contextVerbs = new Set();
    for (const [, canonical] of verbMap) {
      if (!builtIns.has(canonical)) contextVerbs.add(canonical);
    }

    if (contextVerbs.size > 0) {
      this._emit('', 'narrative');
      this._emit('Available actions:', 'title');
      this._emit(`  ${[...contextVerbs].join(', ')}`, 'highlight');
      this._emit('  Use with a noun: <action> <thing>', 'dim');
    }
  };

  // ── Reconcile counter-low states (on initial load) ────────────────────

  Engine.prototype.reconcileCounterLow = function() {
    for (const dtag of this.player.state.inventory) {
      const item = this.events.get(dtag);
      if (!item) continue;
      const currentState = this.player.getState(dtag);
      if (currentState) evalCounterLow(item, dtag, currentState, this.player, (t, ty) => this._emit(t, ty));
    }
  };

  // ── Main command handler (async for puzzle crypto) ────────────────────

  Engine.prototype.handleCommand = async function(input) {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return;
    this._emit(`> ${input}`, 'command');

    // Hard endgame — only "restart" accepted
    if (this.gameOver === 'hard') {
      if (trimmed === 'restart') {
        this._emit('Restarting...', 'narrative');
        this._emit('', 'restart'); // signal to App to clear state
        return;
      }
      this._emit('The story is over. Type "restart" to play again.', 'endgame-prompt');
      return;
    }

    // Report mode — awaiting reason text
    if (this.pendingReport) {
      if (trimmed === 'cancel' || trimmed === 'back') {
        this.pendingReport = null;
        this._emit('Report cancelled.', 'narrative');
        return;
      }
      const report = this.pendingReport;
      this.pendingReport = null;
      this._emit('Report sent.', 'narrative');
      this.output.push({ type: 'report', report: { targetRef: report.targetRef, title: report.title, author: report.author, reason: trimmed } });
      return;
    }

    // Choice mode — disambiguation list awaiting numeric input
    if (this.pendingChoice) {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) {
        const { direction, exits } = this.pendingChoice;
        this.pendingChoice = null;
        if (num < 1 || num > exits.length) {
          this._emit(`Choose 1-${exits.length}.`, 'error');
          return;
        }
        const chosen = exits[num - 1];
        {
          // Navigate directly
          const req = checkRequires(chosen.portalEvent, this.player.state, this.events);
          if (!req.allowed) { this._emit(req.reason, 'error'); return; }
          this.player.incrementMoveCount();
          this.processOnMove();
          this._processNpcOnMove();
          this.enterRoom(chosen.destinationDTag, { isMoving: true });
        }
        return;
      }
      // Non-numeric input clears the pending choice
      this.pendingChoice = null;
    }

    // Crafting mode — ordered recipe step
    if (this.craftingActive) {
      if (/^(back|cancel|leave|quit|exit)$/i.test(trimmed)) {
        this.craftingActive = null;
        this._emit('You pause and step back.', 'narrative');
        return;
      }
      if (this._handleCraftStep(trimmed)) return;
    }

    // Dialogue mode — allow back/leave to exit, restart to bypass
    if (this.dialogueActive) {
      if (/^(back|leave|cancel|quit|exit)$/i.test(trimmed)) {
        this.dialogueActive = null;
        this._emit('You end the conversation.', 'narrative');
        return;
      }
      if (trimmed === 'restart') {
        this.dialogueActive = null;
        // fall through to restart handler below
      } else {
        this.handleDialogueChoice(trimmed);
        return;
      }
    }

    // Puzzle mode
    if (this.puzzleActive) { await this.handlePuzzleAnswer(input.trim()); return; }

    // Restart confirmation
    if (this.pendingRestart) {
      this.pendingRestart = false;
      if (trimmed === 'yes' || trimmed === 'y') {
        this._emit('Restarting...', 'narrative');
        this._emit('', 'restart');
      } else {
        this._emit('Restart cancelled.', 'narrative');
      }
      return;
    }

    // Built-in: restart (mid-game needs confirmation, soft endgame does not)
    if (trimmed === 'restart') {
      if (this.gameOver === 'soft') {
        this._emit('Restarting...', 'narrative');
        this._emit('', 'restart');
      } else {
        this.pendingRestart = true;
        this._emit('Are you sure? This will reset all progress. (yes/no)', 'narrative');
      }
      return;
    }

    // Built-in: look in <container>
    const lookInMatch = trimmed.match(/^(?:look|l)\s+in\s+(.+)$/);
    if (lookInMatch) {
      const cNoun = stripArticles(lookInMatch[1]);
      const container = this._findContainer(cNoun);
      if (container) {
        const desc = container.event.content;
        if (desc) this._emit(desc, 'narrative');
        this._listContainerContents(container.event, container.dtag);
        return;
      }
      // Fall through to look direction / examine
    }

    // Built-in: look <direction> — spec 6.7 portal listing
    const lookDirMatch = trimmed.match(/^(?:look|l)\s+(.+)$/);
    if (lookDirMatch) {
      const dir = lookDirMatch[1];
      // Check if it's a valid direction (not a noun for examine)
      const allExits = [
        ...this._resolveRoomExits(this.currentPlace).exits,
        ...this._resolveRoomExits(this.currentPlace).hiddenByTrust,
      ];
      if (allExits.some((e) => e.slot === dir)) {
        this.handleLookDirection(dir);
        return;
      }
      // Fall through to examine
    }

    // Built-in: look
    if (trimmed === 'look' || trimmed === 'l') {
      if (this.place) this.enterRoom(this.currentPlace);
      return;
    }

    // Built-in: inventory
    if (trimmed === 'inventory' || trimmed === 'i') {
      if (this.player.state.inventory.length === 0) {
        this._emit('You are empty-handed.', 'narrative');
      } else {
        this._emit('You are carrying:', 'narrative');
        for (const dtag of this.player.state.inventory) {
          const item = this.events.get(dtag);
          this._emit(`  ${item ? getTag(item, 'title') : dtag}`, 'item');
        }
      }
      return;
    }

    // Built-in: quests
    if (trimmed === 'quests' || trimmed === 'quest' || trimmed === 'q') {
      this._showQuestLog();
      return;
    }

    // Built-in: map — only if world has ["map", ...] tag
    // "map" bare → always toggle overlay
    // "map <noun>" → verb/noun lookup first; if nothing resolves, toggle overlay
    if (trimmed === 'map') {
      const worldEvent = this._findWorldEvent?.();
      const mapMode = worldEvent?.tags?.find((t) => t[0] === 'map')?.[1];
      if (mapMode) {
        this._emit({ type: 'map-toggle' }, 'map');
        return;
      }
    }

    // Built-in: help
    if (trimmed === 'help' || trimmed === 'h' || trimmed === '?') {
      this._showHelp();
      return;
    }

    // Built-in: reset — return to start place
    if (trimmed === 'reset') {
      this.enterRoom(this.config.GENESIS_PLACE);
      return;
    }

    // Built-in: drop X in/on/into Y (targeted — check before plain drop)
    const dropInMatch = trimmed.match(/^drop\s+(.+?)\s+(?:in|on|into)\s+(.+)$/);
    if (dropInMatch) { this._handleDrop(dropInMatch[1], dropInMatch[2]); return; }

    // Built-in: drop
    const dropMatch = trimmed.match(/^drop\s+(.+)$/);
    if (dropMatch) { this._handleDrop(dropMatch[1]); return; }

    // Built-in: take X from Y
    const takeFromMatch = trimmed.match(/^(?:take|get|grab)\s+(.+?)\s+from\s+(.+)$/);
    if (takeFromMatch) { this._takeFromContainer(takeFromMatch[1], takeFromMatch[2]); return; }

    // Built-in: pick up / take
    const pickupMatch = trimmed.match(/^(?:pick up|take|get|grab)\s+(.+)$/);
    if (pickupMatch) { this.handlePickup(pickupMatch[1]); return; }

    // Built-in: talk / speak — prioritise NPC matches
    const talkMatch = trimmed.match(/^(?:talk to|talk|speak with|speak to|speak)\s+(.+)$/);
    if (talkMatch) {
      const noun = stripArticles(talkMatch[1]);
      const npcMatch = this._findNpcByNoun(noun);
      if (npcMatch) {
        this.startDialogue(npcMatch.dtag);
      } else {
        this.handleInteraction('talk', talkMatch[1], null);
      }
      return;
    }

    // Built-in: report [noun] — only in open collaboration worlds
    const reportMatch = trimmed.match(/^report(?:\s+(.+))?$/);
    if (reportMatch) { this._handleReport(reportMatch[1]?.trim() || null); return; }

    // Built-in: examine / x / inspect / look at (works without a verb tag)
    const examineMatch = trimmed.match(/^(?:examine|x|look at|inspect)\s+(.+)$/);
    if (examineMatch) { this.handleExamine(examineMatch[1]); return; }

    // Built-in: attack <npc> [with <weapon>]
    const attackWithMatch = trimmed.match(/^attack\s+(.+?)\s+with\s+(.+)$/);
    if (attackWithMatch) { this.handleInteraction('attack', attackWithMatch[1], attackWithMatch[2]); return; }
    const attackMatch = trimmed.match(/^attack\s+(.+)$/);
    if (attackMatch) { this.handleInteraction('attack', attackMatch[1], null); return; }

    // Data-driven verb/noun parser — include roaming NPCs as verb sources
    const roamingHere = findRoamingNpcsAtPlace(
      this.events, this.currentPlace, this.player.getMoveCount(),
      (npcDtag) => this.player.getNpcState(npcDtag),
      this._getRoamingNpcList(),
    );
    const roamingEvents = roamingHere.map((r) => r.npcEvent);
    // Recipe events are NOT added as extra verb sources — recipe verbs should only
    // be available when a feature in the current place explicitly declares them via
    // a verb tag. Adding recipes globally caused e.g. "use mechanism" to fire from
    // any room because the recipe title matched the noun.
    const verbMap = buildVerbMap(this.events, this.place, this.player.state.inventory, roamingEvents);
    const parsed = parseInput(trimmed, verbMap);

    if (parsed && parsed.noun1) {
      if (parsed.noun2) {
        // "with" = noun1 is target, noun2 is instrument (attack guard with sword)
        // other prepositions = noun1 is instrument, noun2 is target (use key on door)
        if (parsed.preposition === 'with' || parsed.preposition === 'from') {
          this.handleInteraction(parsed.verb, parsed.noun1, parsed.noun2, parsed.alias);
        } else {
          this.handleInteraction(parsed.verb, parsed.noun2, parsed.noun1, parsed.alias);
        }
      } else {
        this.handleInteraction(parsed.verb, parsed.noun1, null, parsed.alias);
      }
      return;
    }

    // Verb with no noun — check if a recipe matches the verb
    if (parsed && !parsed.noun1) {
      if (parsed.verb === 'examine') {
        if (this.place) this.enterRoom(this.currentPlace);
        return;
      }
      // Check recipes by verb match
      const recipeByVerb = this._findRecipeByVerb(parsed.verb);
      if (recipeByVerb) {
        this._attemptCraft(recipeByVerb.event, recipeByVerb.dtag);
        return;
      }
      // Try place on-interact first (room-scoped), then world on-interact (global)
      if (this._tryPlaceInteract(parsed.verb)) return;
      if (this._tryWorldInteract(parsed.verb)) return;
      this._emit(`${parsed.verb} what?`, 'error');
      return;
    }

    // Movement — try as direction, with optional choice index for contested portals
    const dirInput = trimmed.replace(/^go\s+/, '');
    const dirMatch = dirInput.match(/^(\S+?)(?:\s+(\d+))?$/);
    if (dirMatch) {
      const dir = dirMatch[1];
      const choiceIndex = dirMatch[2] ? parseInt(dirMatch[2], 10) : null;
      const { exits: visibleExits, allClaimedSlots } = this.exitData;
      if (visibleExits.find((e) => e.slot === dir)) {
        this.handleMove(dir, choiceIndex);
        return;
      }
      // Slot claimed but no portal currently visible (hidden state, requires blocked, trust hidden)
      if (allClaimedSlots?.has(dir)) {
        this._emit("You can't go that way.", 'error');
        return;
      }
    }

    // Place on-interact (room-scoped) then world on-interact — fallback after local + direction
    if (this._tryPlaceInteract(trimmed)) return;
    if (this._tryWorldInteract(trimmed)) return;

    this._emit("I don't understand that.", 'error');
  };

  /**
   * Try current place's on-interact handlers as a room-scoped verb dispatcher.
   * Checked before world on-interact so a place can override a global verb.
   * State guard (position 2) checks the place's own state.
   * Returns true if handled.
   */
  Engine.prototype._tryPlaceInteract = function(input) {
    if (!this.currentPlace) return false;
    const placeEvent = this.events.get(this.currentPlace);
    if (!placeEvent) return false;
    const placeDtag = getTag(placeEvent, 'd');

    const verb = input.toLowerCase().trim();
    for (const tag of getTags(placeEvent, 'on-interact')) {
      if (tag[1] !== verb) continue;
      // State guard at position 2 — checks place state
      const stateGuard = tag[2] || '';
      if (stateGuard) {
        const placeState = this.player.getState(placeDtag) ?? getDefaultState(placeEvent);
        if (placeState !== stateGuard) continue;
      }
      const action = tag[3];
      const actionTarget = tag[4];
      const extRef = tag[5];

      if (action === 'traverse' && actionTarget) {
        // Portal traversal: same resolution as world on-interact traverse
        const portal = this.events.get(actionTarget);
        if (!portal) { this._emit('Nothing happens.', 'narrative'); return true; }
        const req = checkRequires(portal, this.player.state, this.events);
        if (!req.allowed) {
          this._emit(req.reason || 'Nothing happens.', 'narrative');
          return true;
        }
        const exitTags = getTags(portal, 'exit');
        const dest = exitTags.find((e) => e[1] !== this.currentPlace);
        if (dest) {
          this.currentPlace = dest[1];
          this.player.setPlace(dest[1]);
          this.enterRoom(dest[1]);
        } else {
          this._emit('Nothing happens.', 'narrative');
        }
        return true;
      } else {
        // All other actions (set-state, give-item, sound, consequence, etc.)
        // go through _dispatchAction which handles transitions, trust, etc.
        this._dispatchAction({
          action, target: actionTarget, extRef,
          selfDtag: placeDtag, selfEvent: placeEvent,
        });
        return true;
      }
    }
    return false;
  };

  /**
   * Try world event on-interact as global verb dispatcher.
   * Fires only if the verb matches and no local handler caught it.
   * Returns true if handled.
   */
  Engine.prototype._tryWorldInteract = function(input) {
    const worldEvent = this._findWorldEvent();
    if (!worldEvent) return false;
    const worldDtag = getTag(worldEvent, 'd');

    const verb = input.toLowerCase().trim();
    for (const tag of getTags(worldEvent, 'on-interact')) {
      if (tag[1] !== verb) continue;
      // State guard at position 2
      const stateGuard = tag[2] || '';
      if (stateGuard) {
        const worldState = this.player.getState(worldDtag) ?? getDefaultState(worldEvent);
        if (worldState !== stateGuard) continue;
      }
      const action = tag[3];
      const actionTarget = tag[4];
      const extRef = tag[5];

      if (action === 'traverse' && actionTarget) {
        // World traverse: custom portal resolution with "Nothing happens" fallback
        const portal = this.events.get(actionTarget);
        if (!portal) { this._emit('Nothing happens.', 'narrative'); return true; }
        const req = checkRequires(portal, this.player.state, this.events);
        if (!req.allowed) {
          this._emit(req.reason || 'Nothing happens.', 'narrative');
          return true;
        }
        const exitTags = getTags(portal, 'exit');
        const dest = exitTags.find((e) => e[1] !== this.currentPlace);
        if (dest) {
          const destRef = dest[1];
          this.currentPlace = destRef;
          this.player.setPlace(destRef);
          this.enterRoom(destRef);
        } else {
          this._emit('Nothing happens.', 'narrative');
        }
        return true;
      } else if (action === 'set-state' && actionTarget && !extRef) {
        // World self set-state: direct set (no transitions)
        this.player.setState(worldDtag, actionTarget);
        return true;
      } else {
        this._dispatchAction({
          action, target: actionTarget, extRef,
          selfDtag: worldDtag, selfEvent: worldEvent,
        });
        return true;
      }
    }
    return false;
  };
}
