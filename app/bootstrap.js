// Application bootstrap.
//
// Imports every feature module, configures cross-module dependencies (which
// replaces the implicit "everything is a global in main.js" pattern), wires
// DOM events, and kicks off the initial render. Order matters: the renderer
// must exist before the controller schedules a redraw, etc.

import { initAudioSystem, playSound } from './audio/audioSystem.js';
import { initializeAuth } from './auth/authService.js';
import { buildInitialRoomState, createMultiplayerService } from './multiplayer/multiplayerService.js';
import { setSentryUser } from './monitoring/sentry.js';
import { createSocialService } from './social/socialService.js';

import { state } from './state/store.js';

// Render
import { initBoardRenderer } from './render/boardRenderer.js';
import { initUiBindings } from './render/uiBindings.js';

// Game
import {
  attachCanvasListener,
  clearSandboxBoard,
  configureGameController,
  endGame,
  exitToHome,
  handleTimeOut,
  initGame,
  resignCurrentGame,
  resetCurrentGame,
  setSandboxTool,
  showPlayerSelect,
  resumePersistedGame,
  startAdventureGame,
  startSandboxGame,
  startMultiplayerGame,
  checkWin
} from './game/gameController.js';
import { setOnTimeout } from './game/timerService.js';
import { prevMove, nextMove, undoLastTurn } from './game/historyService.js';
import { restorePersistedGame } from './game/gamePersistence.js';
import {
  getLeaderboardScore,
  loadSupabasePlayerProfile,
  syncPlayerProfile
} from './game/ratingService.js';

// Multiplayer
import {
  configureMultiplayerBridge,
  finalizeMultiplayerRoom,
  isApplyingRoomSnapshot,
  stopRoomSyncListeners,
  subscribeToRoom,
  syncMultiplayerState
} from './multiplayer/multiplayerBridge.js';

// AI
import { configureAIController } from './ai/aiController.js';
import { clearPendingAITimeouts } from './ai/aiController.js';

// UI
import { id, on, hideOverlay } from './ui/dom.js';
import {
  configureMultiplayerLobby,
  highlightMPSide,
  initMultiplayerLobbyUI,
  resetMultiplayerUI
} from './ui/multiplayerLobby.js';
import {
  configurePlayerSelect,
  initPlayerSelectUI,
  openPlayerSelectOverlay,
  configurePlayerSelectOverlay
} from './ui/playerSelect.js';
import {
  configureProfileMenu,
  initProfileMenu,
  setHomeUXByAuthState,
  showUsernameSetup,
  updateStatsDisplay,
  updateUIForSignedInUser,
  updateUIForSignedOutUser
} from './ui/profileMenu.js';
import {
  configureSocialUI,
  initSocialUI,
  startSocialListeners,
  stopSocialListeners
} from './ui/socialUI.js';
import {
  configureLandingAndOverlays,
  initLandingAndOverlays
} from './ui/landingAndOverlays.js';
import { initLeaderboardUI } from './ui/leaderboardUI.js';

let auth = null;
let socialService = null;
let multiplayerService = null;

