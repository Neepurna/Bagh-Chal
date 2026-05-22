import { getSupabaseClient } from '../services/supabaseClient.js';

const googleRedirectActionKey = 'baghchal_google_redirect_action';

function getDisplayName(user) {
  return user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'Player';
}

function toAppUser(user) {
  if (!user) return null;
  return {
    ...user,
    uid: user.id,
    displayName: getDisplayName(user),
    photoURL: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
    email: user.email || ''
  };
}

function makeDefaultStats(user) {
  return {
    gamesPlayed: 0,
    tigerWins: 0,
    goatWins: 0,
    rating: 500,
    ratedWins: 0,
    ratedLosses: 0,
    adventureLevel: 0,
    adventureCompleted: 0,
    username: getDisplayName(user)
  };
}

async function loadUserProfile(user) {
  const supabase = getSupabaseClient();
  if (!supabase || !user) return null;

  const { data, error } = await supabase
    .from('player_profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('[supabase] profile load failed:', error.message);
    return null;
  }
  return data;
}

function statsFromProfile(profile, user) {
  if (!profile) return makeDefaultStats(user);
  return {
    gamesPlayed: profile.games_played || 0,
    tigerWins: profile.tiger_wins || 0,
    goatWins: profile.goat_wins || 0,
    rating: profile.rating ?? 500,
    ratedWins: profile.rated_wins || 0,
    ratedLosses: profile.rated_losses || 0,
    adventureLevel: profile.adventure_level || 0,
    adventureCompleted: profile.adventure_completed || 0,
    username: profile.username || profile.display_name || getDisplayName(user)
  };
}

export function initializeAuth({ onSignedIn, onSignedOut, onUsernameSetupRequired }) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    console.error('[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
    onSignedOut?.({ auth: null });
    return { auth: null };
  }

  async function handleSession(session) {
    const rawUser = session?.user || null;
    if (!rawUser) {
      onSignedOut?.({ auth: supabase.auth });
      return;
    }

    const profile = await loadUserProfile(rawUser);
    const appUser = toAppUser(rawUser);
    const redirectAction = window.localStorage.getItem(googleRedirectActionKey);
    window.localStorage.removeItem(googleRedirectActionKey);
    const needsUsernameSetup = !profile?.username;

    if (needsUsernameSetup) onUsernameSetupRequired?.();

    onSignedIn?.({
      user: appUser,
      userStats: statsFromProfile(profile, rawUser),
      auth: supabase.auth,
      redirectAction,
      needsUsernameSetup
    });
  }

  supabase.auth.getSession().then(({ data }) => handleSession(data.session));
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => handleSession(session), 0);
  });

  return { auth: supabase.auth, unsubscribe: () => listener.subscription.unsubscribe() };
}

export async function signInWithGoogle({ postSignInAction = null } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    alert('Authentication service is not configured yet.');
    return;
  }

  if (postSignInAction) window.localStorage.setItem(googleRedirectActionKey, postSignInAction);
  else window.localStorage.removeItem(googleRedirectActionKey);

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: import.meta.env.VITE_AUTH_REDIRECT_URL || window.location.origin,
      queryParams: { prompt: 'select_account' }
    }
  });

  if (error) {
    console.error('Supabase Google sign-in error:', error);
    alert('Failed to sign in with Google: ' + error.message);
  }
}

export async function saveUsername({
  currentUser,
  username,
  onUsernameSaved,
  onUsernameError
}) {
  const supabase = getSupabaseClient();
  if (!currentUser || !supabase) return;

  const clean = username.trim().toLowerCase();
  try {
    const { data: existing, error: lookupError } = await supabase
      .from('player_profiles')
      .select('auth_user_id')
      .eq('username', clean)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (existing && existing.auth_user_id !== currentUser.id) {
      onUsernameError?.('Username already taken. Try another.');
      return;
    }

    const payload = {
      auth_user_id: currentUser.id,
      username: clean,
      display_name: username.trim(),
      email: currentUser.email,
      photo_url: currentUser.photoURL || '',
      games_played: 0,
      tiger_wins: 0,
      goat_wins: 0,
      rating: 500,
      rated_wins: 0,
      rated_losses: 0,
      adventure_level: 0,
      adventure_completed: 0,
      leaderboard_score: 167,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from('player_profiles').upsert(payload);
    if (error) throw error;
    onUsernameSaved?.(clean);
  } catch (error) {
    console.error('Error saving username:', error);
    onUsernameError?.('Error saving. Try again.');
  }
}

export async function signOut({ auth, beforeSignOut }) {
  try {
    await beforeSignOut?.();
    await auth?.signOut();
  } catch (error) {
    console.error('Sign-out error:', error);
  }
}
