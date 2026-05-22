import { state } from '../state/store.js';
import { getSupabaseClient } from '../services/supabaseClient.js';

const RATING_FLOOR = 100;
const BASE_RATING = 500;

const RATED_POINTS = {
  tiger: { easy: 10, medium: 15, hard: 20 },
  goat: { easy: 5, medium: 10, hard: 15 }
};

export function getRatingDelta({ playerWon, playerSide, difficulty }) {
  const side = playerSide === 1 || playerSide === 'tiger' ? 'tiger' : 'goat';
  const points = RATED_POINTS[side]?.[difficulty] || RATED_POINTS[side]?.medium || 10;
  return playerWon ? points : -points;
}

export function getLeaderboardScore(stats = state.userStats) {
  const rating = stats.rating ?? BASE_RATING;
  const games = stats.gamesPlayed || 0;
  const adventure = stats.adventureCompleted || stats.adventureLevel || 0;
  return Math.round((rating + Math.min(games, 500) + adventure * 100) / 3);
}

export function applyLocalRatingResult({ playerWon, playerSide, difficulty }) {
  const delta = getRatingDelta({ playerWon, playerSide, difficulty });
  const current = state.userStats.rating ?? BASE_RATING;
  state.userStats.rating = Math.max(RATING_FLOOR, current + delta);
  if (playerWon) state.userStats.ratedWins = (state.userStats.ratedWins || 0) + 1;
  else state.userStats.ratedLosses = (state.userStats.ratedLosses || 0) + 1;
  return delta;
}

export async function syncPlayerProfile() {
  const supabase = getSupabaseClient();
  if (!supabase || !state.currentUser?.id) return;

  const username = state.userStats?.username || state.currentUser?.displayName || 'Player';
  const payload = {
    auth_user_id: state.currentUser.id,
    display_name: username,
    username: state.userStats?.username || username,
    email: state.currentUser.email || null,
    photo_url: state.currentUser.photoURL || null,
    rating: state.userStats.rating ?? BASE_RATING,
    games_played: state.userStats.gamesPlayed || 0,
    tiger_wins: state.userStats.tigerWins || 0,
    goat_wins: state.userStats.goatWins || 0,
    rated_wins: state.userStats.ratedWins || 0,
    rated_losses: state.userStats.ratedLosses || 0,
    adventure_level: state.userStats.adventureLevel || 0,
    adventure_completed: state.userStats.adventureCompleted || 0,
    leaderboard_score: getLeaderboardScore(),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('player_profiles').upsert(payload);
  if (error) console.warn('[supabase] profile sync failed:', error.message);
}

export async function loadSupabasePlayerProfile(user) {
  const supabase = getSupabaseClient();
  if (!supabase || !user?.id) return null;

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

export async function loadLeaderboard({ limit = 10 } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return [{
      display_name: state.userStats?.username || 'You',
      rating: state.userStats.rating ?? BASE_RATING,
      games_played: state.userStats.gamesPlayed || 0,
      adventure_completed: state.userStats.adventureCompleted || 0,
      leaderboard_score: getLeaderboardScore()
    }];
  }

  const { data, error } = await supabase
    .from('player_profiles')
    .select('display_name,rating,games_played,adventure_completed,leaderboard_score')
    .order('leaderboard_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[supabase] leaderboard load failed:', error.message);
    return [];
  }
  return data || [];
}
