import { initAudioSystem, playSound } from './app/audio/audioSystem.js';
import { initializeAuth, saveUsername, signInWithGoogle, signOut } from './app/auth/authService.js';
import { AI_CONFIG, GRID_SIZE, PHASE, PIECE_TYPES, TIME_INCREMENT, TIME_PER_MOVE } from './app/config/gameConfig.js';
import { BOARD_POSITIONS, countTrappedPieces, getAdjacentPositions, getBoardHash, getValidMovesForBoard, getWinState, isDiagonalConnected } from './app/game/boardRules.js';
import { buildInitialRoomState, createMultiplayerService } from './app/multiplayer/multiplayerService.js';
import { createSocialService } from './app/social/socialService.js';

// Bagh Chal Game Logic

// ===== FIREBASE AUTHENTICATION =====
let auth, db;
let currentUser = null;
let userStats = { gamesPlayed: 0, tigerWins: 0, goatWins: 0 };

({ auth, db } = initializeAuth({
  firebase,
  onSignedIn: ({ user, userStats: nextUserStats, auth: nextAuth, db: nextDb }) => {
    currentUser = user;
    userStats = nextUserStats;
    auth = nextAuth;
    db = nextDb;
    updateUIForSignedInUser();
  },
  onSignedOut: ({ auth: nextAuth, db: nextDb }) => {
    currentUser = null;
    auth = nextAuth;
    db = nextDb;
    updateUIForSignedOutUser();
  }
}));

// ===== SOCIAL LISTENERS (start after login) =====
let pendingChallengeId = null;
const socialService = createSocialService({
  firebase,
  getContext: () => ({ currentUser, db, userStats })
});

function startSocialListeners() {
  socialService.startSocialListeners({
    onFriends: renderFriendsList,
    onNotifications: (items) => {
      renderNotifications(items);
      updateNotifBadge(items);
    },
    onChallengeAccepted: handleChallengeAccepted
  });
}

function stopSocialListeners() {
  socialService.stopSocialListeners();
}

// ===== SEARCH USER =====
async function searchUser(username) {
  const resultsEl = document.getElementById('search-results');
  resultsEl.innerHTML = '<p class="friends-empty">Searching…</p>';
  const result = await socialService.searchUser(username);

  if (result.status === 'empty') {
    resultsEl.innerHTML = '';
    return;
  }
  if (result.status === 'not_found') {
    resultsEl.innerHTML = '<p class="friends-empty">No user found with that username.</p>';
    return;
  }
  if (result.status === 'self') {
    resultsEl.innerHTML = '<p class="friends-empty">That\'s you! 😄</p>';
    return;
  }
  if (result.status === 'error' || result.status !== 'found') {
    resultsEl.innerHTML = '<p class="friends-empty">Search failed. Please try again.</p>';
    return;
  }

  let actionHtml = '';
  if (result.friendStatus === 'accepted') actionHtml = `<button class="fa-btn already">✓ Friends</button>`;
  else if (result.friendStatus === 'pending') actionHtml = `<button class="fa-btn pending">Pending…</button>`;
  else actionHtml = `<button class="fa-btn add" onclick="sendFriendRequest('${result.uid}','${result.data.displayUsername || result.data.username || 'Player'}')">+ Add Friend</button>`;

  resultsEl.innerHTML = `
    <div class="friend-row">
      <div class="friend-avatar">${result.data.photoURL ? `<img src="${result.data.photoURL}">` : '👤'}</div>
      <div class="friend-info">
        <div class="friend-name">${result.data.displayUsername || result.data.username || 'Player'}</div>
        <div class="friend-sub">@${result.data.username || 'user'}</div>
      </div>
      <div class="friend-actions">${actionHtml}</div>
    </div>`;
}

// ===== SEND FRIEND REQUEST =====
async function sendFriendRequest(toUid, toUsername) {
  await socialService.sendFriendRequest(toUid, toUsername);
  document.getElementById('friend-search-btn').click();
}

// ===== ACCEPT FRIEND REQUEST =====
async function acceptFriendRequest(fromUid, fromUsername, notifId) {
  try {
    await socialService.acceptFriendRequest(fromUid, fromUsername, notifId);
  } catch (error) {
    console.error('acceptFriendRequest error:', error);
    alert('Could not accept request. Please try again.');
  }
}

// ===== DECLINE FRIEND REQUEST =====
async function declineFriendRequest(fromUid, notifId) {
  await socialService.declineFriendRequest(notifId);
}

function renderFriendsList(friends) {
  const el = document.getElementById('friends-list');
  if (!friends.length) {
    el.innerHTML = '<p class="friends-empty">No friends yet — search for players to add!</p>';
    return;
  }
  el.innerHTML = friends.map(f => `
    <div class="friend-row">
      <div class="friend-avatar">👤</div>
      <div class="friend-info">
        <div class="friend-name">${f.username}</div>
        <div class="friend-sub">@${f.username}</div>
      </div>
      <div class="friend-actions">
        <button class="fa-btn challenge" onclick="openChallengeFlow('${f.uid}','${f.username}')">⚔️ Custom Challenge</button>
      </div>
    </div>`).join('');
}

// ===== CHALLENGE FLOW =====
let challengeTargetUid = null;
let challengeTargetName = null;
let challengeSide = null;
let challengeTime = '5m';

function openChallengeFlow(toUid, toUsername) {
  challengeTargetUid = toUid;
  challengeTargetName = toUsername;
  challengeSide = 'random';
  challengeTime = '5m';
  // Close friends overlay, show a mini modal inside winner-overlay reuse
  document.getElementById('friends-overlay').classList.remove('show');

  // Build a quick challenge side-picker overlay
  const overlay = document.getElementById('challenge-sent-overlay');
  document.getElementById('challenge-sent-text').textContent = `Challenge ${toUsername}`;
  document.getElementById('challenge-sent-sub').innerHTML = `
    <div style="margin:10px 0 4px;font-size:0.85rem;color:var(--text-secondary);">Choose side:</div>
    <div class="challenge-side-picker">
      <button class="csp-btn" id="csp-tiger" onclick="selectChallengeSide('tiger')">🐯 Tiger</button>
      <button class="csp-btn" id="csp-goat" onclick="selectChallengeSide('goat')">🐐 Goat</button>
      <button class="csp-btn active" id="csp-random" onclick="selectChallengeSide('random')">🎲 Random</button>
    </div>
    <div style="margin:8px 0 4px;font-size:0.85rem;color:var(--text-secondary);">Time control:</div>
    <div class="challenge-time-picker">
      <button class="csp-btn" id="ctime-3m" onclick="selectChallengeTime('3m')">3m</button>
      <button class="csp-btn active" id="ctime-5m" onclick="selectChallengeTime('5m')">5m</button>
      <button class="csp-btn" id="ctime-10m" onclick="selectChallengeTime('10m')">10m</button>
      <button class="csp-btn" id="ctime-infinite" onclick="selectChallengeTime('infinite')">∞</button>
    </div>
    <button class="room-btn create" style="margin-top:12px;max-width:100%;" onclick="sendChallenge()">Send Challenge ⚔️</button>
  `;
  // Hide the spinner until they send
  overlay.querySelector('.waiting-spinner').style.display = 'none';
  overlay.classList.add('show');
}

function selectChallengeSide(side) {
  challengeSide = side;
  document.getElementById('csp-tiger').classList.toggle('active', side === 'tiger');
  document.getElementById('csp-goat').classList.toggle('active', side === 'goat');
  document.getElementById('csp-random').classList.toggle('active', side === 'random');
}

function selectChallengeTime(time) {
  challengeTime = time;
  ['3m', '5m', '10m', 'infinite'].forEach(t => {
    const btn = document.getElementById(`ctime-${t}`);
    if (btn) btn.classList.toggle('active', t === time);
  });
}

async function sendChallenge() {
  const result = await socialService.sendChallenge({
    toUid: challengeTargetUid,
    selectedSide: challengeSide,
    challengeTime
  });
  if (!result) return;
  pendingChallengeId = result.challengeId;

  // Update overlay to show waiting
  const overlay = document.getElementById('challenge-sent-overlay');
  document.getElementById('challenge-sent-text').textContent = '⚔️ Challenge sent!';
  document.getElementById('challenge-sent-sub').innerHTML = `<strong>${challengeTargetName}</strong> plays as ${result.opponentSide} — you play as ${result.challengerSide} · ${challengeTime}`;
  overlay.querySelector('.waiting-spinner').style.display = '';
}

document.getElementById('cancel-challenge-btn').addEventListener('click', async () => {
  document.getElementById('challenge-sent-overlay').classList.remove('show');
  if (pendingChallengeId && challengeTargetUid) {
    await socialService.cancelPendingChallenge({ toUid: challengeTargetUid, pendingChallengeId });
    pendingChallengeId = null;
  }
});

function updateNotifBadge(items) {
  const badge = document.getElementById('notif-badge');
  const friendsBadge = document.getElementById('friend-req-badge');
  const reqCount = items.filter(n => n.type === 'friend_request').length;
  const challCount = items.filter(n => n.type === 'challenge').length;
  const actionableCount = reqCount + challCount;

  badge.textContent = actionableCount;
  badge.classList.toggle('hidden', actionableCount === 0);

  friendsBadge.textContent = reqCount;
  friendsBadge.classList.toggle('hidden', reqCount === 0);

  const reqTabBadge = document.getElementById('req-tab-badge');
  if (reqTabBadge) {
    reqTabBadge.textContent = reqCount;
    reqTabBadge.classList.toggle('hidden', reqCount === 0);
  }

  const challTabBadge = document.getElementById('chall-tab-badge');
  if (challTabBadge) {
    challTabBadge.textContent = challCount;
    challTabBadge.classList.toggle('hidden', challCount === 0);
  }
}

function renderNotifications(items) {
  const el = document.getElementById('notif-list');
  if (!items.length) { el.innerHTML = '<p class="friends-empty">No notifications</p>'; return; }

  el.innerHTML = items.map(n => {
    const time = n.createdAt ? timeAgo(n.createdAt.toDate()) : '';
    if (n.type === 'friend_request') {
      return `<div class="notif-row">
        <div class="notif-icon">👤</div>
        <div class="notif-body">
          <div class="notif-text"><strong>${n.fromUsername}</strong> sent you a friend request</div>
          <div class="notif-time">${time}</div>
          <div class="notif-actions">
            <button class="fa-btn accept" onclick="acceptFriendRequest('${n.from}','${n.fromUsername}','${n.id}')">Accept</button>
            <button class="fa-btn decline" onclick="declineFriendRequest('${n.from}','${n.id}')">Decline</button>
          </div>
        </div>
      </div>`;
    }
    if (n.type === 'friend_accepted') {
      return `<div class="notif-row">
        <div class="notif-icon">🤝</div>
        <div class="notif-body">
          <div class="notif-text"><strong>${n.fromUsername}</strong> accepted your friend request!</div>
          <div class="notif-time">${time}</div>
          <div class="notif-actions">
            <button class="fa-btn decline" onclick="dismissNotif('${n.id}')">Dismiss</button>
          </div>
        </div>
      </div>`;
    }
    if (n.type === 'challenge') {
      return `<div class="notif-row">
        <div class="notif-icon">⚔️</div>
        <div class="notif-body">
          <div class="notif-text"><strong>${n.fromUsername}</strong> challenges you! You play as <strong>${n.opponentSide}</strong>${n.challengeTime ? ` · ${n.challengeTime}` : ''}</div>
          <div class="notif-time">${time}</div>
          <div class="notif-actions">
            <button class="fa-btn accept" onclick="acceptChallenge('${n.id}','${n.from}','${n.fromUsername}','${n.opponentSide}','${n.challengerSide}','${n.challengeTime || '5m'}')">Accept ⚔️</button>
            <button class="fa-btn decline" onclick="declineChallenge('${n.id}','${n.from}')">Decline</button>
          </div>
        </div>
      </div>`;
    }
    if (n.type === 'challenge_declined') {
      return `<div class="notif-row">
        <div class="notif-icon">🙅</div>
        <div class="notif-body">
          <div class="notif-text"><strong>${n.fromUsername}</strong> declined your challenge.</div>
          <div class="notif-time">${time}</div>
          <div class="notif-actions">
            <button class="fa-btn decline" onclick="dismissNotif('${n.id}')">Dismiss</button>
          </div>
        </div>
      </div>`;
    }
    return '';
  }).join('');

  // Also update the requests tab in friends panel
  renderRequestsTab(items.filter(n => n.type === 'friend_request'));
  renderChallengesTab(items.filter(n => n.type === 'challenge'));
}

