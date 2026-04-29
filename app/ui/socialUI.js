// Social UI: search players, friend requests, notifications, challenges.
// Wires the friends/notifications overlays and exposes the handlers used by
// inline `onclick="..."` markup that the social service renders into the DOM.

import { playSound } from '../audio/audioSystem.js';
import { id, on, qsa, showOverlay, hideOverlay } from './dom.js';
import { state } from '../state/store.js';

let socialService = null;
let onStartMultiplayerGame = () => {};
let buildInitialRoomState = () => ({});

let challengeTargetUid = null;
let challengeTargetName = null;
let challengeSide = null;
let challengeTime = '5m';

export function configureSocialUI({
  service,
  startMultiplayerGame,
  buildInitialRoomState: initBuilder
}) {
  socialService = service;
  onStartMultiplayerGame = startMultiplayerGame;
  buildInitialRoomState = initBuilder;
}

export function startSocialListeners() {
  socialService?.startSocialListeners({
    onFriends: renderFriendsList,
    onNotifications: (items) => {
      renderNotifications(items);
      updateNotifBadge(items);
    },
    onChallengeAccepted: handleChallengeAccepted
  });
}

export function stopSocialListeners() {
  socialService?.stopSocialListeners();
}

// ── Friends list / search ─────────────────────────────────────────────────
async function searchUser(username) {
  const resultsEl = id('search-results');
  if (!resultsEl) return;
  resultsEl.innerHTML = '<p class="friends-empty">Searching…</p>';
  const result = await socialService.searchUser(username);

  if (result.status === 'empty') { resultsEl.innerHTML = ''; return; }
  if (result.status === 'not_found') { resultsEl.innerHTML = '<p class="friends-empty">No user found with that username.</p>'; return; }
  if (result.status === 'self') { resultsEl.innerHTML = "<p class=\"friends-empty\">That's you! 😄</p>"; return; }
  if (result.status === 'error' || result.status !== 'found') { resultsEl.innerHTML = '<p class="friends-empty">Search failed. Please try again.</p>'; return; }

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

async function sendFriendRequest(toUid, toUsername) {
  await socialService.sendFriendRequest(toUid, toUsername);
  id('friend-search-btn')?.click();
  void toUsername;
}

async function acceptFriendRequest(fromUid, fromUsername, notifId) {
  try {
    await socialService.acceptFriendRequest(fromUid, fromUsername, notifId);
  } catch (err) {
    console.error('acceptFriendRequest error:', err);
    alert('Could not accept request. Please try again.');
  }
}

async function declineFriendRequest(_fromUid, notifId) {
  await socialService.declineFriendRequest(notifId);
}

function renderFriendsList(friends) {
  const el = id('friends-list');
  if (!el) return;
  if (!friends.length) {
    el.innerHTML = '<p class="friends-empty">No friends yet — search for players to add!</p>';
    return;
  }
  el.innerHTML = friends.map((f) => `
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

// ── Challenge flow ────────────────────────────────────────────────────────
function openChallengeFlow(toUid, toUsername) {
  challengeTargetUid = toUid;
  challengeTargetName = toUsername;
  challengeSide = 'random';
  challengeTime = '5m';
  hideOverlay('friends-overlay');

  const overlay = id('challenge-sent-overlay');
  if (!overlay) return;
  const textEl = id('challenge-sent-text');
  if (textEl) textEl.textContent = `Challenge ${toUsername}`;
  const subEl = id('challenge-sent-sub');
  if (subEl) {
    subEl.innerHTML = `
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
  }
  const spinner = overlay.querySelector('.waiting-spinner');
  if (spinner) spinner.style.display = 'none';
  overlay.classList.add('show');
}

function selectChallengeSide(side) {
  challengeSide = side;
  ['tiger', 'goat', 'random'].forEach((s) => {
    id(`csp-${s}`)?.classList.toggle('active', s === side);
  });
}

function selectChallengeTime(time) {
  challengeTime = time;
  ['3m', '5m', '10m', 'infinite'].forEach((t) => {
    id(`ctime-${t}`)?.classList.toggle('active', t === time);
  });
}

async function sendChallenge() {
  const result = await socialService.sendChallenge({
    toUid: challengeTargetUid,
    selectedSide: challengeSide,
    challengeTime
  });
  if (!result) return;
  state.pendingChallengeId = result.challengeId;

  const overlay = id('challenge-sent-overlay');
  if (!overlay) return;
  const text = id('challenge-sent-text');
  const sub = id('challenge-sent-sub');
  if (text) text.textContent = '⚔️ Challenge sent!';
  if (sub) {
    sub.innerHTML = `<strong>${challengeTargetName}</strong> plays as ${result.opponentSide} — you play as ${result.challengerSide} · ${challengeTime}`;
  }
  const spinner = overlay.querySelector('.waiting-spinner');
  if (spinner) spinner.style.display = '';
}

async function dismissNotif(notifId) { await socialService.dismissNotif(notifId); }

async function acceptChallenge(notifId, challengerUid, challengerUsername, mySide, theirSide, challengeTimeSelected = '5m') {
  const result = await socialService.acceptChallenge({
    notifId, challengerUid, challengerUsername, mySide, theirSide, challengeTimeSelected, buildInitialRoomState
  });
  if (!result) return;
  hideOverlay('notif-overlay');
  onStartMultiplayerGame(result.roomId, mySide, challengeTimeSelected);
}

async function declineChallenge(notifId, challengerUid) {
  await socialService.declineChallenge({ notifId, challengerUid });
}

function handleChallengeAccepted(notif) {
  hideOverlay('challenge-sent-overlay');
  state.pendingChallengeId = null;
  socialService.dismissNotif(notif.id);
  onStartMultiplayerGame(notif.roomId, notif.mySide, notif.challengeTime || '5m');
}

// ── Notifications ─────────────────────────────────────────────────────────
function updateNotifBadge(items) {
  const reqCount = items.filter((n) => n.type === 'friend_request').length;
  const challCount = items.filter((n) => n.type === 'challenge').length;
  const actionableCount = reqCount + challCount;

  setBadge('notif-badge', actionableCount);
  setBadge('friend-req-badge', reqCount);
  setBadge('req-tab-badge', reqCount);
  setBadge('chall-tab-badge', challCount);
}

function setBadge(elementId, count) {
  const el = id(elementId);
  if (!el) return;
  el.textContent = count;
  el.classList.toggle('hidden', count === 0);
}

function renderNotifications(items) {
  const el = id('notif-list');
  if (!el) return;
  if (!items.length) { el.innerHTML = '<p class="friends-empty">No notifications</p>'; }
  else el.innerHTML = items.map(renderNotificationRow).join('');

  renderRequestsTab(items.filter((n) => n.type === 'friend_request'));
  renderChallengesTab(items.filter((n) => n.type === 'challenge'));
}

function renderNotificationRow(n) {
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
}

function renderRequestsTab(reqs) {
  const el = id('requests-list');
  if (!el) return;
  if (!reqs.length) { el.innerHTML = '<p class="friends-empty">No pending friend requests</p>'; return; }
  el.innerHTML = reqs.map((n) => `
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

function renderChallengesTab(challenges) {
  const el = id('challenges-list');
  if (!el) return;
  if (!challenges.length) { el.innerHTML = '<p class="friends-empty">No incoming challenges</p>'; return; }
  el.innerHTML = challenges.map((n) => {
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

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function switchFriendsTab(tab) {
  ['friends', 'search', 'requests'].forEach((t) => {
    id(`ftab-${t}`)?.classList.toggle('active', t === tab);
    id(`ftab-${t}-content`)?.classList.toggle('hidden', t !== tab);
  });
}

// ── Wire DOM events + window-level handlers ───────────────────────────────
export function initSocialUI() {
  on('notif-bell', 'click', () => { showOverlay('notif-overlay'); playSound('buttonClick'); });
  on('notif-close', 'click', () => hideOverlay('notif-overlay'));

  on('friends-nav-btn', 'click', () => {
    showOverlay('friends-overlay');
    switchFriendsTab('friends');
    playSound('buttonClick');
  });
  on('friends-close', 'click', () => hideOverlay('friends-overlay'));

  ['friends', 'search', 'requests'].forEach((tab) => {
    on(`ftab-${tab}`, 'click', () => { switchFriendsTab(tab); playSound('buttonClick'); });
  });

  on('friend-search-btn', 'click', () => {
    const input = id('friend-search-input');
    if (input) searchUser(input.value);
  });
  on('friend-search-input', 'keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); searchUser(e.target.value); }
  });

  // Close overlays on backdrop click
  ['friends-overlay', 'notif-overlay', 'coach-coming-soon-overlay'].forEach((overlayId) => {
    const el = id(overlayId);
    if (el) {
      el.addEventListener('click', (e) => {
        if (e.target === el) el.classList.remove('show');
      });
    }
  });

  on('cancel-challenge-btn', 'click', async () => {
    hideOverlay('challenge-sent-overlay');
    if (state.pendingChallengeId && challengeTargetUid) {
      await socialService.cancelPendingChallenge({ toUid: challengeTargetUid, pendingChallengeId: state.pendingChallengeId });
      state.pendingChallengeId = null;
    }
  });

  // Suppress unused-import lint
  void qsa;

  // Expose handlers used by inline `onclick=...` in dynamically rendered markup
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
}
