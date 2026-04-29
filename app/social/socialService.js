export function createSocialService({ firebase, getContext }) {
  let unsubFriends = null;
  let unsubNotifs = null;

  function getRequiredContext() {
    const context = getContext();
    if (!context?.currentUser || !context?.db) return null;
    return context;
  }

  function stopSocialListeners() {
    if (unsubFriends) { unsubFriends(); unsubFriends = null; }
    if (unsubNotifs) { unsubNotifs(); unsubNotifs = null; }
  }

  function startSocialListeners({ onFriends, onNotifications, onChallengeAccepted }) {
    const context = getRequiredContext();
    if (!context) return;

    stopSocialListeners();

    unsubFriends = context.db.collection('friends').doc(context.currentUser.uid).collection('list')
      .where('status', '==', 'accepted')
      .onSnapshot((snap) => {
        onFriends?.(snap.docs.map((doc) => ({ uid: doc.id, ...doc.data() })));
      });

    unsubNotifs = context.db.collection('notifications').doc(context.currentUser.uid).collection('items')
      .orderBy('createdAt', 'desc')
      .onSnapshot((snap) => {
        const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        items.filter((item) => item.type === 'friend_accepted').forEach((item) => {
          context.db.collection('friends').doc(context.currentUser.uid).collection('list').doc(item.from).set({
            status: 'accepted',
            username: item.fromUsername || 'Friend',
            addedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true }).catch((error) => console.error('friend_accepted sync error:', error));
        });

        onNotifications?.(items);
        items.filter((item) => item.type === 'challenge_accepted').forEach((item) => {
          onChallengeAccepted?.(item);
        });
      });
  }

  async function searchUser(username) {
    const context = getRequiredContext();
    if (!context) return { status: 'error' };

    const clean = username.trim().toLowerCase();
    if (!clean) return { status: 'empty' };

    try {
      let uid = null;
      let data = null;

      const snap = await context.db.collection('usernames').doc(clean).get();
      if (snap.exists) {
        uid = snap.data().uid;
        const userSnap = await context.db.collection('users').doc(uid).get();
        data = userSnap.exists ? userSnap.data() : null;
      }

      if (!uid || !data) {
        const legacySnap = await context.db.collection('users').limit(200).get();
        const hit = legacySnap.docs.find((doc) => {
          const user = doc.data() || {};
          const primary = (user.username || '').toString().trim().toLowerCase();
          const display = (user.displayUsername || '').toString().trim().toLowerCase();
          return primary === clean || display === clean;
        });

        if (hit) {
          uid = hit.id;
          data = hit.data();
        }
      }

      if (!uid || !data) {
        return { status: 'not_found' };
      }

      if (uid === context.currentUser.uid) {
        return { status: 'self' };
      }

      const friendSnap = await context.db.collection('friends').doc(context.currentUser.uid).collection('list').doc(uid).get();
      const friendStatus = friendSnap.exists ? friendSnap.data().status : null;

      return {
        status: 'found',
        uid,
        data,
        friendStatus
      };
    } catch (error) {
      console.error('searchUser error:', error);
      return { status: 'error' };
    }
  }

  async function sendFriendRequest(toUid, toUsername) {
    const context = getRequiredContext();
    if (!context) return;

    const batch = context.db.batch();
    batch.set(context.db.collection('friends').doc(context.currentUser.uid).collection('list').doc(toUid), {
      status: 'pending',
      direction: 'sent',
      username: toUsername,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    batch.set(context.db.collection('notifications').doc(toUid).collection('items').doc(), {
      type: 'friend_request',
      from: context.currentUser.uid,
      fromUsername: context.userStats.username,
      fromDisplay: context.userStats.username,
      fromPhoto: context.currentUser.photoURL || '',
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();
  }

  async function acceptFriendRequest(fromUid, fromUsername, notifId) {
    const context = getRequiredContext();
    if (!context) return;

    const batch = context.db.batch();
    batch.set(context.db.collection('friends').doc(context.currentUser.uid).collection('list').doc(fromUid), {
      status: 'accepted',
      username: fromUsername,
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    batch.delete(context.db.collection('notifications').doc(context.currentUser.uid).collection('items').doc(notifId));
    batch.set(context.db.collection('notifications').doc(fromUid).collection('items').doc(), {
      type: 'friend_accepted',
      from: context.currentUser.uid,
      fromUsername: context.userStats.username,
      fromPhoto: context.currentUser.photoURL || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();
  }

  async function declineFriendRequest(notifId) {
    const context = getRequiredContext();
    if (!context) return;
    await context.db.collection('notifications').doc(context.currentUser.uid).collection('items').doc(notifId).delete();
  }

  async function dismissNotif(notifId) {
    const context = getRequiredContext();
    if (!context) return;
    await context.db.collection('notifications').doc(context.currentUser.uid).collection('items').doc(notifId).delete();
  }

  async function sendChallenge({ toUid, selectedSide, challengeTime }) {
    const context = getRequiredContext();
    if (!context) return null;

    const challengerSide = selectedSide === 'random'
      ? (Math.random() > 0.5 ? 'tiger' : 'goat')
      : selectedSide;
    const opponentSide = challengerSide === 'tiger' ? 'goat' : 'tiger';
    const notifRef = context.db.collection('notifications').doc(toUid).collection('items').doc();

    await notifRef.set({
      type: 'challenge',
      from: context.currentUser.uid,
      fromUsername: context.userStats.username,
      fromPhoto: context.currentUser.photoURL || '',
      challengerSide,
      opponentSide,
      challengeTime,
      challengeId: notifRef.id,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return {
      challengeId: notifRef.id,
      challengerSide,
      opponentSide
    };
  }

  async function cancelPendingChallenge({ toUid, pendingChallengeId }) {
    const context = getRequiredContext();
    if (!context || !toUid || !pendingChallengeId) return;

    await context.db.collection('notifications').doc(toUid).collection('items').doc(pendingChallengeId).delete().catch(() => {});
  }

  async function acceptChallenge({
    notifId,
    challengerUid,
    challengerUsername,
    mySide,
    theirSide,
    challengeTimeSelected,
    buildInitialRoomState
  }) {
    const context = getRequiredContext();
    if (!context) return null;

    const roomRef = context.db.collection('rooms').doc();
    const roomId = roomRef.id;
    const initial = buildInitialRoomState();

    await roomRef.set({
      hostUid: challengerUid,
      hostUsername: challengerUsername || 'Player',
      guestUid: context.currentUser.uid,
      guestUsername: context.userStats?.username || 'Player',
      hostSide: theirSide,
      guestSide: mySide,
      timeControl: challengeTimeSelected,
      status: 'playing',
      ...initial,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await context.db.collection('notifications').doc(challengerUid).collection('items').doc().set({
      type: 'challenge_accepted',
      from: context.currentUser.uid,
      fromUsername: context.userStats.username,
      roomId,
      mySide: theirSide,
      challengeTime: challengeTimeSelected,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await context.db.collection('notifications').doc(context.currentUser.uid).collection('items').doc(notifId).delete();

    return { roomId };
  }

  async function declineChallenge({ notifId, challengerUid }) {
    const context = getRequiredContext();
    if (!context) return;

    await context.db.collection('notifications').doc(context.currentUser.uid).collection('items').doc(notifId).delete();
    await context.db.collection('notifications').doc(challengerUid).collection('items').doc().set({
      type: 'challenge_declined',
      from: context.currentUser.uid,
      fromUsername: context.userStats.username,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  return {
    stopSocialListeners,
    startSocialListeners,
    searchUser,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    dismissNotif,
    sendChallenge,
    cancelPendingChallenge,
    acceptChallenge,
    declineChallenge
  };
}