function renderRequestsTab(reqs) {
  const el = document.getElementById('requests-list');
  if (!reqs.length) { el.innerHTML = '<p class="friends-empty">No pending friend requests</p>'; return; }
  el.innerHTML = reqs.map(n => `
    <div class="friend-row">
      <div class="friend-avatar">${n.fromPhoto ? `<img src="${n.fromPhoto}">` : '👤'}</div>
      <div class="friend-info">
        <div class="friend-name">${n.fromUsername}</div>
        <div class="friend-sub">wants to be friends</div>
      </div>
      <div class="friend-actions">
        <button class="fa-btn accept" onclick="acceptFriendRequest('${n.from}','${n.fromUsername}','${n.id}')">Accept</button>
        <button class="fa-btn decline" onclick="declineFriendRequest('${n.from}','${n.id}')">Decline</button>
      </div>
    </div>`).join('');
}

async function dismissNotif(notifId) {
  await socialService.dismissNotif(notifId);
}

function renderChallengesTab(challenges) {
  const el = document.getElementById('challenges-list');
  if (!el) return;
  if (!challenges.length) {
    el.innerHTML = '<p class="friends-empty">No incoming challenges</p>';
    return;
  }
  el.innerHTML = challenges.map(n => {
    const time = n.createdAt ? timeAgo(n.createdAt.toDate()) : '';
    return `
      <div class="friend-row">
        <div class="friend-avatar">⚔️</div>
        <div class="friend-info">
          <div class="friend-name">${n.fromUsername}</div>
          <div class="friend-sub">You: ${n.opponentSide}${n.challengeTime ? ` · ${n.challengeTime}` : ''} · ${time}</div>
        </div>
        <div class="friend-actions">
          <button class="fa-btn accept" onclick="acceptChallenge('${n.id}','${n.from}','${n.fromUsername}','${n.opponentSide}','${n.challengerSide}','${n.challengeTime || '5m'}')">Accept</button>
          <button class="fa-btn decline" onclick="declineChallenge('${n.id}','${n.from}')">Decline</button>
        </div>
      </div>`;
  }).join('');
}

// ===== ACCEPT / DECLINE CHALLENGE =====
async function acceptChallenge(notifId, challengerUid, challengerUsername, mySide, theirSide, challengeTimeSelected = '5m') {
  const result = await socialService.acceptChallenge({
    notifId,
    challengerUid,
    mySide,
    theirSide,
    challengeTimeSelected,
    buildInitialRoomState
  });
  if (!result) return;
  document.getElementById('notif-overlay').classList.remove('show');
  startMultiplayerGame(result.roomId, mySide, challengeTimeSelected);
}

async function declineChallenge(notifId, challengerUid) {
  await socialService.declineChallenge({ notifId, challengerUid });
}

function handleChallengeAccepted(notif) {
  document.getElementById('challenge-sent-overlay').classList.remove('show');
  pendingChallengeId = null;
  socialService.dismissNotif(notif.id);
  startMultiplayerGame(notif.roomId, notif.mySide, notif.challengeTime || '5m');
}

// ===== START MULTIPLAYER GAME (stub — wired in Step 6) =====
function startMultiplayerGame(roomId, side, timeControl = '5m') {
  console.log('[MP] Starting multiplayer game. Room:', roomId, 'Side:', side);
  currentRoomId = roomId;
  multiplayerTimeControl = timeControl || '5m';
  playerSide = side === 'tiger' ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  gameMode = 'multiplayer';
  gameStarted = true;
  isFirstAIMove = false;
  stopRoomSyncListeners();
  subscribeToRoom(roomId);

  const roomOptions = document.getElementById('room-options');
  const roomWaiting = document.getElementById('room-waiting');
  if (roomOptions) roomOptions.classList.add('hidden');
  if (roomWaiting) roomWaiting.classList.add('hidden');
  document.getElementById('player-select-overlay').classList.remove('show');
  initGame();
}

// ===== TIME AGO HELPER =====
function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

// Expose social action handlers for dynamic inline buttons (script runs as type="module")
Object.assign(window, {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  openChallengeFlow,
  selectChallengeSide,
  selectChallengeTime,
  sendChallenge,
  dismissNotif,
  acceptChallenge,
  declineChallenge
});

