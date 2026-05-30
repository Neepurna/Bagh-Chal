// Landing screen + header buttons + tutorial / about / coach overlays +
// footer links + lobby panel buttons. Pure event-binding, no game logic.

import { playSound } from '../audio/audioSystem.js';
import { id, on, qsa, showOverlay, hideOverlay } from './dom.js';
import { PIECE_TYPES } from '../config/gameConfig.js';
import { state } from '../state/store.js';

let openPlayerSelect = () => {};
let triggerShowPlayerSelect = () => {};
let setHomeUXByAuthState = () => {};
let startGuestGame = () => {};
let startSandboxSession = () => {};
let startAdventureSession = () => {};
let pendingGuestSide = null;

export function configureLandingAndOverlays({
  openPlayerSelectOverlay,
  showPlayerSelect,
  setHomeUXByAuthState: setHome,
  startGuestGame: startGuest,
  startSandboxGame,
  startAdventureGame
}) {
  openPlayerSelect = openPlayerSelectOverlay;
  triggerShowPlayerSelect = showPlayerSelect;
  setHomeUXByAuthState = setHome;
  if (typeof startGuest === 'function') startGuestGame = startGuest;
  if (typeof startSandboxGame === 'function') startSandboxSession = startSandboxGame;
  if (typeof startAdventureGame === 'function') startAdventureSession = startAdventureGame;
}

export function initLandingAndOverlays() {
  // Welcome / lobby start buttons
  on('welcome-start-btn', 'click', () => { openPlayerSelect('ai'); playSound('buttonClick'); });

  on('logged-out-start-btn', 'click', () => { openPlayerSelect('ai'); playSound('buttonClick'); });
  on('logged-out-tutorial-btn', 'click', () => { showOverlay('tutorial-overlay'); playSound('buttonClick'); });
  on('logged-out-about-btn', 'click', () => { showOverlay('about-overlay'); playSound('buttonClick'); });

  // Landing page (logged-out hero)
  on('landing-guest-btn', 'click', () => {
    pendingGuestSide = null;
    state.playerSide = null;
    id('guest-start-confirm')?.setAttribute('disabled', 'disabled');
    id('guest-select-goat')?.classList.remove('active');
    id('guest-select-tiger')?.classList.remove('active');
    showOverlay('guest-mode-overlay');
    playSound('buttonClick');
  });
  on('landing-about-btn', 'click', () => { showOverlay('about-overlay'); playSound('buttonClick'); });
  on('landing-history-btn', 'click', () => { showOverlay('history-overlay'); playSound('buttonClick'); });
  on('landing-terms-btn', 'click', () => { showOverlay('terms-overlay'); playSound('buttonClick'); });

  // Game-area button: play again / exit
  on('play-again-btn', 'click', () => {
    if (state.gameMode === 'challenge') {
      hideOverlay('winner-overlay');
      openPlayerSelect('tournament');
      playSound('buttonClick');
      return;
    }
    if (state.guestModeActive && !state.currentUser) {
      hideOverlay('winner-overlay');
      state.gameMode = 'ai';
      state.matchRatingType = 'unrated';
      state.adventureModeActive = false;
      state.adventureBotId = null;
      state.aiDifficulty = 'hard';
      state.aiTimeControl = '3m';
      state.gameStarted = true;
      state.isFirstAIMove = true;
      startGuestGame();
      playSound('buttonClick');
      return;
    }
    triggerShowPlayerSelect();
  });

  on('guest-mode-close', 'click', () => hideOverlay('guest-mode-overlay'));
  on('guest-select-goat', 'click', () => setGuestSide(PIECE_TYPES.GOAT));
  on('guest-select-tiger', 'click', () => setGuestSide(PIECE_TYPES.TIGER));
  on('guest-start-confirm', 'click', () => {
    if (!pendingGuestSide) return;
    state.playerSide = pendingGuestSide;
    state.guestModeActive = true;
    hideOverlay('guest-mode-overlay');
    setHomeUXByAuthState();
    startGuestGame();
    playSound('buttonClick');
  });

  // Tutorial / about overlays
  on('tutorial-close', 'click', () => hideOverlay('tutorial-overlay'));
  on('tutorial-start', 'click', () => { hideOverlay('tutorial-overlay'); openPlayerSelect('ai'); });

  on('about-close', 'click', () => hideOverlay('about-overlay'));
  on('about-start', 'click', () => { hideOverlay('about-overlay'); openPlayerSelect('ai'); });
  on('history-close', 'click', () => hideOverlay('history-overlay'));
  on('terms-close', 'click', () => hideOverlay('terms-overlay'));

  on('coach-coming-soon-close', 'click', () => hideOverlay('coach-coming-soon-overlay'));

  on('tutorial-btn', 'click', () => { startSandboxSession(); playSound('buttonClick'); });
  on('profile-open-board-btn', 'click', () => {
    id('profile-dropdown')?.classList.remove('show');
    startSandboxSession();
    playSound('buttonClick');
  });

  on('footer-tutorial', 'click', () => { showOverlay('tutorial-overlay'); playSound('buttonClick'); });

  on('footer-settings', 'click', () => showOverlay('settings-overlay'));

  // About buttons (multiple instances — header and footer)
  qsa('#footer-about').forEach((btn) => {
    btn.addEventListener('click', () => { showOverlay('about-overlay'); playSound('buttonClick'); });
  });

  // Lobby (chess.com style menu)
  on('lobby-friend-btn', 'click', () => {
    if (!state.currentUser) {
      showOverlay('signup-overlay');
      return;
    }
    showOverlay('friends-overlay');
    playSound('buttonClick');
  });

  on('lobby-tournament-btn', 'click', () => { openPlayerSelect('tournament'); playSound('buttonClick'); });
  on('lobby-adventure-btn', 'click', () => { openPlayerSelect('adventure'); playSound('buttonClick'); });

  // Sign-up overlay close
  on('signup-close', 'click', () => hideOverlay('signup-overlay'));
}

export function launchAdventureBot(botId) {
  startAdventureSession(botId);
}

function setGuestSide(side) {
  pendingGuestSide = side;
  id('guest-select-goat')?.classList.toggle('active', side === PIECE_TYPES.GOAT);
  id('guest-select-tiger')?.classList.toggle('active', side === PIECE_TYPES.TIGER);
  id('guest-start-confirm')?.removeAttribute('disabled');
  playSound('buttonClick');
}
