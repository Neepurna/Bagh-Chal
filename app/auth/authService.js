const firebaseConfig = {
  apiKey: "AIzaSyCwZWRiXb_KwyNpUcQUfRNJQvQyf-o6x5g",
  authDomain: "baghchal-26da2.firebaseapp.com",
  projectId: "baghchal-26da2",
  storageBucket: "baghchal-26da2.firebasestorage.app",
  messagingSenderId: "342367298445",
  appId: "1:342367298445:web:b30dc206c09e73ab24d3c4",
  measurementId: "G-6VR5DSX8CT"
};

async function loadUserData(db, user) {
  if (!db) {
    return { gamesPlayed: 0, tigerWins: 0, goatWins: 0, username: user?.displayName || 'Player' };
  }

  try {
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      const userStats = {
        gamesPlayed: data.gamesPlayed || 0,
        tigerWins: data.tigerWins || 0,
        goatWins: data.goatWins || 0,
        username: data.username || user.displayName || 'Player'
      };

      if (data.username) {
        const clean = String(data.username).trim().toLowerCase();
        const idxRef = db.collection('usernames').doc(clean);
        const idxSnap = await idxRef.get();
        if (!idxSnap.exists) {
          await idxRef.set({ uid: user.uid }).catch(() => {});
        }
      }

      return userStats;
    }

    return { gamesPlayed: 0, tigerWins: 0, goatWins: 0, username: user.displayName || 'Player' };
  } catch (error) {
    console.error('Error loading user data:', error);
    return { gamesPlayed: 0, tigerWins: 0, goatWins: 0, username: user.displayName || 'Player' };
  }
}

export function initializeAuth({ firebase, onSignedIn, onSignedOut }) {
  let auth = null;
  let db = null;

  try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    console.log('Firebase initialized successfully');
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }

  if (auth) {
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        console.log('User signed in:', user.email);
        const userStats = await loadUserData(db, user);
        onSignedIn?.({ user, userStats, auth, db });
      } else {
        console.log('User signed out');
        onSignedOut?.({ auth, db });
      }
    });
  }

  return { auth, db };
}

export async function signInWithGoogle({ auth, db, firebase, onUsernameSetupRequired }) {
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

    const signupOverlay = document.getElementById('signup-overlay');
    if (signupOverlay) {
      signupOverlay.classList.remove('show');
    }

    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
      console.log('New user - showing username setup');
      onUsernameSetupRequired?.();
    }
  } catch (error) {
    console.error('Sign-in error:', error);
    alert('Failed to sign in with Google: ' + error.message);
  }
}

export async function saveUsername({
  currentUser,
  db,
  firebase,
  username,
  onUsernameSaved,
  onUsernameError
}) {
  if (!currentUser || !db) return;

  const clean = username.trim().toLowerCase();
  const existing = await db.collection('usernames').doc(clean).get();
  if (existing.exists) {
    onUsernameError?.('❌ Username already taken — try another.');
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
    onUsernameSaved?.(clean);
  } catch (error) {
    console.error('Error saving username:', error);
    onUsernameError?.('❌ Error saving — try again.');
  }
}

export async function signOut({ auth, beforeSignOut }) {
  if (!auth) return;

  try {
    await beforeSignOut?.();
    await auth.signOut();
  } catch (error) {
    console.error('Sign-out error:', error);
  }
}
