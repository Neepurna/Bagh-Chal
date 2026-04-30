// Profile dropdown + sign-in/out + username setup form + stats display +
// home-screen UX toggling for signed-in vs. signed-out vs. guest modes.

import { saveUsername, signInWithGoogle, signOut } from '../auth/authService.js';
import { id, on, hideOverlay, setDisplay, showOverlay } from './dom.js';
import { state } from '../state/store.js';
import { scheduleCanvasResize } from '../render/boardRenderer.js';
import { toggleMoveNavigation } from '../game/historyService.js';

let firebaseApi = null;
let getAuth = () => null;
let getDb = () => null;
let beforeSignOutCallback = async () => {};

export function configureProfileMenu({
  firebase,
  getAuth: authGetter,
  getDb: dbGetter,
  beforeSignOut
}) {
  firebaseApi = firebase;
  getAuth = authGetter;
  getDb = dbGetter;
  if (typeof beforeSignOut === 'function') beforeSignOutCallback = beforeSignOut;
}

export function showUsernameSetup() { showOverlay('username-setup-overlay'); }
export function hideUsernameSetup() { hideOverlay('username-setup-overlay'); }

export function updateStatsDisplay() {
  const u = state.userStats;
  const games = id('stats-games');
  const tigerWins = id('stats-tiger-wins');
  const goatWins = id('stats-goat-wins');
  if (games) games.textContent = u.gamesPlayed ?? 0;
  if (tigerWins) tigerWins.textContent = u.tigerWins ?? 0;
  if (goatWins) goatWins.textContent = u.goatWins ?? 0;
}

export function setHomeUXByAuthState() {
  const shouldShowAppShell = Boolean(state.currentUser) || state.guestModeActive;
  const isGuestOnly = state.guestModeActive && !state.currentUser;

  const loggedOutLanding = id('logged-out-landing');
  const appShell = id('app-shell');
  if (loggedOutLanding) loggedOutLanding.hidden = shouldShowAppShell;
  if (appShell) appShell.hidden = !shouldShowAppShell;
  document.body.classList.toggle('landing-active', !shouldShowAppShell);
  setDisplay('header-nav', isGuestOnly ? 'none' : 'flex');

  const sidebarWelcome = id('welcome-screen');
  if (sidebarWelcome) sidebarWelcome.style.display = 'flex';

  const loggedOutSidebar = id('logged-out-sidebar-welcome');
  if (loggedOutSidebar) loggedOutSidebar.hidden = Boolean(state.currentUser) || isGuestOnly;
  const loggedInSidebar = id('logged-in-sidebar-welcome');
  if (loggedInSidebar) loggedInSidebar.hidden = !state.currentUser || isGuestOnly;

  id('gameStatePanel')?.classList.add('hidden');
  id('tigerPanel')?.classList.add('hidden');
  id('goatPanel')?.classList.add('hidden');
  id('sandbox-panel')?.classList.add('hidden');
  id('gameActionsPanel')?.classList.add('hidden');
  toggleMoveNavigation(false);

  if (shouldShowAppShell) scheduleCanvasResize();
}

export function updateUIForSignedInUser() {
  state.guestModeActive = false;
  setDisplay('sign-in-btn', 'none');
  setDisplay('profile-menu', 'block');
  setDisplay('notif-bell', 'flex');

  if (state.currentUser) {
    const profileImg = id('profile-img');
    const profileUsername = id('profile-username');
    if (profileImg) profileImg.src = state.currentUser.photoURL || 'https://via.placeholder.com/32';
    if (profileUsername) profileUsername.textContent = state.userStats.username || state.currentUser.displayName || 'Player';
  }

  setHomeUXByAuthState();
  updateStatsDisplay();
}

export function updateUIForSignedOutUser() {
  state.guestModeActive = false;
  setDisplay('sign-in-btn', 'block');
  setDisplay('profile-menu', 'none');
  setDisplay('notif-bell', 'none');
  setHomeUXByAuthState();
}

export function initProfileMenu() {
  on('sign-in-btn', 'click', () => showOverlay('signup-overlay'));

  const triggerGoogleSignIn = () => signInWithGoogle({
    auth: getAuth(),
    db: getDb(),
    firebase: firebaseApi,
    onUsernameSetupRequired: showUsernameSetup
  });

  on('google-signin-btn', 'click', triggerGoogleSignIn);
  on('landing-google-signin', 'click', triggerGoogleSignIn);

  on('sign-out-btn', 'click', () => signOut({
    auth: getAuth(),
    beforeSignOut: beforeSignOutCallback
  }));

  on('profile-btn', 'click', () => {
    id('profile-dropdown')?.classList.toggle('show');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const profileMenu = id('profile-menu');
    const dropdown = id('profile-dropdown');
    if (profileMenu && !profileMenu.contains(e.target)) {
      dropdown?.classList.remove('show');
    }
  });

  // Username setup form
  const form = id('username-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const usernameInput = id('new-username');
      const errEl = id('username-error');
      if (errEl) errEl.style.display = 'none';
      if (!usernameInput) return;

      const username = usernameInput.value.trim();
      if (username.length < 3) {
        if (errEl) {
          errEl.textContent = 'Username must be at least 3 characters.';
          errEl.style.display = 'block';
        }
        return;
      }

      saveUsername({
        currentUser: state.currentUser,
        db: getDb(),
        firebase: firebaseApi,
        username,
        onUsernameSaved: (cleanUsername) => {
          state.userStats.username = cleanUsername;
          hideUsernameSetup();
          updateUIForSignedInUser();
          // Bootstrap will re-attach listeners via the auth flow.
        },
        onUsernameError: (message) => {
          if (errEl) {
            errEl.textContent = message;
            errEl.style.display = 'block';
          }
        }
      });
    });
  }
}
