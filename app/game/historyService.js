// Move history: snapshot game state before each move, allow stepping back
// through the last 5 snapshots and forward to the live position.

import { id } from '../ui/dom.js';
import { markDirty, MAX_HISTORY_SNAPSHOTS, state } from '../state/store.js';

export function saveState() {
  const game = state.game;
  state.gameHistory.push({
    board: [...game.board],
    currentPlayer: game.currentPlayer,
    phase: game.phase,
    goatsPlaced: game.goatsPlaced,
    goatsCaptured: game.goatsCaptured,
    tigerIdentities: { ...game.tigerIdentities },
    goatIdentities: { ...game.goatIdentities }
  });
  if (state.gameHistory.length > MAX_HISTORY_SNAPSHOTS) {
    state.gameHistory.shift();
  }
  state.currentMoveIndex = -1;
  updateMoveNavigation();
}

export function isViewingHistory() {
  return state.currentMoveIndex !== -1;
}

export function prevMove() {
  if (state.currentMoveIndex === -1 && state.gameHistory.length === 0) return;
  const game = state.game;

  if (state.currentMoveIndex === -1) {
    state.savedGameState = {
      board: [...game.board],
      currentPlayer: game.currentPlayer,
      phase: game.phase,
      goatsPlaced: game.goatsPlaced,
      goatsCaptured: game.goatsCaptured,
      tigerIdentities: { ...game.tigerIdentities },
      goatIdentities: { ...game.goatIdentities },
      selectedPiece: game.selectedPiece,
      validMoves: [...game.validMoves]
    };
    state.currentMoveIndex = state.gameHistory.length - 1;
  } else if (state.currentMoveIndex > 0) {
    state.currentMoveIndex--;
  }

  if (state.currentMoveIndex >= 0) {
    applySnapshot(state.gameHistory[state.currentMoveIndex]);
  }
  updateMoveNavigation();
  markDirty();
}

export function nextMove() {
  if (!state.savedGameState || state.currentMoveIndex === -1) {
    updateMoveNavigation();
    markDirty();
    return;
  }
  if (state.currentMoveIndex < state.gameHistory.length - 1) {
    state.currentMoveIndex++;
    applySnapshot(state.gameHistory[state.currentMoveIndex]);
  } else {
    state.currentMoveIndex = -1;
    applySnapshot(state.savedGameState, /* withSelection */ true);
    state.savedGameState = null;
  }
  updateMoveNavigation();
  markDirty();
}

export function undoLastTurn() {
  if (state.gameMode !== 'ai' || !state.gameStarted || state.gameHistory.length === 0) return false;

  const playerToMove = state.playerSide;
  let targetIndex = state.gameHistory.length - 1;

  // If the AI has already replied, revert the full turn pair so the player is
  // back on move. If the AI has not moved yet, revert only the player's move.
  if (state.game.currentPlayer === playerToMove && state.gameHistory.length >= 2) {
    targetIndex = state.gameHistory.length - 2;
  }

  const snap = state.gameHistory[targetIndex];
  if (!snap) return false;

  applySnapshot(snap, /* withSelection */ true);
  state.gameHistory = state.gameHistory.slice(0, targetIndex);
  state.currentMoveIndex = -1;
  state.savedGameState = null;
  state.positionHistory = [];
  state.positionCounts = new Map();
  updateMoveNavigation();
  markDirty();
  return true;
}

function applySnapshot(snap, withSelection = false) {
  const game = state.game;
  game.board = [...snap.board];
  game.currentPlayer = snap.currentPlayer;
  game.phase = snap.phase;
  game.goatsPlaced = snap.goatsPlaced;
  game.goatsCaptured = snap.goatsCaptured;
  game.tigerIdentities = { ...snap.tigerIdentities };
  game.goatIdentities = { ...(snap.goatIdentities || {}) };
  game.selectedPiece = withSelection ? snap.selectedPiece : null;
  game.validMoves = withSelection ? [...(snap.validMoves || [])] : [];
}

export function updateMoveNavigation() {
  const container = id('move-nav-container');
  if (!container) return;

  const prevBtn = id('prev-move-btn');
  const nextBtn = id('next-move-btn');
  const counter = id('move-counter');

  const canShowMoveNav = state.historyNavigationVisible
    && state.gameStarted
    && state.gameHistory.length > 0
    && (state.gameMode === 'ai' || state.gameMode === 'multiplayer');

  if (!canShowMoveNav) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');

  const displayIndex = state.currentMoveIndex === -1 ? state.gameHistory.length : state.currentMoveIndex + 1;
  if (counter) counter.textContent = `${displayIndex} / ${state.gameHistory.length}`;
  if (prevBtn) prevBtn.disabled = state.currentMoveIndex === 0;
  if (nextBtn) nextBtn.disabled = state.currentMoveIndex === -1;
}

export function toggleMoveNavigation(show) {
  const container = id('move-nav-container');
  if (!container) return;
  state.historyNavigationVisible = !!show;
  if (show) {
    updateMoveNavigation();
  } else {
    container.classList.add('hidden');
    state.currentMoveIndex = -1;
    state.savedGameState = null;
  }
}