export function bootstrap() {
  initAudioSystem();
  initBoardRenderer();
  initUiBindings();

  socialService = createSocialService({
    getContext: () => ({ currentUser: state.currentUser, userStats: state.userStats })
  });
  multiplayerService = createMultiplayerService({
    getContext: () => ({ currentUser: state.currentUser, userStats: state.userStats })
  });

  configureMultiplayerBridge({
    service: multiplayerService,
    onRoomFinished: (room) => {
      if (!state.game.gameOver) {
        const msg = room.winnerMessage
          || (room.winner === 'tiger' ? 'Tiger won the match.' : 'Goat won the match.');
        endGame(msg, room.winner);
      }
    }
  });

  configureAIController({
    checkWin,
    syncMultiplayer: () => syncMultiplayerState()
  });

  configureGameController({
    syncMultiplayerState,
    finalizeMultiplayerRoom,
    isApplyingRoomSnapshot,
    stopRoomSyncListeners,
    resetMultiplayerUI,
    setHomeUXByAuthState,
    openPlayerSelectOverlay,
    updateUserStats: (won, side) => updateUserStats(won, side),
    configurePlayerSelectOverlay
  });

  // Wire start-multiplayer-game so the lobby + social UI can call it without
  // a circular import.
  const startMultiplayer = (roomId, side, timeControl) =>
    startMultiplayerGame(roomId, side, timeControl, { onSubscribe: subscribeToRoom });

  configurePlayerSelect({
    onStartGame: () => initGame(),
    resetMultiplayerUI,
    highlightMPSide
  });

  configureMultiplayerLobby({
    service: multiplayerService,
    buildInitialRoomState,
    startMultiplayerGame: startMultiplayer
  });

  configureSocialUI({
    service: socialService,
    startMultiplayerGame: startMultiplayer,
    buildInitialRoomState
  });

  configureProfileMenu({
    getAuth: () => auth,
    beforeSignOut: async () => {
      // Tear down everything game-related before sign-out completes.
      stopRoomSyncListeners();
      state.gameStarted = false;
      state.gameMode = 'ai';
      state.currentRoomId = null;
      state.currentRoomCode = null;
      state.pendingChallengeId = null;
      resetMultiplayerUI();
      hideOverlay('winner-overlay');
      hideOverlay('player-select-overlay');
      hideOverlay('friends-overlay');
      hideOverlay('notif-overlay');
      hideOverlay('challenge-sent-overlay');
      hideOverlay('signup-overlay');
      id('profile-dropdown')?.classList.remove('show');
    }
  });

  configureLandingAndOverlays({
    openPlayerSelectOverlay,
    showPlayerSelect,
    setHomeUXByAuthState,
    startGuestGame: () => {
      state.gameMode = 'ai';
      state.matchRatingType = 'unrated';
      state.adventureModeActive = false;
      state.adventureBotId = null;
      state.aiDifficulty = 'easy';
      state.aiTimeControl = '3m';
      state.gameStarted = true;
      state.isFirstAIMove = true;
      initGame();
    },
    startSandboxGame,
    startAdventureGame
  });

  setOnTimeout(() => handleTimeOut());

  // ── Auth ───────────────────────────────────────────────────────
  ({ auth } = initializeAuth({
    onUsernameSetupRequired: showUsernameSetup,
    onSignedIn: async ({ user, userStats: nextStats, auth: nextAuth, redirectAction, needsUsernameSetup }) => {
      state.currentUser = user;
      state.userStats = nextStats;
      auth = nextAuth;
      await hydrateSupabaseProfile(user);
      setSentryUser(user);
      state.pendingPostSignInAction = needsUsernameSetup ? redirectAction : null;
      hideAuthLoadingScreen(); // reveal app only after auth is confirmed
      updateUIForSignedInUser();
      startSocialListeners();
      if (redirectAction && !needsUsernameSetup) runPostSignInAction(redirectAction);
    },
    onSignedOut: ({ auth: nextAuth }) => {
      state.currentUser = null;
      auth = nextAuth;
      setSentryUser(null);
      hideAuthLoadingScreen(); // reveal landing page only after auth confirmed absent
      updateUIForSignedOutUser();
      stopSocialListeners();
    }
  }));

  // ── DOM event wiring (one-shot) ────────────────────────────────
  attachCanvasListener();
  initPlayerSelectUI();
  initMultiplayerLobbyUI();
  initSocialUI();
  initProfileMenu();
  initLandingAndOverlays();
  initLeaderboardUI();

  // Game-area buttons that only the bootstrap can wire (they need exitToHome
  // and the move history controls together).
  on('exit-btn', 'click', exitToHome);
  on('header-home-btn', 'click', exitToHome);
  on('prev-move-btn', 'click', prevMove);
  on('next-move-btn', 'click', nextMove);
  on('undo-game-btn', 'click', () => {
    clearPendingAITimeouts();
    if (undoLastTurn()) playSound('buttonClick');
  });
  on('reset-game-btn', 'click', resetCurrentGame);
  on('restart-left-btn', 'click', resetCurrentGame);
  on('resign-game-btn', 'click', () => {
    if (window.confirm('Are you sure you want to resign this game?')) resignCurrentGame();
  });
  on('resign-left-btn', 'click', () => {
    if (window.confirm('Are you sure you want to resign this game?')) resignCurrentGame();
  });
  on('mobile-undo-btn', 'click', () => {
    clearPendingAITimeouts();
    if (undoLastTurn()) playSound('buttonClick');
  });
  on('mobile-restart-btn', 'click', resetCurrentGame);
  on('mobile-resign-btn', 'click', () => {
    if (window.confirm('Are you sure you want to resign this game?')) resignCurrentGame();
  });
  on('mobile-profile-btn', 'click', () => { id('profile-btn')?.click(); });
  on('sandbox-clear-btn', 'click', clearSandboxBoard);
  on('sandbox-exit-btn', 'click', exitToHome);
  on('sandbox-tool-tiger', 'click', () => setSandboxTool('tiger'));
  on('sandbox-tool-goat', 'click', () => setSandboxTool('goat'));
  on('sandbox-tool-erase', 'click', () => setSandboxTool('erase'));
  on('sandbox-tool-cancel', 'click', () => setSandboxTool(null));

  // ── Initial render ─────────────────────────────────────────────
  if (restorePersistedGame()) {
    resumePersistedGame();
  } else {
    initGame(); // populates the homepage with decorative goats
  }

  // DO NOT call updateUIForSignedOutUser() here.
  // The auth-loading-screen overlay covers the page while Supabase resolves
  // the persisted auth state from localStorage. Once onAuthStateChanged fires
  // (either onSignedIn or onSignedOut), hideAuthLoadingScreen() is called and
  // the correct UI is revealed — no flash of the landing page for logged-in
  // users, no flash of the app-shell for logged-out users.
  //
  // Safety net: if Supabase takes longer than 5 s to respond (e.g. SDK blocked
  // by an ad-blocker), we fall through to the signed-out state so the user is
  // never stuck on the loading screen.
  const _authFallbackTimer = setTimeout(() => {
    if (!state.currentUser) {
      hideAuthLoadingScreen();
      updateUIForSignedOutUser();
    }
  }, 5000);
  // Store on window so the auth callbacks can cancel it.
  window.__authFallbackTimer = _authFallbackTimer;
}