// Update stats after game
async function updateUserStats(won, side) {
  if (!currentUser || !db) return;
  
  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const updates = {
      gamesPlayed: firebase.firestore.FieldValue.increment(1)
    };
    
    if (won) {
      if (side === 'tiger') {
        updates.tigerWins = firebase.firestore.FieldValue.increment(1);
        userStats.tigerWins++;
      } else {
        updates.goatWins = firebase.firestore.FieldValue.increment(1);
        userStats.goatWins++;
      }
    }
    
    userStats.gamesPlayed++;
    await userRef.update(updates);
    updateStatsDisplay();
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

// UI Updates
function updateUIForSignedInUser() {
  const signInBtn = document.getElementById('sign-in-btn');
  const profileMenu = document.getElementById('profile-menu');
  
  if (signInBtn) signInBtn.style.display = 'none';
  if (profileMenu) profileMenu.style.display = 'block';

  // Show social header buttons
  const notifBell = document.getElementById('notif-bell');
  const friendsNavBtn = document.getElementById('friends-nav-btn');
  if (notifBell) notifBell.style.display = 'flex';
  if (friendsNavBtn) friendsNavBtn.style.display = 'flex';
  
  const profileImg = document.getElementById('profile-img');
  const profileUsername = document.getElementById('profile-username');
  
  if (currentUser) {
    if (profileImg) profileImg.src = currentUser.photoURL || 'https://via.placeholder.com/32';
    if (profileUsername) profileUsername.textContent = userStats.username || currentUser.displayName || 'Player';
  }
  
  updateStatsDisplay();
  startSocialListeners();
}

function updateUIForSignedOutUser() {
  const signInBtn = document.getElementById('sign-in-btn');
  const profileMenu = document.getElementById('profile-menu');
  
  if (signInBtn) signInBtn.style.display = 'block';
  if (profileMenu) profileMenu.style.display = 'none';

  // Hide social header buttons
  const notifBell = document.getElementById('notif-bell');
  const friendsNavBtn = document.getElementById('friends-nav-btn');
  if (notifBell) notifBell.style.display = 'none';
  if (friendsNavBtn) friendsNavBtn.style.display = 'none';

  stopSocialListeners();
}

function updateStatsDisplay() {
  const statsGames = document.getElementById('stats-games');
  const statsTigerWins = document.getElementById('stats-tiger-wins');
  const statsGoatWins = document.getElementById('stats-goat-wins');
  
  if (statsGames) statsGames.textContent = userStats.gamesPlayed;
  if (statsTigerWins) statsTigerWins.textContent = userStats.tigerWins;
  if (statsGoatWins) statsGoatWins.textContent = userStats.goatWins;
}

function showUsernameSetup() {
  document.getElementById('username-setup-overlay').classList.add('show');
}

function hideUsernameSetup() {
  document.getElementById('username-setup-overlay').classList.remove('show');
}

// ===== GAME LOGIC =====

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Set canvas size
canvas.width = 600;
canvas.height = 600;

// Load images
const images = {
  tigerPiece: new Image(),
  goatPiece: new Image(),
  backdrop: new Image(),
  board: new Image()
};

// Front-facing gameplay pieces (same image for all tigers/goats)
images.tigerPiece.src = 'assets/bagh.png';
images.goatPiece.src = 'assets/bhakhra.png';
images.backdrop.src = 'assets/Backdrop.png';
images.board.src = 'assets/baghchal.png';

// Don't gate rendering on image loading — draw() handles missing images gracefully.
// Images will appear as they load since draw() runs in a requestAnimationFrame loop.
let imagesLoaded = 0;
const totalImages = 4;
function imageLoaded() { imagesLoaded++; }
images.tigerPiece.onload = imageLoaded; images.tigerPiece.onerror = imageLoaded;
images.goatPiece.onload = imageLoaded; images.goatPiece.onerror = imageLoaded;
images.backdrop.onload = imageLoaded; images.backdrop.onerror = imageLoaded;
images.board.onload = imageLoaded; images.board.onerror = imageLoaded;

// Game Constants
// Track which tiger image to use for each position
const tigerImages = [0, 1, 2, 3]; // Maps tiger index to image index

// Player settings
let playerSide = null; // Will be PIECE_TYPES.GOAT or PIECE_TYPES.TIGER
let gameMode = 'ai';   // 'ai' or 'multiplayer'
let multiplayerSide = null; // chosen side in multiplayer mode
let gameStarted = false;
let isFirstAIMove = true;
let aiDifficulty = 'easy'; // 'easy' or 'hard'
let pendingBoardResetTimeout = null;
let pendingAITurnTimeout = null;

// Multiplayer room sync state
let currentRoomId = null;
let currentRoomCode = null;
const multiplayerService = createMultiplayerService({
  firebase,
  getContext: () => ({ db })
});

// Timer settings
let timerInterval = null;
let currentTime = 30; // 30 seconds per move
let multiplayerTimeControl = '5m';

function getMultiplayerTurnSeconds() {
  if (multiplayerTimeControl === '3m') return 180;
  if (multiplayerTimeControl === '10m') return 600;
  if (multiplayerTimeControl === '5m') return 300;
  return Infinity; // 'infinite'
}

function clearPendingAsyncActions() {
  if (pendingBoardResetTimeout) {
    clearTimeout(pendingBoardResetTimeout);
    pendingBoardResetTimeout = null;
  }

  if (pendingAITurnTimeout) {
    clearTimeout(pendingAITurnTimeout);
    pendingAITurnTimeout = null;
  }
}

function scheduleAIMove(delay = getAIThinkingTime()) {
  if (pendingAITurnTimeout) {
    clearTimeout(pendingAITurnTimeout);
  }

  pendingAITurnTimeout = setTimeout(() => {
    pendingAITurnTimeout = null;
    aiMove();
  }, delay);
}

// ===== WEBWORKER AI OPTIMIZATION =====
let aiWorker = null;
let workerSupported = typeof Worker !== 'undefined';

// Initialize WebWorker for off-thread AI computation
function initializeAIWorker() {
  if (!workerSupported) {
    console.log('WebWorkers not supported - using inline AI');
    return;
  }
  
  try {
    aiWorker = new Worker('ai-worker.js', { type: 'module' });
    aiWorker.onerror = (error) => {
      console.error('Worker error:', error);
      aiWorker = null;
    };
    console.log('AI WebWorker initialized successfully');
  } catch (error) {
    console.error('Failed to initialize WebWorker:', error);
    aiWorker = null;
  }
}

// Call worker with timeout fallback
function getAIMoveFromWorker(gameState, aiSide, callback) {
  if (!aiWorker) {
    callback(null);
    return;
  }
  
  const timeout = setTimeout(() => {
    console.warn('Worker timeout - computing AI move locally');
    callback(null);
  }, AI_CONFIG.hard.thinkTime + 100);
  
  const handler = (event) => {
    clearTimeout(timeout);
    aiWorker.removeEventListener('message', handler);
    
    if (event.data.success) {
      callback(event.data.move);
    } else {
      console.error('Worker AI failed:', event.data.error);
      callback(null);
    }
  };
  
  aiWorker.addEventListener('message', handler);
  aiWorker.postMessage({
    board: gameState.board,
    phase: gameState.phase,
    goatsPlaced: gameState.goatsPlaced,
    goatsCaptured: gameState.goatsCaptured,
    aiSide: aiSide,
    gameState: gameState
  });
}

// Transposition table for local AI (memoization cache)
const aiTranspositionTable = new Map();
const TRANSPOSITION_TABLE_SIZE = 50000;

function stopRoomSyncListeners() {
  multiplayerService.stopRoomSyncListeners();
}

function getCurrentMultiplayerPayload(extra = {}) {
  return {
    board: [...gameState.board],
    currentPlayer: gameState.currentPlayer,
    phase: gameState.phase,
    goatsPlaced: gameState.goatsPlaced,
    goatsCaptured: gameState.goatsCaptured,
    goatIdentities: { ...(gameState.goatIdentities || {}) },
    tigerIdentities: { ...(gameState.tigerIdentities || {}) },
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...extra
  };
}

async function syncMultiplayerState(extra = {}) {
  await multiplayerService.syncRoomState({
    roomId: currentRoomId,
    gameMode,
    payload: getCurrentMultiplayerPayload(extra)
  });
}

function applyRoomStateToLocal(roomData) {
  if (!roomData || !roomData.board) return;
  multiplayerService.withAppliedRoomSnapshot(() => {
    gameState.board = [...roomData.board];
    gameState.currentPlayer = roomData.currentPlayer ?? PIECE_TYPES.GOAT;
    gameState.phase = roomData.phase || PHASE.PLACEMENT;
    gameState.goatsPlaced = roomData.goatsPlaced || 0;
    gameState.goatsCaptured = roomData.goatsCaptured || 0;
    gameState.goatIdentities = { ...(roomData.goatIdentities || {}) };
    gameState.tigerIdentities = { ...(roomData.tigerIdentities || {}) };
    gameState.selectedPiece = null;
    gameState.validMoves = [];
    gameState.gameOver = roomData.status === 'finished';
  });
  updateUI();
  draw();
}

function subscribeToRoom(roomId) {
  multiplayerService.subscribeToRoom(roomId, {
    onRoomState: applyRoomStateToLocal,
    onRoomFinished: (room) => {
      if (!gameState.gameOver) {
        const msg = room.winnerMessage || (room.winner === 'tiger' ? 'Tiger won the match.' : 'Goat won the match.');
        endGame(msg, room.winner);
      }
    }
  });
}

// Game State
let gameState = {
  board: Array(25).fill(PIECE_TYPES.EMPTY),
  currentPlayer: PIECE_TYPES.GOAT,
  phase: PHASE.PLACEMENT,
  goatsPlaced: 0,
  goatsCaptured: 0,
  selectedPiece: null,
  validMoves: [],
  gameOver: false
};

// History for viewing previous moves (up to 5)
let gameHistory = [];
let currentMoveIndex = -1; // -1 means we're at the current move
let currentGameState = null;
let savedGameState = null;

// Position history to detect repetitions
let positionHistory = [];
const MAX_POSITION_HISTORY = 10; // Track last 10 positions

// Sequential goat flag counter (cycles through all 20 countries)
let goatFlagCounter = 0;
function getNextGoatFlag() {
  const idx = goatFlagCounter % 20;
  goatFlagCounter++;
  return idx;
}

// Board positions (x, y coordinates for 5x5 grid)
const positions = BOARD_POSITIONS;

// Initialize game
function initGame(options = {}) {
  const started = options.started ?? gameStarted;
  const decorativeGoats = options.decorativeGoats ?? !started;
  const shouldPlayStartSound = options.playStartSound ?? started;
  const shouldShowPanels = options.showPanels ?? started;
  const shouldStartTimer = options.startTimer ?? started;
  const shouldTriggerAutoAI = options.autoAIMove ?? (started && gameMode === 'ai' && playerSide === PIECE_TYPES.TIGER);

  clearPendingAsyncActions();
  stopTimer();

  // Reset state
  gameState = {
    board: Array(25).fill(PIECE_TYPES.EMPTY),
    currentPlayer: PIECE_TYPES.GOAT,
    phase: PHASE.PLACEMENT,
    goatsPlaced: 0,
    goatsCaptured: 0,
    selectedPiece: null,
    validMoves: [],
    gameOver: false,
    tigerIdentities: {}, // Track which tiger logo is at which position
    goatIdentities: {} // Track which RSP image is at which goat position
  };

  // Clear history
  gameHistory = [];
  currentMoveIndex = -1;
  savedGameState = null;
  
  // Clear position history
  positionHistory = [];

  // Reset goat flag counter
  goatFlagCounter = 0;

  // Place tigers at corners
  gameState.board[0] = PIECE_TYPES.TIGER;  // Top-left
  gameState.tigerIdentities[0] = 0;
  gameState.board[4] = PIECE_TYPES.TIGER;  // Top-right
  gameState.tigerIdentities[4] = 1;
  gameState.board[20] = PIECE_TYPES.TIGER; // Bottom-left
  gameState.tigerIdentities[20] = 2;
  gameState.board[24] = PIECE_TYPES.TIGER; // Bottom-right
  gameState.tigerIdentities[24] = 3;

  // Add random goats for visual appeal on homepage (only if game hasn't started)
  if (decorativeGoats) {
    const goatPositions = [6, 8, 12, 16, 18]; // Some strategic positions
    goatPositions.forEach((pos, index) => {
      gameState.board[pos] = PIECE_TYPES.GOAT;
      gameState.goatsPlaced++;
      gameState.goatIdentities[pos] = index % 20; // Cycle through country flags
    });
  }

  if (shouldPlayStartSound) {
    playSound('newGame');
  }

  updateUI();
  draw();
  
  // Initialize AI worker for optimized computation (only once)
  if (!aiWorker && workerSupported) {
    initializeAIWorker();
  }
  
  // Show/hide panels based on game state
  if (shouldShowPanels) {
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('gameStatePanel').classList.remove('hidden');
    document.getElementById('tigerPanel').classList.remove('hidden');
    document.getElementById('goatPanel').classList.remove('hidden');
    toggleMoveNavigation(true);
    if (shouldStartTimer) {
      startTimer();
    }
  } else {
    document.getElementById('welcome-screen').style.display = 'flex';
    document.getElementById('gameStatePanel').classList.add('hidden');
    document.getElementById('tigerPanel').classList.add('hidden');
    document.getElementById('goatPanel').classList.add('hidden');
    toggleMoveNavigation(false);
  }
  
  // If player is tiger, goats go first (AI mode only)
  if (shouldTriggerAutoAI) {
    scheduleAIMove();
  }
}

// Timer functions
function startTimer() {
  stopTimer();
  currentTime = gameMode === 'multiplayer' ? getMultiplayerTurnSeconds() : TIME_PER_MOVE;
  updateTimerDisplay();

  // Infinite time control: display only, no countdown.
  if (!Number.isFinite(currentTime)) {
    return;
  }
  
  timerInterval = setInterval(() => {
    currentTime -= 0.1;
    if (currentTime <= 0) {
      currentTime = 0;
      stopTimer();
      handleTimeOut();
    }
    updateTimerDisplay();
  }, 100);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function resetTimer() {
  if (gameMode === 'multiplayer') {
    currentTime = getMultiplayerTurnSeconds();
  } else {
    currentTime = TIME_PER_MOVE + TIME_INCREMENT;
  }
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const timerElement = document.getElementById('timer-text');
  if (timerElement) {
    if (!Number.isFinite(currentTime)) {
      timerElement.textContent = '∞';
      timerElement.classList.remove('warning', 'danger');
      return;
    }

    const totalSec = Math.max(0, Math.ceil(currentTime));
    const mins = Math.floor(totalSec / 60);
    const secs = String(totalSec % 60).padStart(2, '0');
    timerElement.textContent = `${mins}:${secs}`;
    
    // Update color based on time remaining
    timerElement.classList.remove('warning', 'danger');
    if (currentTime <= 10) {
      timerElement.classList.add('danger');
    } else if (currentTime <= 30) {
      timerElement.classList.add('warning');
    }
  }
}

function handleTimeOut() {
  if (gameState.gameOver) return;
  
  stopTimer();
  
  // Current player loses
  const winner = gameState.currentPlayer === PIECE_TYPES.GOAT ? 'tiger' : 'goat';
  const message = gameState.currentPlayer === PIECE_TYPES.GOAT 
    ? 'Tiger wins - Time Out!' 
    : 'Goat wins - Time Out!';
  
  endGame(message, winner);
}

function onMoveMade() {
  // Reset timer with increment and start for next player
  resetTimer();
  startTimer();
}

// Get randomized AI thinking time (0-0.5 seconds, first move instant)
function getAIThinkingTime() {
  if (isFirstAIMove) {
    isFirstAIMove = false;
    return 0;
  }
  return Math.random() * 500;
}

// Show AI thinking indicator
function showAIThinking() {
  document.getElementById('ai-thinking').classList.add('show');
}

// Hide AI thinking indicator
function hideAIThinking() {
  document.getElementById('ai-thinking').classList.remove('show');
}

// Get valid moves for a piece
function getValidMoves(index) {
  return getValidMovesForBoard(index, gameState.board, positions).map(({ to, capture }) => ({ to, capture }));
}

// Check if tigers are trapped
function areTigersTrapped() {
  return countTrappedPieces(gameState.board, PIECE_TYPES.TIGER, positions) === 4;
}

// Count how many tigers are trapped (have no valid moves)
function countTrappedTigers() {
  return countTrappedPieces(gameState.board, PIECE_TYPES.TIGER, positions);
}

// Check if goats are trapped (rare case)
function areGoatsTrapped() {
  return countTrappedPieces(gameState.board, PIECE_TYPES.GOAT, positions) === gameState.board.filter(piece => piece === PIECE_TYPES.GOAT).length;
}

// Check win conditions
function checkWin() {
  const winState = getWinState(gameState, positions);
  if (winState) {
    endGame(winState.message, winState.winner);
    return true;
  }

  return false;
}

// Handle board click
function handleClick(event) {
  if (gameState.gameOver || !gameStarted || currentMoveIndex !== -1) return;
  
  // Don't allow clicks if it's not player's turn
  if (gameState.currentPlayer !== playerSide) {
    console.log('Not your turn. Current:', gameState.currentPlayer, 'Your side:', playerSide);
    return;
  }

  const rect = canvas.getBoundingClientRect();
  // Scale click coordinates from displayed size to canvas size
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  console.log('Click at:', x, y, 'Canvas size:', canvas.width, canvas.height, 'Display size:', rect.width, rect.height);

  // Convert click to board position
  const clickedIndex = getClickedPosition(x, y);
  
  console.log('Clicked index:', clickedIndex, 'Piece at index:', gameState.board[clickedIndex]);
  
  if (clickedIndex === -1) return;

  if (gameState.phase === PHASE.PLACEMENT) {
    // Placement phase - place goat or move tiger
    if (gameState.currentPlayer === PIECE_TYPES.GOAT && playerSide === PIECE_TYPES.GOAT) {
      if (gameState.board[clickedIndex] === PIECE_TYPES.EMPTY) {
        saveState(); // Save state before move
        gameState.board[clickedIndex] = PIECE_TYPES.GOAT;
        gameState.goatIdentities[clickedIndex] = getNextGoatFlag();
        gameState.goatsPlaced++;
        playSound('pieceMove');
        
        if (gameState.goatsPlaced === 20) {
          gameState.phase = PHASE.MOVEMENT;
        }
        
        gameState.currentPlayer = PIECE_TYPES.TIGER;
        
        // Track position
        const boardHash = getBoardHash(gameState.board);
        positionHistory.push(boardHash);
        if (positionHistory.length > MAX_POSITION_HISTORY) {
          positionHistory.shift();
        }
        
        updateUI();
        onMoveMade();
        
        if (!checkWin()) {
          if (gameMode === 'multiplayer') {
            syncMultiplayerState().catch(err => console.error('[MP] Failed to sync move:', err));
          } else {
            scheduleAIMove();
          }
        }
      }
    } else if (gameState.currentPlayer === PIECE_TYPES.TIGER && playerSide === PIECE_TYPES.TIGER) {
      // Tiger's turn in placement phase
      if (gameState.board[clickedIndex] === PIECE_TYPES.TIGER) {
        // Select tiger
        gameState.selectedPiece = clickedIndex;
        gameState.validMoves = getValidMoves(clickedIndex);
        draw();
      } else if (gameState.selectedPiece !== null) {
        // Try to move or capture
        const move = gameState.validMoves.find(m => m.to === clickedIndex);
        if (move) {
          saveState(); // Save state before move
          // Transfer tiger identity when moving
          const tigerIdentity = gameState.tigerIdentities[gameState.selectedPiece];
          gameState.board[move.to] = PIECE_TYPES.TIGER;
          gameState.tigerIdentities[move.to] = tigerIdentity;
          
          gameState.board[gameState.selectedPiece] = PIECE_TYPES.EMPTY;
          delete gameState.tigerIdentities[gameState.selectedPiece];
          
          playSound('pieceMove');
          if (move.capture !== null) {
            gameState.board[move.capture] = PIECE_TYPES.EMPTY;
            delete gameState.goatIdentities[move.capture];
            gameState.goatsCaptured++;
            playSound('tigerCapture');
            updateUI();
          }
          
          gameState.selectedPiece = null;
          gameState.validMoves = [];
          gameState.currentPlayer = PIECE_TYPES.GOAT;
          
          // Track position after tiger move in placement
          const boardHashTigerPlace = getBoardHash(gameState.board);
          positionHistory.push(boardHashTigerPlace);
          if (positionHistory.length > MAX_POSITION_HISTORY) {
            positionHistory.shift();
          }
          
          if (!checkWin()) {
            if (gameMode === 'multiplayer') {
              syncMultiplayerState().catch(err => console.error('[MP] Failed to sync move:', err));
            } else {
              scheduleAIMove();
            }
          }
        } else if (gameState.board[clickedIndex] === PIECE_TYPES.TIGER) {
          // Select different tiger
          gameState.selectedPiece = clickedIndex;
          gameState.validMoves = getValidMoves(clickedIndex);
        } else {
          // Deselect
          gameState.selectedPiece = null;
          gameState.validMoves = [];
        }
      }
    }
  } else {
    // Movement phase
    if (gameState.currentPlayer === PIECE_TYPES.GOAT && playerSide === PIECE_TYPES.GOAT) {
      if (gameState.selectedPiece === null) {
        // Select a goat
        if (gameState.board[clickedIndex] === PIECE_TYPES.GOAT) {
          gameState.selectedPiece = clickedIndex;
          gameState.validMoves = getValidMoves(clickedIndex);
        }
      } else {
        // Try to move selected goat
        const move = gameState.validMoves.find(m => m.to === clickedIndex);
        if (move) {
          saveState(); // Save state before move
          gameState.board[move.to] = PIECE_TYPES.GOAT;
          gameState.board[gameState.selectedPiece] = PIECE_TYPES.EMPTY;
          // Transfer goat identity
          gameState.goatIdentities[move.to] = gameState.goatIdentities[gameState.selectedPiece];
          delete gameState.goatIdentities[gameState.selectedPiece];
          playSound('pieceMove');
          gameState.selectedPiece = null;
          gameState.validMoves = [];
          gameState.currentPlayer = PIECE_TYPES.TIGER;
          
          // Track position
          const boardHash = getBoardHash(gameState.board);
          positionHistory.push(boardHash);
          if (positionHistory.length > MAX_POSITION_HISTORY) {
            positionHistory.shift();
          }
          
          updateUI();
          
          if (!checkWin()) {
            if (gameMode === 'multiplayer') {
              syncMultiplayerState().catch(err => console.error('[MP] Failed to sync move:', err));
            } else {
              scheduleAIMove();
            }
          }
        } else if (gameState.board[clickedIndex] === PIECE_TYPES.GOAT) {
          // Select different goat
          gameState.selectedPiece = clickedIndex;
          gameState.validMoves = getValidMoves(clickedIndex);
        } else {
          // Deselect
          gameState.selectedPiece = null;
          gameState.validMoves = [];
        }
      }
    } else if (gameState.currentPlayer === PIECE_TYPES.TIGER && playerSide === PIECE_TYPES.TIGER) {
      // Tiger's turn in movement phase
      if (gameState.selectedPiece === null) {
        // Select a tiger
        if (gameState.board[clickedIndex] === PIECE_TYPES.TIGER) {
          gameState.selectedPiece = clickedIndex;
          gameState.validMoves = getValidMoves(clickedIndex);
          draw();
        }
      } else {
        // Try to move or capture
        const move = gameState.validMoves.find(m => m.to === clickedIndex);
        if (move) {
          saveState(); // Save state before move
          // Transfer tiger identity when moving
          const tigerIdentity = gameState.tigerIdentities[gameState.selectedPiece];
          gameState.board[move.to] = PIECE_TYPES.TIGER;
          gameState.tigerIdentities[move.to] = tigerIdentity;
          
          gameState.board[gameState.selectedPiece] = PIECE_TYPES.EMPTY;
          delete gameState.tigerIdentities[gameState.selectedPiece];
          
          playSound('pieceMove');
          if (move.capture !== null) {
            gameState.board[move.capture] = PIECE_TYPES.EMPTY;
            delete gameState.goatIdentities[move.capture];
            gameState.goatsCaptured++;
            playSound('tigerCapture');
            updateUI();
          }
          
          gameState.selectedPiece = null;
          gameState.validMoves = [];
          gameState.currentPlayer = PIECE_TYPES.GOAT;
          
          // Track position after tiger move in movement phase
          const boardHashTigerMove = getBoardHash(gameState.board);
          positionHistory.push(boardHashTigerMove);
          if (positionHistory.length > MAX_POSITION_HISTORY) {
            positionHistory.shift();
          }
          
          if (!checkWin()) {
            if (gameMode === 'multiplayer') {
              syncMultiplayerState().catch(err => console.error('[MP] Failed to sync move:', err));
            } else {
              scheduleAIMove();
            }
          }
        } else if (gameState.board[clickedIndex] === PIECE_TYPES.TIGER) {
          // Select different tiger
          gameState.selectedPiece = clickedIndex;
          gameState.validMoves = getValidMoves(clickedIndex);
        } else {
          // Deselect
          gameState.selectedPiece = null;
          gameState.validMoves = [];
        }
      }
    }
  }

  updateUI();
  draw();
}

// Simple AI for tiger or goat
function aiMove() {
  console.log('aiMove called. Current player:', gameState.currentPlayer, 'playerSide:', playerSide);
  const aiSide = playerSide === PIECE_TYPES.GOAT ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  console.log('AI side:', aiSide, 'gameStarted:', gameStarted, 'gameOver:', gameState.gameOver);
  
  if (gameState.currentPlayer !== aiSide || gameState.gameOver || !gameStarted) {
    console.log('aiMove returning early');
    return;
  }

  console.log('aiMove proceeding with AI move');
  showAIThinking();
  const delay = getAIThinkingTime();
  
  pendingAITurnTimeout = setTimeout(() => {
    pendingAITurnTimeout = null;
    console.log('Executing AI move after delay');
    if (aiDifficulty === 'hard') {
      executeHardAIMove();
    } else {
      executeAIMove();
    }
    hideAIThinking();
  }, delay);
}

// ===== HARD AI IMPLEMENTATION =====

// Evaluate board state from perspective of given player
function evaluateBoard(board, player, phase, goatsPlaced, goatsCaptured) {
  let score = 0;
  
  if (player === PIECE_TYPES.TIGER) {
    // Tiger evaluation
    score += goatsCaptured * 100; // Captures are paramount
    
    // Count tiger mobility
    let totalMobility = 0;
    let trappedTigers = 0;
    
    for (let i = 0; i < 25; i++) {
      if (board[i] === PIECE_TYPES.TIGER) {
        const moves = getValidMovesForState(i, board);
        totalMobility += moves.length;
        
        if (moves.length === 0) {
          trappedTigers++;
          score -= 500; // Heavily penalize trapped tigers
        } else {
          score += moves.length * 10; // Reward mobility
        }
        
        // Reward center control
        const pos = positions[i];
        if (pos.row === 2 && pos.col === 2) {
          score += 15;
        } else if (Math.abs(pos.row - 2) <= 1 && Math.abs(pos.col - 2) <= 1) {
          score += 5;
        }
        
        // Count capture opportunities
        const captureMoves = moves.filter(m => m.capture !== null);
        score += captureMoves.length * 50;
      }
    }
    
    // Penalize if all tigers are trapped
    if (trappedTigers === 4) {
      score -= 10000;
    }
    
  } else {
    // Goat evaluation - DEFENSIVE PRIORITY
    score -= goatsCaptured * 200; // Losing goats is very bad
    
    // Heavily penalize if close to losing (4 captures = game over at 5)
    if (goatsCaptured >= 4) {
      score -= 5000;
    }
    
    // Count goat safety and formation
    let safeGoats = 0;
    let isolatedGoats = 0;
    let tigerMobility = 0;
    let tigerCaptureMoves = 0;
    
    for (let i = 0; i < 25; i++) {
      if (board[i] === PIECE_TYPES.GOAT) {
        const pos = positions[i];
        const adjacent = getAdjacentForState(i, board);
        
        // Check if goat has backup (critical for defense)
        let hasBackup = false;
        let adjacentGoats = 0;
        
        for (const adj of adjacent) {
          if (board[adj] === PIECE_TYPES.GOAT) {
            adjacentGoats++;
            hasBackup = true;
          }
        }
        
        if (hasBackup) {
          safeGoats++;
          score += 40; // Strong reward for goat formations
        } else {
          isolatedGoats++;
          score -= 25; // Penalize isolated goats
        }
        
        // Extra reward for goats in pairs/groups (2+ adjacent goats)
        if (adjacentGoats >= 2) {
          score += 30; // Strong defensive formation
        }
        
        // Strategic positioning in placement phase
        if (phase === PHASE.PLACEMENT) {
          // Prioritize center and key blocking positions
          if (pos.row === 2 && pos.col === 2) {
            score += 35; // Center control
          } else if (Math.abs(pos.row - 2) <= 1 && Math.abs(pos.col - 2) <= 1) {
            score += 15; // Near center
          }
          
          // Reward key diagonal intersections
          if ((pos.row === 1 || pos.row === 3) && (pos.col === 1 || pos.col === 3)) {
            score += 20;
          }
        }
        
        // In movement phase, prioritize trapping
        if (phase === PHASE.MOVEMENT) {
          // Reward positions that block tiger paths
          const nearTiger = adjacent.some(adj => board[adj] === PIECE_TYPES.TIGER);
          if (nearTiger && hasBackup) {
            score += 35; // Blocking tiger with backup is excellent
          }
        }
        
        // Penalize vulnerable edge goats
        if (pos.row === 0 || pos.row === 4 || pos.col === 0 || pos.col === 4) {
          if (!hasBackup) {
            score -= 15; // Isolated edge goats are very vulnerable
          }
        }
      } else if (board[i] === PIECE_TYPES.TIGER) {
        const moves = getValidMovesForState(i, board);
        tigerMobility += moves.length;
        
        // Count capture opportunities for tigers
        const captureMoves = moves.filter(m => m.capture !== null);
        tigerCaptureMoves += captureMoves.length;
      }
    }
    
    // CRITICAL: Reward for restricting tiger movement (suffocation strategy)
    score += (40 - tigerMobility) * 8; // Higher weight for suffocation
    
    // Penalize if tigers have capture opportunities
    score -= tigerCaptureMoves * 60;
    
    // Bonus for trapping tigers completely
    if (tigerMobility === 0 && phase === PHASE.MOVEMENT) {
      score += 15000; // Winning position
    }
    
    // Reward tight formations over isolated goats
    score += safeGoats * 25;
    score -= isolatedGoats * 20;
  }
  
  return score;
}

// Get valid moves for a position in a given board state
function getValidMovesForState(index, board) {
  return getValidMovesForBoard(index, board, positions);
}

// Get adjacent positions for a given board state
function getAdjacentForState(index, board) {
  return getAdjacentPositions(index, positions);
}

// Minimax with alpha-beta pruning
function minimax(board, depth, alpha, beta, isMaximizing, player, phase, goatsPlaced, goatsCaptured) {
  // Terminal conditions
  if (depth === 0 || goatsCaptured >= 5) {
    return evaluateBoard(board, player, phase, goatsPlaced, goatsCaptured);
  }
  
  // Check if game is over (all tigers trapped)
  if (phase === PHASE.MOVEMENT) {
    let allTrapped = true;
    for (let i = 0; i < 25; i++) {
      if (board[i] === PIECE_TYPES.TIGER) {
        const moves = getValidMovesForState(i, board);
        if (moves.length > 0) {
          allTrapped = false;
          break;
        }
      }
    }
    if (allTrapped) {
      return isMaximizing ? -10000 : 10000;
    }
  }
  
  const currentPlayer = isMaximizing ? player : (player === PIECE_TYPES.TIGER ? PIECE_TYPES.GOAT : PIECE_TYPES.TIGER);
  
  if (isMaximizing) {
    let maxEval = -Infinity;
    const moves = getAllPossibleMoves(board, currentPlayer, phase, goatsPlaced);
    
    for (const move of moves) {
      const newState = applyMove(board, move, phase, goatsPlaced, goatsCaptured);
      const evaluation = minimax(newState.board, depth - 1, alpha, beta, false, player, newState.phase, newState.goatsPlaced, newState.goatsCaptured);
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break; // Prune
    }
    
    return maxEval;
  } else {
    let minEval = Infinity;
    const moves = getAllPossibleMoves(board, currentPlayer, phase, goatsPlaced);
    
    for (const move of moves) {
      const newState = applyMove(board, move, phase, goatsPlaced, goatsCaptured);
      const evaluation = minimax(newState.board, depth - 1, alpha, beta, true, player, newState.phase, newState.goatsPlaced, newState.goatsCaptured);
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break; // Prune
    }
    
    return minEval;
  }
}

// Get all possible moves for a player
function getAllPossibleMoves(board, player, phase, goatsPlaced) {
  const moves = [];
  
  if (player === PIECE_TYPES.GOAT && phase === PHASE.PLACEMENT && goatsPlaced < 20) {
    // Placement moves
    for (let i = 0; i < 25; i++) {
      if (board[i] === PIECE_TYPES.EMPTY) {
        moves.push({ type: 'place', to: i });
      }
    }
  } else {
    // Movement moves
    for (let i = 0; i < 25; i++) {
      if (board[i] === player) {
        const pieceMoves = getValidMovesForState(i, board);
        // Ensure moves have type field
        for (const move of pieceMoves) {
          if (!move.type) {
            move.type = 'move';
          }
        }
        moves.push(...pieceMoves);
      }
    }
  }
  
  return moves;
}

// Apply a move to create a new board state
function applyMove(board, move, phase, goatsPlaced, goatsCaptured) {
  const newBoard = [...board];
  let newPhase = phase;
  let newGoatsPlaced = goatsPlaced;
  let newGoatsCaptured = goatsCaptured;
  
  if (move.type === 'place') {
    newBoard[move.to] = PIECE_TYPES.GOAT;
    newGoatsPlaced++;
    if (newGoatsPlaced === 20) {
      newPhase = PHASE.MOVEMENT;
    }
  } else {
    newBoard[move.to] = newBoard[move.from];
    newBoard[move.from] = PIECE_TYPES.EMPTY;
    if (move.capture !== null) {
      newBoard[move.capture] = PIECE_TYPES.EMPTY;
      newGoatsCaptured++;
    }
  }
  
  return { board: newBoard, phase: newPhase, goatsPlaced: newGoatsPlaced, goatsCaptured: newGoatsCaptured };
}

// Execute hard AI move - uses Heavy Backend AI
async function executeHardAIMove() {
  if (gameState.gameOver) return;
  
  console.log('=== Hard AI Move Start (Backend API) ===');
  const aiSide = playerSide === PIECE_TYPES.GOAT ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  
  // Try sending board state to the backend
  try {
    const response = await fetch('http://localhost:3000/api/get-move', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gameState: {
          board: gameState.board,
          phase: gameState.phase,
          goatsPlaced: gameState.goatsPlaced,
          goatsCaptured: gameState.goatsCaptured
        },
        aiSide: aiSide,
        difficulty: 'hard' // Triggers full deep calculations on backend
      })
    });

    if (!response.ok) throw new Error('Backend AI request failed');
    
    const data = await response.json();
    
    if (data.success && data.move) {
      console.log(`Backend AI executed in ${data.stats?.timeSpent || 'unknown'}ms`);
      applyHardAIMove(data.move, aiSide);
      return;
    } else {
      throw new Error('Valid move not found from Backend AI');
    }
    
  } catch (err) {
    console.error('Backend AI Failed, falling back to local Easy AI:', err);
    // If backend is down, fall back to our existing worker so the game doesn't crash
    const allMoves = getAllPossibleMoves(gameState.board, aiSide, gameState.phase, gameState.goatsPlaced);
    executeHardAIMoveLocal(allMoves, aiSide);
  }
}

