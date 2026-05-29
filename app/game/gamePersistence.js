import { PIECE_TYPES } from '../config/gameConfig.js';
import { state } from '../state/store.js';
import { getSupabaseClient } from '../services/supabaseClient.js';
import { syncPlayerProfile } from './ratingService.js';
import { trackGameStart, trackGameEnd } from '../analytics/analyticsService.js';

const ACTIVE_GAME_KEY = 'baghchal.activeGame.v1';
const COMPLETED_GAMES_KEY = 'baghchal.completedGames.v1';

function serializeClockValue(value) {
  return Number.isFinite(value) ? value : null;
}

function restoreClockValue(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  return Number.isFinite(fallback) ? fallback : Infinity;
}

function cloneGame(game) {
  return {
    board: [...game.board],
    currentPlayer: game.currentPlayer,
    phase: game.phase,
    goatsPlaced: game.goatsPlaced,
    goatsCaptured: game.goatsCaptured,
    selectedPiece: game.selectedPiece,
    validMoves: [...(game.validMoves || [])],
    gameOver: game.gameOver,
    tigerIdentities: { ...game.tigerIdentities },
    goatIdentities: { ...game.goatIdentities }
  };
}

export function beginPersistedGame() {
  state.currentGameId = crypto.randomUUID();
  state.currentGameStartedAt = new Date().toISOString();
  persistActiveGame();
  trackGameStart({
    gameMode: state.gameMode,
    playerSide: state.playerSide === PIECE_TYPES.TIGER ? 'tiger' : 'goat',
    aiDifficulty: state.aiDifficulty ?? null,
  });
}

export function persistActiveGame(options = {}) {
  if (!state.gameStarted || state.gameMode === 'sandbox') return;
  if (!state.currentGameId) beginPersistedGame();

  const snapshot = {
    id: state.currentGameId,
    status: state.game.gameOver ? 'completed' : 'active',
    startedAt: state.currentGameStartedAt,
    updatedAt: new Date().toISOString(),
    gameMode: state.gameMode,
    playerSide: state.playerSide,
    aiDifficulty: state.aiDifficulty,
    aiTimeControl: state.aiTimeControl,
    multiplayerTimeControl: state.multiplayerTimeControl,
    matchRatingType: state.matchRatingType,
    adventureModeActive: state.adventureModeActive,
    adventureBotId: state.adventureBotId,
    game: cloneGame(state.game),
    gameHistory: state.gameHistory,
    goatFlagCounter: state.goatFlagCounter,
    positionHistory: state.positionHistory,
    positionCounts: Array.from(state.positionCounts.entries()),
    clockSeconds: {
      tiger: serializeClockValue(state.clockSeconds?.tiger),
      goat: serializeClockValue(state.clockSeconds?.goat)
    },
    clockInitialized: state.clockInitialized,
    clockActiveSide: state.clockActiveSide,
    clockLastTickAt: state.clockLastTickAt
  };

  window.localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(snapshot));
  if (options.syncRemote !== false) {
    syncGameToSupabase(snapshot).catch((err) => {
      console.warn('[supabase] active game sync failed:', err.message);
    });
  }
}

