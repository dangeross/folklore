/**
 * Quest mixin — adds quest tracking methods to GameEngine prototype.
 */

import { getTag, getTags, getDefaultState, checkRequires } from './world.js';
import { getTrustLevel, isEventTrusted } from './trust.js';
import { renderMarkdown } from './content.js';

export function mixQuest(Engine) {
  /** Find all quest events in the world (cached). */
  Engine.prototype._findQuests = function() {
    const raw = this._getQuestList();
    if (!this.config.trustSet) return raw;
    // Filter by trust — skip hidden quest events
    return raw.filter(({ event }) => {
      const level = getTrustLevel(this.config.trustSet, event.pubkey, 'all', this.config.clientMode || 'community');
      return level !== 'hidden';
    });
  };

  /** Evaluate all quests and mark newly completed ones. */
  Engine.prototype._evalQuests = function(depth = 0) {
    let anyCompleted = false;
    for (const { event, dtag } of this._findQuests()) {
      if (this.player.getState(dtag) === 'complete') continue;
      const req = checkRequires(event, this.player.state, this.events);
      if (!req.allowed) continue;

      this.player.setState(dtag, 'complete');
      anyCompleted = true;

      const questType = getTag(event, 'quest-type') || 'open';
      const isEndgame = questType === 'endgame';

      if (isEndgame) {
        // Endgame quest — render closing prose with distinct styling
        this._emit('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'endgame-separator');
        if (event.content) {
          this._emitHtml(renderMarkdown(event.content), 'endgame');
        }
        this._emit('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'endgame-separator');
        // Check mode: ["quest-type", "endgame", "open"] = soft end
        const modeTag = event.tags.find((t) => t[0] === 'quest-type');
        const mode = modeTag?.[2] === 'open' ? 'soft' : 'hard';
        this.gameOver = mode;
        if (mode === 'hard') {
          this._emit('Type "restart" to play again.', 'endgame-prompt');
        } else {
          this._emit('The story continues. You may keep exploring, or type "restart" to play again.', 'endgame-prompt');
        }
      } else {
        const title = getTag(event, 'title') || 'Quest';
        this._emit(`Quest complete: ${title}`, 'success');
      }

      // Fire on-complete actions (set-state, give-item, consequence, sound)
      for (const tag of getTags(event, 'on-complete')) {
        const action = tag[2];
        const value = tag[3];
        const extRef = tag[4];
        // tag[5] is the external event ref for counter actions (add/set/sub-counter)
        // where tag[4] is the amount and tag[5] is the target event
        this._dispatchAction({
          action, target: value, extRef,
          selfDtag: dtag, selfEvent: event,
          opts: { extraRef: tag[5] },
        });
      }
    }

    // Cascade: quest completion may satisfy other quests' requires
    if (anyCompleted && depth < 10) {
      this._evalQuests(depth + 1);
    }
  };

  /**
   * Fire on-complete handlers for a quest that was just set to complete
   * directly (via on-interact set-state, bypassing _evalQuests).
   * Called from _dispatchAction when applyExternalSetState returns questCompleted.
   */
  Engine.prototype._fireQuestOnComplete = function(questRef) {
    const questEvent = this.events.get(questRef);
    if (!questEvent) return;

    const questType = getTag(questEvent, 'quest-type') || 'open';
    const isEndgame = questType === 'endgame';

    if (isEndgame) {
      this._emit('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'endgame-separator');
      if (questEvent.content) {
        this._emitHtml(renderMarkdown(questEvent.content), 'endgame');
      }
      this._emit('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'endgame-separator');
      const modeTag = questEvent.tags.find((t) => t[0] === 'quest-type');
      const mode = modeTag?.[2] === 'open' ? 'soft' : 'hard';
      this.gameOver = mode;
      if (mode === 'hard') {
        this._emit('Type "restart" to play again.', 'endgame-prompt');
      } else {
        this._emit('The story continues. You may keep exploring, or type "restart" to play again.', 'endgame-prompt');
      }
    } else {
      const title = getTag(questEvent, 'title') || 'Quest';
      this._emit(`Quest complete: ${title}`, 'success');
    }

    for (const tag of getTags(questEvent, 'on-complete')) {
      const action = tag[2];
      const value = tag[3];
      const extRef = tag[4];
      // tag[5] is the external event ref for counter actions (add/set/sub-counter)
      this._dispatchAction({
        action, target: value, extRef,
        selfDtag: questRef, selfEvent: questEvent,
        opts: { extraRef: tag[5] },
      });
    }

    // Cascade: quest completion may satisfy other quests
    this._evalQuests();
  };

  /** Show quest log — active and completed quests. */
  Engine.prototype._showQuestLog = function() {
    // Filter out endgame quests — they're internal win-state detectors
    const quests = this._findQuests().filter(({ event }) => getTag(event, 'quest-type') !== 'endgame');
    if (quests.length === 0) {
      this._emit('No quests.', 'narrative');
      return;
    }

    const active = [];
    const completed = [];
    for (const { event, dtag } of quests) {
      const title = getTag(event, 'title') || dtag;
      const state = this.player.getState(dtag);
      if (state === 'complete') {
        completed.push({ title, event, dtag });
      } else if (state === 'active') {
        active.push({ title, event, dtag });
      }
      // quests with no state (not yet activated) are not shown
    }

    if (active.length > 0) {
      this._emit('Active quests:', 'narrative');
      for (const q of active) {
        this._emit(`  \u25cb ${q.title}`, 'puzzle');
        // Build step completion list
        const questType = getTag(q.event, 'quest-type') || 'open';
        const steps = getTags(q.event, 'involves').map((inv) => {
          const invRef = inv[1];
          const invEvent = this.events.get(invRef);
          if (!invEvent) return null;
          // Security: skip involves refs whose author is untrusted
          if (this.config.trustSet && isEventTrusted(invEvent, this.config.trustSet, this.config.clientMode) === 'hidden') return null;
          const invTitle = getTag(invEvent, 'title') || invRef.split(':').pop();
          const state = this.player.getState(invRef);
          const solved = this.player.isPuzzleSolved(invRef);
          const held = this.player.hasItem(invRef);
          const done = solved || held || (state && state !== getDefaultState(invEvent));
          return { invTitle, done };
        }).filter(Boolean);
        // Display steps according to quest-type
        let foundNextUndone = false;
        for (const step of steps) {
          if (step.done) {
            this._emit(`    \u2713 ${step.invTitle}`, 'item');
          } else {
            switch (questType) {
              case 'hidden':
                this._emit('    \u2717 ???', 'dim');
                break;
              case 'mystery':
                break; // don't show undone steps
              case 'sequential':
                if (!foundNextUndone) {
                  this._emit(`    \u2717 ${step.invTitle}`, 'dim');
                  foundNextUndone = true;
                }
                break; // remaining undone steps hidden
              default: // 'open'
                this._emit(`    \u2717 ${step.invTitle}`, 'dim');
            }
          }
        }
      }
    }

    if (completed.length > 0) {
      this._emit('Completed:', 'narrative');
      for (const q of completed) {
        this._emit(`  \u2713 ${q.title}`, 'dim');
      }
    }
  };
}
