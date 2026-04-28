// Per-turn countdown timer.
//
// Externally exposes start/stop/reset and also calls back when time runs out.
// The countdown loop is driven by setInterval at 100ms — the same cadence as
// the original code, since the UI shows tenth-of-second precision near zero.

import { id } from '../ui/dom.js';
import { state } from '../state/store.js';

let timerInterval = null;
let currentTime = 180;
let onTimeoutCallback = null;

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

function turnSeconds() {
  return state.gameMode === 'multiplayer' ? getMultiplayerTurnSeconds() : getAITurnSeconds();
}

export function startTimer() {
  stopTimer();
  currentTime = turnSeconds();
  updateTimerDisplay();
  if (!Number.isFinite(currentTime)) return;

  timerInterval = setInterval(() => {
    currentTime -= 0.1;
    if (currentTime <= 0) {
      currentTime = 0;
      stopTimer();
      if (onTimeoutCallback) onTimeoutCallback();
    }
    updateTimerDisplay();
  }, 100);
}

export function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

export function resetTimer() {
  currentTime = turnSeconds();
  updateTimerDisplay();
}

/** Convenience: reset + start, called by the game controller after every move. */
export function onMoveMade() {
  resetTimer();
  startTimer();
}

function updateTimerDisplay() {
  const el = id('timer-text');
  if (!el) return;

  if (!Number.isFinite(currentTime)) {
    el.textContent = '∞';
    el.classList.remove('warning', 'danger');
    return;
  }

  const totalSec = Math.max(0, Math.ceil(currentTime));
  const mins = Math.floor(totalSec / 60);
  const secs = String(totalSec % 60).padStart(2, '0');
  el.textContent = `${mins}:${secs}`;

  el.classList.remove('warning', 'danger');
  if (currentTime <= 10) el.classList.add('danger');
  else if (currentTime <= 30) el.classList.add('warning');
}
