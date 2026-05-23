// Multiplayer bridge: connects the multiplayer service to the central game
// state. Owns subscribeToRoom (so room snapshots flow into local state), the
// per-move sync payload, and the helper that finalizes a finished room.

import { PHASE, PIECE_TYPES } from '../config/gameConfig.js';
import { state } from '../state/store.js';
import { markDirty } from '../state/store.js';
import { updateUI } from '../render/uiBindings.js';
import { syncTimerToCurrentTurn } from '../game/timerService.js';


let multiplayerService = null;
let onRoomFinishedCallback = () => {};

export function configureMultiplayerBridge({
  service,
  onRoomFinished
}) {
  multiplayerService = service;
  if (typeof onRoomFinished === 'function') onRoomFinishedCallback = onRoomFinished;
}

export function isApplyingRoomSnapshot() {
  return Boolean(multiplayerService?.isApplyingRoomSnapshot?.());
}

export function stopRoomSyncListeners() {
  state.opponentUsername = null;
  multiplayerService?.stopRoomSyncListeners?.();
}

export async function finalizeMultiplayerRoom({ roomId, winner, winnerMessage }) {
  if (!roomId) return;
  return multiplayerService.finalizeRoom({ roomId, winner, winnerMessage });
}

function getCurrentMultiplayerPayload(extra = {}) {
  const game = state.game;
  return {
    board: [...game.board],
    currentPlayer: game.currentPlayer,
    phase: game.phase,
    goatsPlaced: game.goatsPlaced,
    goatsCaptured: game.goatsCaptured,
    goatIdentities: { ...(game.goatIdentities || {}) },
    tigerIdentities: { ...(game.tigerIdentities || {}) },
    clockSeconds: {
      tiger: Number.isFinite(state.clockSeconds?.tiger) ? state.clockSeconds.tiger : null,
      goat: Number.isFinite(state.clockSeconds?.goat) ? state.clockSeconds.goat : null
    },
    clockInitialized: state.clockInitialized,
    clockActiveSide: state.clockActiveSide,
    clockLastTickAt: state.clockLastTickAt,
    ...extra
  };
}

export async function syncMultiplayerState(extra = {}) {
  await multiplayerService.syncRoomState({
    roomId: state.currentRoomId,
    gameMode: state.gameMode,
    payload: getCurrentMultiplayerPayload(extra)
  });
}

function applyRoomStateToLocal(roomData) {
  const boardState = roomData.board_state || roomData;
  if (!boardState || !boardState.board) return;
  const game = state.game;

  // Resolve opponent username from room document
  if (state.currentUser) {
    const weAreHost = roomData.host_id === state.currentUser.id;
    state.opponentUsername = weAreHost
      ? (roomData.guest_username || 'Opponent')
      : (roomData.host_username || 'Opponent');
  }

  // Only apply board state when the game isn't already finished locally.
  // game.gameOver is owned exclusively by endGame() — we must NOT set it here,
  // because this function runs BEFORE onRoomFinished fires in the snapshot
  // listener. Setting it here would block the onRoomFinished → endGame path
  // and leave the losing player without a winner overlay.
  if (game.gameOver) return;

  multiplayerService.withAppliedRoomSnapshot(() => {
    game.board = [...boardState.board];
    game.currentPlayer = boardState.currentPlayer ?? PIECE_TYPES.GOAT;
    game.phase = boardState.phase || PHASE.PLACEMENT;
    game.goatsPlaced = boardState.goatsPlaced || 0;
    game.goatsCaptured = boardState.goatsCaptured || 0;
    game.goatIdentities = { ...(boardState.goatIdentities || {}) };
    game.tigerIdentities = { ...(boardState.tigerIdentities || {}) };
    game.selectedPiece = null;
    game.validMoves = [];

    if (boardState.clockSeconds) {
      state.clockSeconds = {
        tiger: typeof boardState.clockSeconds.tiger === 'number' ? Math.max(0, boardState.clockSeconds.tiger) : Infinity,
        goat: typeof boardState.clockSeconds.goat === 'number' ? Math.max(0, boardState.clockSeconds.goat) : Infinity
      };
      state.clockInitialized = boardState.clockInitialized !== false;
      state.clockActiveSide = boardState.clockActiveSide ?? game.currentPlayer;
      state.clockLastTickAt = boardState.clockLastTickAt || Date.now();
    }
  });

  syncTimerToCurrentTurn();
  updateUI();
  markDirty();
}

export function subscribeToRoom(roomId) {
  multiplayerService.subscribeToRoom(roomId, {
    onRoomState: applyRoomStateToLocal,
    onRoomFinished: (room) => onRoomFinishedCallback(room)
  });
}