export function restorePersistedGame() {
  const raw = window.localStorage.getItem(ACTIVE_GAME_KEY);
  if (!raw) return null;

  try {
    const snapshot = JSON.parse(raw);
    if (!snapshot || snapshot.status !== 'active' || !snapshot.game) return null;

    state.currentGameId = snapshot.id;
    state.currentGameStartedAt = snapshot.startedAt;
    state.gameMode = snapshot.gameMode || 'ai';
    state.playerSide = snapshot.playerSide ?? PIECE_TYPES.GOAT;
    state.aiDifficulty = snapshot.aiDifficulty || 'medium';
    state.aiTimeControl = snapshot.aiTimeControl || '3m';
    state.multiplayerTimeControl = snapshot.multiplayerTimeControl || '5m';
    state.matchRatingType = snapshot.matchRatingType || 'unrated';
    state.adventureModeActive = !!snapshot.adventureModeActive;
    state.adventureBotId = snapshot.adventureBotId || null;
    state.gameStarted = true;
    state.isFirstAIMove = false;
    state.game = snapshot.game;
    state.gameHistory = snapshot.gameHistory || [];
    state.currentMoveIndex = -1;
    state.savedGameState = null;
    state.goatFlagCounter = snapshot.goatFlagCounter || 0;
    state.positionHistory = snapshot.positionHistory || [];
    state.positionCounts = new Map(snapshot.positionCounts || []);
    const fallbackSeconds = state.gameMode === 'multiplayer'
      ? getStoredMultiplayerSeconds(snapshot.multiplayerTimeControl)
      : getStoredAISeconds(snapshot.aiTimeControl);
    state.clockSeconds = {
      tiger: restoreClockValue(snapshot.clockSeconds?.tiger, fallbackSeconds),
      goat: restoreClockValue(snapshot.clockSeconds?.goat, fallbackSeconds)
    };
    state.clockInitialized = snapshot.clockInitialized !== false;
    state.clockActiveSide = snapshot.clockActiveSide ?? state.game.currentPlayer;
    state.clockLastTickAt = snapshot.clockLastTickAt || Date.now();
    return snapshot;
  } catch (error) {
    console.warn('[persist] failed to restore active game:', error.message);
    return null;
  }
}

function getStoredAISeconds(timeControl) {
  if (timeControl === '10m') return 600;
  if (timeControl === 'infinite') return Infinity;
  return 180;
}

function getStoredMultiplayerSeconds(timeControl) {
  if (timeControl === '3m') return 180;
  if (timeControl === '10m') return 600;
  if (timeControl === 'infinite') return Infinity;
  return 300;
}

export function completePersistedGame({ winner, message, ratingDelta = 0 }) {
  const raw = window.localStorage.getItem(ACTIVE_GAME_KEY);
  if (!raw) return;

  try {
    const completed = JSON.parse(raw);
    completed.status = 'completed';
    completed.winner = winner;
    completed.message = message;
    completed.ratingDelta = ratingDelta;
    completed.completedAt = new Date().toISOString();

    const archive = JSON.parse(window.localStorage.getItem(COMPLETED_GAMES_KEY) || '[]');
    archive.unshift(completed);
    window.localStorage.setItem(COMPLETED_GAMES_KEY, JSON.stringify(archive.slice(0, 50)));
    window.localStorage.removeItem(ACTIVE_GAME_KEY);

    syncGameToSupabase(completed).catch((err) => {
      console.warn('[supabase] completed game sync failed:', err.message);
    });
    trackGameEnd(completed);
    syncPlayerProfile();
  } catch (error) {
    console.warn('[persist] failed to complete game:', error.message);
  }
}

export function clearPersistedActiveGame() {
  window.localStorage.removeItem(ACTIVE_GAME_KEY);
}

async function syncGameToSupabase(snapshot) {
  const supabase = getSupabaseClient();
  if (!supabase || !state.currentUser?.id) return;

  const payload = {
    id: snapshot.id,
    auth_user_id: state.currentUser.id,
    status: snapshot.status,
    game_mode: snapshot.gameMode,
    player_side: snapshot.playerSide === PIECE_TYPES.TIGER ? 'tiger' : 'goat',
    opponent_side: snapshot.playerSide === PIECE_TYPES.TIGER ? 'goat' : 'tiger',
    ai_difficulty: snapshot.aiDifficulty,
    match_rating_type: snapshot.matchRatingType,
    adventure_bot_id: snapshot.adventureBotId,
    board_state: snapshot,
    winner: snapshot.winner || null,
    rating_delta: snapshot.ratingDelta || 0,
    started_at: snapshot.startedAt,
    completed_at: snapshot.completedAt || null,
    updated_at: snapshot.updatedAt || new Date().toISOString()
  };

  const { error } = await supabase.from('games').upsert(payload);
  if (error) throw error;
}
