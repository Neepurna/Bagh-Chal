import { PHASE, PIECE_TYPES } from '../config/gameConfig.js';

export function buildInitialRoomState() {
  const board = Array(25).fill(PIECE_TYPES.EMPTY);
  board[0] = PIECE_TYPES.TIGER;
  board[4] = PIECE_TYPES.TIGER;
  board[20] = PIECE_TYPES.TIGER;
  board[24] = PIECE_TYPES.TIGER;

  return {
    board,
    currentPlayer: PIECE_TYPES.GOAT,
    phase: PHASE.PLACEMENT,
    goatsPlaced: 0,
    goatsCaptured: 0,
    goatIdentities: {},
    tigerIdentities: { '0': 0, '4': 1, '20': 2, '24': 3 }
  };
}

export function createMultiplayerService({ firebase, getContext }) {
  let currentRoomUnsub = null;
  let roomLobbyUnsub = null;
  let applyingRoomSnapshot = false;

  function stopRoomSyncListeners() {
    if (currentRoomUnsub) {
      currentRoomUnsub();
      currentRoomUnsub = null;
    }
    if (roomLobbyUnsub) {
      roomLobbyUnsub();
      roomLobbyUnsub = null;
    }
  }

  function stopLobbyListener() {
    if (roomLobbyUnsub) {
      roomLobbyUnsub();
      roomLobbyUnsub = null;
    }
  }

  function isApplyingRoomSnapshot() {
    return applyingRoomSnapshot;
  }

  function withAppliedRoomSnapshot(callback) {
    applyingRoomSnapshot = true;
    try {
      callback();
    } finally {
      applyingRoomSnapshot = false;
    }
  }

  async function syncRoomState({ roomId, gameMode, payload }) {
    const { db } = getContext();
    if (!db || !roomId || gameMode !== 'multiplayer' || applyingRoomSnapshot) return;
    await db.collection('rooms').doc(roomId).set(payload, { merge: true });
  }

  function subscribeToRoom(roomId, { onRoomState, onRoomFinished }) {
    const { db } = getContext();
    if (!db || !roomId) return;
    if (currentRoomUnsub) currentRoomUnsub();

    currentRoomUnsub = db.collection('rooms').doc(roomId).onSnapshot((snap) => {
      if (!snap.exists) return;
      const room = snap.data();

      if (room.board) {
        onRoomState?.(room);
      }

      if (room.status === 'finished' && room.winner) {
        onRoomFinished?.(room);
      }
    }, (err) => {
      console.error('[MP] Room listener error:', err);
    });
  }

  async function finalizeRoom({ roomId, winner, winnerMessage }) {
    const { db } = getContext();
    if (!db || !roomId || applyingRoomSnapshot) return;

    await db.collection('rooms').doc(roomId).set({
      status: 'finished',
      winner,
      winnerMessage,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  function startLobbyListener(roomRef, { onRoomReady }) {
    stopLobbyListener();

    roomLobbyUnsub = roomRef.onSnapshot((snap) => {
      if (!snap.exists) return;
      const room = snap.data();
      if (room.status === 'playing' && room.guestUid) {
        stopLobbyListener();
        onRoomReady?.(room);
      }
    }, (err) => {
      console.error('[MP] Lobby listener error:', err);
    });
  }

  return {
    stopRoomSyncListeners,
    stopLobbyListener,
    isApplyingRoomSnapshot,
    withAppliedRoomSnapshot,
    syncRoomState,
    subscribeToRoom,
    finalizeRoom,
    startLobbyListener
  };
}
