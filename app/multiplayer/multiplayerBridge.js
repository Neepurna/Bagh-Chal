// Multiplayer bridge: connects the multiplayer service to the central game
// state. Owns subscribeToRoom (so room snapshots flow into local state), the
// per-move sync payload, and the helper that finalizes a finished room.

import { PHASE, PIECE_TYPES } from '../config/gameConfig.js';
import { state } from '../state/store.js';
import { markDirty } from '../state/store.js';
import { updateUI } from '../render/uiBindings.js';


let multiplayerService = null;
let firebaseApi = null;
let getDb = () => null;
let onRoomFinishedCallback = () => {};

export function configureMultiplayerBridge({
  firebase,
  service,
  getDb: dbGetter,
  onRoomFinished
}) {
  firebaseApi = firebase;
  multiplayerService = service;
  getDb = dbGetter;
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
  const db = getDb();
  if (!db || !roomId) return;
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
    updatedAt: firebaseApi.firestore.FieldValue.serverTimestamp(),
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
  if (!roomData || !roomData.board) return;
  const game = state.game;

  // Resolve opponent username from room document
  if (state.currentUser) {
    const weAreHost = roomData.hostUid === state.currentUser.uid;
    state.opponentUsername = weAreHost
      ? (roomData.guestUsername || 'Opponent')
      : (roomData.hostUsername || 'Opponent');
  }

  // Only apply board state when the game isn't already finished locally.
  // game.gameOver is owned exclusively by endGame() — we must NOT set it here,
  // because this function runs BEFORE onRoomFinished fires in the snapshot
  // listener. Setting it here would block the onRoomFinished → endGame path
  // and leave the losing player without a winner overlay.
  if (game.gameOver) return;

  multiplayerService.withAppliedRoomSnapshot(() => {
    game.board = [...roomData.board];
    game.currentPlayer = roomData.currentPlayer ?? PIECE_TYPES.GOAT;
    game.phase = roomData.phase || PHASE.PLACEMENT;
    game.goatsPlaced = roomData.goatsPlaced || 0;
    game.goatsCaptured = roomData.goatsCaptured || 0;
    game.goatIdentities = { ...(roomData.goatIdentities || {}) };
    game.tigerIdentities = { ...(roomData.tigerIdentities || {}) };
    game.selectedPiece = null;
    game.validMoves = [];
  });

  updateUI();
  markDirty();
}

export function subscribeToRoom(roomId) {
  multiplayerService.subscribeToRoom(roomId, {
    onRoomState: applyRoomStateToLocal,
    onRoomFinished: (room) => onRoomFinishedCallback(room)
  });
}
