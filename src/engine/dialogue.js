/**
 * Dialogue mixin — adds dialogue methods to GameEngine prototype.
 */

import { getTag, getTags, checkRequires, checkRequiresCounter } from './world.js';
import { isEventTrusted } from './trust.js';

export function mixDialogue(Engine) {
  Engine.prototype.enterDialogueNode = function(npcDtag, nodeDtag) {
    const node = this.events.get(nodeDtag);
    if (!node) {
      this._emit('The conversation ends.', 'narrative');
      this.dialogueActive = null;
      return;
    }

    // Security: verify dialogue node author is trusted
    if (this.config.trustSet && isEventTrusted(node, this.config.trustSet, this.config.clientMode) === 'hidden') {
      this._emit('The conversation ends.', 'narrative');
      this.dialogueActive = null;
      return;
    }

    this.player.markDialogueVisited(nodeDtag);
    this.dialogueActive = { npcDtag, nodeDtag };

    const text = node.content || getTag(node, 'text'); // prefer content, fall back to text tag
    if (text) this._emit(text, 'dialogue');

    // Fire on-enter actions
    for (const tag of getTags(node, 'on-enter')) {
      if (tag[1] && tag[1] !== 'player') continue;
      // State guard at position 2 (blank = any state)
      const stateGuard = tag[2] || '';
      if (stateGuard) {
        const nodeState = this.player.getState(nodeDtag);
        if (nodeState !== stateGuard) continue;
      }
      const action = tag[3];
      const actionTarget = tag[4];

      if (action === 'set-state' && actionTarget && !tag[5]) {
        // Self-set: set state on the dialogue node itself (no transition)
        this.player.setState(nodeDtag, actionTarget);
      } else {
        const extRef = tag[5];  // full a-tag (shifted by state guard)
        this._dispatchAction({
          action, target: actionTarget, extRef,
          selfDtag: nodeDtag, selfEvent: node,
        });
      }
    }

    // Evaluate quests after on-enter state changes — allows endgame quests to
    // fire immediately from dialogue choices (e.g. the final choice in a world).
    this._evalQuests();

    // Show options (filter by destination requires)
    const options = getTags(node, 'option');
    const visibleOptions = this._getVisibleOptions(options);

    if (visibleOptions.length === 0 || this.gameOver) {
      // Leaf node (or game just ended) — auto-exit dialogue
      this.dialogueActive = null;
      return;
    }

    for (let i = 0; i < visibleOptions.length; i++) {
      this._emit(`  ${i + 1}. ${visibleOptions[i].label}`, 'dialogue-option');
    }
  };

  Engine.prototype._getVisibleOptions = function(options) {
    const visibleOptions = [];
    for (const opt of options) {
      const label = opt[1];
      const nextRef = opt[2];

      if (!nextRef) {
        visibleOptions.push({ label, nextDtag: null });
      } else {
        const nextDtag = nextRef;  // full a-tag
        const destNode = this.events.get(nextDtag);
        if (destNode) {
          // Security: skip options whose destination author is untrusted
          if (this.config.trustSet && isEventTrusted(destNode, this.config.trustSet, this.config.clientMode) === 'hidden') continue;
          const destReq = checkRequires(destNode, this.player.state, this.events);
          const destRcReq = checkRequiresCounter(destNode, null, this.player.state, this.events);
          if (destReq.allowed && destRcReq.allowed) {
            visibleOptions.push({ label, nextDtag });
          }
        } else {
          visibleOptions.push({ label, nextDtag });
        }
      }
    }
    return visibleOptions;
  };

  Engine.prototype.handleDialogueChoice = function(input) {
    if (!this.dialogueActive) return;
    const node = this.events.get(this.dialogueActive.nodeDtag);
    if (!node) { this.dialogueActive = null; return; }

    const options = getTags(node, 'option');
    const visibleOptions = this._getVisibleOptions(options);

    const choice = parseInt(input, 10);
    if (isNaN(choice) || choice < 1 || choice > visibleOptions.length) {
      this._emit(`Choose 1-${visibleOptions.length}.`, 'error');
      return;
    }

    const selected = visibleOptions[choice - 1];
    this._emit(`> ${selected.label}`, 'command');

    // Fire on-option actions matching this label
    for (const tag of getTags(node, 'on-option')) {
      if (tag[1] !== selected.label) continue;
      const action = tag[2];
      const target = tag[3];
      const extRef = tag[4];
      this._dispatchAction({ action, target, extRef, selfDtag: this.dialogueActive.nodeDtag, selfEvent: node });
    }

    if (!selected.nextDtag) {
      this._emit('The conversation ends.', 'narrative');
      this.dialogueActive = null;
    } else {
      // Check if the target is a payment event
      const targetEvent = this.events.get(selected.nextDtag);
      if (this.config.trustSet && targetEvent && isEventTrusted(targetEvent, this.config.trustSet, this.config.clientMode) === 'hidden') {
        this._emit('The conversation ends.', 'narrative');
        this.dialogueActive = null;
        return;
      }
      const targetType = targetEvent ? getTag(targetEvent, 'type') : null;

      if (targetType === 'payment') {
        this._activatePayment(selected.nextDtag, targetEvent);
        this.dialogueActive = null;
      } else {
        this.enterDialogueNode(this.dialogueActive.npcDtag, selected.nextDtag);
      }
    }
  };

  Engine.prototype.startDialogue = function(npcDtag) {
    const npc = this.events.get(npcDtag);
    if (!npc) { this._emit("They don't seem interested in talking.", 'error'); return; }

    const entryDtag = this.resolveDialogueEntry(npc);
    if (!entryDtag) {
      this._emit("They don't seem interested in talking.", 'error');
      return;
    }

    const npcTitle = getTag(npc, 'title');
    this._emit(`\n— ${npcTitle} —`, 'npc-title');
    this.enterDialogueNode(npcDtag, entryDtag);
  };
}
