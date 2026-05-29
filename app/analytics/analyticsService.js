import { getSupabaseClient } from '../services/supabaseClient.js';
import { state } from '../state/store.js';

const SESSION_KEY = 'baghchal.session_id';

function getOrCreateSessionId() {
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

async function track(eventType, data = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const sessionId = getOrCreateSessionId();
  const authUserId = state.currentUser?.id ?? null;

  const payload = {
    session_id: sessionId,
    auth_user_id: authUserId,
    event_type: eventType,
    is_guest: !authUserId,
    ...data,
  };

  const { error } = await supabase.from('analytics_events').insert(payload);
  if (error) console.warn('[analytics] failed to track event:', error.message);
}

export function trackGameStart({ gameMode, playerSide, aiDifficulty }) {
  track('game_start', {
    game_mode: gameMode,
    player_side: playerSide,
    ai_difficulty: aiDifficulty ?? null,
  }).catch(() => {});
}

export function trackGameEnd(snapshot) {
  const startedAt = snapshot.startedAt ? new Date(snapshot.startedAt).getTime() : null;
  const completedAt = snapshot.completedAt ? new Date(snapshot.completedAt).getTime() : Date.now();
  const durationSeconds = startedAt ? Math.round((completedAt - startedAt) / 1000) : null;
  const moveCount = Array.isArray(snapshot.gameHistory) ? snapshot.gameHistory.length : null;
  const playerSide = snapshot.playerSide === 1 ? 'tiger'
    : snapshot.playerSide === 2 ? 'goat'
    : snapshot.playerSide ?? null;

  track('game_end', {
    game_mode: snapshot.gameMode,
    player_side: playerSide,
    ai_difficulty: snapshot.aiDifficulty ?? null,
    winner: snapshot.winner ?? null,
    move_count: moveCount,
    duration_seconds: durationSeconds,
  }).catch(() => {});
}
