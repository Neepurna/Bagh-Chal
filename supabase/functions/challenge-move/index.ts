import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getAdminClient, requireUser } from '../_shared/supabase.ts';
import {
  applyMove,
  applyPlayerMove,
  getChallengeBotDifficulty,
  getBotMove,
  getWinState,
  recordRepetition,
  GameState,
  MoveInput,
  Side
} from '../_shared/challenge-rules.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const user = await requireUser(req);
    const { attempt_id, move } = await req.json() as { attempt_id: string; move: MoveInput };
    const admin = getAdminClient();

    const { data: attempt, error: attemptError } = await admin
      .from('bot_challenge_attempts')
      .select('*, bot_challenges(*)')
      .eq('id', attempt_id)
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) return jsonResponse({ error: 'Attempt not found.' }, 404);
    if (attempt.status !== 'active') return jsonResponse({ error: 'Attempt is already complete.' }, 400);

    const challenge = attempt.bot_challenges;
    let state = attempt.canonical_state;
    const playerSide = challenge.player_side as Side;
    const botSide = challenge.bot_side as Side;
    let moveCount = attempt.move_count || 0;

    const playerResult = applyPlayerMove(state, playerSide, move);
    state = recordRepetition(playerResult.state);
    moveCount += 1;
    await recordMove(admin, attempt, challenge, moveCount, 'player', playerResult.move, state);

    let winState = getChallengeWinState(state, challenge);
    if (!winState && state.currentPlayer === botSide) {
      await delay(getChallengeBotDelayMs());
      const botMove = getBotMove(state, botSide, getChallengeBotDifficulty());
      if (botMove) {
        const botResult = applyMove(state, botSide, botMove);
        state = recordRepetition(botResult.state);
        moveCount += 1;
        await recordMove(admin, attempt, challenge, moveCount, 'bot', botResult.move, state);
      }
      winState = getChallengeWinState(state, challenge);
    }

    const status = getAttemptStatus(winState?.winner || null, playerSide);
    const updatePayload: Record<string, unknown> = {
      canonical_state: state,
      move_count: moveCount,
      updated_at: new Date().toISOString()
    };
    if (status !== 'active') {
      updatePayload.status = status;
      updatePayload.winner = winState?.winner || 'draw';
      updatePayload.completed_at = new Date().toISOString();
    }

    const { error: updateError } = await admin
      .from('bot_challenge_attempts')
      .update(updatePayload)
      .eq('id', attempt.id);
    if (updateError) throw updateError;

    return jsonResponse({
      status,
      winner: winState?.winner || null,
      message: winState?.message || null,
      claim_eligible: status === 'won',
      game_state: state
    });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Challenge move failed.' }, 400);
  }
});

async function recordMove(
  admin: ReturnType<typeof getAdminClient>,
  attempt: Record<string, unknown>,
  challenge: Record<string, unknown>,
  moveNumber: number,
  actor: 'player' | 'bot',
  move: Record<string, unknown>,
  resultingState: Record<string, unknown>
) {
  const { error } = await admin.from('bot_challenge_moves').insert({
    attempt_id: attempt.id,
    challenge_id: challenge.id,
    auth_user_id: attempt.auth_user_id,
    move_number: moveNumber,
    actor,
    move,
    resulting_state: resultingState
  });
  if (error) throw error;
}

function getAttemptStatus(winner: Side | 'draw' | null, playerSide: Side) {
  if (!winner) return 'active';
  if (winner === playerSide) return 'won';
  if (winner === 'draw') return 'draw';
  return 'lost';
}

function getChallengeWinState(state: GameState, challenge: Record<string, unknown>) {
  const generic = getWinState(state);
  if (!generic) return null;
  if (generic.winner === 'draw') return generic;

  if (challenge.id === 'defeat-goat-bot') {
    if (Number(state.goatsCaptured || 0) >= 5) {
      return { winner: 'tiger' as Side, message: 'Tiger captured five goats and cleared the bounty.' };
    }
    return generic.winner === 'goat'
      ? { winner: 'goat' as Side, message: 'Goat trapped every tiger. Bounty failed.' }
      : null;
  }

  if (challenge.id === 'defeat-tiger-bot') {
    return generic.winner === 'goat'
      ? { winner: 'goat' as Side, message: 'Goat trapped every tiger and cleared the bounty.' }
      : generic;
  }

  return generic;
}

function getChallengeBotDelayMs() {
  const configured = Number(Deno.env.get('CHALLENGE_BOT_DELAY_MS') ?? 50);
  if (!Number.isFinite(configured)) return 50;
  return Math.max(0, Math.min(1500, configured));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
