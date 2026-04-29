// Multiplayer lobby: create-room, join-room, copy-code, cancel-room buttons,
// side-pick highlighting, and the bookkeeping needed to reset the lobby UI.

import { playSound } from '../audio/audioSystem.js';
import { PIECE_TYPES } from '../config/gameConfig.js';
import { id, on, qs, qsa } from './dom.js';
import { state } from '../state/store.js';

let firebaseApi = null;
let multiplayerService = null;
let getDb = () => null;
let onStartMultiplayerGame = () => {};
let buildInitialRoomState = () => ({});

export function configureMultiplayerLobby({
  firebase,
  service,
  buildInitialRoomState: initBuilder,
  getDb: dbGetter,
  startMultiplayerGame
}) {
  firebaseApi = firebase;
  multiplayerService = service;
  buildInitialRoomState = initBuilder;
  getDb = dbGetter;
  onStartMultiplayerGame = startMultiplayerGame;
}

export function highlightMPSide(side) {
  state.multiplayerSide = side;
  id('select-goat')?.classList.toggle('mp-selected', side === PIECE_TYPES.GOAT);
  id('select-tiger')?.classList.toggle('mp-selected', side === PIECE_TYPES.TIGER);
}

export function resetMultiplayerUI() {
  multiplayerService?.stopRoomSyncListeners?.();
  state.currentRoomId = null;
  state.currentRoomCode = null;
  state.multiplayerSide = null;
  qsa('#select-goat, #select-tiger').forEach((c) => c.classList.remove('mp-selected'));
  id('room-options')?.classList.remove('hidden');
  id('room-waiting')?.classList.add('hidden');
  const codeInput = id('room-code-input');
  if (codeInput) codeInput.value = '';
}

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function sideToString(side) {
  return side === PIECE_TYPES.TIGER ? 'tiger' : 'goat';
}

function pulseSidePickerHint() {
  const hint = qs('.mp-hint');
  if (hint) {
    hint.textContent = '⬆ Pick a side first!';
    hint.style.color = 'var(--gold)';
  }
  const sel = qs('.player-selection');
  if (sel) {
    sel.style.animation = 'none';
    void sel.offsetHeight;
  }
}

export function initMultiplayerLobbyUI() {
  on('create-room-btn', 'click', async () => {
    const db = getDb();
    if (!state.currentUser || !db) {
      alert('Please sign in first to play multiplayer.');
      return;
    }
    if (!state.multiplayerSide) {
      pulseSidePickerHint();
      return;
    }
    const code = generateRoomCode();
    const hostSide = sideToString(state.multiplayerSide);
    const guestSide = hostSide === 'tiger' ? 'goat' : 'tiger';

    try {
      const roomRef = db.collection('rooms').doc();
      const initial = buildInitialRoomState();
      await roomRef.set({
        roomCode: code,
        hostUid: state.currentUser.uid,
        hostUsername: state.userStats?.username || state.currentUser.displayName || 'Player',
        guestUid: null,
        guestUsername: null,
        hostSide,
        guestSide,
        timeControl: '5m',
        status: 'waiting',
        ...initial,
        createdAt: firebaseApi.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebaseApi.firestore.FieldValue.serverTimestamp()
      });

      state.currentRoomId = roomRef.id;
      state.currentRoomCode = code;
      const roomCodeDisplay = id('room-code-display');
      if (roomCodeDisplay) roomCodeDisplay.textContent = code;
      id('room-options')?.classList.add('hidden');
      id('room-waiting')?.classList.remove('hidden');
      playSound('buttonClick');

      multiplayerService.startLobbyListener(roomRef, {
        onRoomReady: (room) => onStartMultiplayerGame(roomRef.id, hostSide, room.timeControl || '5m')
      });
    } catch (err) {
      console.error('[mp] failed creating room:', err);
      alert('Failed to create room. Please try again.');
    }
  });

  on('join-room-btn', 'click', async () => {
    const db = getDb();
    if (!state.currentUser || !db) {
      alert('Please sign in first to play multiplayer.');
      return;
    }
    if (!state.multiplayerSide) {
      pulseSidePickerHint();
      return;
    }
    const codeInput = id('room-code-input');
    const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
    if (code.length < 4) {
      if (codeInput) codeInput.style.borderColor = 'var(--red, #e94560)';
      return;
    }
    if (codeInput) codeInput.style.borderColor = '';
    playSound('buttonClick');

    try {
      const wantedSide = sideToString(state.multiplayerSide);
      const snap = await db.collection('rooms').where('roomCode', '==', code).limit(1).get();
      if (snap.empty) {
        alert('Room not found or already started.');
        return;
      }
      const roomDoc = snap.docs[0];
      const room = roomDoc.data();
      if (room.status !== 'waiting' || room.guestUid) {
        alert('Room not available to join anymore.');
        return;
      }
      if (room.hostUid === state.currentUser.uid) {
        alert('You cannot join your own room from this account.');
        return;
      }
      if (room.guestSide !== wantedSide) {
        alert(`Host reserved ${room.hostSide.toUpperCase()}. Please pick ${room.guestSide.toUpperCase()} to join.`);
        return;
      }
      await db.collection('rooms').doc(roomDoc.id).set({
        guestUid: state.currentUser.uid,
        guestUsername: state.userStats?.username || state.currentUser.displayName || 'Player',
        status: 'playing',
        updatedAt: firebaseApi.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      state.currentRoomId = roomDoc.id;
      state.currentRoomCode = code;
      onStartMultiplayerGame(roomDoc.id, wantedSide, room.timeControl || '5m');
    } catch (err) {
      console.error('[mp] failed joining room:', err);
      alert('Failed to join room. Check rules and try again.');
    }
  });

  on('copy-code-btn', 'click', () => {
    const codeDisplay = id('room-code-display');
    const code = codeDisplay ? codeDisplay.textContent : '';
    navigator.clipboard.writeText(code).then(() => {
      const btn = id('copy-code-btn');
      if (btn) {
        btn.textContent = '✅ Copied';
        setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
      }
    });
  });

  on('cancel-room-btn', 'click', async () => {
    const db = getDb();
    try {
      if (db && state.currentRoomId) {
        const roomSnap = await db.collection('rooms').doc(state.currentRoomId).get();
        if (roomSnap.exists) {
          const room = roomSnap.data();
          if (room.hostUid === state.currentUser?.uid && room.status === 'waiting') {
            await db.collection('rooms').doc(state.currentRoomId).delete();
          }
        }
      }
    } catch (err) {
      console.error('[mp] failed cancelling room:', err);
    }
    multiplayerService?.stopLobbyListener?.();
    state.currentRoomId = null;
    state.currentRoomCode = null;
    resetMultiplayerUI();
    playSound('buttonClick');
  });
}
