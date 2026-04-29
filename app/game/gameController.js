// Game flow orchestrator.
//
// Owns: initGame, handleClick (player input), checkWin, exitToHome,
// showPlayerSelect, startMultiplayerGame. Calls into other services
// (history, timer, ai, render, multiplayer) as needed.

import { playSound } from '../audio/audioSystem.js';
import { GRID_SIZE, PHASE, PIECE_TYPES } from '../config/gameConfig.js';
import {
  BOARD_POSITIONS,
  countTrappedPieces,
  getBoardHash,
  getPositionKey,
  isThreefoldRepetition,
  getValidMovesForBoard,
  getWinState
} from './boardRules.js';
import { saveState, toggleMoveNavigation } from './historyService.js';
import { startTimer, stopTimer, resetTimer, onMoveMade } from './timerService.js';
import {
  clearPendingAITimeouts,
  initializeAIWorker,
  scheduleAIMove
} from '../ai/aiController.js';
import {
  getCanvas,
  getClickedPosition,
  scheduleCanvasResize
} from '../render/boardRenderer.js';
import { updateUI } from '../render/uiBindings.js';
import { hideOverlay, id, setDisplay } from '../ui/dom.js';
import { hideWinnerOverlay, showWinnerOverlay } from '../ui/winnerOverlay.js';
import {
  markDirty,
  MAX_POSITION_HISTORY,
  nextGoatFlag,
  resetGameState,
  state
} from '../state/store.js';

// Hooks injected by bootstrap. Filled by configureGameController().
const hooks = {
  syncMultiplayerState: async () => {},
  finalizeMultiplayerRoom: async () => {},
  isApplyingRoomSnapshot: () => false,
  stopRoomSyncListeners: () => {},
  resetMultiplayerUI: () => {},
  setHomeUXByAuthState: () => {},
  openPlayerSelectOverlay: () => {},
  updateUserStats: async () => {},
  configurePlayerSelectOverlay: () => {}
};

