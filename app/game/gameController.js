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
import { startTimer, stopTimer, onMoveMade } from './timerService.js';
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
import { getAdventureBot, isFinalAdventureBot } from './adventureConfig.js';
import {
  applyLocalRatingResult,
  syncPlayerProfile
} from './ratingService.js';
import {
  beginPersistedGame,
  clearPersistedActiveGame,
  completePersistedGame,
  persistActiveGame
} from './gamePersistence.js';
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
  submitChallengeMove: async () => ({ ok: false, error: 'Challenge backend is not configured.' }),
  resignChallengeAttempt: async () => ({ ok: false, error: 'Challenge backend is not configured.' }),
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

let pendingChallengeMoveUiTimeout = null;

function clearChallengePendingUi() {
  if (pendingChallengeMoveUiTimeout) {
    clearTimeout(pendingChallengeMoveUiTimeout);
    pendingChallengeMoveUiTimeout = null;
  }
}

function setChallengePendingMove(pending) {
  if (!state.challenge) return;

  if (!pending) {
    clearChallengePendingUi();
    state.challenge.pendingMove = false;
    state.challenge.pendingMoveUi = false;
    return;
  }

  state.challenge.pendingMove = true;
  state.challenge.pendingMoveUi = false;
  clearChallengePendingUi();

  // Avoid flashing "Verifying..." on every move; only show it for slow requests.
  pendingChallengeMoveUiTimeout = setTimeout(() => {
    pendingChallengeMoveUiTimeout = null;
    if (state.gameMode !== 'challenge') return;
    if (!state.challenge?.pendingMove) return;
    state.challenge.pendingMoveUi = true;
    updateUI();
    markDirty();
  }, 250);
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
export function initGame(options = {}) {
  const started = options.started ?? state.gameStarted;
  const decorativeGoats = options.decorativeGoats ?? !started;
  const shouldPlayStartSound = options.playStartSound ?? started;
  const shouldShowPanels = options.showPanels ?? started;
  const shouldStartTimer = options.startTimer ?? started;
  const layout = options.layout ?? 'standard';
  const shouldTriggerAutoAI = options.autoAIMove
    ?? (started && state.gameMode === 'ai' && state.playerSide === PIECE_TYPES.TIGER);

  clearPendingAsyncActions();
  stopTimer();

  resetGameState();
  const game = state.game;

  if (layout === 'standard') {
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
  }

  if (shouldPlayStartSound) playSound('newGame');

  initializeAIWorker();
  updateUI();
  markDirty();

  if (shouldShowPanels) {
    setDisplay('welcome-screen', 'none');
    updateModePanels({ playing: true });
    if (options.persistStart !== false) beginPersistedGame();
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
  clearChallengePendingUi();
  clearPendingAITimeouts();
}

export function exitToHome() {
  clearPendingAsyncActions();
  stopTimer();
  state.gameStarted = false;
  state.gameMode = 'ai';
  state.challenge = null;
  state.sandboxTool = null;
  hooks.stopRoomSyncListeners();
  state.currentRoomId = null;
  state.currentRoomCode = null;
  if (!state.currentUser) state.guestModeActive = false;
  state.adventureModeActive = false;
  state.adventureBotId = null;
  state.matchRatingType = 'unrated';
  clearPersistedActiveGame();
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
  state.challenge = null;
  state.sandboxTool = null;
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
  state.sandboxTool = null;

  hooks.stopRoomSyncListeners();
  if (typeof onSubscribe === 'function') onSubscribe(roomId);

  id('room-options')?.classList.add('hidden');
  id('room-waiting')?.classList.add('hidden');
  hideOverlay('player-select-overlay');
  initGame();
}

export function startChallengeGame(payload = {}) {
  const challenge = payload.challenge || {};
  const attempt = payload.attempt || {};
  const snapshot = payload.game_state || payload.canonical_state || payload.state;

  clearPendingAsyncActions();
  stopTimer();
  hooks.stopRoomSyncListeners();
  state.currentRoomId = null;
  state.currentRoomCode = null;
  state.gameMode = 'challenge';
  state.matchRatingType = 'rated';
  state.adventureModeActive = false;
  state.adventureBotId = challenge.bot_id || challenge.botId || null;
  state.aiDifficulty = 'hard';
  state.playerSide = normalizeSide(challenge.player_side || challenge.playerSide);
  state.gameStarted = true;
  state.isFirstAIMove = false;
  state.sandboxTool = null;
  state.challenge = {
    attemptId: attempt.id || payload.attempt_id,
    challengeId: challenge.id || payload.challenge_id,
    botName: challenge.bot_name || challenge.botName || 'Bounty Bot',
    botProfile: challenge.bot_profile || challenge.botProfile || null,
    walletAddress: attempt.wallet_address || payload.wallet_address || null,
    prizeUsdc: Number(challenge.prize_usdc || challenge.prizeUsdc || 0),
    status: attempt.status || 'active',
    pendingMove: false,
    pendingMoveUi: false,
    claimEligible: false,
    claimId: null,
    claimTxSignature: null
  };

  hideOverlay('winner-overlay');
  hideOverlay('player-select-overlay');
  initGame({
    started: true,
    decorativeGoats: false,
    playStartSound: true,
    persistStart: false,
    autoAIMove: false
  });
  applyChallengeSnapshot(snapshot);
  updateUI();
  markDirty();
}

export function startSandboxGame() {
  clearPendingAsyncActions();
  stopTimer();
  hooks.stopRoomSyncListeners();
  state.currentRoomId = null;
  state.currentRoomCode = null;
  state.playerSide = null;
  state.gameMode = 'sandbox';
  state.gameStarted = true;
  state.isFirstAIMove = false;
  state.sandboxTool = null;
  state.sandboxStarterSide = PIECE_TYPES.GOAT;
  hideOverlay('winner-overlay');
  hideOverlay('player-select-overlay');
  initGame({
    started: true,
    decorativeGoats: false,
    playStartSound: false,
    showPanels: true,
    startTimer: false,
    autoAIMove: false,
    layout: 'empty'
  });
}

export function setSandboxStarterSide(side) {
  if (state.gameMode !== 'sandbox') return;
  state.sandboxStarterSide = side === PIECE_TYPES.TIGER ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  syncSandboxMeta();
  updateUI();
  markDirty();
}

export function startSandboxBotGame() {
  if (state.gameMode !== 'sandbox') return false;

  const tigerCount = countPiecesOnBoard(PIECE_TYPES.TIGER);
  const goatCount = countPiecesOnBoard(PIECE_TYPES.GOAT);
  if (tigerCount !== 4 || goatCount > 20) {
    window.alert('Open Board needs exactly 4 tigers and at most 20 goats before starting a bot game.');
    return false;
  }

  clearPendingAsyncActions();
  stopTimer();

  state.gameMode = 'ai';
  state.matchRatingType = 'unrated';
  state.adventureModeActive = false;
  state.adventureBotId = null;
  state.aiDifficulty = 'hard';
  state.aiTimeControl = '3m';
  state.playerSide = state.sandboxStarterSide;
  state.gameStarted = true;
  state.isFirstAIMove = true;
  state.sandboxTool = null;

  const game = state.game;
  game.selectedPiece = null;
  game.validMoves = [];
  game.gameOver = false;
  game.currentPlayer = state.sandboxStarterSide;
  game.phase = goatCount >= 20 ? PHASE.MOVEMENT : PHASE.PLACEMENT;
  game.goatsPlaced = goatCount;
  game.goatsCaptured = 20 - goatCount;

  state.gameHistory = [];
  state.currentMoveIndex = -1;
  state.savedGameState = null;
  state.positionHistory = [];
  state.positionCounts = new Map();
  state.currentGameId = null;
  state.currentGameStartedAt = null;
  pushPositionHistory();

  setDisplay('welcome-screen', 'none');
  updateModePanels({ playing: true });
  beginPersistedGame();
  startTimer();
  updateUI();
  markDirty();
  scheduleCanvasResize();

  const aiSide = state.playerSide === PIECE_TYPES.GOAT ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  if (game.currentPlayer === aiSide) scheduleAIMove(250);
  return true;
}

export function resumePersistedGame() {
  initializeAIWorker();
  setDisplay('welcome-screen', 'none');
  updateModePanels({ playing: true });
  startTimer();
  updateUI();
  markDirty();

  const aiSide = state.playerSide === PIECE_TYPES.GOAT ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  if (state.gameMode === 'ai' && state.game.currentPlayer === aiSide) scheduleAIMove(250);
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

  let ratingDelta = 0;
  let playerWon = false;
  if (winner !== 'draw') {
    playerWon = (winner === 'tiger' && state.playerSide === PIECE_TYPES.TIGER)
                || (winner === 'goat' && state.playerSide === PIECE_TYPES.GOAT);
  }

  if (state.gameMode === 'ai' && state.matchRatingType === 'rated' && winner !== 'draw') {
    ratingDelta = applyLocalRatingResult({
      playerWon,
      playerSide: state.playerSide,
      difficulty: state.aiDifficulty
    });
  }

  if (state.adventureModeActive && playerWon && state.adventureBotId) {
    const bot = getAdventureBot(state.adventureBotId);
    state.userStats.adventureLevel = Math.max(state.userStats.adventureLevel || 0, bot.unlockLevel + 1);
    state.userStats.adventureCompleted = Math.max(state.userStats.adventureCompleted || 0, bot.unlockLevel + 1);
    if (isFinalAdventureBot(bot.id)) {
      state.userStats.adventureCompleted = Math.max(state.userStats.adventureCompleted || 0, 6);
    }
    syncPlayerProfile();
  }

  if (state.currentUser && winner !== 'draw') {
    const side = state.playerSide === PIECE_TYPES.TIGER ? 'tiger' : 'goat';
    hooks.updateUserStats(playerWon, side);
  }

  completePersistedGame({ winner, message, ratingDelta });

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
      autoAIMove: false,
      persistStart: false
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

  const canvas = getCanvas();
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  const clickedIndex = getClickedPosition(x, y);
  if (clickedIndex === -1) return;

  if (state.gameMode === 'sandbox') {
    handleSandboxClick(clickedIndex);
    updateUI();
    markDirty();
    return;
  }

  if (state.gameMode === 'challenge') {
    handleChallengeClick(clickedIndex);
    updateUI();
    markDirty();
    return;
  }

  if (game.currentPlayer !== state.playerSide) return;

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

function handleSandboxClick(clickedIndex) {
  const game = state.game;
  const clickedPiece = game.board[clickedIndex];

  if (state.sandboxTool === 'erase') {
    if (clickedPiece === PIECE_TYPES.EMPTY) return;
    saveState();
    removeSandboxPiece(clickedIndex);
    game.selectedPiece = null;
    game.validMoves = [];
    syncSandboxMeta();
    playSound('buttonClick');
    return;
  }

  if (game.selectedPiece !== null) {
    if (clickedIndex === game.selectedPiece) {
      game.selectedPiece = null;
      return;
    }

    if (clickedPiece === PIECE_TYPES.EMPTY) {
      saveState();
      moveSandboxPiece(game.selectedPiece, clickedIndex);
      game.selectedPiece = null;
      game.validMoves = [];
      syncSandboxMeta();
      playSound('pieceMove');
      return;
    }

    state.sandboxTool = null;
    game.selectedPiece = clickedIndex;
    return;
  }

  if (clickedPiece !== PIECE_TYPES.EMPTY) {
    state.sandboxTool = null;
    game.selectedPiece = clickedIndex;
    return;
  }

  if (state.sandboxTool === 'tiger' && countPiecesOnBoard(PIECE_TYPES.TIGER) < 4) {
    saveState();
    game.board[clickedIndex] = PIECE_TYPES.TIGER;
    game.tigerIdentities[clickedIndex] = nextTigerIdentity();
    syncSandboxMeta();
    playSound('pieceMove');
    return;
  }

  if (state.sandboxTool === 'goat' && countPiecesOnBoard(PIECE_TYPES.GOAT) < 20) {
    saveState();
    game.board[clickedIndex] = PIECE_TYPES.GOAT;
    game.goatIdentities[clickedIndex] = nextGoatFlag();
    syncSandboxMeta();
    playSound('pieceMove');
  }
}

function handleChallengeClick(clickedIndex) {
  const game = state.game;
  if (state.challenge?.pendingMove) return;
  if (game.currentPlayer !== state.playerSide) return;

  const phase = game.phase;
  const isPlacement = phase === PHASE.PLACEMENT;
  const isPlayerGoat = state.playerSide === PIECE_TYPES.GOAT;
  const isGoatTurn = game.currentPlayer === PIECE_TYPES.GOAT;
  const isTigerTurn = !isGoatTurn;

  if (isPlacement && isGoatTurn && isPlayerGoat) {
    if (game.board[clickedIndex] !== PIECE_TYPES.EMPTY) return;
    sendChallengeMove({ type: 'place', to: clickedIndex });
    return;
  }

  if (
    (isPlacement && isTigerTurn && !isPlayerGoat) ||
    (!isPlacement && isTigerTurn && !isPlayerGoat)
  ) {
    handleChallengeSelectOrMove(clickedIndex, PIECE_TYPES.TIGER);
    return;
  }

  if (!isPlacement && isGoatTurn && isPlayerGoat) {
    handleChallengeSelectOrMove(clickedIndex, PIECE_TYPES.GOAT);
  }
}

function handleChallengeSelectOrMove(clickedIndex, pieceType) {
  const game = state.game;
  if (game.selectedPiece === null) {
    if (game.board[clickedIndex] === pieceType) {
      game.selectedPiece = clickedIndex;
      game.validMoves = getValidMovesForCurrent(clickedIndex);
    }
    return;
  }

  const move = game.validMoves.find((candidate) => candidate.to === clickedIndex);
  if (move) {
    sendChallengeMove({
      type: 'move',
      from: game.selectedPiece,
      to: move.to,
      capture: move.capture
    });
    return;
  }

  if (game.board[clickedIndex] === pieceType) {
    game.selectedPiece = clickedIndex;
    game.validMoves = getValidMovesForCurrent(clickedIndex);
  } else {
    game.selectedPiece = null;
    game.validMoves = [];
  }
}

async function sendChallengeMove(move) {
  if (!state.challenge?.attemptId) return;
  const optimisticRollback = cloneGameForRollback(state.game);
  try {
    applyOptimisticChallengeMove(move);
  } catch (err) {
    console.warn('[challenge] optimistic apply failed:', err);
  }

  setChallengePendingMove(true);
  updateUI();
  markDirty();

  const result = await hooks.submitChallengeMove(state.challenge.attemptId, move);
  setChallengePendingMove(false);
  if (!result?.ok) {
    state.game = optimisticRollback;
    window.alert(result?.error || 'Challenge move failed.');
    updateUI();
    markDirty();
    return;
  }

  const data = result.data || {};
  applyChallengeSnapshot(data.game_state || data.canonical_state || data.state);
  state.challenge.status = data.status || state.challenge.status;
  state.challenge.claimEligible = !!data.claim_eligible;
  state.challenge.claimId = data.claim_id || state.challenge.claimId || null;

  updateUI();
  markDirty();

  if (data.winner) {
    const playerWon = (data.winner === 'tiger' && state.playerSide === PIECE_TYPES.TIGER)
      || (data.winner === 'goat' && state.playerSide === PIECE_TYPES.GOAT);
    state.challenge.claimEligible = !!data.claim_eligible && playerWon;
    endGame(data.message || `${data.winner === 'tiger' ? 'Tiger' : 'Goat'} won the challenge.`, data.winner);
  }
}

function cloneGameForRollback(game) {
  return {
    ...game,
    board: [...(game.board || [])],
    validMoves: [...(game.validMoves || [])],
    tigerIdentities: { ...(game.tigerIdentities || {}) },
    goatIdentities: { ...(game.goatIdentities || {}) }
  };
}

function applyOptimisticChallengeMove(move) {
  const game = state.game;
  if (!move || game.gameOver) return;

  // The client already validated move legality; this is only to make the UI feel snappy.
  const mover = game.currentPlayer;

  if (move.type === 'place') {
    if (mover !== PIECE_TYPES.GOAT) return;
    if (typeof move.to !== 'number') return;
    if (game.board[move.to] !== PIECE_TYPES.EMPTY) return;

    game.board[move.to] = PIECE_TYPES.GOAT;
    game.goatIdentities[move.to] = nextGoatFlag();
    game.goatsPlaced += 1;
    if (game.goatsPlaced >= 20) game.phase = PHASE.MOVEMENT;
    game.currentPlayer = PIECE_TYPES.TIGER;
    game.selectedPiece = null;
    game.validMoves = [];
    return;
  }

  if (move.type === 'move') {
    if (typeof move.from !== 'number' || typeof move.to !== 'number') return;

    const from = move.from;
    const to = move.to;
    const capture = move.capture;

    game.board[to] = mover;
    game.board[from] = PIECE_TYPES.EMPTY;

    if (mover === PIECE_TYPES.TIGER) {
      const tigerIdentity = game.tigerIdentities[from];
      delete game.tigerIdentities[from];
      if (tigerIdentity !== undefined) game.tigerIdentities[to] = tigerIdentity;

      if (typeof capture === 'number') {
        if (game.board[capture] === PIECE_TYPES.GOAT) {
          game.board[capture] = PIECE_TYPES.EMPTY;
          delete game.goatIdentities[capture];
          game.goatsCaptured += 1;
        }
      }

      game.currentPlayer = PIECE_TYPES.GOAT;
    } else {
      const goatIdentity = game.goatIdentities[from];
      delete game.goatIdentities[from];
      if (goatIdentity !== undefined) game.goatIdentities[to] = goatIdentity;

      game.currentPlayer = PIECE_TYPES.TIGER;
    }

    game.selectedPiece = null;
    game.validMoves = [];
  }
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
  persistActiveGame();
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
      persistActiveGame();
      onMoveMade();
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
    persistActiveGame();
    updateUI();
    onMoveMade();
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
  } else if (state.gameMode === 'ai') {
    scheduleAIMove();
  }
}

function applyChallengeSnapshot(snapshot) {
  if (!snapshot?.board) return;
  state.game = {
    ...state.game,
    board: [...snapshot.board],
    currentPlayer: normalizeSide(snapshot.currentPlayer || snapshot.current_player),
    phase: snapshot.phase || PHASE.PLACEMENT,
    goatsPlaced: Number(snapshot.goatsPlaced ?? snapshot.goats_placed ?? 0),
    goatsCaptured: Number(snapshot.goatsCaptured ?? snapshot.goats_captured ?? 0),
    selectedPiece: null,
    validMoves: [],
    gameOver: !!snapshot.gameOver,
    tigerIdentities: { ...(snapshot.tigerIdentities || snapshot.tiger_identities || {}) },
    goatIdentities: { ...(snapshot.goatIdentities || snapshot.goat_identities || {}) }
  };
}

function normalizeSide(side) {
  if (side === PIECE_TYPES.TIGER || side === 'tiger') return PIECE_TYPES.TIGER;
  return PIECE_TYPES.GOAT;
}

export function startAdventureGame(botId) {
  const bot = getAdventureBot(botId);
  clearPendingAsyncActions();
  stopTimer();
  hooks.stopRoomSyncListeners();
  state.currentRoomId = null;
  state.currentRoomCode = null;
  state.gameMode = 'ai';
  state.matchRatingType = 'rated';
  state.adventureModeActive = true;
  state.adventureBotId = bot.id;
  state.aiDifficulty = bot.difficulty;
  state.playerSide = bot.side === 'tiger' ? PIECE_TYPES.GOAT : PIECE_TYPES.TIGER;
  state.gameStarted = true;
  state.isFirstAIMove = true;
  state.sandboxTool = null;
  hideOverlay('winner-overlay');
  hideOverlay('player-select-overlay');
  initGame({ started: true, decorativeGoats: false, playStartSound: true });
}

export function setSandboxTool(tool) {
  state.sandboxTool = tool;
  state.game.selectedPiece = null;
  state.game.validMoves = [];
  updateUI();
  markDirty();
}

export function resetCurrentGame() {
  if (state.gameMode !== 'ai' || !state.gameStarted) return;
  if (state.matchRatingType === 'rated') return;
  hideWinnerOverlay();
  initGame({
    started: true,
    decorativeGoats: false,
    playStartSound: false
  });
}

export function clearSandboxBoard() {
  if (state.gameMode !== 'sandbox') return;
  state.sandboxTool = null;
  state.sandboxStarterSide = PIECE_TYPES.GOAT;
  initGame({
    started: true,
    decorativeGoats: false,
    playStartSound: false,
    showPanels: true,
    startTimer: false,
    autoAIMove: false,
    layout: 'empty'
  });
}

export async function resignCurrentGame() {
  if (!state.gameStarted || state.game.gameOver) return;
  if (state.gameMode !== 'ai' && state.gameMode !== 'multiplayer' && state.gameMode !== 'challenge') return;

  if (state.gameMode === 'challenge') {
    if (state.challenge?.pendingMove || !state.challenge?.attemptId) return;
    setChallengePendingMove(true);
    updateUI();
    markDirty();
    const result = await hooks.resignChallengeAttempt(state.challenge.attemptId);
    setChallengePendingMove(false);
    if (!result?.ok) {
      window.alert(result?.error || 'Challenge resignation failed.');
      updateUI();
      markDirty();
      return;
    }
    const data = result.data || {};
    applyChallengeSnapshot(data.game_state || data.canonical_state || data.state);
    state.challenge.status = data.status || 'lost';
    state.challenge.claimEligible = false;
    endGame(data.message || 'Bounty failed by resignation.', data.winner || (state.playerSide === PIECE_TYPES.TIGER ? 'goat' : 'tiger'));
    return;
  }

  const playerIsTiger = state.playerSide === PIECE_TYPES.TIGER;
  const winner = playerIsTiger ? 'goat' : 'tiger';
  const message = state.gameMode === 'multiplayer'
    ? 'Opponent wins by resignation.'
    : `${winner === 'tiger' ? 'Tiger' : 'Goat'} wins by resignation.`;

  endGame(message, winner);
}

function updateModePanels({ playing }) {
  const showStandardPanels = playing && state.gameMode !== 'sandbox';
  const showSandboxPanel = playing && state.gameMode === 'sandbox';
  const showActionPanel = false;

  id('gameStatePanel')?.classList.toggle('hidden', !showStandardPanels);
  id('tigerPanel')?.classList.toggle('hidden', !showStandardPanels);
  id('goatPanel')?.classList.toggle('hidden', !showStandardPanels);
  id('sandbox-panel')?.classList.toggle('hidden', !showSandboxPanel);
  id('gameActionsPanel')?.classList.toggle('hidden', !showActionPanel);
  id('reset-game-btn')?.toggleAttribute('hidden', state.gameMode !== 'ai');
  id('resign-game-btn')?.toggleAttribute('hidden', state.gameMode === 'sandbox');

  const resignLabel = id('resign-game-btn');
  if (resignLabel) resignLabel.textContent = state.gameMode === 'multiplayer' ? 'Resign Match' : 'Resign';

  const rated = state.matchRatingType === 'rated';
  id('reset-game-btn')?.toggleAttribute('hidden', state.gameMode !== 'ai' || rated);
  id('restart-left-btn')?.toggleAttribute('hidden', state.gameMode !== 'ai' || rated);
  id('undo-game-btn')?.toggleAttribute('hidden', state.gameMode !== 'ai' || rated);
  id('mobile-undo-btn')?.toggleAttribute('hidden', rated);
  id('mobile-restart-btn')?.toggleAttribute('hidden', rated);

  toggleMoveNavigation(false);
}

function syncSandboxMeta() {
  const game = state.game;
  game.goatsPlaced = countPiecesOnBoard(PIECE_TYPES.GOAT);
  game.goatsCaptured = Math.max(0, 20 - game.goatsPlaced);
  game.phase = game.goatsPlaced >= 20 ? PHASE.MOVEMENT : PHASE.PLACEMENT;
  game.currentPlayer = state.sandboxStarterSide;
}

function countPiecesOnBoard(pieceType) {
  return state.game.board.reduce((count, piece) => count + (piece === pieceType ? 1 : 0), 0);
}

function nextTigerIdentity() {
  const used = new Set(Object.values(state.game.tigerIdentities));
  for (let identity = 0; identity < 4; identity++) {
    if (!used.has(identity)) return identity;
  }
  return 0;
}

function moveSandboxPiece(fromIndex, toIndex) {
  const game = state.game;
  const piece = game.board[fromIndex];
  game.board[toIndex] = piece;
  game.board[fromIndex] = PIECE_TYPES.EMPTY;

  if (piece === PIECE_TYPES.TIGER) {
    game.tigerIdentities[toIndex] = game.tigerIdentities[fromIndex];
    delete game.tigerIdentities[fromIndex];
  } else if (piece === PIECE_TYPES.GOAT) {
    game.goatIdentities[toIndex] = game.goatIdentities[fromIndex];
    delete game.goatIdentities[fromIndex];
  }
}

function removeSandboxPiece(index) {
  const game = state.game;
  const piece = game.board[index];
  game.board[index] = PIECE_TYPES.EMPTY;

  if (piece === PIECE_TYPES.TIGER) {
    delete game.tigerIdentities[index];
  } else if (piece === PIECE_TYPES.GOAT) {
    delete game.goatIdentities[index];
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
