// AI bridge: schedules AI turns, prefers the off-thread WebWorker, falls
// back to a synchronous BaghchalAI run when the worker is unavailable.
//
// The old code maintained ~520 lines of duplicate minimax in main.js as a
// fallback. We now reuse the same BaghchalAI class the worker uses, so there
// is exactly one AI implementation to keep correct.

import { playSound } from '../audio/audioSystem.js';
import { AI_CONFIG, PHASE, PIECE_TYPES } from '../config/gameConfig.js';
import {
  BOARD_POSITIONS,
  countTrappedPieces,
  getBoardHash,
  getPositionKey,
  getValidMovesForBoard
} from '../game/boardRules.js';
import { saveState } from '../game/historyService.js';
import { onMoveMade } from '../game/timerService.js';
import { markDirty, MAX_POSITION_HISTORY, nextGoatFlag, state } from '../state/store.js';

// Lazy-imported (to avoid pulling MCTS classes when running easy mode only).
let BaghchalAIClass = null;

let aiWorker = null;
const workerSupported = typeof Worker !== 'undefined';

// Hooks supplied by the bootstrap so the AI controller can ask the game
// controller "is the game still running?" and "tell the renderer/UI to refresh".
const hooks = {
  checkWin: () => null,
  syncMultiplayer: async () => {}
};

export function configureAIController({ checkWin, syncMultiplayer }) {
  if (typeof checkWin === 'function') hooks.checkWin = checkWin;
  if (typeof syncMultiplayer === 'function') hooks.syncMultiplayer = syncMultiplayer;
}

export function initializeAIWorker() {
  if (!workerSupported) return;
  if (aiWorker) return;
  try {
    aiWorker = new Worker('ai-worker.js', { type: 'module' });
    aiWorker.onerror = (err) => {
      console.error('[ai] worker error:', err);
      aiWorker = null;
    };
  } catch (err) {
    console.error('[ai] failed to init worker:', err);
    aiWorker = null;
  }
}

function getAIMoveFromWorker(gameState, aiSide) {
  return new Promise((resolve) => {
    if (!aiWorker) { resolve(null); return; }
    const timeout = setTimeout(() => resolve(null), AI_CONFIG.hard.thinkTime + 100);
    const handler = (event) => {
      clearTimeout(timeout);
      aiWorker.removeEventListener('message', handler);
      resolve(event.data && event.data.success ? event.data.move : null);
    };
    aiWorker.addEventListener('message', handler);
    aiWorker.postMessage({
      board: gameState.board,
      phase: gameState.phase,
      goatsPlaced: gameState.goatsPlaced,
      goatsCaptured: gameState.goatsCaptured,
      aiSide,
      difficulty: 'hard'
    });
  });
}

async function syncBaghchalAIFallback(gameState, aiSide, difficulty = 'hard') {
  if (!BaghchalAIClass) {
    const mod = await import('./BaghchalAI.js');
    BaghchalAIClass = mod.BaghchalAI;
  }
  const ai = new BaghchalAIClass(difficulty);
  return ai.getBestMove({
    board: gameState.board,
    phase: gameState.phase,
    goatsPlaced: gameState.goatsPlaced,
    goatsCaptured: gameState.goatsCaptured,
    currentPlayer: aiSide
  }, aiSide);
}

// ── Move scheduling ────────────────────────────────────────────────────────
function getAIThinkingTime() {
  if (state.isFirstAIMove) {
    state.isFirstAIMove = false;
    return 0;
  }
  return Math.random() * 500;
}

function showAIThinking() { document.getElementById('ai-thinking')?.classList.add('show'); }
function hideAIThinking() { document.getElementById('ai-thinking')?.classList.remove('show'); }

export function clearPendingAITimeouts() {
  if (state.pendingAITurnTimeout) {
    clearTimeout(state.pendingAITurnTimeout);
    state.pendingAITurnTimeout = null;
  }
}

export function scheduleAIMove(delay = getAIThinkingTime()) {
  clearPendingAITimeouts();
  state.pendingAITurnTimeout = setTimeout(() => {
    state.pendingAITurnTimeout = null;
    aiMove();
  }, delay);
}

