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
    tigerIdentities: { ...game.tigerIdentities }
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

function applySnapshot(snap, withSelection = false) {
  const game = state.game;
  game.board = [...snap.board];
  game.currentPlayer = snap.currentPlayer;
  game.phase = snap.phase;
  game.goatsPlaced = snap.goatsPlaced;
  game.goatsCaptured = snap.goatsCaptured;
  game.tigerIdentities = { ...snap.tigerIdentities };
  game.selectedPiece = withSelection ? snap.selectedPiece : null;
  game.validMoves = withSelection ? [...(snap.validMoves || [])] : [];
}

export function updateMoveNavigation() {
  const container = id('move-nav-container');
  if (!container) return;

  const prevBtn = id('prev-move-btn');
  const nextBtn = id('next-move-btn');
  const counter = id('move-counter');

  if (!state.gameStarted || state.gameHistory.length === 0) {
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
  if (show) {
    updateMoveNavigation();
  } else {
    container.classList.add('hidden');
    state.currentMoveIndex = -1;
    state.savedGameState = null;
  }
}
