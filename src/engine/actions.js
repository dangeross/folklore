/**
 * actions.js — Unified action resolution.
 * No React imports. All functions take engine context as parameters.
 */

import {
  getTag, getTags, getDefaultState, findTransition,
  checkRequires,
} from './world.js';
import { isEventTrusted } from './trust.js';

/**
 * Apply a set-state action on an external target event.
 * Handles clue, puzzle, portal, feature types.
 * Returns { acted, puzzleActivated } where puzzleActivated is a dtag or null.
 */
export function applyExternalSetState(targetRef, targetState, events, player, emit, emitHtml, trustSet, clientMode) {
  const targetEvent = events.get(targetRef);  // targetRef is full a-tag
  if (!targetEvent) return { acted: false, puzzleActivated: null };

  // Security: verify target event's author is trusted
  if (trustSet && isEventTrusted(targetEvent, trustSet, clientMode) === 'hidden') {
    return { acted: false, puzzleActivated: null };
  }

  const targetType = getTag(targetEvent, 'type');

  if (targetType === 'clue') {
    const currentState = player.getState(targetRef);
    // Only set state and display if the state is changing — prevents re-showing on repeat triggers
    if (currentState !== targetState) {
      player.setState(targetRef, targetState);
      // Only display content if the clue's own requires pass
      const clueReq = checkRequires(targetEvent, player.state, events);
      if (clueReq.allowed) {
        emit(`\n${getTag(targetEvent, 'title')}:`, 'clue-title');
        emit(targetEvent.content, 'clue');
      }
    }
    return { acted: true, puzzleActivated: null };
  }

  if (targetType === 'puzzle') {
    if (player.isPuzzleSolved(targetRef)) {
      emit('You have already solved this.', 'narrative');
    } else {
      const puzzleTitle = getTag(targetEvent, 'title');
      emit(`\n${puzzleTitle ? puzzleTitle + ':' : 'A riddle appears:'}`, 'puzzle-title');
      emit(targetEvent.content, 'puzzle');
      emit('Type your answer (or "back" to leave)...', 'hint');
      return { acted: true, puzzleActivated: targetRef };
    }
    return { acted: true, puzzleActivated: null };
  }

  if (targetType === 'portal') {
    const portalCurrentState = player.getState(targetRef) ?? getDefaultState(targetEvent);
    if (portalCurrentState !== targetState) {
      player.setState(targetRef, targetState);
      const transition = findTransition(targetEvent, portalCurrentState, targetState);
      if (transition?.text) emit(transition.text, 'narrative');
    }
    return { acted: true, puzzleActivated: null };
  }

  if (targetType === 'feature') {
    const featCurrentState = player.getState(targetRef) ?? getDefaultState(targetEvent);
    if (featCurrentState !== targetState) {
      player.setState(targetRef, targetState);
      const transition = findTransition(targetEvent, featCurrentState, targetState);
      if (transition?.text) emit(transition.text, 'narrative');
    }
    return { acted: true, puzzleActivated: null };
  }

  if (targetType === 'item') {
    const itemCurrentState = player.getState(targetRef) ?? getDefaultState(targetEvent);
    if (itemCurrentState !== targetState) {
      player.setState(targetRef, targetState);
      const transition = findTransition(targetEvent, itemCurrentState, targetState);
      if (transition?.text) emit(transition.text, 'narrative');
    }
    return { acted: true, puzzleActivated: null };
  }

  if (targetType === 'place' || targetType === 'npc') {
    const currentState = player.getState(targetRef) ?? getDefaultState(targetEvent);
    if (currentState !== targetState) {
      player.setState(targetRef, targetState);
      const transition = findTransition(targetEvent, currentState, targetState);
      if (transition?.text) emit(transition.text, 'narrative');
    }
    return { acted: true, puzzleActivated: null };
  }

  if (targetType === 'quest') {
    const currentState = player.getState(targetRef);
    if (currentState !== targetState) {
      player.setState(targetRef, targetState);
      if (targetState === 'complete') {
        return { acted: true, puzzleActivated: null, questCompleted: targetRef };
      }
    }
    return { acted: true, puzzleActivated: null };
  }

  if (targetType === 'world') {
    player.setState(targetRef, targetState);
    return { acted: true, puzzleActivated: null };
  }

  return { acted: false, puzzleActivated: null };
}

/**
 * Give an item to the player — initialize state and counters.
 */