// Optimized local minimax with move ordering and transposition table
function executeHardAIMoveLocal(allMoves, aiSide) {
  console.log('Evaluating', allMoves.length, 'moves with optimized minimax...');
  
  // Sort moves using heuristic ordering for better pruning
  const orderedMoves = orderMovesByHeuristic(allMoves, aiSide);
  
  let searchDepth;
  if (aiSide === PIECE_TYPES.GOAT) {
    searchDepth = gameState.phase === PHASE.PLACEMENT ? 
      AI_CONFIG.hard.goatPlacementDepth : 
      AI_CONFIG.hard.goatMovementDepth;
  } else {
    searchDepth = gameState.phase === PHASE.PLACEMENT ? 
      AI_CONFIG.hard.tigerPlacementDepth : 
      AI_CONFIG.hard.tigerMovementDepth;
  }
  
  let bestMove = null;
  let bestScore = -Infinity;
  let alternativeMoves = [];
  
  const startTime = Date.now();
  const timeLimit = AI_CONFIG.hard.thinkTime;
  
  // Evaluate moves with time limit
  for (let i = 0; i < orderedMoves.length; i++) {
    // Check time budget
    if (Date.now() - startTime > timeLimit * 0.9) {
      console.log('Time limit reached, using best move found');
      break;
    }
    
    const move = orderedMoves[i];
    const newState = applyMove(gameState.board, move, gameState.phase, gameState.goatsPlaced, gameState.goatsCaptured);
    
    // Check repetition
    const newBoardHash = getBoardHash(newState.board);
    const wouldRepeat = positionHistory.slice(-6).includes(newBoardHash);
    
    // Optimized minimax with memo
    const score = minimaxOptimized(
      newState.board, 
      searchDepth - 1, 
      -Infinity, 
      Infinity, 
      false,
      aiSide, 
      newState.phase, 
      newState.goatsPlaced, 
      newState.goatsCaptured
    );
    
    let adjustedScore = score;
    if (aiSide === PIECE_TYPES.GOAT && wouldRepeat) {
      adjustedScore -= 100;
    }
    
    if (adjustedScore > bestScore - 50 && !wouldRepeat) {
      alternativeMoves.push({ move, score: adjustedScore });
    }
    
    if (adjustedScore > bestScore) {
      bestScore = adjustedScore;
      bestMove = move;
    }
  }
  
  // Avoid repetition for goat AI
  if (aiSide === PIECE_TYPES.GOAT && alternativeMoves.length > 1) {
    alternativeMoves.sort((a, b) => b.score - a.score);
    const bestNewState = applyMove(gameState.board, bestMove, gameState.phase, gameState.goatsPlaced, gameState.goatsCaptured);
    const bestHash = getBoardHash(bestNewState.board);
    
    if (positionHistory.slice(-4).includes(bestHash)) {
      const altIndex = Math.floor(Math.random() * Math.min(3, alternativeMoves.length));
      bestMove = alternativeMoves[altIndex].move;
      bestScore = alternativeMoves[altIndex].score;
    }
  }
  
  applyHardAIMove(bestMove, aiSide);
}