function aiMove() {
  const game = state.game;
  const aiSide = state.playerSide === PIECE_TYPES.GOAT ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  if (game.currentPlayer !== aiSide || game.gameOver || !state.gameStarted) return;

  showAIThinking();
  const delay = getAIThinkingTime();
  state.pendingAITurnTimeout = setTimeout(async () => {
    state.pendingAITurnTimeout = null;
    try {
      if (state.aiDifficulty === 'hard') {
        await executeHardAIMove(aiSide);
      } else if (state.aiDifficulty === 'medium') {
        await executeMediumAIMove(aiSide);
      } else {
        // easy
        executeEasyAIMove(aiSide);
      }
    } finally {
      hideAIThinking();
    }
  }, delay);
}

// ── Hard AI ────────────────────────────────────────────────────────────────
async function executeHardAIMove(aiSide) {
  const game = state.game;
  if (game.gameOver) return;

  let bestMove = await getAIMoveFromWorker(game, aiSide);
  if (!bestMove) {
    console.warn('[ai] worker unavailable, running synchronous fallback');
    try {
      bestMove = await syncBaghchalAIFallback(game, aiSide);
    } catch (err) {
      console.error('[ai] fallback failed:', err);
    }
  }
  applyHardAIMove(bestMove, aiSide);
}

function applyHardAIMove(bestMove, aiSide) {
  const game = state.game;
  if (!state.gameStarted || game.gameOver) return;

  if (!bestMove) {
    hooks.checkWin();
    return;
  }
  saveState();

  if (bestMove.type === 'place') {
    game.board[bestMove.to] = PIECE_TYPES.GOAT;
    game.goatIdentities[bestMove.to] = nextGoatFlag();
    game.goatsPlaced++;
    if (game.goatsPlaced === 20) game.phase = PHASE.MOVEMENT;
    game.currentPlayer = PIECE_TYPES.TIGER;
  } else {
    if (game.board[bestMove.from] === PIECE_TYPES.TIGER) {
      const tigerIdentity = game.tigerIdentities[bestMove.from];
      game.tigerIdentities[bestMove.to] = tigerIdentity;
      delete game.tigerIdentities[bestMove.from];
    } else if (game.board[bestMove.from] === PIECE_TYPES.GOAT) {
      const goatIdentity = game.goatIdentities[bestMove.from];
      game.goatIdentities[bestMove.to] = goatIdentity;
      delete game.goatIdentities[bestMove.from];
    }
    game.board[bestMove.to] = game.board[bestMove.from];
    game.board[bestMove.from] = PIECE_TYPES.EMPTY;

    if (bestMove.capture !== null && bestMove.capture !== undefined) {
      game.board[bestMove.capture] = PIECE_TYPES.EMPTY;
      delete game.goatIdentities[bestMove.capture];
      game.goatsCaptured++;
      playSound('tigerCapture');
    }
    game.currentPlayer = aiSide === PIECE_TYPES.TIGER ? PIECE_TYPES.GOAT : PIECE_TYPES.TIGER;
  }

  pushPositionHistory();
  playSound('pieceMove');
  markDirty();
  hooks.checkWin();
  onMoveMade();
}

// ── Medium AI (paper's heuristic strategy) ────────────────────────────────
async function executeMediumAIMove(aiSide) {
  const game = state.game;
  if (game.gameOver) return;

  let bestMove = null;
  try {
    bestMove = await syncBaghchalAIFallback(game, aiSide, 'medium');
  } catch (err) {
    console.error('[ai] medium AI failed:', err);
  }
  applyHardAIMove(bestMove, aiSide); // reuse same apply logic
}

// ── Easy AI (random with capture preference) ───────────────────────────────
function executeEasyAIMove(aiSide) {
  if (aiSide === PIECE_TYPES.TIGER) executeAITigerMove();
  else executeAIGoatMove();
}