export function configureGameController(injected) {
  Object.assign(hooks, injected);
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
export function initGame(options = {}) {
  const started = options.started ?? state.gameStarted;
  const decorativeGoats = options.decorativeGoats ?? !started;
  const shouldPlayStartSound = options.playStartSound ?? started;
  const shouldShowPanels = options.showPanels ?? started;
  const shouldStartTimer = options.startTimer ?? started;
  const shouldTriggerAutoAI = options.autoAIMove
    ?? (started && state.gameMode === 'ai' && state.playerSide === PIECE_TYPES.TIGER);

  clearPendingAsyncActions();
  stopTimer();

  resetGameState();
  const game = state.game;

  // Tigers at corners
  game.board[0] = PIECE_TYPES.TIGER;  game.tigerIdentities[0] = 0;
  game.board[4] = PIECE_TYPES.TIGER;  game.tigerIdentities[4] = 1;
  game.board[20] = PIECE_TYPES.TIGER; game.tigerIdentities[20] = 2;
  game.board[24] = PIECE_TYPES.TIGER; game.tigerIdentities[24] = 3;

  // Decorative goats on the homepage
  if (decorativeGoats) {
    const goatPositions = [6, 8, 12, 16, 18];
    goatPositions.forEach((pos, index) => {
      game.board[pos] = PIECE_TYPES.GOAT;
      game.goatsPlaced++;
      game.goatIdentities[pos] = index % 20;
    });
  }

  if (shouldPlayStartSound) playSound('newGame');

  initializeAIWorker();
  updateUI();
  markDirty();

  if (shouldShowPanels) {
    setDisplay('welcome-screen', 'none');
    id('gameStatePanel')?.classList.remove('hidden');
    id('tigerPanel')?.classList.remove('hidden');
    id('goatPanel')?.classList.remove('hidden');
    toggleMoveNavigation(true);
    if (shouldStartTimer) startTimer();
  } else {
    hooks.setHomeUXByAuthState();
  }

  scheduleCanvasResize();

  if (shouldTriggerAutoAI) scheduleAIMove();
}

export function clearPendingAsyncActions() {
  if (state.pendingBoardResetTimeout) {
    clearTimeout(state.pendingBoardResetTimeout);
    state.pendingBoardResetTimeout = null;
  }
  clearPendingAITimeouts();
}

export function exitToHome() {
  clearPendingAsyncActions();
  stopTimer();
  state.gameStarted = false;
  state.gameMode = 'ai';
  hooks.stopRoomSyncListeners();
  state.currentRoomId = null;
  state.currentRoomCode = null;
  if (!state.currentUser) state.guestModeActive = false;
  hideOverlay('winner-overlay');
  hideOverlay('player-select-overlay');
  hooks.resetMultiplayerUI();
  hooks.setHomeUXByAuthState();
  playSound('buttonClick');
}

export function showPlayerSelect() {
  clearPendingAsyncActions();
  stopTimer();
  state.gameStarted = false;
  state.gameMode = 'ai';
  hooks.stopRoomSyncListeners();
  state.currentRoomId = null;
  state.currentRoomCode = null;
  hideOverlay('winner-overlay');
  hooks.openPlayerSelectOverlay('ai');
  toggleMoveNavigation(false);
}

export function startMultiplayerGame(roomId, side, timeControl = '5m', { onSubscribe } = {}) {
  state.currentRoomId = roomId;
  state.multiplayerTimeControl = timeControl || '5m';
  state.playerSide = side === 'tiger' ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  state.gameMode = 'multiplayer';
  state.gameStarted = true;
  state.isFirstAIMove = false;

  hooks.stopRoomSyncListeners();
  if (typeof onSubscribe === 'function') onSubscribe(roomId);

  id('room-options')?.classList.add('hidden');
  id('room-waiting')?.classList.add('hidden');
  hideOverlay('player-select-overlay');
  initGame();
}

// ── Game flow helpers ──────────────────────────────────────────────────────
export function getValidMovesForCurrent(index) {
  return getValidMovesForBoard(index, state.game.board, BOARD_POSITIONS).map(({ to, capture }) => ({ to, capture }));
}

export function checkWin() {
  const game = state.game;

  // Check threefold repetition draw (paper: "Tigers and Goats is a draw" with optimal play)
  // Cantonment movement (goat cycling in a safe area) is the primary drawing mechanism
  if (game.phase === PHASE.MOVEMENT && isThreefoldRepetition(state.positionCounts)) {
    endGame('Draw by repetition.', 'draw');
    return true;
  }

  const winState = getWinState({
    board: game.board,
    phase: game.phase,
    goatsPlaced: game.goatsPlaced,
    goatsCaptured: game.goatsCaptured
  });
  if (winState) {
    endGame(winState.message, winState.winner);
    return true;
  }
  return false;
}

export function endGame(message, winner) {
  const game = state.game;
  clearPendingAsyncActions();
  stopTimer();
  game.gameOver = true;

  if (state.gameMode === 'multiplayer' && state.currentRoomId && !hooks.isApplyingRoomSnapshot()) {
    hooks.finalizeMultiplayerRoom({ roomId: state.currentRoomId, winner, winnerMessage: message })
      .catch((err) => console.error('[mp] failed to finalize room:', err));
  }

  if (state.currentUser && winner !== 'draw') {
    const playerWon = (winner === 'tiger' && state.playerSide === PIECE_TYPES.TIGER)
                      || (winner === 'goat' && state.playerSide === PIECE_TYPES.GOAT);
    const side = state.playerSide === PIECE_TYPES.TIGER ? 'tiger' : 'goat';
    hooks.updateUserStats(playerWon, side);
  }

  showWinnerOverlay(message, winner);
  toggleMoveNavigation(false);

  // Reset the board behind the overlay so the next match is clean.
  state.pendingBoardResetTimeout = setTimeout(() => {
    state.pendingBoardResetTimeout = null;
    initGame({
      started: true,
      decorativeGoats: false,
      playStartSound: false,
      startTimer: false,
      autoAIMove: false
    });
    state.gameStarted = false; // disable clicks while overlay is up
    markDirty();
  }, 1000);
}

export function handleTimeOut() {
  const game = state.game;
  if (game.gameOver) return;
  stopTimer();
  const winner = game.currentPlayer === PIECE_TYPES.GOAT ? 'tiger' : 'goat';
  const message = game.currentPlayer === PIECE_TYPES.GOAT ? 'Tiger wins - Time Out!' : 'Goat wins - Time Out!';
  endGame(message, winner);
}

// ── Player input ───────────────────────────────────────────────────────────
export function attachCanvasListener() {
  const canvas = getCanvas();
  if (!canvas) return;
  canvas.addEventListener('click', handleClick);
}

function handleClick(event) {
  const game = state.game;
  if (game.gameOver || !state.gameStarted || state.currentMoveIndex !== -1) return;
  if (game.currentPlayer !== state.playerSide) return;

  const canvas = getCanvas();
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  const clickedIndex = getClickedPosition(x, y);
  if (clickedIndex === -1) return;

  const phase = game.phase;
  const isPlacement = phase === PHASE.PLACEMENT;
  const isPlayerGoat = state.playerSide === PIECE_TYPES.GOAT;
  const isGoatTurn = game.currentPlayer === PIECE_TYPES.GOAT;
  const isTigerTurn = !isGoatTurn;

  if (isPlacement && isGoatTurn && isPlayerGoat) {
    handleGoatPlacement(clickedIndex);
  } else if (isPlacement && isTigerTurn && !isPlayerGoat) {
    handleTigerSelectOrMove(clickedIndex);
  } else if (!isPlacement && isGoatTurn && isPlayerGoat) {
    handleGoatSelectOrMove(clickedIndex);
  } else if (!isPlacement && isTigerTurn && !isPlayerGoat) {
    handleTigerSelectOrMove(clickedIndex);
  }

  updateUI();
  markDirty();
}

function handleGoatPlacement(clickedIndex) {
  const game = state.game;
  if (game.board[clickedIndex] !== PIECE_TYPES.EMPTY) return;
  saveState();
  game.board[clickedIndex] = PIECE_TYPES.GOAT;
  game.goatIdentities[clickedIndex] = nextGoatFlag();
  game.goatsPlaced++;
  playSound('pieceMove');
  if (game.goatsPlaced === 20) game.phase = PHASE.MOVEMENT;
  game.currentPlayer = PIECE_TYPES.TIGER;
  pushPositionHistory();
  updateUI();
  onMoveMade();
  if (!checkWin()) afterPlayerMove();
}

function handleTigerSelectOrMove(clickedIndex) {
  const game = state.game;

  // Selecting a tiger
  if (game.board[clickedIndex] === PIECE_TYPES.TIGER && game.selectedPiece === null) {
    game.selectedPiece = clickedIndex;
    game.validMoves = getValidMovesForCurrent(clickedIndex);
    return;
  }

  // Move attempt
  if (game.selectedPiece !== null) {
    const move = game.validMoves.find((m) => m.to === clickedIndex);
    if (move) {
      saveState();
      moveTigerOnBoard(move);
      pushPositionHistory();
      if (!checkWin()) afterPlayerMove();
      return;
    }
    if (game.board[clickedIndex] === PIECE_TYPES.TIGER) {
      // Switch selection to a different tiger
      game.selectedPiece = clickedIndex;
      game.validMoves = getValidMovesForCurrent(clickedIndex);
      return;
    }
    // Deselect
    game.selectedPiece = null;
    game.validMoves = [];
  }
}

function handleGoatSelectOrMove(clickedIndex) {
  const game = state.game;
  if (game.selectedPiece === null) {
    if (game.board[clickedIndex] === PIECE_TYPES.GOAT) {
      game.selectedPiece = clickedIndex;
      game.validMoves = getValidMovesForCurrent(clickedIndex);
    }
    return;
  }
  const move = game.validMoves.find((m) => m.to === clickedIndex);
  if (move) {
    saveState();
    game.board[move.to] = PIECE_TYPES.GOAT;
    game.board[game.selectedPiece] = PIECE_TYPES.EMPTY;
    game.goatIdentities[move.to] = game.goatIdentities[game.selectedPiece];
    delete game.goatIdentities[game.selectedPiece];
    playSound('pieceMove');
    game.selectedPiece = null;
    game.validMoves = [];
    game.currentPlayer = PIECE_TYPES.TIGER;
    pushPositionHistory();
    updateUI();
    if (!checkWin()) afterPlayerMove();
    return;
  }
  if (game.board[clickedIndex] === PIECE_TYPES.GOAT) {
    game.selectedPiece = clickedIndex;
    game.validMoves = getValidMovesForCurrent(clickedIndex);
  } else {
    game.selectedPiece = null;
    game.validMoves = [];
  }
}

function moveTigerOnBoard(move) {
  const game = state.game;
  const tigerIdentity = game.tigerIdentities[game.selectedPiece];
  game.board[move.to] = PIECE_TYPES.TIGER;
  game.tigerIdentities[move.to] = tigerIdentity;
  game.board[game.selectedPiece] = PIECE_TYPES.EMPTY;
  delete game.tigerIdentities[game.selectedPiece];

  playSound('pieceMove');
  if (move.capture !== null && move.capture !== undefined) {
    game.board[move.capture] = PIECE_TYPES.EMPTY;
    delete game.goatIdentities[move.capture];
    game.goatsCaptured++;
    playSound('tigerCapture');
    updateUI();
  }
  game.selectedPiece = null;
  game.validMoves = [];
  game.currentPlayer = PIECE_TYPES.GOAT;
}

function afterPlayerMove() {
  if (state.gameMode === 'multiplayer') {
    hooks.syncMultiplayerState().catch((err) => console.error('[mp] sync failed:', err));
  } else {
    scheduleAIMove();
  }
}

function pushPositionHistory() {
  // Rolling log for display/debug (keep last N)
  const hash = getBoardHash(state.game.board);
  state.positionHistory.push(hash);
  if (state.positionHistory.length > MAX_POSITION_HISTORY) {
    state.positionHistory.shift();
  }

  // Full-game repetition tracking (board + whose turn it is)
  // Only track during movement phase — placement cannot repeat positions
  if (state.game.phase === PHASE.MOVEMENT) {
    const key = getPositionKey(state.game.board, state.game.currentPlayer);
    const count = (state.positionCounts.get(key) || 0) + 1;
    state.positionCounts.set(key, count);
  }
}

// Re-export so dependent modules can derive board info easily.
export {
  countTrappedPieces,
  getBoardHash,
  getPositionKey,
  GRID_SIZE,
  hideWinnerOverlay
};