// Smart move ordering heuristic
function orderMovesByHeuristic(moves, aiSide) {
  const scored = moves.map(move => {
    let score = 0;
    
    // Captures are highest priority
    if (move.type === 'move' && move.capture !== null && move.capture === PIECE_TYPES.GOAT) {
      score += 1000;
    }
    
    // Center positions
    if (move.to === 12) score += 100;
    if ([6, 8, 16, 18].includes(move.to)) score += 50;
    
    return { move, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  return scored.map(item => item.move);
}

// Optimized minimax with transposition table memoization
function minimaxOptimized(board, depth, alpha, beta, isMaximizing, aiSide, phase, goatsPlaced, goatsCaptured) {
  // Terminal conditions
  if (depth === 0 || goatsCaptured >= 5) {
    return evaluateBoard(board, aiSide, phase, goatsPlaced, goatsCaptured);
  }
  
  // Check game over
  if (phase === PHASE.MOVEMENT) {
    let allTrapped = true;
    for (let i = 0; i < 25; i++) {
      if (board[i] === PIECE_TYPES.TIGER) {
        const moves = getValidMovesForState(i, board);
        if (moves.length > 0) {
          allTrapped = false;
          break;
        }
      }
    }
    if (allTrapped) return isMaximizing ? -10000 : 10000;
  }
  
  // Transposition table lookup
  const posHash = getBoardHash(board) + '_' + depth + '_' + isMaximizing;
  if (aiTranspositionTable.has(posHash)) {
    return aiTranspositionTable.get(posHash);
  }
  
  const currentPlayer = isMaximizing ? aiSide : (aiSide === PIECE_TYPES.TIGER ? PIECE_TYPES.GOAT : PIECE_TYPES.TIGER);
  
  if (isMaximizing) {
    let maxEval = -Infinity;
    const moves = getAllPossibleMoves(board, currentPlayer, phase, goatsPlaced);
    const orderedMoves = orderMovesByHeuristic(moves, currentPlayer);
    
    for (const move of orderedMoves) {
      const newState = applyMove(board, move, phase, goatsPlaced, goatsCaptured);
      const evaluation = minimaxOptimized(newState.board, depth - 1, alpha, beta, false, aiSide, newState.phase, newState.goatsPlaced, newState.goatsCaptured);
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break;
    }
    
    // Cache result
    if (aiTranspositionTable.size < TRANSPOSITION_TABLE_SIZE) {
      aiTranspositionTable.set(posHash, maxEval);
    }
    
    return maxEval;
  } else {
    let minEval = Infinity;
    const moves = getAllPossibleMoves(board, currentPlayer, phase, goatsPlaced);
    const orderedMoves = orderMovesByHeuristic(moves, currentPlayer);
    
    for (const move of orderedMoves) {
      const newState = applyMove(board, move, phase, goatsPlaced, goatsCaptured);
      const evaluation = minimaxOptimized(newState.board, depth - 1, alpha, beta, true, aiSide, newState.phase, newState.goatsPlaced, newState.goatsCaptured);
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    
    // Cache result
    if (aiTranspositionTable.size < TRANSPOSITION_TABLE_SIZE) {
      aiTranspositionTable.set(posHash, minEval);
    }
    
    return minEval;
  }
}

// Apply the computed best move to game state
function applyHardAIMove(bestMove, aiSide) {
  if (!gameStarted || gameState.gameOver) return;

  if (!bestMove) {
    checkWin();
    return;
  }
  
  saveState();
  
  if (bestMove.type === 'place') {
    gameState.board[bestMove.to] = PIECE_TYPES.GOAT;
    gameState.goatIdentities[bestMove.to] = getNextGoatFlag();
    gameState.goatsPlaced++;
    if (gameState.goatsPlaced === 20) {
      gameState.phase = PHASE.MOVEMENT;
    }
    gameState.currentPlayer = PIECE_TYPES.TIGER;
  } else {
    if (gameState.board[bestMove.from] === PIECE_TYPES.TIGER) {
      const tigerIdentity = gameState.tigerIdentities[bestMove.from];
      gameState.tigerIdentities[bestMove.to] = tigerIdentity;
      delete gameState.tigerIdentities[bestMove.from];
    } else if (gameState.board[bestMove.from] === PIECE_TYPES.GOAT) {
      const goatIdentity = gameState.goatIdentities[bestMove.from];
      gameState.goatIdentities[bestMove.to] = goatIdentity;
      delete gameState.goatIdentities[bestMove.from];
    }
    
    gameState.board[bestMove.to] = gameState.board[bestMove.from];
    gameState.board[bestMove.from] = PIECE_TYPES.EMPTY;
    
    if (bestMove.capture !== null) {
      gameState.board[bestMove.capture] = PIECE_TYPES.EMPTY;
      delete gameState.goatIdentities[bestMove.capture];
      gameState.goatsCaptured++;
      playSound('tigerCapture');
    }
    
    gameState.currentPlayer = aiSide === PIECE_TYPES.TIGER ? PIECE_TYPES.GOAT : PIECE_TYPES.TIGER;
  }
  
  const currentBoardHash = getBoardHash(gameState.board);
  positionHistory.push(currentBoardHash);
  
  if (positionHistory.length > MAX_POSITION_HISTORY) {
    positionHistory.shift();
  }
  
  playSound('pieceMove');
  updateUI();
  draw();
  console.log('=== Hard AI Move Complete (Optimized) ===');
  checkWin();
  onMoveMade();
}


// ===== ORIGINAL EASY AI =====

function executeAIMove() {
  console.log('executeAIMove called');
  const aiSide = playerSide === PIECE_TYPES.GOAT ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  console.log('executeAIMove - aiSide:', aiSide);
  
  if (aiSide === PIECE_TYPES.TIGER) {
    console.log('Calling executeAITigerMove');
    executeAITigerMove();
  } else {
    console.log('Calling executeAIGoatMove');
    executeAIGoatMove();
  }
}

// AI for tiger moves
function executeAITigerMove() {
  console.log('executeAITigerMove called');
  if (gameState.gameOver) return;

  const tigers = [];
  for (let i = 0; i < 25; i++) {
    if (gameState.board[i] === PIECE_TYPES.TIGER) {
      const moves = getValidMoves(i);
      if (moves.length > 0) {
        tigers.push({ index: i, moves });
      }
    }
  }

  console.log('Found tigers with moves:', tigers.length);

  if (tigers.length === 0) {
    checkWin();
    return;
  }

  // Prioritize captures
  for (const tiger of tigers) {
    const captureMoves = tiger.moves.filter(m => m.capture !== null);
    if (captureMoves.length > 0) {
      const move = captureMoves[0];
      saveState(); // Save state before AI move
      
      // Transfer tiger identity
      const tigerIdentity = gameState.tigerIdentities[tiger.index];
      gameState.board[move.to] = PIECE_TYPES.TIGER;
      gameState.tigerIdentities[move.to] = tigerIdentity;
      
      gameState.board[tiger.index] = PIECE_TYPES.EMPTY;
      delete gameState.tigerIdentities[tiger.index];
      
      gameState.board[move.capture] = PIECE_TYPES.EMPTY;
      delete gameState.goatIdentities[move.capture];
      gameState.goatsCaptured++;
      playSound('pieceMove');
      playSound('tigerCapture');
      gameState.currentPlayer = PIECE_TYPES.GOAT;
      
      updateUI();
      draw();
      checkWin();
      onMoveMade();
      return;
    }
  }

  // Otherwise, make a random move
  const randomTiger = tigers[Math.floor(Math.random() * tigers.length)];
  const randomMove = randomTiger.moves[Math.floor(Math.random() * randomTiger.moves.length)];
  saveState(); // Save state before AI move
  
  // Transfer tiger identity
  const tigerIdentity = gameState.tigerIdentities[randomTiger.index];
  gameState.board[randomMove.to] = PIECE_TYPES.TIGER;
  gameState.tigerIdentities[randomMove.to] = tigerIdentity;
  
  gameState.board[randomTiger.index] = PIECE_TYPES.EMPTY;
  delete gameState.tigerIdentities[randomTiger.index];
  
  playSound('pieceMove');
  gameState.currentPlayer = PIECE_TYPES.GOAT;

  updateUI();
  draw();
  checkWin();
}

// AI for goat moves
function executeAIGoatMove() {
  console.log('executeAIGoatMove called. Phase:', gameState.phase);
  if (gameState.gameOver) return;
  
  if (gameState.phase === PHASE.PLACEMENT) {
    console.log('Placement phase - placing goat');
    // Place goat on random empty spot
    const emptySpots = [];
    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === PIECE_TYPES.EMPTY) {
        emptySpots.push(i);
      }
    }
    
    console.log('Empty spots:', emptySpots.length);
    
    if (emptySpots.length > 0) {
      const randomSpot = emptySpots[Math.floor(Math.random() * emptySpots.length)];
      console.log('Placing goat at:', randomSpot);
      saveState(); // Save state before AI move
      gameState.board[randomSpot] = PIECE_TYPES.GOAT;
      gameState.goatIdentities[randomSpot] = getNextGoatFlag();
      gameState.goatsPlaced++;
      playSound('pieceMove');
      
      if (gameState.goatsPlaced === 20) {
        gameState.phase = PHASE.MOVEMENT;
      }
      
      gameState.currentPlayer = PIECE_TYPES.TIGER;
      console.log('Goat placed. Current player now:', gameState.currentPlayer);
    }
  } else {
    // Movement phase - move a random goat
    const goats = [];
    for (let i = 0; i < 25; i++) {
      if (gameState.board[i] === PIECE_TYPES.GOAT) {
        const moves = getValidMoves(i);
        if (moves.length > 0) {
          goats.push({ index: i, moves });
        }
      }
    }
    
    if (goats.length > 0) {
      const randomGoat = goats[Math.floor(Math.random() * goats.length)];
      const randomMove = randomGoat.moves[Math.floor(Math.random() * randomGoat.moves.length)];
      saveState(); // Save state before AI move
      
      gameState.board[randomMove.to] = PIECE_TYPES.GOAT;
      gameState.board[randomGoat.index] = PIECE_TYPES.EMPTY;
      playSound('pieceMove');
      gameState.currentPlayer = PIECE_TYPES.TIGER;
    }
  }
  
  updateUI();
  draw();
  checkWin();
}

// Get clicked position
function getClickedPosition(x, y) {
  const size = Math.min(canvas.width, canvas.height);
  const padding = size * 0.1;
  const cellSize = (size - 2 * padding) / (GRID_SIZE - 1);

  for (let i = 0; i < 25; i++) {
    const { row, col } = positions[i];
    const px = padding + col * cellSize;
    const py = padding + row * cellSize;
    const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
    
    if (distance < cellSize * 0.3) {
      return i;
    }
  }

  return -1;
}

// Drawing functions
function drawOctagonPath(x, y, radius) {
  const sides = 8;
  const startAngle = Math.PI / 8;
  ctx.beginPath();
  for (let side = 0; side < sides; side++) {
    const angle = startAngle + (side * Math.PI * 2) / sides;
    const pointX = x + Math.cos(angle) * radius;
    const pointY = y + Math.sin(angle) * radius;
    if (side === 0) {
      ctx.moveTo(pointX, pointY);
    } else {
      ctx.lineTo(pointX, pointY);
    }
  }
  ctx.closePath();
}

function draw() {
  const size = Math.min(canvas.width, canvas.height);

  // Board background matches the frosted steel-blue UI shell.
  const boardGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  boardGradient.addColorStop(0, '#7694b0');
  boardGradient.addColorStop(0.5, '#5f7892');
  boardGradient.addColorStop(1, '#4d657d');
  ctx.fillStyle = boardGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const boardGlow = ctx.createRadialGradient(
    canvas.width * 0.48,
    canvas.height * 0.42,
    0,
    canvas.width * 0.48,
    canvas.height * 0.42,
    canvas.width * 0.52
  );
  boardGlow.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  boardGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = boardGlow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const padding = size * 0.1;
  const cellSize = (size - 2 * padding) / (GRID_SIZE - 1);

  // Draw board lines
  ctx.strokeStyle = 'rgba(247, 251, 255, 0.86)';
  ctx.lineWidth = 2.6;

  // Horizontal and vertical lines
  for (let i = 0; i < GRID_SIZE; i++) {
    // Horizontal
    ctx.beginPath();
    ctx.moveTo(padding, padding + i * cellSize);
    ctx.lineTo(padding + (GRID_SIZE - 1) * cellSize, padding + i * cellSize);
    ctx.stroke();

    // Vertical
    ctx.beginPath();
    ctx.moveTo(padding + i * cellSize, padding);
    ctx.lineTo(padding + i * cellSize, padding + (GRID_SIZE - 1) * cellSize);
    ctx.stroke();
  }

  // Draw diagonals
  // Main diagonals from corners to center
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding + 4 * cellSize, padding + 4 * cellSize);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(padding + 4 * cellSize, padding);
  ctx.lineTo(padding, padding + 4 * cellSize);
  ctx.stroke();

  // Inner square diagonals
  ctx.beginPath();
  ctx.moveTo(padding + 2 * cellSize, padding);
  ctx.lineTo(padding + 4 * cellSize, padding + 2 * cellSize);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(padding + 4 * cellSize, padding + 2 * cellSize);
  ctx.lineTo(padding + 2 * cellSize, padding + 4 * cellSize);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(padding + 2 * cellSize, padding + 4 * cellSize);
  ctx.lineTo(padding, padding + 2 * cellSize);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(padding, padding + 2 * cellSize);
  ctx.lineTo(padding + 2 * cellSize, padding);
  ctx.stroke();

  // Draw valid move indicators
  if (gameState.validMoves.length > 0) {
    ctx.fillStyle = 'rgba(99, 204, 255, 0.28)';
    for (const move of gameState.validMoves) {
      const { row, col } = positions[move.to];
      const x = padding + col * cellSize;
      const y = padding + row * cellSize;
      
      ctx.beginPath();
      ctx.arc(x, y, cellSize * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw pieces
  for (let i = 0; i < 25; i++) {
    const { row, col } = positions[i];
    const x = padding + col * cellSize;
    const y = padding + row * cellSize;
    const piece = gameState.board[i];

    if (piece === PIECE_TYPES.TIGER) {
      const validMoves = getValidMoves(i);
      const isTrapped = validMoves.length === 0;
      
      const isSelected = gameState.selectedPiece === i;
      const isCurrentTurn = gameState.currentPlayer === PIECE_TYPES.TIGER;
      const chipRadius = cellSize * 0.4;
      
      // Black background chip for tigers
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#111111';
      drawOctagonPath(x, y, chipRadius);
      ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      
      // Draw tiger image clipped to a slightly smaller inner octagon
      const tigerImg = images.tigerPiece;
      const innerR = chipRadius * 0.82;
      if (tigerImg && tigerImg.complete) {
        ctx.save();
        drawOctagonPath(x, y, innerR);
        ctx.clip();
        if (isTrapped) { ctx.globalAlpha = 0.45; ctx.filter = 'grayscale(100%)'; }
        ctx.drawImage(tigerImg, x - innerR, y - innerR, innerR * 2, innerR * 2);
        if (isTrapped) { ctx.globalAlpha = 1.0; ctx.filter = 'none'; }
        ctx.restore();
      }
      
      // Border
      if (isSelected) {
        ctx.shadowColor = '#e9f3ff'; ctx.shadowBlur = 20;
        ctx.strokeStyle = '#f4f8ff'; ctx.lineWidth = 4;
      } else if (isCurrentTurn) {
        ctx.shadowColor = '#6fd4ff'; ctx.shadowBlur = 14;
        ctx.strokeStyle = '#6fd4ff'; ctx.lineWidth = 4;
      } else {
        ctx.strokeStyle = isTrapped ? '#69798b' : 'rgba(255,255,255,0.86)';
        ctx.lineWidth = 2;
      }
      drawOctagonPath(x, y, chipRadius);
      ctx.stroke();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      
      // Subtle shine overlay
      ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.beginPath();
      ctx.arc(x - chipRadius * 0.28, y - chipRadius * 0.32, chipRadius * 0.42, 0, Math.PI * 2);
      ctx.fill();
    } else if (piece === PIECE_TYPES.GOAT) {
      const isSelected = gameState.selectedPiece === i;
      const isCurrentTurn = gameState.currentPlayer === PIECE_TYPES.GOAT;
      const chipRadius = cellSize * 0.4;
      
      // White background chip for goats
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, chipRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      
      // Draw goat image clipped to a slightly smaller inner circle
      const goatImg = images.goatPiece;
      const goatInnerR = chipRadius * 0.82;
      if (goatImg && goatImg.complete) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, goatInnerR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(goatImg, x - goatInnerR, y - goatInnerR, goatInnerR * 2, goatInnerR * 2);
        ctx.restore();
      }
      
      // Border
      if (isSelected) {
        ctx.shadowColor = '#e9f7ff'; ctx.shadowBlur = 20;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
      } else if (isCurrentTurn) {
        ctx.shadowColor = '#5bc9ff'; ctx.shadowBlur = 14;
        ctx.strokeStyle = '#5bc9ff'; ctx.lineWidth = 4;
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
      }
      ctx.beginPath();
      ctx.arc(x, y, chipRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      
      // Subtle shine overlay
      ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.beginPath();
      ctx.arc(x - chipRadius * 0.28, y - chipRadius * 0.32, chipRadius * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  // Continuous animation loop
  requestAnimationFrame(draw);
}

// Update UI
function updateUI() {
  document.getElementById('tiger-captures').textContent = gameState.goatsCaptured;
  document.getElementById('goats-remaining').textContent = 20 - gameState.goatsPlaced;
  document.getElementById('tigers-trapped').textContent = countTrappedTigers() + ' / 4';

  const turnText = document.getElementById('turn-text');
  const phaseText = document.getElementById('phase-text');

  // Update turn text
  if (gameState.currentPlayer === PIECE_TYPES.TIGER) {
    turnText.textContent = 'Tiger';
  } else {
    turnText.textContent = 'Goat';
  }

  // Update phase text
  phaseText.textContent = gameState.phase === PHASE.PLACEMENT ? 
    'Placement Phase' : 'Movement Phase';

  // Update progress bars
  const captureProgress = document.getElementById('captureProgress');
  if (captureProgress) {
    captureProgress.style.width = (gameState.goatsCaptured / 5 * 100) + '%';
  }

  const placedProgress = document.getElementById('placedProgress');
  if (placedProgress) {
    placedProgress.style.width = (gameState.goatsPlaced / 20 * 100) + '%';
  }

  // Update tags
  const tigerTag = document.getElementById('tigerTag');
  if (tigerTag) {
    tigerTag.textContent = 'Captures: ' + gameState.goatsCaptured + ' / 5';
  }

  const goatTag = document.getElementById('goatTag');
  if (goatTag) {
    goatTag.textContent = 'Placed: ' + gameState.goatsPlaced + ' / 20';
  }
}

// Save current game state to history
function saveState() {
  const stateCopy = {
    board: [...gameState.board],
    currentPlayer: gameState.currentPlayer,
    phase: gameState.phase,
    goatsPlaced: gameState.goatsPlaced,
    goatsCaptured: gameState.goatsCaptured,
    tigerIdentities: {...gameState.tigerIdentities}
  };
  gameHistory.push(stateCopy);
  // Keep only last 5 moves
  if (gameHistory.length > 5) {
    gameHistory.shift();
  }
  // Reset to viewing current move when a new move is made
  currentMoveIndex = -1;
  updateMoveNavigation();
}

// Toggle viewing previous move

// Navigate to previous move
function prevMove() {
  if (currentMoveIndex === -1 && gameHistory.length === 0) return;
  
  if (currentMoveIndex === -1) {
    // Save current state first time
    savedGameState = {
      board: [...gameState.board],
      currentPlayer: gameState.currentPlayer,
      phase: gameState.phase,
      goatsPlaced: gameState.goatsPlaced,
      goatsCaptured: gameState.goatsCaptured,
      tigerIdentities: {...gameState.tigerIdentities},
      selectedPiece: gameState.selectedPiece,
      validMoves: [...gameState.validMoves]
    };
    currentMoveIndex = gameHistory.length - 1;
  } else if (currentMoveIndex > 0) {
    currentMoveIndex--;
  }
  
  if (currentMoveIndex >= 0) {
    const previousState = gameHistory[currentMoveIndex];
    gameState.board = [...previousState.board];
    gameState.currentPlayer = previousState.currentPlayer;
    gameState.phase = previousState.phase;
    gameState.goatsPlaced = previousState.goatsPlaced;
    gameState.goatsCaptured = previousState.goatsCaptured;
    gameState.tigerIdentities = {...previousState.tigerIdentities};
    gameState.selectedPiece = null;
    gameState.validMoves = [];
  }
  
  updateMoveNavigation();
  updateUI();
  draw();
}

// Navigate to next move
function nextMove() {
  if (savedGameState && currentMoveIndex !== -1) {
    if (currentMoveIndex < gameHistory.length - 1) {
      currentMoveIndex++;
      const previousState = gameHistory[currentMoveIndex];
      gameState.board = [...previousState.board];
      gameState.currentPlayer = previousState.currentPlayer;
      gameState.phase = previousState.phase;
      gameState.goatsPlaced = previousState.goatsPlaced;
      gameState.goatsCaptured = previousState.goatsCaptured;
      gameState.tigerIdentities = {...previousState.tigerIdentities};
      gameState.selectedPiece = null;
      gameState.validMoves = [];
    } else {
      // Return to current state
      currentMoveIndex = -1;
      gameState.board = [...savedGameState.board];
      gameState.currentPlayer = savedGameState.currentPlayer;
      gameState.phase = savedGameState.phase;
      gameState.goatsPlaced = savedGameState.goatsPlaced;
      gameState.goatsCaptured = savedGameState.goatsCaptured;
      gameState.tigerIdentities = {...savedGameState.tigerIdentities};
      gameState.selectedPiece = savedGameState.selectedPiece;
      gameState.validMoves = [...savedGameState.validMoves];
      savedGameState = null;
    }
  }
  
  updateMoveNavigation();
  updateUI();
  draw();
}

// Update move navigation UI
function updateMoveNavigation() {
  const container = document.getElementById('move-nav-container');
  if (!container) return;
  
  const prevBtn = document.getElementById('prev-move-btn');
  const nextBtn = document.getElementById('next-move-btn');
  const counter = document.getElementById('move-counter');
  
  // Show container only if game has started and there's history
  if (!gameStarted || gameHistory.length === 0) {
    container.classList.add('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  
  // Calculate display numbers (1-indexed from the end)
  const displayIndex = currentMoveIndex === -1 ? gameHistory.length : currentMoveIndex + 1;
  if (counter) {
    counter.textContent = `${displayIndex} / ${gameHistory.length}`;
  }
  
  // Disable prev button if at start
  if (prevBtn) {
    prevBtn.disabled = currentMoveIndex === 0;
  }
  
  // Disable next button if at current move
  if (nextBtn) {
    nextBtn.disabled = currentMoveIndex === -1;
  }
}

// Show/hide move navigation when game starts/ends
function toggleMoveNavigation(show) {
  const container = document.getElementById('move-nav-container');
  if (!container) return;
  
  if (show) {
    updateMoveNavigation();
  } else {
    container.classList.add('hidden');
    currentMoveIndex = -1;
    savedGameState = null;
  }
}

function buildWinnerPresentation(message, winner) {
  const playerWon = (winner === 'tiger' && playerSide === PIECE_TYPES.TIGER) ||
                    (winner === 'goat' && playerSide === PIECE_TYPES.GOAT);
  const winnerLabel = winner === 'tiger' ? 'Tiger' : 'Goat';

  if (gameMode === 'ai') {
    if (playerWon) {
      return {
        title: `${winnerLabel} Won!`,
        kicker: winner === 'tiger' ? 'Predator Prevails' : 'The Herd Holds',
        subtext: winner === 'tiger'
          ? 'A sharp finishing sequence let the tiger seize the final advantage.'
          : 'Disciplined positioning closed every escape and sealed the board for the goats.'
      };
    }

    return {
      title: winner === 'tiger' ? 'Defeat. Tiger Won.' : 'Defeat. Goat Won.',
      kicker: 'Match Lost',
      subtext: winner === 'tiger'
        ? 'Tiger found the decisive breakthrough and closed the match cleanly.'
        : 'Goat controlled the board patiently and converted the endgame without error.'
    };
  }

  return {
    title: message || `${winnerLabel} won the match.`,
    kicker: winner === 'tiger' ? 'Predator Prevails' : 'The Herd Holds',
    subtext: winner === 'tiger'
      ? 'A sharp finishing sequence let the tiger seize the final advantage.'
      : 'Disciplined positioning closed every escape and sealed the board for the goats.'
  };
}

// End game
function endGame(message, winner) {
  clearPendingAsyncActions();
  stopTimer();
  gameState.gameOver = true;
  playSound('winning');

  if (gameMode === 'multiplayer' && currentRoomId && db && !multiplayerService.isApplyingRoomSnapshot()) {
    multiplayerService.finalizeRoom({
      roomId: currentRoomId,
      winner,
      winnerMessage: message
    }).catch(err => console.error('[MP] Failed to finalize room:', err));
  }
  
  // Update user stats if logged in
  if (currentUser) {
    const playerWon = (winner === 'tiger' && playerSide === PIECE_TYPES.TIGER) || 
                      (winner === 'goat' && playerSide === PIECE_TYPES.GOAT);
    const side = playerSide === PIECE_TYPES.TIGER ? 'tiger' : 'goat';
    updateUserStats(playerWon, side);
  }
  
  const overlay = document.getElementById('winner-overlay');
  const winnerIcon = document.getElementById('winner-icon');
  const winnerText = document.getElementById('winner-text');
  const winnerKicker = document.getElementById('winner-kicker');
  const winnerSubtext = document.getElementById('winner-subtext');
  const presentation = buildWinnerPresentation(message, winner);
  overlay.dataset.winner = winner;

  // Display logos based on winner
  if (winner === 'tiger') {
    winnerIcon.innerHTML = `
      <div class="winner-logos">
        <img src="assets/bagh.png" class="winner-logo">
      </div>
    `;
  } else {
    winnerIcon.innerHTML = '<img src="assets/bhakhra.png" class="winner-logo-single">';
  }

  if (winnerKicker) winnerKicker.textContent = presentation.kicker;
  if (winnerSubtext) winnerSubtext.textContent = presentation.subtext;
  winnerText.textContent = presentation.title;
  overlay.classList.add('show');
  toggleMoveNavigation(false);
  
  // Reset the board behind the overlay so the next game starts from a clean state.
  pendingBoardResetTimeout = setTimeout(() => {
    pendingBoardResetTimeout = null;
    initGame({
      started: true,
      decorativeGoats: false,
      playStartSound: false,
      startTimer: false,
      autoAIMove: false
    });
    gameStarted = false; // Prevent clicks while overlay is active
    draw();
  }, 1000); // 1-second delay so they can briefly see the winning move before the board wipes
}

// Reset game
function resetGame() {
  showPlayerSelect();
}

// Event listeners
canvas.addEventListener('click', handleClick);

// Authentication event listeners (with safe checks)
const signInBtn = document.getElementById('sign-in-btn');
if (signInBtn) {
  signInBtn.addEventListener('click', () => {
    document.getElementById('signup-overlay').classList.add('show');
  });
}

const googleSigninBtn = document.getElementById('google-signin-btn');
if (googleSigninBtn) {
  googleSigninBtn.addEventListener('click', () => signInWithGoogle({
    auth,
    db,
    firebase,
    onUsernameSetupRequired: showUsernameSetup
  }));
}

const signOutBtn = document.getElementById('sign-out-btn');
if (signOutBtn) {
  signOutBtn.addEventListener('click', () => signOut({
    auth,
    beforeSignOut: async () => {
      stopRoomSyncListeners();
      currentRoomId = null;
      currentRoomCode = null;
    }
  }));
}

// Profile dropdown toggle
const profileBtn = document.getElementById('profile-btn');
if (profileBtn) {
  profileBtn.addEventListener('click', () => {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) {
      dropdown.classList.toggle('show');
    }
  });
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const profileMenu = document.getElementById('profile-menu');
  const dropdown = document.getElementById('profile-dropdown');
  if (profileMenu && !profileMenu.contains(e.target)) {
    dropdown.classList.remove('show');
  }
});

// Username setup form
const usernameForm = document.getElementById('username-form');
if (usernameForm) {
  usernameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('new-username');
    const errEl = document.getElementById('username-error');
    if (errEl) errEl.style.display = 'none';
    if (usernameInput) {
      const username = usernameInput.value.trim();
      if (username.length >= 3) {
        saveUsername({
          currentUser,
          db,
          firebase,
          username,
          onUsernameSaved: (cleanUsername) => {
            userStats.username = cleanUsername;
            hideUsernameSetup();
            updateUIForSignedInUser();
            startSocialListeners();
          },
          onUsernameError: (message) => {
            if (errEl) {
              errEl.textContent = message;
              errEl.style.display = 'block';
            }
          }
        });
      } else {
        if (errEl) { errEl.textContent = 'Username must be at least 3 characters.'; errEl.style.display = 'block'; }
      }
    }
  });
}

// ===== SOCIAL UI EVENT LISTENERS =====

// --- Notification bell ---
const notifBellBtn = document.getElementById('notif-bell');
if (notifBellBtn) {
  notifBellBtn.addEventListener('click', () => {
    document.getElementById('notif-overlay').classList.add('show');
    playSound('buttonClick');
  });
}

const notifCloseBtn = document.getElementById('notif-close');
if (notifCloseBtn) {
  notifCloseBtn.addEventListener('click', () => {
    document.getElementById('notif-overlay').classList.remove('show');
  });
}

// --- Friends nav button ---
const friendsNavBtnEl = document.getElementById('friends-nav-btn');
if (friendsNavBtnEl) {
  friendsNavBtnEl.addEventListener('click', () => {
    document.getElementById('friends-overlay').classList.add('show');
    switchFriendsTab('friends');
    playSound('buttonClick');
  });
}

const friendsCloseBtn = document.getElementById('friends-close');
if (friendsCloseBtn) {
  friendsCloseBtn.addEventListener('click', () => {
    document.getElementById('friends-overlay').classList.remove('show');
  });
}

// --- Friends overlay tabs ---
['friends', 'search', 'requests'].forEach(tab => {
  const btn = document.getElementById(`ftab-${tab}`);
  if (btn) btn.addEventListener('click', () => { switchFriendsTab(tab); playSound('buttonClick'); });
});

function switchFriendsTab(tab) {
  ['friends', 'search', 'requests'].forEach(t => {
    const btn = document.getElementById(`ftab-${t}`);
    const panel = document.getElementById(`ftab-${t}-content`);
    if (btn) btn.classList.toggle('active', t === tab);
    if (panel) panel.classList.toggle('hidden', t !== tab);
  });
}

// --- Friend search ---
const friendSearchBtn = document.getElementById('friend-search-btn');
if (friendSearchBtn) {
  friendSearchBtn.addEventListener('click', () => {
    const val = document.getElementById('friend-search-input').value;
    searchUser(val);
  });
}

const friendSearchInput = document.getElementById('friend-search-input');
if (friendSearchInput) {
  friendSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); searchUser(e.target.value); }
  });
}

// Close overlays on backdrop click
['friends-overlay', 'notif-overlay'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', (e) => {
      if (e.target === el) el.classList.remove('show');
    });
  }
});