function executeAITigerMove() {
  const game = state.game;
  if (game.gameOver) return;

  const tigers = [];
  for (let i = 0; i < 25; i++) {
    if (game.board[i] === PIECE_TYPES.TIGER) {
      const moves = getValidMovesForBoard(i, game.board, BOARD_POSITIONS).map(({ to, capture }) => ({ to, capture }));
      if (moves.length > 0) tigers.push({ index: i, moves });
    }
  }
  if (tigers.length === 0) { hooks.checkWin(); return; }

  // Capture-first
  for (const t of tigers) {
    const captures = t.moves.filter((m) => m.capture !== null);
    if (captures.length > 0) {
      const move = captures[0];
      saveState();
      const tigerIdentity = game.tigerIdentities[t.index];
      game.board[move.to] = PIECE_TYPES.TIGER;
      game.tigerIdentities[move.to] = tigerIdentity;
      game.board[t.index] = PIECE_TYPES.EMPTY;
      delete game.tigerIdentities[t.index];
      game.board[move.capture] = PIECE_TYPES.EMPTY;
      delete game.goatIdentities[move.capture];
      game.goatsCaptured++;
      playSound('pieceMove');
      playSound('tigerCapture');
      game.currentPlayer = PIECE_TYPES.GOAT;
      pushPositionHistory();
      markDirty();
      hooks.checkWin();
      onMoveMade();
      return;
    }
  }

  // Random fallback
  const t = tigers[Math.floor(Math.random() * tigers.length)];
  const move = t.moves[Math.floor(Math.random() * t.moves.length)];
  saveState();
  const tigerIdentity = game.tigerIdentities[t.index];
  game.board[move.to] = PIECE_TYPES.TIGER;
  game.tigerIdentities[move.to] = tigerIdentity;
  game.board[t.index] = PIECE_TYPES.EMPTY;
  delete game.tigerIdentities[t.index];
  playSound('pieceMove');
  game.currentPlayer = PIECE_TYPES.GOAT;
  pushPositionHistory();
  markDirty();
  hooks.checkWin();
  onMoveMade();
}

function executeAIGoatMove() {
  const game = state.game;
  if (game.gameOver) return;

  if (game.phase === PHASE.PLACEMENT) {
    const empty = [];
    for (let i = 0; i < 25; i++) if (game.board[i] === PIECE_TYPES.EMPTY) empty.push(i);
    if (empty.length === 0) return;
    const spot = empty[Math.floor(Math.random() * empty.length)];
    saveState();
    game.board[spot] = PIECE_TYPES.GOAT;
    game.goatIdentities[spot] = nextGoatFlag();
    game.goatsPlaced++;
    playSound('pieceMove');
    if (game.goatsPlaced === 20) game.phase = PHASE.MOVEMENT;
    game.currentPlayer = PIECE_TYPES.TIGER;
  } else {
    const goats = [];
    for (let i = 0; i < 25; i++) {
      if (game.board[i] === PIECE_TYPES.GOAT) {
        const moves = getValidMovesForBoard(i, game.board, BOARD_POSITIONS).map(({ to, capture }) => ({ to, capture }));
        if (moves.length > 0) goats.push({ index: i, moves });
      }
    }
    if (goats.length > 0) {
      const g = goats[Math.floor(Math.random() * goats.length)];
      const move = g.moves[Math.floor(Math.random() * g.moves.length)];
      saveState();
      game.board[move.to] = PIECE_TYPES.GOAT;
      game.board[g.index] = PIECE_TYPES.EMPTY;
      playSound('pieceMove');
      game.currentPlayer = PIECE_TYPES.TIGER;
    }
  }

  pushPositionHistory();
  markDirty();
  hooks.checkWin();
  onMoveMade();
}

function pushPositionHistory() {
  const hash = getBoardHash(state.game.board);
  state.positionHistory.push(hash);
  if (state.positionHistory.length > MAX_POSITION_HISTORY) {
    state.positionHistory.shift();
  }

  // Full-game repetition tracking (board + whose turn it is)
  if (state.game.phase === PHASE.MOVEMENT) {
    const key = getPositionKey(state.game.board, state.game.currentPlayer);
    const count = (state.positionCounts.get(key) || 0) + 1;
    state.positionCounts.set(key, count);
  }
}

// Suppress unused-import lint: countTrappedPieces is exported by boardRules
// and re-used elsewhere; kept here as a documented dependency.
void countTrappedPieces;
