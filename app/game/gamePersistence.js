import { PIECE_TYPES } from '../config/gameConfig.js';
import { state } from '../state/store.js';
import { getSupabaseClient } from '../services/supabaseClient.js';
import { syncPlayerProfile } from './ratingService.js';

const ACTIVE_GAME_KEY = 'baghchal.activeGame.v1';
const COMPLETED_GAMES_KEY = 'baghchal.completedGames.v1';

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
}

export function persistActiveGame() {
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
    matchRatingType: state.matchRatingType,
    adventureModeActive: state.adventureModeActive,
    adventureBotId: state.adventureBotId,
    game: cloneGame(state.game),
    gameHistory: state.gameHistory,
    goatFlagCounter: state.goatFlagCounter,
    positionHistory: state.positionHistory,
    positionCounts: Array.from(state.positionCounts.entries())
  };

  window.localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(snapshot));
  syncGameToSupabase(snapshot).catch((err) => {
    console.warn('[supabase] active game sync failed:', err.message);
  });
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
    return snapshot;
  } catch (error) {
    console.warn('[persist] failed to restore active game:', error.message);
    return null;
  }
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