export function giveItem(itemRef, events, player, emit, trustSet, clientMode) {
  if (player.hasItem(itemRef)) return;  // itemRef is full a-tag

  // Security: verify item event's author is trusted
  const itemEvent = events.get(itemRef);
  if (trustSet && itemEvent && isEventTrusted(itemEvent, trustSet, clientMode) === 'hidden') {
    return;
  }

  player.pickUp(itemRef);
  const itemDefaultState = itemEvent ? getDefaultState(itemEvent) : null;
  if (itemDefaultState) player.setState(itemRef, itemDefaultState);

  if (itemEvent) {
    for (const ct of getTags(itemEvent, 'counter')) {
      player.setCounter(`${itemRef}:${ct[1]}`, parseInt(ct[2], 10));
    }
  }
  const itemTitle = itemEvent ? getTag(itemEvent, 'title') : itemRef;
  emit(`Received: ${itemTitle}`, 'item');
}

/**
 * Evaluate on-counter tags on state entry (re-evaluation).
 * If counter is already at or below threshold and item is not already in the target state, fire the action.
 */
export function evalCounterLow(item, dtag, currentState, player, emit) {
  for (const lt of getTags(item, 'on-counter')) {
    // Support both new shape (with direction) and legacy (without)
    const hasDirection = lt[1] === 'down' || lt[1] === 'up';
    const direction = hasDirection ? lt[1] : 'down';
    const counterName = hasDirection ? lt[2] : lt[1];
    const threshold = parseInt(hasDirection ? lt[3] : lt[2], 10);
    const action = hasDirection ? lt[4] : lt[3];
    const actionTarget = hasDirection ? lt[5] : lt[4];

    const key = `${dtag}:${counterName}`;
    const val = player.getCounter(key);
    if (val === undefined) continue;

    // State-entry re-evaluation: check if counter already satisfies threshold
    let satisfied = false;
    if (direction === 'down') {
      satisfied = val <= threshold;
    } else if (direction === 'up') {
      satisfied = val >= threshold;
    }
    if (!satisfied) continue;

    if (currentState === actionTarget) continue;

    if (action === 'set-state' && actionTarget) {
      const transition = findTransition(item, currentState, actionTarget);
      if (transition) {
        player.setState(dtag, transition.to);
        if (transition.text) emit(transition.text, 'narrative');
        currentState = transition.to;
      }
    }
  }
}

/**
 * Evaluate sequence puzzles in the current room after feature state changes.
 */
export function evalSequencePuzzles(place, events, player, emit, emitSound, trustSet, clientMode) {
  if (!place) return;

  for (const ref of getTags(place, 'puzzle')) {
    const pDTag = ref[1];  // full a-tag
    if (player.isPuzzleSolved(pDTag)) continue;
    const puzzleEvent = events.get(pDTag);
    if (!puzzleEvent) continue;

    const puzzleType = getTag(puzzleEvent, 'puzzle-type');
    if (puzzleType !== 'sequence') continue;

    const reqResult = checkRequires(puzzleEvent, player.state, events);
    if (!reqResult.allowed) continue;

    // All requires pass — puzzle solved!
    player.markPuzzleSolved(pDTag);
    emit('Something clicks into place.', 'success');

    // Fire on-complete actions
    for (const tag of getTags(puzzleEvent, 'on-complete')) {
      const action = tag[2];
      const value = tag[3];
      const extRef = tag[4];

      if (action === 'set-state' && extRef) {
        const targetEvent = events.get(extRef);  // extRef is full a-tag
        if (!targetEvent) continue;
        // Security: verify target author
        if (trustSet && isEventTrusted(targetEvent, trustSet, clientMode) === 'hidden') continue;
        const targetType = getTag(targetEvent, 'type');
        const currentStateForType = player.getState(extRef) ?? getDefaultState(targetEvent);
        if (currentStateForType !== value) {
          player.setState(extRef, value);
          const transition = findTransition(targetEvent, currentStateForType, value);
          if (transition?.text) emit(transition.text, 'narrative');
        }
      } else if (action === 'give-item' && value) {
        const itemEvent = events.get(value);
        if (itemEvent && !player.hasItem(value)) {
          giveItem(value, events, player, emit, trustSet, clientMode);
        }
      } else if (action === 'consume-item' && value) {
        if (player.hasItem(value)) {
          player.removeItem(value);
        }
      } else if (action === 'give-crypto-key') {
        player.addCryptoKey(value);
      } else if (action === 'sound' && value) {
        if (emitSound) emitSound(value);
      }
    }
  }
}
