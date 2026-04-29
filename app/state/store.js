// Central runtime state + change-notification.
//
// Replaces the dozen+ module-scoped `let` variables that lived at the top of
// the old monolithic main.js. All state mutations go through `state` (or its
// `state.game` sub-tree), and any code that wants to be notified of a change
// calls `markDirty()` after mutating.
//
// `markDirty()` collapses many mutations in the same tick into a single
// requestAnimationFrame callback, replacing the old "draw() schedules itself
// every frame forever" pattern that burned CPU for nothing.

import { PHASE, PIECE_TYPES } from '../config/gameConfig.js';

export function makeInitialGameState() {
  return {
    board: Array(25).fill(PIECE_TYPES.EMPTY),
    currentPlayer: PIECE_TYPES.GOAT,
    phase: PHASE.PLACEMENT,
    goatsPlaced: 0,
    goatsCaptured: 0,
    selectedPiece: null,
    validMoves: [],
    gameOver: false,
    tigerIdentities: {},
    goatIdentities: {}
  };
}

// Single shared state object. Modules import this and read/write fields.
export const state = {
  // ── Session / auth ─────────────────────────────────────────────
  currentUser: null,
  userStats: { gamesPlayed: 0, tigerWins: 0, goatWins: 0 },
  guestModeActive: false,
  pendingPostSignInAction: null,

  // ── Game settings ──────────────────────────────────────────────
  playerSide: null,
  gameMode: 'ai',                   // 'ai' | 'multiplayer'
  multiplayerSide: null,
  aiDifficulty: 'easy',             // 'easy' | 'hard'
  aiTimeControl: '3m',
  multiplayerTimeControl: '5m',

  // ── Game runtime flags ─────────────────────────────────────────
  gameStarted: false,
  isFirstAIMove: true,

  // ── Pending async ──────────────────────────────────────────────
  pendingBoardResetTimeout: null,
  pendingAITurnTimeout: null,

  // ── Multiplayer ────────────────────────────────────────────────
  currentRoomId: null,
  currentRoomCode: null,
  pendingChallengeId: null,
  opponentUsername: null,

  // ── Game core ──────────────────────────────────────────────────
  game: makeInitialGameState(),

  // Move history (last 5 snapshots)
  gameHistory: [],
  currentMoveIndex: -1,
  savedGameState: null,

  // Position-repetition tracking
  positionHistory: [],

  // Sequential goat flag (cycles 0..19)
  goatFlagCounter: 0,

  // Tiger image identity (which logo is at each starting corner)
  tigerImages: [0, 1, 2, 3]
};

export const MAX_POSITION_HISTORY = 10;
export const MAX_HISTORY_SNAPSHOTS = 5;

// ── Redraw / change subscribers ──────────────────────────────────
const listeners = new Set();
let pendingRedraw = false;

/**
 * Schedule listeners to fire on the next animation frame. Multiple calls in
 * the same tick coalesce into one callback. This is the engine that powers
 * "redraw on change" instead of "redraw every frame".
 */
export function markDirty() {
  if (pendingRedraw) return;
  pendingRedraw = true;
  requestAnimationFrame(() => {
    pendingRedraw = false;
    listeners.forEach((fn) => {
      try { fn(); } catch (err) { console.error('redraw listener error:', err); }
    });
  });
}

/** Subscribe to redraw events. Returns an unsubscribe function. */
export function onRedraw(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Reset the in-game state (board, history, position log, flag counter). */
export function resetGameState() {
  state.game = makeInitialGameState();
  state.gameHistory = [];
  state.currentMoveIndex = -1;
  state.savedGameState = null;
  state.positionHistory = [];
  state.goatFlagCounter = 0;
}

/** Get next sequential goat flag index (0..19) and advance the counter. */
export function nextGoatFlag() {
  const idx = state.goatFlagCounter % 20;
  state.goatFlagCounter++;
  return idx;
}
