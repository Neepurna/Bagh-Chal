// Reactive UI text/progress updates: turn name, phase, captures, progress bars.
// Subscribes to the same redraw signal the canvas uses, so every state change
// updates both at once.

import { PHASE, PIECE_TYPES } from '../config/gameConfig.js';
import { countTrappedPieces, BOARD_POSITIONS } from '../game/boardRules.js';
import { id } from '../ui/dom.js';
import { onRedraw, state } from '../state/store.js';

export function initUiBindings() {
  onRedraw(updateUI);
  updateUI();
}

/**
 * Imperative call site for callers that need a synchronous text refresh
 * (e.g. after `endGame` updates a counter). The redraw subscriber will run on
 * the next frame regardless, but some flows want the DOM to be in sync now.
 */
export function updateUI() {
  const game = state.game;

  setText('tiger-captures', game.goatsCaptured);
  setText('goats-remaining', 20 - game.goatsPlaced);
  setText('tigers-trapped', `${countTrappedPieces(game.board, PIECE_TYPES.TIGER, BOARD_POSITIONS)} / 4`);

  const turnText = id('turn-text');
  if (turnText) turnText.textContent = game.currentPlayer === PIECE_TYPES.TIGER ? 'Tiger' : 'Goat';

  const phaseText = id('phase-text');
  if (phaseText) phaseText.textContent = game.phase === PHASE.PLACEMENT ? 'Placement Phase' : 'Movement Phase';

  setWidth('captureProgress', `${(game.goatsCaptured / 5) * 100}%`);
  setWidth('placedProgress', `${(game.goatsPlaced / 20) * 100}%`);

  setText('tigerTag', `Captures: ${game.goatsCaptured} / 5`);
  setText('goatTag', `Placed: ${game.goatsPlaced} / 20`);

  updateMultiplayerTags(game);
}

function updateMultiplayerTags(game) {
  const isMP = state.gameMode === 'multiplayer' && state.gameStarted;

  const playerTag = id('mp-player-tag');
  const opponentTag = id('mp-opponent-tag');
  if (!playerTag || !opponentTag) return;

  if (isMP) {
    playerTag.classList.remove('hidden');
    opponentTag.classList.remove('hidden');

    // Names
    const myName = state.userStats?.username || 'You';
    const oppName = state.opponentUsername || 'Opponent';
    setText('mp-player-name', myName);
    setText('mp-opponent-name', oppName);

    // Active-turn glow
    const myTurn = game.currentPlayer === state.playerSide;
    playerTag.classList.toggle('mp-tag-active', myTurn);
    opponentTag.classList.toggle('mp-tag-active', !myTurn);
  } else {
    playerTag.classList.add('hidden');
    opponentTag.classList.add('hidden');
    playerTag.classList.remove('mp-tag-active');
    opponentTag.classList.remove('mp-tag-active');
  }
}

function setText(elementId, value) {
  const el = id(elementId);
  if (el) el.textContent = value;
}

function setWidth(elementId, width) {
  const el = id(elementId);
  if (el) el.style.width = width;
}
