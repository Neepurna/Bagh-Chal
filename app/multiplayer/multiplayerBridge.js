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
    game.gameOver = roomData.status === 'finished';
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
