// Match countdown clock.
//
// Each side receives the selected game time once. The active side's clock
// counts down continuously while it is their turn; the opponent's clock stays
// frozen. There is no increment and no per-turn reset.

import { PIECE_TYPES } from '../config/gameConfig.js';
import { state } from '../state/store.js';
import { id } from '../ui/dom.js';
import { persistActiveGame } from './gamePersistence.js';

let timerInterval = null;
let onTimeoutCallback = null;
let lastLocalPersistAt = 0;

const LOCAL_CLOCK_PERSIST_MS = 1000;

/** Wire the timeout handler. Called once during bootstrap. */
export function setOnTimeout(fn) {
  onTimeoutCallback = fn;
}

export function getAITurnSeconds() {
  if (state.aiTimeControl === '3m') return 180;
  if (state.aiTimeControl === '10m') return 600;
  if (state.aiTimeControl === 'infinite') return Infinity;
  return 180;
}

export function getMultiplayerTurnSeconds() {
  if (state.multiplayerTimeControl === '3m') return 180;
  if (state.multiplayerTimeControl === '5m') return 300;
  if (state.multiplayerTimeControl === '10m') return 600;
  return Infinity;
}

function matchSeconds() {
  return state.gameMode === 'multiplayer' ? getMultiplayerTurnSeconds() : getAITurnSeconds();
}

function sideKey(side) {
  return side === PIECE_TYPES.TIGER ? 'tiger' : 'goat';
}

function opponentSide(side) {
  return side === PIECE_TYPES.TIGER ? PIECE_TYPES.GOAT : PIECE_TYPES.TIGER;
}

function clearTimerInterval() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function ensureClockInitialized(force = false) {
  if (state.clockInitialized && !force) return;

  const seconds = matchSeconds();
  state.clockSeconds = {
    tiger: seconds,
    goat: seconds
  };
  state.clockInitialized = true;
  state.clockActiveSide = state.game.currentPlayer;
  state.clockLastTickAt = Date.now();
  lastLocalPersistAt = 0;
}

function getRemainingForSide(side) {
  const value = state.clockSeconds?.[sideKey(side)];
  if (value === null || value === undefined) return matchSeconds();
  return value;
}

function setRemainingForSide(side, seconds) {
  state.clockSeconds[sideKey(side)] = Number.isFinite(seconds)
    ? Math.max(0, seconds)
    : Infinity;
}

function settleActiveClock(now = Date.now()) {
  if (!state.clockInitialized) return getRemainingForSide(state.game.currentPlayer);

  const activeSide = state.clockActiveSide ?? state.game.currentPlayer;
  const previousTick = state.clockLastTickAt ?? now;
  const remaining = getRemainingForSide(activeSide);

  state.clockLastTickAt = now;

  if (!Number.isFinite(remaining)) return remaining;

  const elapsed = Math.max(0, (now - previousTick) / 1000);
  const nextRemaining = Math.max(0, remaining - elapsed);
  setRemainingForSide(activeSide, nextRemaining);
  return nextRemaining;
}

export function startTimer() {
  clearTimerInterval();
  ensureClockInitialized();

  if (!state.clockActiveSide) state.clockActiveSide = state.game.currentPlayer;
  if (!state.clockLastTickAt) state.clockLastTickAt = Date.now();

  tickClock();
  if (Number.isFinite(getRemainingForSide(state.clockActiveSide))) {
    timerInterval = setInterval(tickClock, 100);
  }
}

export function stopTimer() {
  if (state.clockInitialized) {
    settleActiveClock();
    updateTimerDisplay();
    persistClockLocally();
  }
  clearTimerInterval();
}

export function resetTimer() {
  ensureClockInitialized(true);
  updateTimerDisplay();
  persistClockLocally();
}

/** Called after a legal move changes `game.currentPlayer`. */
export function onMoveMade() {
  ensureClockInitialized();
  settleActiveClock();
  state.clockActiveSide = state.game.currentPlayer;
  state.clockLastTickAt = Date.now();
  updateTimerDisplay();
  persistClockLocally();
  startTimer();
}

/** Re-align a restored or remote room snapshot to the side currently to move. */
export function syncTimerToCurrentTurn() {
  if (!state.clockInitialized) return;
  clearTimerInterval();
  state.clockActiveSide = state.game.currentPlayer;
  if (!state.clockLastTickAt) state.clockLastTickAt = Date.now();
  updateTimerDisplay();
  startTimer();
}

function tickClock() {
  if (!state.gameStarted || state.game.gameOver) {
    clearTimerInterval();
    updateTimerDisplay();
    return;
  }

  ensureClockInitialized();
  const remaining = settleActiveClock();
  updateTimerDisplay();
  persistClockLocallyThrottled();

  if (Number.isFinite(remaining) && remaining <= 0) {
    clearTimerInterval();
    setRemainingForSide(state.clockActiveSide, 0);
    updateTimerDisplay();
    persistClockLocally();
    if (onTimeoutCallback) onTimeoutCallback();
  }
}

function persistClockLocallyThrottled() {
  const now = Date.now();
  if (now - lastLocalPersistAt < LOCAL_CLOCK_PERSIST_MS) return;
  lastLocalPersistAt = now;
  persistClockLocally();
}

function persistClockLocally() {
  if (!state.gameStarted || state.gameMode === 'sandbox') return;
  persistActiveGame({ syncRemote: false });
}

function updateTimerDisplay() {
  const timerText = id('timer-text');
  const playerClock = id('play-player-clock');
  const opponentClock = id('play-opponent-clock');

  const playerSide = state.playerSide ?? PIECE_TYPES.GOAT;
  const otherSide = opponentSide(playerSide);
  const activeSide = state.clockActiveSide ?? state.game.currentPlayer;

  const activeLabel = formatClock(getRemainingForSide(activeSide));
  const playerLabel = formatClock(getRemainingForSide(playerSide));
  const opponentLabel = formatClock(getRemainingForSide(otherSide));

  setTimerText(timerText, activeLabel);
  setTimerText(playerClock, playerLabel);
  setTimerText(opponentClock, opponentLabel);

  applyClockUrgency(timerText, getRemainingForSide(activeSide));
  applyClockUrgency(playerClock, getRemainingForSide(playerSide));
  applyClockUrgency(opponentClock, getRemainingForSide(otherSide));
}

function formatClock(value) {
  if (!Number.isFinite(value)) return '∞';

  const totalSec = Math.max(0, Math.ceil(value));
  const mins = Math.floor(totalSec / 60);
  const secs = String(totalSec % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function applyClockUrgency(el, value) {
  el?.classList.remove('warning', 'danger');
  if (!Number.isFinite(value)) return;
  if (value <= 10) el?.classList.add('danger');
  else if (value <= 30) el?.classList.add('warning');
}

function setTimerText(el, value) {
  if (el) el.textContent = value;
}
