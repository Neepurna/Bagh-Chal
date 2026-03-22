// Bagh Chal Game Logic

// ===== FIREBASE AUTHENTICATION =====
// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCwZWRiXb_KwyNpUcQUfRNJQvQyf-o6x5g",
  authDomain: "baghchal-26da2.firebaseapp.com",
  projectId: "baghchal-26da2",
  storageBucket: "baghchal-26da2.firebasestorage.app",
  messagingSenderId: "342367298445",
  appId: "1:342367298445:web:b30dc206c09e73ab24d3c4",
  measurementId: "G-6VR5DSX8CT"
};

// Initialize Firebase
let auth, db;
let currentUser = null;
let userStats = { gamesPlayed: 0, tigerWins: 0, goatWins: 0 };

try {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
}

// Auth state observer
if (auth) {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      console.log('User signed in:', user.email);
      await loadUserData(user);
      updateUIForSignedInUser();
    } else {
      currentUser = null;
      console.log('User signed out');
      updateUIForSignedOutUser();
    }
  });
}

// Sign in with Google
async function signInWithGoogle() {
  console.log('signInWithGoogle called');
  if (!auth) {
    console.error('Firebase auth not initialized');
    alert('Authentication service not available. Please refresh the page.');
    return;
  }
  
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    console.log('Starting Google sign-in popup...');
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    console.log('Sign-in successful:', user.email);
    
    // Close the sign-in overlay
    const signupOverlay = document.getElementById('signup-overlay');
    if (signupOverlay) {
      signupOverlay.classList.remove('show');
    }
    
    // Check if user needs to set username
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
      console.log('New user - showing username setup');
      // New user - show username setup
      showUsernameSetup();
    }
  } catch (error) {
    console.error('Sign-in error:', error);
    alert('Failed to sign in with Google: ' + error.message);
  }
}