// Sign up overlay close button
document.getElementById('signup-close').addEventListener('click', () => {
  document.getElementById('signup-overlay').classList.remove('show');
});

document.getElementById('play-again-btn').addEventListener('click', showPlayerSelect);
document.getElementById('exit-btn').addEventListener('click', exitToHome);

const prevMoveBtn = document.getElementById('prev-move-btn');
if (prevMoveBtn) {
  prevMoveBtn.addEventListener('click', prevMove);
}

const nextMoveBtn = document.getElementById('next-move-btn');
if (nextMoveBtn) {
  nextMoveBtn.addEventListener('click', nextMove);
}

// Welcome start button
document.getElementById('welcome-start-btn').addEventListener('click', () => {
  document.getElementById('player-select-overlay').classList.add('show');
  playSound('buttonClick');
});

// Welcome start button hover
document.getElementById('welcome-start-btn').addEventListener('mouseenter', () => {
  playSound('hover');
});

// Tutorial buttons (handle all instances)
document.querySelectorAll('#tutorial-btn, #footer-tutorial').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('tutorial-overlay').classList.add('show');
    playSound('buttonClick');
  });
  btn.addEventListener('mouseenter', () => {
    playSound('hover');
  });
});

// Tutorial close button
document.getElementById('tutorial-close').addEventListener('click', () => {
  document.getElementById('tutorial-overlay').classList.remove('show');
});