// ── Helpers used by bootstrap-internal hooks ─────────────────────

/**
 * Fades out and removes the auth-loading-screen overlay.
 * Safe to call multiple times — the element is removed after the first call.
 * Also clears the 5-second safety-net fallback timer.
 */
function hideAuthLoadingScreen() {
  // Cancel the safety-net timer so it doesn't fire after auth already resolved.
  if (window.__authFallbackTimer) {
    clearTimeout(window.__authFallbackTimer);
    window.__authFallbackTimer = null;
  }

  const screen = document.getElementById('auth-loading-screen');
  if (!screen) return; // already removed

  screen.classList.add('fade-out');
  // Remove from DOM after the CSS transition finishes (matches transition: 0.35s)
  setTimeout(() => screen.remove(), 370);
}

function runPostSignInAction(action) {
  if (action === 'open-player-select') {
    window.requestAnimationFrame(() => showPlayerSelect());
  }
}

async function updateUserStats(won, side) {
  if (!state.currentUser) return;
  try {
    if (won) {
      if (side === 'tiger') {
        state.userStats.tigerWins++;
      } else {
        state.userStats.goatWins++;
      }
    }
    state.userStats.gamesPlayed++;
    await syncPlayerProfile();
    updateStatsDisplay();
  } catch (err) {
    console.error('Error updating stats:', err);
  }
}

async function hydrateSupabaseProfile(user) {
  const profile = await loadSupabasePlayerProfile(user);
  if (profile) {
    state.userStats = {
      ...state.userStats,
      username: profile.username || profile.display_name || state.userStats.username || 'Player',
      gamesPlayed: profile.games_played || 0,
      tigerWins: profile.tiger_wins || 0,
      goatWins: profile.goat_wins || 0,
      rating: profile.rating ?? 500,
      ratedWins: profile.rated_wins || 0,
      ratedLosses: profile.rated_losses || 0,
      adventureLevel: profile.adventure_level || 0,
      adventureCompleted: profile.adventure_completed || 0
    };
    return;
  }

  state.userStats.leaderboardScore = getLeaderboardScore();
  await syncPlayerProfile();
}
