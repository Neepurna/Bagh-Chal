// Player-select overlay: AI vs Tournament tabs, side picker, difficulty,
// time control. Handles starting a single-player game when a side is chosen.

import { playSound } from '../audio/audioSystem.js';
import { PIECE_TYPES } from '../config/gameConfig.js';
import { id, on, qsa, setHidden, showOverlay, hideOverlay } from './dom.js';
import { state } from '../state/store.js';

let onStartGameCallback = null;
let resetMultiplayerUICallback = () => {};
let highlightMPSideCallback = () => {};

export function configurePlayerSelect({ onStartGame, resetMultiplayerUI, highlightMPSide }) {
  if (typeof onStartGame === 'function') onStartGameCallback = onStartGame;
  if (typeof resetMultiplayerUI === 'function') resetMultiplayerUICallback = resetMultiplayerUI;
  if (typeof highlightMPSide === 'function') highlightMPSideCallback = highlightMPSide;
}

export function configurePlayerSelectOverlay(view = 'ai') {
  const title = id('player-select-title');
  const modeTabs = id('player-select-mode-tabs');
  const aiTab = id('mode-tab-ai');
  const tournamentTab = id('mode-tab-player');
  const aiContent = id('ai-tab-content');
  const multiplayerSection = id('multiplayer-section');

  if (view === 'tournament') {
    state.gameMode = 'multiplayer';
    if (title) { title.hidden = false; title.textContent = 'Tournaments'; }
    setHidden('player-select-mode-tabs', true);
    if (aiTab) { aiTab.hidden = true; aiTab.classList.remove('active'); }
    if (tournamentTab) { tournamentTab.hidden = false; tournamentTab.classList.add('active'); }
    if (aiContent) aiContent.classList.add('hidden');
    if (multiplayerSection) multiplayerSection.classList.remove('hidden');
    return;
  }

  state.gameMode = 'ai';
  if (title) { title.hidden = false; title.textContent = 'Play Bot'; }
  setHidden('player-select-mode-tabs', true);
  if (aiTab) { aiTab.hidden = false; aiTab.classList.add('active'); }
  if (tournamentTab) { tournamentTab.hidden = true; tournamentTab.classList.remove('active'); }
  if (aiContent) aiContent.classList.remove('hidden');
  if (multiplayerSection) multiplayerSection.classList.add('hidden');
  resetMultiplayerUICallback();
  // Suppress unused parameter lint: modeTabs reference is for clarity.
  void modeTabs;
}

export function openPlayerSelectOverlay(view = 'ai') {
  configurePlayerSelectOverlay(view);
  showOverlay('player-select-overlay');
}

export function initPlayerSelectUI() {
  // Side selection buttons
  on('select-goat', 'click', () => onSideClick(PIECE_TYPES.GOAT));
  on('select-goat', 'mouseenter', () => playSound('hover'));
  on('select-tiger', 'click', () => onSideClick(PIECE_TYPES.TIGER));
  on('select-tiger', 'mouseenter', () => playSound('hover'));

  // Mode tabs
  on('mode-tab-ai', 'click', () => { configurePlayerSelectOverlay('ai'); playSound('buttonClick'); });
  on('mode-tab-player', 'click', () => { configurePlayerSelectOverlay('tournament'); playSound('buttonClick'); });

  // Player-select close button
  on('player-select-close', 'click', () => hideOverlay('player-select-overlay'));

  // Difficulty buttons
  qsa('.difficulty-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      qsa('.difficulty-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.aiDifficulty = btn.dataset.difficulty;
      playSound('buttonClick');
    });
    btn.addEventListener('mouseenter', () => playSound('hover'));
  });

  // Time-control buttons
  qsa('.time-control-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      qsa('.time-control-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.aiTimeControl = btn.dataset.timeControl;
      playSound('buttonClick');
    });
    btn.addEventListener('mouseenter', () => playSound('hover'));
  });
}

function onSideClick(side) {
  if (state.gameMode === 'multiplayer') {
    highlightMPSideCallback(side);
    playSound('buttonClick');
    return;
  }
  state.playerSide = side;
  state.gameStarted = true;
  state.isFirstAIMove = true;
  hideOverlay('player-select-overlay');
  if (onStartGameCallback) onStartGameCallback();
  playSound('buttonClick');
}