// Player selection close button
document.getElementById('player-select-close').addEventListener('click', () => {
  document.getElementById('player-select-overlay').classList.remove('show');
});

// Sign up overlay close button (safe check for optional element)
const signupClose = document.getElementById('signup-close');
if (signupClose) {
  signupClose.addEventListener('click', () => {
    document.getElementById('signup-overlay').classList.remove('show');
  });
}

// Tutorial start playing button
const tutorialStart = document.getElementById('tutorial-start');
if (tutorialStart) {
  tutorialStart.addEventListener('click', () => {
    document.getElementById('tutorial-overlay').classList.remove('show');
    document.getElementById('player-select-overlay').classList.add('show');
  });
}

// About buttons (handle all instances)
document.querySelectorAll('#about-btn, #footer-about').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('about-overlay').classList.add('show');
    playSound('buttonClick');
  });
  btn.addEventListener('mouseenter', () => {
    playSound('hover');
  });
});

// About close button
const aboutClose = document.getElementById('about-close');
if (aboutClose) {
  aboutClose.addEventListener('click', () => {
    document.getElementById('about-overlay').classList.remove('show');
  });
}

// About start playing button
const aboutStart = document.getElementById('about-start');
if (aboutStart) {
  aboutStart.addEventListener('click', () => {
    document.getElementById('about-overlay').classList.remove('show');
    document.getElementById('player-select-overlay').classList.add('show');
  });
}

