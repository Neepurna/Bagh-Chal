// Multiplayer lobby: create-room, join-room, copy-code, cancel-room buttons,
// side-pick highlighting, and the bookkeeping needed to reset the lobby UI.

import { playSound } from '../audio/audioSystem.js';
import { PIECE_TYPES } from '../config/gameConfig.js';
import { id, on, qs, qsa } from './dom.js';
import { state } from '../state/store.js';

let multiplayerService = null;
let onStartMultiplayerGame = () => {};
let buildInitialRoomState = () => ({});

export function configureMultiplayerLobby({
  service,
  buildInitialRoomState: initBuilder,
  startMultiplayerGame
}) {
  multiplayerService = service;
  buildInitialRoomState = initBuilder;
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
    if (!state.currentUser) {
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
      const initial = buildInitialRoomState();
      const room = await multiplayerService.createRoom({
        roomCode: code,
        guestSide,
        hostSide,
        timeControl: '5m',
        initial
      });

      state.currentRoomId = room.id;
      state.currentRoomCode = code;
      const roomCodeDisplay = id('room-code-display');
      if (roomCodeDisplay) roomCodeDisplay.textContent = code;
      id('room-options')?.classList.add('hidden');
      id('room-waiting')?.classList.remove('hidden');
      playSound('buttonClick');

      multiplayerService.startLobbyListener(room.id, {
        onRoomReady: (nextRoom) => onStartMultiplayerGame(room.id, hostSide, nextRoom.time_control || '5m')
      });
    } catch (err) {
      console.error('[mp] failed creating room:', err);
      alert('Failed to create room. Please try again.');
    }
  });

  on('join-room-btn', 'click', async () => {
    if (!state.currentUser) {
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
      const result = await multiplayerService.joinRoomByCode({ roomCode: code, wantedSide });
      if (result.status === 'not_found') {
        alert('Room not found or already started.');
        return;
      }
      if (result.status === 'self') {
        alert('You cannot join your own room from this account.');
        return;
      }
      if (result.status === 'wrong_side') {
        alert(`Host reserved ${result.room.host_side.toUpperCase()}. Please pick ${result.room.guest_side.toUpperCase()} to join.`);
        return;
      }
      const room = result.room;
      state.currentRoomId = room.id;
      state.currentRoomCode = code;
      onStartMultiplayerGame(room.id, wantedSide, room.time_control || '5m');
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
    try {
      if (state.currentRoomId) {
        await multiplayerService.cancelWaitingRoom(state.currentRoomId);
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