// Load user data from Firestore
async function loadUserData(user) {
  if (!db) return;
  
  try {
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      userStats = {
        gamesPlayed: data.gamesPlayed || 0,
        tigerWins: data.tigerWins || 0,
        goatWins: data.goatWins || 0,
        username: data.username || user.displayName || 'Player'
      };

      // Backfill username index for older accounts that predate usernames/{username}
      if (data.username) {
        const clean = String(data.username).trim().toLowerCase();
        const idxRef = db.collection('usernames').doc(clean);
        const idxSnap = await idxRef.get();
        if (!idxSnap.exists) {
          await idxRef.set({ uid: user.uid }).catch(() => {});
        }
      }
    } else {
      userStats = { gamesPlayed: 0, tigerWins: 0, goatWins: 0, username: user.displayName || 'Player' };
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

// Save username for new user — enforces uniqueness via usernames/{username} index
async function saveUsername(username) {
  if (!currentUser || !db) return;
  const clean = username.trim().toLowerCase();

  // Check uniqueness
  const existing = await db.collection('usernames').doc(clean).get();
  if (existing.exists) {
    const errEl = document.getElementById('username-error');
    if (errEl) { errEl.textContent = '❌ Username already taken — try another.'; errEl.style.display = 'block'; }
    return;
  }

  try {
    const batch = db.batch();
    batch.set(db.collection('users').doc(currentUser.uid), {
      username: clean,
      displayUsername: username.trim(),
      email: currentUser.email,
      photoURL: currentUser.photoURL || '',
      gamesPlayed: 0,
      tigerWins: 0,
      goatWins: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.set(db.collection('usernames').doc(clean), { uid: currentUser.uid });
    await batch.commit();
    userStats.username = clean;
    hideUsernameSetup();
    updateUIForSignedInUser();
    startSocialListeners();
  } catch (error) {
    console.error('Error saving username:', error);
    const errEl = document.getElementById('username-error');
    if (errEl) { errEl.textContent = '❌ Error saving — try again.'; errEl.style.display = 'block'; }
  }
}

// ===== SOCIAL LISTENERS (start after login) =====
let unsubFriends = null;
let unsubNotifs = null;
let pendingChallengeId = null;

function startSocialListeners() {
  if (!currentUser || !db) return;
  stopSocialListeners();
  listenFriends();
  listenNotifications();
}

function stopSocialListeners() {
  if (unsubFriends) { unsubFriends(); unsubFriends = null; }
  if (unsubNotifs) { unsubNotifs(); unsubNotifs = null; }
}

// ===== SEARCH USER =====
async function searchUser(username) {
  const resultsEl = document.getElementById('search-results');
  resultsEl.innerHTML = '<p class="friends-empty">Searching…</p>';
  const clean = username.trim().toLowerCase();
  if (!clean) { resultsEl.innerHTML = ''; return; }

  try {
    let uid = null;
    let data = null;

    // Fast path: usernames index
    const snap = await db.collection('usernames').doc(clean).get();
    if (snap.exists) {
      uid = snap.data().uid;
      const userSnap = await db.collection('users').doc(uid).get();
      data = userSnap.exists ? userSnap.data() : null;
    }

    // Fallback for legacy users missing usernames index or mixed-case usernames
    if (!uid || !data) {
      const legacySnap = await db.collection('users').limit(200).get();
      const hit = legacySnap.docs.find(doc => {
        const u = doc.data() || {};
        const u1 = (u.username || '').toString().trim().toLowerCase();
        const u2 = (u.displayUsername || '').toString().trim().toLowerCase();
        return u1 === clean || u2 === clean;
      });

      if (hit) {
        uid = hit.id;
        data = hit.data();
      }
    }

    if (!uid || !data) {
      resultsEl.innerHTML = '<p class="friends-empty">No user found with that username.</p>';
      return;
    }

    if (uid === currentUser.uid) {
      resultsEl.innerHTML = '<p class="friends-empty">That\'s you! 😄</p>';
      return;
    }

    // Check existing friend status
    const friendSnap = await db.collection('friends').doc(currentUser.uid).collection('list').doc(uid).get();
    let actionHtml = '';
    if (friendSnap.exists) {
      const st = friendSnap.data().status;
      if (st === 'accepted') actionHtml = `<button class="fa-btn already">✓ Friends</button>`;
      else if (st === 'pending') actionHtml = `<button class="fa-btn pending">Pending…</button>`;
    } else {
      actionHtml = `<button class="fa-btn add" onclick="sendFriendRequest('${uid}','${data.displayUsername || data.username || 'Player'}')">+ Add Friend</button>`;
    }

    resultsEl.innerHTML = `
      <div class="friend-row">
        <div class="friend-avatar">${data.photoURL ? `<img src="${data.photoURL}">` : '👤'}</div>
        <div class="friend-info">
          <div class="friend-name">${data.displayUsername || data.username || 'Player'}</div>
          <div class="friend-sub">@${data.username || 'user'}</div>
        </div>
        <div class="friend-actions">${actionHtml}</div>
      </div>`;
  } catch (err) {
    console.error('searchUser error:', err);
    resultsEl.innerHTML = '<p class="friends-empty">Search failed. Please try again.</p>';
  }
}

// ===== SEND FRIEND REQUEST =====
async function sendFriendRequest(toUid, toUsername) {
  if (!currentUser || !db) return;
  const batch = db.batch();
  // Mark in sender's list as pending
  batch.set(db.collection('friends').doc(currentUser.uid).collection('list').doc(toUid), {
    status: 'pending', direction: 'sent', username: toUsername, addedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  // Create notification for recipient
  batch.set(db.collection('notifications').doc(toUid).collection('items').doc(), {
    type: 'friend_request',
    from: currentUser.uid,
    fromUsername: userStats.username,
    fromDisplay: userStats.username,
    fromPhoto: currentUser.photoURL || '',
    status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await batch.commit();
  // Refresh search results
  document.getElementById('friend-search-btn').click();
}

// ===== ACCEPT FRIEND REQUEST =====
async function acceptFriendRequest(fromUid, fromUsername, notifId) {
  if (!currentUser || !db) return;
  try {
    const batch = db.batch();

    // Mark accepted in CURRENT user's own friend list (allowed by rules)
    batch.set(db.collection('friends').doc(currentUser.uid).collection('list').doc(fromUid), {
      status: 'accepted',
      username: fromUsername,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Remove incoming request notification
    batch.delete(db.collection('notifications').doc(currentUser.uid).collection('items').doc(notifId));

    // Notify requester so they can mark their own side as accepted
    batch.set(db.collection('notifications').doc(fromUid).collection('items').doc(), {
      type: 'friend_accepted',
      from: currentUser.uid,
      fromUsername: userStats.username,
      fromPhoto: currentUser.photoURL || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
  } catch (error) {
    console.error('acceptFriendRequest error:', error);
    alert('Could not accept request. Please try again.');
  }
}

// ===== DECLINE FRIEND REQUEST =====
async function declineFriendRequest(fromUid, notifId) {
  if (!currentUser || !db) return;
  await db.collection('notifications').doc(currentUser.uid).collection('items').doc(notifId).delete();
}

// ===== LISTEN TO FRIENDS =====
function listenFriends() {
  if (!currentUser || !db) return;
  unsubFriends = db.collection('friends').doc(currentUser.uid).collection('list')
    .where('status', '==', 'accepted')
    .onSnapshot(snap => {
      renderFriendsList(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    });
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
  if (!currentUser || !db) return;

  const selectedChallengerSide = challengeSide === 'random'
    ? (Math.random() > 0.5 ? 'tiger' : 'goat')
    : challengeSide;
  const opponentSide = selectedChallengerSide === 'tiger' ? 'goat' : 'tiger';
  const notifRef = db.collection('notifications').doc(challengeTargetUid).collection('items').doc();
  pendingChallengeId = notifRef.id;

  await notifRef.set({
    type: 'challenge',
    from: currentUser.uid,
    fromUsername: userStats.username,
    fromPhoto: currentUser.photoURL || '',
    challengerSide: selectedChallengerSide,
    opponentSide: opponentSide,       // opponent plays this
    challengeTime: challengeTime,
    challengeId: pendingChallengeId,
    status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Update overlay to show waiting
  const overlay = document.getElementById('challenge-sent-overlay');
  document.getElementById('challenge-sent-text').textContent = '⚔️ Challenge sent!';
  document.getElementById('challenge-sent-sub').innerHTML = `<strong>${challengeTargetName}</strong> plays as ${opponentSide} — you play as ${selectedChallengerSide} · ${challengeTime}`;
  overlay.querySelector('.waiting-spinner').style.display = '';
}

document.getElementById('cancel-challenge-btn').addEventListener('click', async () => {
  document.getElementById('challenge-sent-overlay').classList.remove('show');
  // Clean up the pending challenge notification if still pending
  if (pendingChallengeId && challengeTargetUid) {
    await db.collection('notifications').doc(challengeTargetUid).collection('items').doc(pendingChallengeId).delete().catch(() => {});
    pendingChallengeId = null;
  }
});

// ===== LISTEN TO NOTIFICATIONS =====
function listenNotifications() {
  if (!currentUser || !db) return;
  unsubNotifs = db.collection('notifications').doc(currentUser.uid).collection('items')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Auto-finalize sender side when a friend_accepted notification arrives
      items.filter(n => n.type === 'friend_accepted').forEach(n => {
        db.collection('friends').doc(currentUser.uid).collection('list').doc(n.from).set({
          status: 'accepted',
          username: n.fromUsername || 'Friend',
          addedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(err => console.error('friend_accepted sync error:', err));
      });

      renderNotifications(items);
      updateNotifBadge(items);

      // Auto-handle accepted challenges (room created by opponent)
      items.filter(n => n.type === 'challenge_accepted').forEach(n => {
        handleChallengeAccepted(n);
      });
    });
}

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
  await db.collection('notifications').doc(currentUser.uid).collection('items').doc(notifId).delete();
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
  if (!currentUser || !db) return;
  // Create room
  const roomRef = db.collection('rooms').doc();
  const roomId = roomRef.id;
  const initial = buildInitialRoomState();

  await roomRef.set({
    hostUid: challengerUid,
    guestUid: currentUser.uid,
    hostSide: theirSide,
    guestSide: mySide,
    timeControl: challengeTimeSelected,
    status: 'playing',
    ...initial,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Notify challenger that challenge was accepted, include roomId
  await db.collection('notifications').doc(challengerUid).collection('items').doc().set({
    type: 'challenge_accepted',
    from: currentUser.uid,
    fromUsername: userStats.username,
    roomId: roomId,
    mySide: theirSide,
    challengeTime: challengeTimeSelected,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Remove challenge notification
  await db.collection('notifications').doc(currentUser.uid).collection('items').doc(notifId).delete();

  // Start game for this player
  document.getElementById('notif-overlay').classList.remove('show');
  startMultiplayerGame(roomId, mySide, challengeTimeSelected);
}

async function declineChallenge(notifId, challengerUid) {
  await db.collection('notifications').doc(currentUser.uid).collection('items').doc(notifId).delete();
  // Optionally notify challenger
  await db.collection('notifications').doc(challengerUid).collection('items').doc().set({
    type: 'challenge_declined',
    from: currentUser.uid,
    fromUsername: userStats.username,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function handleChallengeAccepted(notif) {
  // Close challenge-sent overlay, start game
  document.getElementById('challenge-sent-overlay').classList.remove('show');
  pendingChallengeId = null;
  // Remove this notification
  db.collection('notifications').doc(currentUser.uid).collection('items').doc(notif.id).delete();
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

  document.getElementById('room-options').classList.add('hidden');
  document.getElementById('room-waiting').classList.add('hidden');
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

// Sign out
async function signOut() {
  if (!auth) return;
  
  try {
    stopRoomSyncListeners();
    currentRoomId = null;
    currentRoomCode = null;
    await auth.signOut();
  } catch (error) {
    console.error('Sign-out error:', error);
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

// Audio system
const soundUrls = {
  newGame:      '/music/newgamestart.mp3',
  pieceMove:    '/music/Piece-Move.mp3',
  tigerCapture: '/music/tiger-points.mp3',
  winning:      '/music/winning-sound.mp3',
  hover:        '/music/hover.mp3',
  buttonClick:  '/music/click.mp3'
};

const soundCache = {};
let audioUnlocked = false;

function attemptAudioUnlock() {
  if (audioUnlocked) return;
  const hover = soundCache.hover;
  if (!hover) return;

  // Try to unlock audio playback as soon as the browser allows.
  hover.volume = 0;
  hover.play()
    .then(() => {
      hover.pause();
      hover.currentTime = 0;
      hover.volume = 1;
      audioUnlocked = true;
    })
    .catch(() => {
      hover.volume = 1;
    });
}

function initAudioSystem() {
  Object.entries(soundUrls).forEach(([name, url]) => {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.load();
    soundCache[name] = audio;
  });

  // Bind broad early-intent listeners so hover can work immediately after first user intent.
  ['pointerenter', 'mousemove', 'pointerdown', 'mousedown', 'keydown', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, attemptAudioUnlock, { passive: true });
  });
}

function playSound(name) {
  const base = soundCache[name];
  if (!base) return;

  const snd = base.cloneNode();
  snd.volume = name === 'hover' ? 0.8 : 1;
  snd.play().catch(() => {});
}

// Game Constants
const GRID_SIZE = 5;
const PIECE_TYPES = {
  EMPTY: 0,
  TIGER: 1,
  GOAT: 2
};

const PHASE = {
  PLACEMENT: 'placement',
  MOVEMENT: 'movement'
};

// Track which tiger image to use for each position
const tigerImages = [0, 1, 2, 3]; // Maps tiger index to image index

// Player settings
let playerSide = null; // Will be PIECE_TYPES.GOAT or PIECE_TYPES.TIGER
let gameMode = 'ai';   // 'ai' or 'multiplayer'
let multiplayerSide = null; // chosen side in multiplayer mode
let gameStarted = false;
let isFirstAIMove = true;
let aiDifficulty = 'easy'; // 'easy' or 'hard'

// Multiplayer room sync state
let currentRoomId = null;
let currentRoomCode = null;
let currentRoomUnsub = null;
let roomLobbyUnsub = null;
let isApplyingRoomSnapshot = false;

// Timer settings
let timerInterval = null;
let currentTime = 30; // 30 seconds per move
let multiplayerTimeControl = '5m';
const TIME_PER_MOVE = 30;
const TIME_INCREMENT = 3;

function getMultiplayerTurnSeconds() {
  if (multiplayerTimeControl === '3m') return 180;
  if (multiplayerTimeControl === '10m') return 600;
  if (multiplayerTimeControl === '5m') return 300;
  return Infinity; // 'infinite'
}

// AI Configuration
const AI_CONFIG = {
  easy: {
    depth: 0, // Random moves
    thinkTime: 300
  },
  hard: {
    tigerPlacementDepth: 1, // Tiger doesn't place, but for consistency
    tigerMovementDepth: 2,  // Tiger attacks - moderate depth
    goatPlacementDepth: 3,  // Goat defense needs planning - deeper search
    goatMovementDepth: 3,   // Goat defense critical - deeper search
    thinkTime: 500
  }
};

function stopRoomSyncListeners() {
  if (currentRoomUnsub) {
    currentRoomUnsub();
    currentRoomUnsub = null;
  }
  if (roomLobbyUnsub) {
    roomLobbyUnsub();
    roomLobbyUnsub = null;
  }
}

function buildInitialRoomState() {
  const board = Array(25).fill(PIECE_TYPES.EMPTY);
  board[0] = PIECE_TYPES.TIGER;
  board[4] = PIECE_TYPES.TIGER;
  board[20] = PIECE_TYPES.TIGER;
  board[24] = PIECE_TYPES.TIGER;

  return {
    board,
    currentPlayer: PIECE_TYPES.GOAT,
    phase: PHASE.PLACEMENT,
    goatsPlaced: 0,
    goatsCaptured: 0,
    goatIdentities: {},
    tigerIdentities: { '0': 0, '4': 1, '20': 2, '24': 3 }
  };
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
  if (!db || !currentRoomId || gameMode !== 'multiplayer' || isApplyingRoomSnapshot) return;
  await db.collection('rooms').doc(currentRoomId).set(getCurrentMultiplayerPayload(extra), { merge: true });
}

function applyRoomStateToLocal(roomData) {
  if (!roomData || !roomData.board) return;
  isApplyingRoomSnapshot = true;
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
  isApplyingRoomSnapshot = false;
  updateUI();
  draw();
}

function subscribeToRoom(roomId) {
  if (!db || !roomId) return;
  if (currentRoomUnsub) currentRoomUnsub();

  currentRoomUnsub = db.collection('rooms').doc(roomId).onSnapshot((snap) => {
    if (!snap.exists) return;
    const room = snap.data();

    if (room.board) {
      applyRoomStateToLocal(room);
    }

    if (room.status === 'finished' && room.winner && !gameState.gameOver) {
      const msg = room.winnerMessage || (room.winner === 'tiger' ? 'Opposition Wins!' : 'Governing Parties Win!');
      endGame(msg, room.winner);
    }
  }, (err) => {
    console.error('[MP] Room listener error:', err);
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

// History for viewing previous move
let gameHistory = [];
let isViewingPrevious = false;
let currentGameState = null;

// Position history to detect repetitions
let positionHistory = [];
const MAX_POSITION_HISTORY = 10; // Track last 10 positions

// Helper function to create board hash
function getBoardHash(board) {
  return board.join(',');
}

// Sequential goat flag counter (cycles through all 20 countries)
let goatFlagCounter = 0;
function getNextGoatFlag() {
  const idx = goatFlagCounter % 20;
  goatFlagCounter++;
  return idx;
}

// Board positions (x, y coordinates for 5x5 grid)
const positions = [];
for (let row = 0; row < GRID_SIZE; row++) {
  for (let col = 0; col < GRID_SIZE; col++) {
    positions.push({ row, col });
  }
}

// Initialize game
function initGame() {
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
  isViewingPrevious = false;
  currentGameState = null;
  updateViewPrevButton();
  
  // Clear position history
  positionHistory = [];

  // Reset goat flag counter
  goatFlagCounter = 0;

  // Place tigers at corners with their identities
  gameState.board[0] = PIECE_TYPES.TIGER;  // Top-left - Congress
  gameState.tigerIdentities[0] = 0;
  gameState.board[4] = PIECE_TYPES.TIGER;  // Top-right - Maoist
  gameState.tigerIdentities[4] = 1;
  gameState.board[20] = PIECE_TYPES.TIGER; // Bottom-left - RRP
  gameState.tigerIdentities[20] = 2;
  gameState.board[24] = PIECE_TYPES.TIGER; // Bottom-right - Surya
  gameState.tigerIdentities[24] = 3;

  // Add random goats for visual appeal on homepage (only if game hasn't started)
  if (!gameStarted) {
    const goatPositions = [6, 8, 12, 16, 18]; // Some strategic positions
    goatPositions.forEach((pos, index) => {
      gameState.board[pos] = PIECE_TYPES.GOAT;
      gameState.goatsPlaced++;
      gameState.goatIdentities[pos] = index % 20; // Cycle through country flags
    });
  }

  if (gameStarted) {
    playSound('newGame');
  }

  updateUI();
  draw();
  
  // Show/hide panels based on game state
  if (gameStarted) {
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('gameStatePanel').classList.remove('hidden');
    document.getElementById('tigerPanel').classList.remove('hidden');
    document.getElementById('goatPanel').classList.remove('hidden');
    startTimer();
  } else {
    document.getElementById('welcome-screen').style.display = 'flex';
    document.getElementById('gameStatePanel').classList.add('hidden');
    document.getElementById('tigerPanel').classList.add('hidden');
    document.getElementById('goatPanel').classList.add('hidden');
  }
  
  // If player is tiger, goats go first (AI mode only)
  if (gameStarted && gameMode === 'ai' && playerSide === PIECE_TYPES.TIGER) {
    setTimeout(() => aiMove(), getAIThinkingTime());
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
    ? 'Opposition Wins - Time Out!' 
    : 'Governing Parties Win - Time Out!';
  
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

// Get adjacent positions
function getAdjacent(index) {
  const { row, col } = positions[index];
  const adjacent = [];

  // Horizontal and vertical
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1]
  ];

  // Diagonals
  const diagonals = [
    [-1, -1], [-1, 1], [1, -1], [1, 1]
  ];

  // Check regular directions (always valid)
  for (const [dr, dc] of directions) {
    const newRow = row + dr;
    const newCol = col + dc;
    if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE) {
      adjacent.push(newRow * GRID_SIZE + newCol);
    }
  }

  // Check diagonals - check if diagonal line exists between two points
  for (const [dr, dc] of diagonals) {
    const newRow = row + dr;
    const newCol = col + dc;
    if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE) {
      if (isDiagonalConnected(row, col, newRow, newCol)) {
        adjacent.push(newRow * GRID_SIZE + newCol);
      }
    }
  }

  return adjacent;
}

// Check if two positions are connected by a diagonal line on the board
function isDiagonalConnected(r1, c1, r2, c2) {
  // Must be diagonal move (both row and col change by 1)
  if (Math.abs(r1 - r2) !== 1 || Math.abs(c1 - c2) !== 1) {
    return false;
  }

  // Main diagonal (top-left to bottom-right): row === col
  // Valid positions: (0,0)-(1,1)-(2,2)-(3,3)-(4,4)
  if (r1 === c1 && r2 === c2) {
    return true;
  }

  // Anti-diagonal (top-right to bottom-left): row + col === 4
  // Valid positions: (0,4)-(1,3)-(2,2)-(3,1)-(4,0)
  if (r1 + c1 === 4 && r2 + c2 === 4) {
    return true;
  }

  // Inner diamond diagonals connecting edge midpoints
  // The diamond connects: (0,2) ↔ (2,4) ↔ (4,2) ↔ (2,0) ↔ (0,2)
  
  // Define the edge midpoints
  const topMid = [0, 2];
  const rightMid = [2, 4];
  const bottomMid = [4, 2];
  const leftMid = [2, 0];
  
  // Helper to check if point matches coordinates
  const pointMatches = (r, c, point) => r === point[0] && c === point[1];
  
  // Check all diamond connections
  // Top-center (0,2) to Right-center (2,4): moves through (1,3)
  if ((pointMatches(r1, c1, [1, 3]) && pointMatches(r2, c2, topMid)) ||
      (pointMatches(r1, c1, topMid) && pointMatches(r2, c2, [1, 3])) ||
      (pointMatches(r1, c1, [1, 3]) && pointMatches(r2, c2, rightMid)) ||
      (pointMatches(r1, c1, rightMid) && pointMatches(r2, c2, [1, 3]))) {
    return true;
  }
  
  // Right-center (2,4) to Bottom-center (4,2): moves through (3,3)
  if ((pointMatches(r1, c1, [3, 3]) && pointMatches(r2, c2, rightMid)) ||
      (pointMatches(r1, c1, rightMid) && pointMatches(r2, c2, [3, 3])) ||
      (pointMatches(r1, c1, [3, 3]) && pointMatches(r2, c2, bottomMid)) ||
      (pointMatches(r1, c1, bottomMid) && pointMatches(r2, c2, [3, 3]))) {
    return true;
  }
  
  // Bottom-center (4,2) to Left-center (2,0): moves through (3,1)
  if ((pointMatches(r1, c1, [3, 1]) && pointMatches(r2, c2, bottomMid)) ||
      (pointMatches(r1, c1, bottomMid) && pointMatches(r2, c2, [3, 1])) ||
      (pointMatches(r1, c1, [3, 1]) && pointMatches(r2, c2, leftMid)) ||
      (pointMatches(r1, c1, leftMid) && pointMatches(r2, c2, [3, 1]))) {
    return true;
  }
  
  // Left-center (2,0) to Top-center (0,2): moves through (1,1)
  if ((pointMatches(r1, c1, [1, 1]) && pointMatches(r2, c2, leftMid)) ||
      (pointMatches(r1, c1, leftMid) && pointMatches(r2, c2, [1, 1])) ||
      (pointMatches(r1, c1, [1, 1]) && pointMatches(r2, c2, topMid)) ||
      (pointMatches(r1, c1, topMid) && pointMatches(r2, c2, [1, 1]))) {
    return true;
  }

  return false;
}

// Get valid moves for a piece
function getValidMoves(index) {
  const piece = gameState.board[index];
  const moves = [];

  if (piece === PIECE_TYPES.GOAT) {
    // Goats can only move to adjacent empty spots
    const adjacent = getAdjacent(index);
    for (const adj of adjacent) {
      if (gameState.board[adj] === PIECE_TYPES.EMPTY) {
        moves.push({ to: adj, capture: null });
      }
    }
  } else if (piece === PIECE_TYPES.TIGER) {
    // Tigers can move or capture
    const adjacent = getAdjacent(index);
    for (const adj of adjacent) {
      if (gameState.board[adj] === PIECE_TYPES.EMPTY) {
        // Regular move - only to directly adjacent empty position
        moves.push({ to: adj, capture: null });
      } else if (gameState.board[adj] === PIECE_TYPES.GOAT) {
        // Check if can capture (jump over goat)
        const { row: r1, col: c1 } = positions[index];
        const { row: r2, col: c2 } = positions[adj];
        const dr = r2 - r1;
        const dc = c2 - c1;
        const jumpRow = r2 + dr;
        const jumpCol = c2 + dc;
        
        // Validate jump position is within board
        if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE) {
          const jumpIndex = jumpRow * GRID_SIZE + jumpCol;
          
          // Must land on empty space
          if (gameState.board[jumpIndex] === PIECE_TYPES.EMPTY) {
            // Verify the jump follows a valid line on the board
            // The jump destination must be adjacent to the goat in the same direction
            const jumpAdjacent = getAdjacent(adj);
            if (jumpAdjacent.includes(jumpIndex)) {
              // Additional check: the tiger must be able to reach the goat position
              // This prevents invalid diagonal jumps
              moves.push({ to: jumpIndex, capture: adj });
            }
          }
        }
      }
    }
  }

  return moves;
}

// Check if tigers are trapped
function areTigersTrapped() {
  for (let i = 0; i < 25; i++) {
    if (gameState.board[i] === PIECE_TYPES.TIGER) {
      const moves = getValidMoves(i);
      if (moves.length > 0) {
        return false;
      }
    }
  }
  return true;
}

// Count how many tigers are trapped (have no valid moves)
function countTrappedTigers() {
  let trappedCount = 0;
  for (let i = 0; i < 25; i++) {
    if (gameState.board[i] === PIECE_TYPES.TIGER) {
      const moves = getValidMoves(i);
      if (moves.length === 0) {
        trappedCount++;
      }
    }
  }
  return trappedCount;
}

// Check if goats are trapped (rare case)
function areGoatsTrapped() {
  for (let i = 0; i < 25; i++) {
    if (gameState.board[i] === PIECE_TYPES.GOAT) {
      const moves = getValidMoves(i);
      if (moves.length > 0) {
        return false;
      }
    }
  }
  return true;
}

// Check win conditions
function checkWin() {
  // Tigers win by capturing 5 goats (can happen in any phase)
  if (gameState.goatsCaptured >= 5) {
    endGame('Opposition Wins!', 'tiger');
    return true;
  }

  // Goats win by trapping all tigers (only in movement phase)
  if (gameState.phase === PHASE.MOVEMENT && areTigersTrapped()) {
    endGame('Governing Parties Win!', 'goat');
    return true;
  }

  // Tigers win by trapping all goats (rare case, only in movement phase)
  if (gameState.phase === PHASE.MOVEMENT && gameState.goatsPlaced === 20 && areGoatsTrapped()) {
    endGame('Opposition Wins!', 'tiger');
    return true;
  }
  
  // Check if tigers trapped during placement (goats on board but can't move)
  if (gameState.phase === PHASE.PLACEMENT && gameState.goatsPlaced > 0 && areTigersTrapped()) {
    endGame('Governing Parties Win!', 'goat');
    return true;
  }

  return false;
}

// Handle board click
function handleClick(event) {
  if (gameState.gameOver || !gameStarted || isViewingPrevious) return;
  
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
            setTimeout(aiMove, getAIThinkingTime());
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
              setTimeout(aiMove, getAIThinkingTime());
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
              setTimeout(aiMove, getAIThinkingTime());
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
              setTimeout(aiMove, getAIThinkingTime());
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
  
  setTimeout(() => {
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
  const piece = board[index];
  if (piece === PIECE_TYPES.EMPTY) return [];
  
  const moves = [];
  const adjacent = getAdjacentForState(index, board);
  
  for (const adj of adjacent) {
    if (board[adj] === PIECE_TYPES.EMPTY) {
      moves.push({ from: index, to: adj, capture: null });
    } else if (piece === PIECE_TYPES.TIGER && board[adj] === PIECE_TYPES.GOAT) {
      // Check for capture - calculate jump position
      const { row: r1, col: c1 } = positions[index];
      const { row: r2, col: c2 } = positions[adj];
      const dr = r2 - r1;
      const dc = c2 - c1;
      const jumpRow = r2 + dr;
      const jumpCol = c2 + dc;
      
      if (jumpRow >= 0 && jumpRow < GRID_SIZE && jumpCol >= 0 && jumpCol < GRID_SIZE) {
        const jumpIndex = jumpRow * GRID_SIZE + jumpCol;
        
        if (board[jumpIndex] === PIECE_TYPES.EMPTY) {
          const jumpAdjacent = getAdjacentForState(adj, board);
          if (jumpAdjacent.includes(jumpIndex)) {
            moves.push({ from: index, to: jumpIndex, capture: adj });
          }
        }
      }
    }
  }
  
  return moves;
}

// Get adjacent positions for a given board state
function getAdjacentForState(index, board) {
  const pos = positions[index];
  const adjacent = [];
  
  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1], // orthogonal
    [-1, -1], [-1, 1], [1, -1], [1, 1] // diagonal
  ];
  
  for (const [dr, dc] of directions) {
    const newRow = pos.row + dr;
    const newCol = pos.col + dc;
    
    if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE) {
      const newIndex = newRow * GRID_SIZE + newCol;
      
      // Check if diagonal is valid
      if (Math.abs(dr) === 1 && Math.abs(dc) === 1) {
        if (isDiagonalConnected(pos.row, pos.col, newRow, newCol)) {
          adjacent.push(newIndex);
        }
      } else {
        adjacent.push(newIndex);
      }
    }
  }
  
  return adjacent;
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

// Execute hard AI move using minimax
function executeHardAIMove() {
  if (gameState.gameOver) return;
  
  console.log('=== Hard AI Move Start ===');
  const aiSide = playerSide === PIECE_TYPES.GOAT ? PIECE_TYPES.TIGER : PIECE_TYPES.GOAT;
  console.log('AI Side:', aiSide === PIECE_TYPES.TIGER ? 'TIGER' : 'GOAT');
  console.log('Phase:', gameState.phase);
  
  // Special handling for first goat placement - randomize among 5 safe positions
  if (aiSide === PIECE_TYPES.GOAT && gameState.phase === PHASE.PLACEMENT && gameState.goatsPlaced === 0) {
    console.log('First goat placement - using safe positions');
    const safePositions = [12, 2, 10, 14, 22]; // Center and 4 middle border positions
    const availableSafePositions = safePositions.filter(pos => gameState.board[pos] === PIECE_TYPES.EMPTY);
    
    if (availableSafePositions.length > 0) {
      const randomSafePos = availableSafePositions[Math.floor(Math.random() * availableSafePositions.length)];
      console.log('Placing first goat at safe position:', randomSafePos);
      
      saveState();
      gameState.board[randomSafePos] = PIECE_TYPES.GOAT;
      gameState.goatIdentities[randomSafePos] = getNextGoatFlag();
      gameState.goatsPlaced++;
      playSound('pieceMove');
      gameState.currentPlayer = PIECE_TYPES.TIGER;
      
      // Add position to history
      positionHistory.push(getBoardHash(gameState.board));
      if (positionHistory.length > MAX_POSITION_HISTORY) {
        positionHistory.shift();
      }
      
      updateUI();
      draw();
      checkWin();
      hideAIThinking();
      startTimer();
      return;
    }
  }
  
  const allMoves = getAllPossibleMoves(gameState.board, aiSide, gameState.phase, gameState.goatsPlaced);
  console.log('Total possible moves:', allMoves.length);
  
  if (allMoves.length === 0) {
    console.log('No moves available!');
    checkWin();
    return;
  }
  
  // Determine search depth based on AI side and phase
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
  
  console.log('Using search depth:', searchDepth);
  
  let bestMove = null;
  let bestScore = -Infinity;
  let alternativeMoves = []; // Track good alternative moves
  
  // Use minimax search for accurate play
  console.log('Evaluating moves with minimax...');
  for (let i = 0; i < allMoves.length; i++) {
    const move = allMoves[i];
    const newState = applyMove(gameState.board, move, gameState.phase, gameState.goatsPlaced, gameState.goatsCaptured);
    
    // Check if this position would repeat recent history
    const newBoardHash = getBoardHash(newState.board);
    const wouldRepeat = positionHistory.slice(-6).includes(newBoardHash); // Check last 6 positions
    
    // Use minimax to look ahead
    const score = minimax(
      newState.board, 
      searchDepth - 1, 
      -Infinity, 
      Infinity, 
      false, // Opponent's turn next
      aiSide, 
      newState.phase, 
      newState.goatsPlaced, 
      newState.goatsCaptured
    );
    
    // Penalize repetitive moves for Goat AI
    let adjustedScore = score;
    if (aiSide === PIECE_TYPES.GOAT && wouldRepeat) {
      adjustedScore -= 100; // Penalty for repetition
      console.log('Move would repeat position, applying penalty');
    }
    
    // Track alternative moves that are close to best
    if (adjustedScore > bestScore - 50 && !wouldRepeat) {
      alternativeMoves.push({ move, score: adjustedScore });
    }
    
    if (adjustedScore > bestScore) {
      bestScore = adjustedScore;
      bestMove = move;
    }
  }
  
  // If best move would cause repetition and we have alternatives, choose alternative
  if (aiSide === PIECE_TYPES.GOAT && alternativeMoves.length > 1) {
    // Sort alternatives by score
    alternativeMoves.sort((a, b) => b.score - a.score);
    
    // Check if the top alternative is different from best move
    const bestNewState = applyMove(gameState.board, bestMove, gameState.phase, gameState.goatsPlaced, gameState.goatsCaptured);
    const bestHash = getBoardHash(bestNewState.board);
    
    if (positionHistory.slice(-4).includes(bestHash)) {
      console.log('Choosing alternative move to avoid repetition');
      // Pick second or third best move to add variety
      const altIndex = Math.floor(Math.random() * Math.min(3, alternativeMoves.length));
      bestMove = alternativeMoves[altIndex].move;
      bestScore = alternativeMoves[altIndex].score;
    }
  }
  
  console.log('Best move selected with score:', bestScore);
  console.log('Move:', bestMove);
  
  // Apply the best move
  if (bestMove) {
    saveState();
    
    if (bestMove.type === 'place') {
      console.log('Placing goat at position:', bestMove.to);
      gameState.board[bestMove.to] = PIECE_TYPES.GOAT;
      gameState.goatIdentities[bestMove.to] = getNextGoatFlag();
      gameState.goatsPlaced++;
      if (gameState.goatsPlaced === 20) {
        gameState.phase = PHASE.MOVEMENT;
      }
      gameState.currentPlayer = PIECE_TYPES.TIGER;
    } else {
      console.log('Moving from', bestMove.from, 'to', bestMove.to);
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
        console.log('Captured piece at:', bestMove.capture);
        gameState.board[bestMove.capture] = PIECE_TYPES.EMPTY;
        delete gameState.goatIdentities[bestMove.capture];
        gameState.goatsCaptured++;
        playSound('tigerCapture');
      }
      
      gameState.currentPlayer = aiSide === PIECE_TYPES.TIGER ? PIECE_TYPES.GOAT : PIECE_TYPES.TIGER;
    }
    
    // Track position to detect repetitions
    const currentBoardHash = getBoardHash(gameState.board);
    positionHistory.push(currentBoardHash);
    
    // Keep only recent history
    if (positionHistory.length > MAX_POSITION_HISTORY) {
      positionHistory.shift();
    }
    
    playSound('pieceMove');
    updateUI();
    draw();
    console.log('=== Hard AI Move Complete ===');
    checkWin();
    onMoveMade();
  }
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

  // Clear canvas with solid background color
  ctx.fillStyle = '#141b2d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const padding = size * 0.1;
  const cellSize = (size - 2 * padding) / (GRID_SIZE - 1);

  // Draw board lines
  ctx.strokeStyle = '#4a5568';
  ctx.lineWidth = 2;

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
    ctx.fillStyle = 'rgba(78, 205, 196, 0.3)';
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
        ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 20;
        ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 4;
      } else if (isCurrentTurn) {
        ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 14;
        ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 4;
      } else {
        ctx.strokeStyle = isTrapped ? '#555' : 'rgba(255,255,255,0.7)';
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
        ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 20;
        ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 4;
      } else if (isCurrentTurn) {
        ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 14;
        ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 4;
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
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
    turnText.textContent = 'Opposition';
  } else {
    turnText.textContent = 'Governing Parties';
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
  // Keep only last move
  if (gameHistory.length > 1) {
    gameHistory.shift();
  }
  updateViewPrevButton();
}

// Toggle viewing previous move
function toggleViewPrevious() {
  if (gameHistory.length === 0 || gameState.gameOver) return;
  
  const btn = document.getElementById('view-prev-btn');
  
  if (!isViewingPrevious) {
    // Save current state and show previous
    currentGameState = {
      board: [...gameState.board],
      currentPlayer: gameState.currentPlayer,
      phase: gameState.phase,
      goatsPlaced: gameState.goatsPlaced,
      goatsCaptured: gameState.goatsCaptured,
      tigerIdentities: {...gameState.tigerIdentities},
      selectedPiece: gameState.selectedPiece,
      validMoves: [...gameState.validMoves]
    };
    
    const previousState = gameHistory[0];
    gameState.board = [...previousState.board];
    gameState.currentPlayer = previousState.currentPlayer;
    gameState.phase = previousState.phase;
    gameState.goatsPlaced = previousState.goatsPlaced;
    gameState.goatsCaptured = previousState.goatsCaptured;
    gameState.tigerIdentities = {...previousState.tigerIdentities};
    gameState.selectedPiece = null;
    gameState.validMoves = [];
    
    isViewingPrevious = true;
    btn.classList.add('viewing');
  } else {
    // Restore current state
    gameState.board = [...currentGameState.board];
    gameState.currentPlayer = currentGameState.currentPlayer;
    gameState.phase = currentGameState.phase;
    gameState.goatsPlaced = currentGameState.goatsPlaced;
    gameState.goatsCaptured = currentGameState.goatsCaptured;
    gameState.tigerIdentities = {...currentGameState.tigerIdentities};
    gameState.selectedPiece = currentGameState.selectedPiece;
    gameState.validMoves = [...currentGameState.validMoves];
    
    isViewingPrevious = false;
    btn.classList.remove('viewing');
  }
  
  updateUI();
  draw();
}

// Update view previous button state
function updateViewPrevButton() {
  const btn = document.getElementById('view-prev-btn');
  if (btn) {
    btn.disabled = gameHistory.length === 0 || gameState.gameOver;
    if (gameHistory.length === 0 || gameState.gameOver) {
      btn.classList.remove('viewing');
      isViewingPrevious = false;
    }
  }
}

// End game
function endGame(message, winner) {
  gameState.gameOver = true;
  playSound('winning');

  if (gameMode === 'multiplayer' && currentRoomId && db && !isApplyingRoomSnapshot) {
    db.collection('rooms').doc(currentRoomId).set({
      status: 'finished',
      winner,
      winnerMessage: message,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(err => console.error('[MP] Failed to finalize room:', err));
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

  // Display logos based on winner
  if (winner === 'tiger') {
    winnerIcon.innerHTML = `
      <div class="winner-logos">
        <img src="assets/Congress.png" class="winner-logo">
        <img src="assets/Maoist.png" class="winner-logo">
        <img src="assets/RRP.png" class="winner-logo">
        <img src="assets/Surya.png" class="winner-logo">
      </div>
    `;
  } else {
    winnerIcon.innerHTML = '<img src="assets/Ghanti.png" class="winner-logo-single">';
  }
  
  winnerText.textContent = message;
  overlay.classList.add('show');
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
  googleSigninBtn.addEventListener('click', signInWithGoogle);
}

const signOutBtn = document.getElementById('sign-out-btn');
if (signOutBtn) {
  signOutBtn.addEventListener('click', signOut);
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
        saveUsername(username);
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
['friends', 'search', 'requests', 'challenges'].forEach(tab => {
  const btn = document.getElementById(`ftab-${tab}`);
  if (btn) btn.addEventListener('click', () => { switchFriendsTab(tab); playSound('buttonClick'); });
});

function switchFriendsTab(tab) {
  ['friends', 'search', 'requests', 'challenges'].forEach(t => {
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
document.getElementById('view-prev-btn').addEventListener('click', toggleViewPrevious);

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
  document.getElementById('difficulty-section').style.display = '';
  document.getElementById('multiplayer-section').classList.add('hidden');
  // Reset multiplayer UI state
  resetMultiplayerUI();
  playSound('buttonClick');
});

document.getElementById('mode-tab-player').addEventListener('click', () => {
  gameMode = 'multiplayer';
  document.getElementById('mode-tab-player').classList.add('active');
  document.getElementById('mode-tab-ai').classList.remove('active');
  document.getElementById('difficulty-section').style.display = 'none';
  document.getElementById('multiplayer-section').classList.remove('hidden');
  playSound('buttonClick');
});

function resetMultiplayerUI() {
  stopRoomSyncListeners();
  currentRoomId = null;
  currentRoomCode = null;
  multiplayerSide = null;
  document.querySelectorAll('#select-goat, #select-tiger').forEach(c => c.classList.remove('mp-selected'));
  document.getElementById('room-options').classList.remove('hidden');
  document.getElementById('room-waiting').classList.add('hidden');
  document.getElementById('room-code-input').value = '';
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

document.getElementById('create-room-btn').addEventListener('click', async () => {
  if (!currentUser || !db) {
    alert('Please sign in first to play multiplayer.');
    return;
  }
  if (!multiplayerSide) {
    // Pulse the side selection to hint user
    document.querySelector('.player-selection').style.animation = 'none';
    document.querySelector('.player-selection').offsetHeight; // reflow
    document.querySelector('.mp-hint').textContent = '⬆ Pick a side first!';
    document.querySelector('.mp-hint').style.color = 'var(--gold)';
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
    document.getElementById('room-code-display').textContent = code;
    document.getElementById('room-options').classList.add('hidden');
    document.getElementById('room-waiting').classList.remove('hidden');
    playSound('buttonClick');

    if (roomLobbyUnsub) roomLobbyUnsub();
    roomLobbyUnsub = roomRef.onSnapshot((snap) => {
      if (!snap.exists) return;
      const room = snap.data();
      if (room.status === 'playing' && room.guestUid) {
        if (roomLobbyUnsub) {
          roomLobbyUnsub();
          roomLobbyUnsub = null;
        }
        startMultiplayerGame(roomRef.id, hostSide, room.timeControl || '5m');
      }
    }, (err) => {
      console.error('[MP] Lobby listener error:', err);
    });

    console.log('[Multiplayer] Room created:', code, 'Side:', hostSide);
  } catch (err) {
    console.error('[Multiplayer] Failed creating room:', err);
    alert('Failed to create room. Please try again.');
  }
});

document.getElementById('join-room-btn').addEventListener('click', async () => {
  if (!currentUser || !db) {
    alert('Please sign in first to play multiplayer.');
    return;
  }
  if (!multiplayerSide) {
    document.querySelector('.mp-hint').textContent = '⬆ Pick a side first!';
    document.querySelector('.mp-hint').style.color = 'var(--gold)';
    return;
  }
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (code.length < 4) {
    document.getElementById('room-code-input').style.borderColor = 'var(--red, #e94560)';
    return;
  }
  document.getElementById('room-code-input').style.borderColor = '';
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

document.getElementById('copy-code-btn').addEventListener('click', () => {
  const code = document.getElementById('room-code-display').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.getElementById('copy-code-btn');
    btn.textContent = '✅ Copied';
    setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
  });
});

document.getElementById('cancel-room-btn').addEventListener('click', async () => {
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

  if (roomLobbyUnsub) { roomLobbyUnsub(); roomLobbyUnsub = null; }
  currentRoomId = null;
  currentRoomCode = null;
  resetMultiplayerUI();
  playSound('buttonClick');
});

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

function showPlayerSelect() {
  gameStarted = false;
  gameMode = 'ai';
  stopRoomSyncListeners();
  currentRoomId = null;
  currentRoomCode = null;
  document.getElementById('winner-overlay').classList.remove('show');
  document.getElementById('player-select-overlay').classList.add('show');
  // Reset to AI mode tab
  document.getElementById('mode-tab-ai').classList.add('active');
  document.getElementById('mode-tab-player').classList.remove('active');
  document.getElementById('difficulty-section').style.display = '';
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
