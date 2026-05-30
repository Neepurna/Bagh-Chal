import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getAdminClient, requireUser } from '../_shared/supabase.ts';
import { Side } from '../_shared/challenge-rules.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const user = await requireUser(req);
    const { attempt_id } = await req.json() as { attempt_id: string };
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
    const winner = challenge.bot_side as Side;
    const { error: updateError } = await admin
      .from('bot_challenge_attempts')
      .update({
        status: 'lost',
        winner,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', attempt.id);
    if (updateError) throw updateError;

    return jsonResponse({
      status: 'lost',
      winner,
      message: `${winner === 'tiger' ? 'Tiger' : 'Goat'} wins by resignation.`,
      claim_eligible: false,
      game_state: attempt.canonical_state
    });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Challenge resignation failed.' }, 400);
  }
});
