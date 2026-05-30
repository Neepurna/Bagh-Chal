import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getAdminClient, requireUser } from '../_shared/supabase.ts';
import { applyMove, GameState, getChallengeBotDifficulty, getBotMove, getWinState, initialState, recordRepetition, Side } from '../_shared/challenge-rules.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const user = await requireUser(req);
    const { challenge_id } = await req.json();
    const admin = getAdminClient();

    const { data: challenge, error: challengeError } = await admin
      .from('bot_challenges')
      .select('*')
      .eq('id', challenge_id)
      .eq('status', 'active')
      .maybeSingle();
    if (challengeError) throw challengeError;
    if (!challenge) return jsonResponse({ error: 'Challenge is not active.' }, 404);
    if ((challenge.claims_paid || 0) >= challenge.max_claims) {
      return jsonResponse({ error: 'This bounty pool has been fully claimed.' }, 400);
    }

    const { data: wallet, error: walletError } = await admin
      .from('wallet_links')
      .select('wallet_address')
      .eq('auth_user_id', user.id)
      .not('verified_at', 'is', null)
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (walletError) throw walletError;
    if (!wallet) return jsonResponse({ error: 'Link Phantom before starting a bounty attempt.' }, 400);

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count, error: countError } = await admin
      .from('bot_challenge_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('auth_user_id', user.id)
      .eq('challenge_id', challenge.id)
      .gte('started_at', dayStart.toISOString());
    if (countError) throw countError;
    if ((count || 0) >= 5) return jsonResponse({ error: 'Daily attempt limit reached for this boss.' }, 429);

    let state = initialState();
    const openingBotMove = challenge.bot_side === state.currentPlayer
      ? getBotMove(state, challenge.bot_side as Side, getChallengeBotDifficulty())
      : null;
    if (openingBotMove) {
      state = recordRepetition(applyMove(state, challenge.bot_side as Side, openingBotMove).state);
    }

    const startWinState = getChallengeWinState(state, challenge);
    const { data: attempt, error: insertError } = await admin
      .from('bot_challenge_attempts')
      .insert({
        challenge_id: challenge.id,
        auth_user_id: user.id,
        wallet_address: wallet.wallet_address,
        status: startWinState ? 'lost' : 'active',
        canonical_state: state,
        move_count: openingBotMove ? 1 : 0,
        updated_at: new Date().toISOString()
      })
      .select('*')
      .single();
    if (insertError) throw insertError;

    if (openingBotMove) {
      await admin.from('bot_challenge_moves').insert({
        attempt_id: attempt.id,
        challenge_id: challenge.id,
        auth_user_id: user.id,
        move_number: 1,
        actor: 'bot',
        move: openingBotMove,
        resulting_state: state
      });
    }

    return jsonResponse({
      challenge,
      attempt,
      game_state: state,
      wallet_address: wallet.wallet_address
    });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Failed to start challenge.' }, 400);
  }
});

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
