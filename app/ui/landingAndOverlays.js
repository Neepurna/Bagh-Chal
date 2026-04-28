// Landing screen + header buttons + tutorial / about / coach overlays +
// footer links + lobby panel buttons. Pure event-binding, no game logic.

import { playSound } from '../audio/audioSystem.js';
import { id, on, qsa, showOverlay, hideOverlay } from './dom.js';
import { state } from '../state/store.js';

let openPlayerSelect = () => {};
let triggerShowPlayerSelect = () => {};
let setHomeUXByAuthState = () => {};

export function configureLandingAndOverlays({
  openPlayerSelectOverlay,
  showPlayerSelect,
  setHomeUXByAuthState: setHome
}) {
  openPlayerSelect = openPlayerSelectOverlay;
  triggerShowPlayerSelect = showPlayerSelect;
  setHomeUXByAuthState = setHome;
}

export function initLandingAndOverlays() {
  // Welcome / lobby start buttons
  on('welcome-start-btn', 'click', () => { openPlayerSelect('ai'); playSound('buttonClick'); });
  on('welcome-start-btn', 'mouseenter', () => playSound('hover'));

  on('logged-out-start-btn', 'click', () => { openPlayerSelect('ai'); playSound('buttonClick'); });

  on('logged-out-tutorial-btn', 'click', () => { showOverlay('tutorial-overlay'); playSound('buttonClick'); });
  on('logged-out-about-btn', 'click', () => { showOverlay('about-overlay'); playSound('buttonClick'); });

  // Landing page (logged-out hero)
  on('landing-guest-btn', 'click', () => {
    state.guestModeActive = true;
    setHomeUXByAuthState();
    triggerShowPlayerSelect();
    playSound('buttonClick');
  });
  on('landing-about-btn', 'click', () => { showOverlay('about-overlay'); playSound('buttonClick'); });
  on('landing-history-btn', 'click', () => { showOverlay('tutorial-overlay'); playSound('buttonClick'); });
  on('landing-terms-btn', 'click', () => alert('Terms of Use and Privacy Policy content is coming soon.'));

  // Game-area button: play again / exit
  on('play-again-btn', 'click', triggerShowPlayerSelect);

  // Tutorial / about / coach overlays
  on('tutorial-close', 'click', () => hideOverlay('tutorial-overlay'));
  on('tutorial-start', 'click', () => { hideOverlay('tutorial-overlay'); openPlayerSelect('ai'); });

  on('about-close', 'click', () => hideOverlay('about-overlay'));
  on('about-start', 'click', () => { hideOverlay('about-overlay'); openPlayerSelect('ai'); });

  on('coach-coming-soon-close', 'click', () => hideOverlay('coach-coming-soon-overlay'));

  on('tutorial-btn', 'click', () => { showOverlay('coach-coming-soon-overlay'); playSound('buttonClick'); });
  on('tutorial-btn', 'mouseenter', () => playSound('hover'));

  on('footer-tutorial', 'click', () => { showOverlay('tutorial-overlay'); playSound('buttonClick'); });
  on('footer-tutorial', 'mouseenter', () => playSound('hover'));

  on('footer-settings', 'click', () => showOverlay('settings-overlay'));

  // About buttons (multiple instances — header and footer)
  qsa('#about-btn, #footer-about').forEach((btn) => {
    btn.addEventListener('click', () => { showOverlay('about-overlay'); playSound('buttonClick'); });
    btn.addEventListener('mouseenter', () => playSound('hover'));
  });

  // Lobby (chess.com style menu)
  on('lobby-play-online-btn', 'click', () => { openPlayerSelect('ai'); playSound('buttonClick'); });
  on('lobby-play-online-btn', 'mouseenter', () => playSound('hover'));

  on('lobby-friend-btn', 'click', () => {
    if (!state.currentUser) {
      showOverlay('signup-overlay');
      return;
    }
    showOverlay('friends-overlay');
    playSound('buttonClick');
  });
  on('lobby-friend-btn', 'mouseenter', () => playSound('hover'));

  on('lobby-tournament-btn', 'click', () => { openPlayerSelect('tournament'); playSound('buttonClick'); });
  on('lobby-tournament-btn', 'mouseenter', () => playSound('hover'));

  on('lobby-history-link', 'click', (e) => { e.preventDefault(); playSound('buttonClick'); });
  on('lobby-leaderboard-link', 'click', (e) => { e.preventDefault(); playSound('buttonClick'); });

  // Sign-up overlay close
  on('signup-close', 'click', () => hideOverlay('signup-overlay'));
}
