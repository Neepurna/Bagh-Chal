import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getAdminClient, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const user = await requireUser(req);
    const { attempt_id } = await req.json();
    const admin = getAdminClient();

    const { data: attempt, error: attemptError } = await admin
      .from('bot_challenge_attempts')
      .select('*, bot_challenges(*)')
      .eq('id', attempt_id)
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) return jsonResponse({ error: 'Attempt not found.' }, 404);
    if (attempt.status !== 'won') return jsonResponse({ error: 'Only server-verified wins can create claims.' }, 400);

    const challenge = attempt.bot_challenges;
    if (attempt.winner !== challenge.player_side) {
      return jsonResponse({ error: 'Attempt winner does not match player side.' }, 400);
    }
    if ((challenge.claims_paid || 0) >= challenge.max_claims) {
      return jsonResponse({ error: 'This bounty pool has been fully claimed.' }, 400);
    }

    const { data: existing, error: existingError } = await admin
      .from('bot_challenge_claims')
      .select('*')
      .eq('challenge_id', challenge.id)
      .eq('season', challenge.season)
      .eq('wallet_address', attempt.wallet_address)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return jsonResponse({ claim: existing, claim_id: existing.id });

    const { data: claim, error: claimError } = await admin
      .from('bot_challenge_claims')
      .insert({
        challenge_id: challenge.id,
        season: challenge.season,
        auth_user_id: user.id,
        wallet_address: attempt.wallet_address,
        attempt_id: attempt.id,
        amount_usdc: challenge.prize_usdc,
        status: 'eligible'
      })
      .select('*')
      .single();
    if (claimError) throw claimError;

    return jsonResponse({ claim, claim_id: claim.id });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Failed to submit result.' }, 400);
  }
});
