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
// ── Google OAuth Client ID ────────────────────────────────────────────────────
// Required for the chess.com-style popup (Google Identity Services).
// GIS opens Google's account picker directly — no Firebase relay, no black flash.
//
// HOW TO FIND YOUR CLIENT ID (takes ~30 seconds):
//   1. Open https://console.firebase.google.com/project/baghchal-26da2/authentication/providers
//   2. Click "Google" in the provider list
//   3. Expand "Web SDK configuration"
//   4. Copy the "Web client ID"  — it looks like:
//        342367298445-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
//   5. Paste it below, replacing the placeholder string.
//
const GOOGLE_OAUTH_CLIENT_ID = '342367298445-ab2811qo6gin4jo23b8n18l1m2ed56bc.apps.googleusercontent.com';

export async function signInWithGoogle({ auth, db, firebase, onUsernameSetupRequired, postSignInAction = null }) {
  console.log('signInWithGoogle called');
  if (!auth) {
    console.error('Firebase auth not initialized');
    alert('Authentication service not available. Please refresh the page.');
    return;
  }

  // ── Path A: Google Identity Services (chess.com-style) ───────────────────
  // GIS opens Google's account picker in a popup that goes DIRECTLY to
  // accounts.google.com — no intermediate Firebase relay page, so there is
  // no black→white flash. We then hand the resulting access token to Firebase
  // so auth state, Firestore rules, and all existing logic stay unchanged.
  const gisReady = window.google?.accounts?.oauth2 &&
                   GOOGLE_OAUTH_CLIENT_ID !== 'PASTE_YOUR_WEB_CLIENT_ID_HERE';

  if (gisReady) {
    console.log('Starting Google sign-in via GIS popup...');
    return new Promise((resolve) => {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        scope: 'openid email profile',
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            // 'access_denied' = user closed the popup — not an error worth alerting.
            if (tokenResponse.error !== 'access_denied') {
              console.error('GIS sign-in error:', tokenResponse.error);
              alert('Failed to sign in with Google: ' + tokenResponse.error);
            } else {
              console.log('GIS popup closed by user.');
            }
            resolve();
            return;
          }

          try {
            setRedirectIntent(postSignInAction);
            // Convert the Google access token into a Firebase credential.
            const credential = firebase.auth.GoogleAuthProvider.credential(
              null,
              tokenResponse.access_token
            );
            await auth.signInWithCredential(credential);
            // onAuthStateChanged handles everything from here.
          } catch (error) {
            window.localStorage.removeItem(googleRedirectStateKey);
            window.localStorage.removeItem(googleRedirectActionKey);
            console.error('Firebase credential error:', error);
            alert('Failed to sign in: ' + error.message);
          }
          resolve();
        }
      });

      // prompt:'select_account' forces Google to always show the account picker,
      // even if the user has only one Google account — consistent with chess.com.
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    });
  }

  // ── Path B: Firebase popup fallback ──────────────────────────────────────
  // Used when GIS hasn't loaded yet (slow network, ad-blocker) OR when
  // GOOGLE_OAUTH_CLIENT_ID hasn't been filled in yet.
  // Has the Firebase relay flash but is functionally identical.
  console.log('Starting Google sign-in via Firebase popup (GIS not ready)...');
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    setRedirectIntent(postSignInAction);
    await auth.signInWithPopup(provider);
  } catch (error) {
    window.localStorage.removeItem(googleRedirectStateKey);
    window.localStorage.removeItem(googleRedirectActionKey);
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
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