// Difficulty selection
const difficultyButtons = document.querySelectorAll('.difficulty-btn');
difficultyButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    // Remove active class from all buttons
    difficultyButtons.forEach(b => b.classList.remove('active'));
    // Add active class to clicked button
    btn.classList.add('active');
    // Set difficulty
    aiDifficulty = btn.dataset.difficulty;
    console.log('AI Difficulty set to:', aiDifficulty);
    playSound('buttonClick');
  });
  btn.addEventListener('mouseenter', () => {
    playSound('hover');
  });
});

// ===== MODE TABS =====
document.getElementById('mode-tab-ai').addEventListener('click', () => {
  gameMode = 'ai';
  document.getElementById('mode-tab-ai').classList.add('active');
  document.getElementById('mode-tab-player').classList.remove('active');
  document.getElementById('ai-tab-content').classList.remove('hidden');
  document.getElementById('multiplayer-section').classList.add('hidden');
  // Reset multiplayer UI state
  resetMultiplayerUI();
  playSound('buttonClick');
});

document.getElementById('mode-tab-player').addEventListener('click', () => {
  gameMode = 'multiplayer';
  document.getElementById('mode-tab-player').classList.add('active');
  document.getElementById('mode-tab-ai').classList.remove('active');
  document.getElementById('ai-tab-content').classList.add('hidden');
  document.getElementById('multiplayer-section').classList.remove('hidden');
  playSound('buttonClick');
});

function resetMultiplayerUI() {
  stopRoomSyncListeners();
  currentRoomId = null;
  currentRoomCode = null;
  multiplayerSide = null;
  document.querySelectorAll('#select-goat, #select-tiger').forEach(c => c.classList.remove('mp-selected'));
  const roomOptions = document.getElementById('room-options');
  const roomWaiting = document.getElementById('room-waiting');
  const roomCodeInput = document.getElementById('room-code-input');
  if (roomOptions) roomOptions.classList.remove('hidden');
  if (roomWaiting) roomWaiting.classList.add('hidden');
  if (roomCodeInput) roomCodeInput.value = '';
}

// ===== MULTIPLAYER SIDE SELECTION highlight =====
function highlightMPSide(side) {
  multiplayerSide = side;
  document.getElementById('select-goat').classList.toggle('mp-selected', side === PIECE_TYPES.GOAT);
  document.getElementById('select-tiger').classList.toggle('mp-selected', side === PIECE_TYPES.TIGER);
}

// ===== ROOM ACTIONS =====
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function sideToString(side) {
  return side === PIECE_TYPES.TIGER ? 'tiger' : 'goat';
}

// Create room button
const createRoomBtn = document.getElementById('create-room-btn');
if (createRoomBtn) {
  createRoomBtn.addEventListener('click', async () => {
    if (!currentUser || !db) {
      alert('Please sign in first to play multiplayer.');
      return;
    }
    if (!multiplayerSide) {
      // Pulse the side selection to hint user
      document.querySelector('.player-selection').style.animation = 'none';
      document.querySelector('.player-selection').offsetHeight; // reflow
      const mpHint = document.querySelector('.mp-hint');
      if (mpHint) {
        mpHint.textContent = '⬆ Pick a side first!';
        mpHint.style.color = 'var(--gold)';
      }
      return;
    }
    const code = generateRoomCode();
    const hostSide = sideToString(multiplayerSide);
    const guestSide = hostSide === 'tiger' ? 'goat' : 'tiger';

    try {
      const roomRef = db.collection('rooms').doc();
      const initial = buildInitialRoomState();
      await roomRef.set({
        roomCode: code,
        hostUid: currentUser.uid,
        guestUid: null,
        hostSide,
        guestSide,
        timeControl: '5m',
        status: 'waiting',
        ...initial,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      currentRoomId = roomRef.id;
      currentRoomCode = code;
      const roomCodeDisplay = document.getElementById('room-code-display');
      if (roomCodeDisplay) roomCodeDisplay.textContent = code;
      const roomOptions = document.getElementById('room-options');
      const roomWaiting = document.getElementById('room-waiting');
      if (roomOptions) roomOptions.classList.add('hidden');
      if (roomWaiting) roomWaiting.classList.remove('hidden');
      playSound('buttonClick');

      multiplayerService.startLobbyListener(roomRef, {
        onRoomReady: (room) => {
          startMultiplayerGame(roomRef.id, hostSide, room.timeControl || '5m');
        }
      });

      console.log('[Multiplayer] Room created:', code, 'Side:', hostSide);
    } catch (err) {
      console.error('[Multiplayer] Failed creating room:', err);
      alert('Failed to create room. Please try again.');
    }
  });
}

// Join room button
const joinRoomBtn = document.getElementById('join-room-btn');
if (joinRoomBtn) {
  joinRoomBtn.addEventListener('click', async () => {
    if (!currentUser || !db) {
      alert('Please sign in first to play multiplayer.');
      return;
    }
    if (!multiplayerSide) {
      const mpHint = document.querySelector('.mp-hint');
      if (mpHint) {
        mpHint.textContent = '⬆ Pick a side first!';
        mpHint.style.color = 'var(--gold)';
      }
      return;
    }
    const roomCodeInput = document.getElementById('room-code-input');
    const code = roomCodeInput ? roomCodeInput.value.trim().toUpperCase() : '';
    if (code.length < 4) {
      if (roomCodeInput) roomCodeInput.style.borderColor = 'var(--red, #e94560)';
      return;
    }
    if (roomCodeInput) roomCodeInput.style.borderColor = '';
    playSound('buttonClick');

    try {
      const wantedSide = sideToString(multiplayerSide);
      const snap = await db.collection('rooms')
        .where('roomCode', '==', code)
        .limit(1)
        .get();

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

      if (room.hostUid === currentUser.uid) {
        alert('You cannot join your own room from this account.');
        return;
      }

      if (room.guestSide !== wantedSide) {
        alert(`Host reserved ${room.hostSide.toUpperCase()}. Please pick ${room.guestSide.toUpperCase()} to join.`);
        return;
      }

      await db.collection('rooms').doc(roomDoc.id).set({
        guestUid: currentUser.uid,
        status: 'playing',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      currentRoomId = roomDoc.id;
      currentRoomCode = code;
      console.log('[Multiplayer] Joined room:', code, 'Side:', wantedSide);
      startMultiplayerGame(roomDoc.id, wantedSide, room.timeControl || '5m');
    } catch (err) {
      console.error('[Multiplayer] Failed joining room:', err);
      alert('Failed to join room. Check rules and try again.');
    }
  });
}

// Copy code button
const copyCodeBtn = document.getElementById('copy-code-btn');
if (copyCodeBtn) {
  copyCodeBtn.addEventListener('click', () => {
    const codeDisplay = document.getElementById('room-code-display');
    const code = codeDisplay ? codeDisplay.textContent : '';
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('copy-code-btn');
      if (btn) {
        btn.textContent = '✅ Copied';
        setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
      }
    });
  });
}

// Cancel room button
const cancelRoomBtn = document.getElementById('cancel-room-btn');
if (cancelRoomBtn) {
  cancelRoomBtn.addEventListener('click', async () => {
    try {
      if (db && currentRoomId) {
        const roomSnap = await db.collection('rooms').doc(currentRoomId).get();
        if (roomSnap.exists) {
          const room = roomSnap.data();
          if (room.hostUid === currentUser?.uid && room.status === 'waiting') {
            await db.collection('rooms').doc(currentRoomId).delete();
          }
        }
      }
    } catch (err) {
      console.error('[MP] Failed cancelling room:', err);
    }

    multiplayerService.stopLobbyListener();
    currentRoomId = null;
    currentRoomCode = null;
    resetMultiplayerUI();
    playSound('buttonClick');
  });
}

// Player selection
document.getElementById('select-goat').addEventListener('click', () => {
  if (gameMode === 'multiplayer') {
    highlightMPSide(PIECE_TYPES.GOAT);
    playSound('buttonClick');
    return;
  }
  playerSide = PIECE_TYPES.GOAT;
  gameStarted = true;
  isFirstAIMove = true;
  document.getElementById('player-select-overlay').classList.remove('show');
  initGame();
  playSound('buttonClick');
});

document.getElementById('select-goat').addEventListener('mouseenter', () => {
  playSound('hover');
});

document.getElementById('select-tiger').addEventListener('click', () => {
  if (gameMode === 'multiplayer') {
    highlightMPSide(PIECE_TYPES.TIGER);
    playSound('buttonClick');
    return;
  }
  playerSide = PIECE_TYPES.TIGER;
  gameStarted = true;
  isFirstAIMove = true;
  document.getElementById('player-select-overlay').classList.remove('show');
  initGame();
  playSound('buttonClick');
});

document.getElementById('select-tiger').addEventListener('mouseenter', () => {
  playSound('hover');
});

function exitToHome() {
  clearPendingAsyncActions();
  stopTimer();
  gameStarted = false;
  gameMode = 'ai';
  stopRoomSyncListeners();
  currentRoomId = null;
  currentRoomCode = null;
  document.getElementById('winner-overlay').classList.remove('show');
  document.getElementById('player-select-overlay').classList.remove('show');
  document.getElementById('welcome-screen').style.display = 'flex';
  document.getElementById('gameStatePanel').classList.add('hidden');
  document.getElementById('tigerPanel').classList.add('hidden');
  document.getElementById('goatPanel').classList.add('hidden');
  toggleMoveNavigation(false);
  resetMultiplayerUI();
  playSound('buttonClick');
}

function showPlayerSelect() {
  clearPendingAsyncActions();
  stopTimer();
  gameStarted = false;
  gameMode = 'ai';
  stopRoomSyncListeners();
  currentRoomId = null;
  currentRoomCode = null;
  document.getElementById('winner-overlay').classList.remove('show');
  document.getElementById('player-select-overlay').classList.add('show');
  toggleMoveNavigation(false);
  // Reset to AI mode tab
  document.getElementById('mode-tab-ai').classList.add('active');
  document.getElementById('mode-tab-player').classList.remove('active');
  document.getElementById('ai-tab-content').classList.remove('hidden');
  document.getElementById('multiplayer-section').classList.add('hidden');
  resetMultiplayerUI();
}

// Footer links
const footerSettings = document.getElementById('footer-settings');
if (footerSettings) {
  footerSettings.addEventListener('click', () => {
    const settingsOverlay = document.getElementById('settings-overlay');
    if (settingsOverlay) {
      settingsOverlay.classList.add('show');
    }
  });
}

// Resize canvas
function resizeCanvas() {
  const container = document.querySelector('.board-container');
  const size = Math.min(container.clientWidth - 80, 600);
  canvas.width = size;
  canvas.height = size;
  draw();
}

window.addEventListener('resize', resizeCanvas);

// Initialize
initAudioSystem();
initGame();
resizeCanvas();
draw(); // Ensure initial draw even if images haven't loaded yet

// Initialize auth UI on page load
updateUIForSignedOutUser();
