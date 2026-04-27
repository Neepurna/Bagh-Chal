const firebaseConfig = {
  apiKey: "AIzaSyCwZWRiXb_KwyNpUcQUfRNJQvQyf-o6x5g",
  authDomain: "baghchal-26da2.firebaseapp.com",
  projectId: "baghchal-26da2",
  storageBucket: "baghchal-26da2.firebasestorage.app",
  messagingSenderId: "342367298445",
  appId: "1:342367298445:web:b30dc206c09e73ab24d3c4",
  measurementId: "G-6VR5DSX8CT"
};
const googleRedirectStateKey = 'baghchal_google_redirect';
const googleRedirectActionKey = 'baghchal_google_redirect_action';

function setRedirectIntent(postSignInAction = null) {
  window.localStorage.setItem(googleRedirectStateKey, '1');
  if (postSignInAction) {
    window.localStorage.setItem(googleRedirectActionKey, postSignInAction);
  } else {
    window.localStorage.removeItem(googleRedirectActionKey);
  }
}

function consumeRedirectIntent() {
  const hasRedirectState = window.localStorage.getItem(googleRedirectStateKey) === '1';
  if (!hasRedirectState) {
    return { redirectAction: null, hadRedirectIntent: false };
  }

  const redirectAction = window.localStorage.getItem(googleRedirectActionKey);
  window.localStorage.removeItem(googleRedirectStateKey);
  window.localStorage.removeItem(googleRedirectActionKey);
  return { redirectAction, hadRedirectIntent: true };
}

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

export function initializeAuth({ firebase, onSignedIn, onSignedOut, onUsernameSetupRequired }) {
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

        // Keep fallback values so onSignedIn is always called even if
        // data loading partially fails.
        let userStats = { gamesPlayed: 0, tigerWins: 0, goatWins: 0, username: user.displayName || 'Player' };
        let redirectAction = null;
        let needsUsernameSetup = false;

        try {
          userStats = await loadUserData(db, user);
          const intent = consumeRedirectIntent();
          redirectAction = intent.redirectAction;
          const hadRedirectIntent = intent.hadRedirectIntent;

          if (hadRedirectIntent) {
            try {
              // This Firestore call previously had no error handling — if it
              // threw (rules block, network issue, etc.) onSignedIn was never
              // called and the welcome page stayed visible.
              const userDoc = await db.collection('users').doc(user.uid).get();
              if (!userDoc.exists) {
                needsUsernameSetup = true;
                onUsernameSetupRequired?.();
              }
            } catch (firestoreError) {
              console.error('Error checking user document:', firestoreError);
              // Can't confirm whether the doc exists — treat as existing user
              // and proceed. Username setup can be triggered separately if needed.
            }
          }
        } catch (error) {
          console.error('Error during sign-in data loading:', error);
        }

        // Always call onSignedIn when we have a user — this is the call that
        // actually transitions the UI from welcome page to home page.
        onSignedIn?.({ user, userStats, auth, db, redirectAction, needsUsernameSetup });
      } else {
        console.log('User signed out');
        onSignedOut?.({ auth, db });
      }
    });
  }

  return { auth, db };
}
export async function signInWithGoogle({ auth, db, firebase, onUsernameSetupRequired, postSignInAction = null }) {
  console.log('signInWithGoogle called');
  if (!auth) {
    console.error('Firebase auth not initialized');
    alert('Authentication service not available. Please refresh the page.');
    return;
  }

  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account'
  });

  try {
    // signInWithPopup is used instead of signInWithRedirect because Firefox 10.x
    // (loaded via CDN) has a known issue with signInWithRedirect when browsers block
    // third-party cookies (Chrome 115+, Safari ITP). The redirect bounces through
    // baghchal-26da2.firebaseapp.com — a different domain — and that cross-domain
    // communication gets blocked, causing Firebase to briefly sign the user in and
    // then immediately sign them out (the "blink" bug). signInWithPopup stays
    // same-origin and onAuthStateChanged fires cleanly once with the user.
    console.log('Starting Google sign-in popup...');
    setRedirectIntent(postSignInAction);
    await auth.signInWithPopup(provider);
    // onAuthStateChanged will fire with the user on the same page load — no redirect needed.
  } catch (error) {
    // Clean up the intent if the user cancelled or if there was an error,
    // so stale keys don't affect subsequent sign-in attempts.
    window.localStorage.removeItem(googleRedirectStateKey);
    window.localStorage.removeItem(googleRedirectActionKey);
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      // User dismissed the popup — not an error worth alerting about.
      console.log('Google sign-in popup was closed by user.');
      return;
    }
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
