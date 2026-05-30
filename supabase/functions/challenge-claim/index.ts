import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getAdminClient, requireUser } from '../_shared/supabase.ts';
import { settleClaimWithRelayer } from '../_shared/settlement.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const user = await requireUser(req);
    const { claim_id } = await req.json();
    const admin = getAdminClient();

    const { data: claim, error: claimError } = await admin
      .from('bot_challenge_claims')
      .select('*, bot_challenges(*)')
      .eq('id', claim_id)
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claim) return jsonResponse({ error: 'Claim not found.' }, 404);
    if (claim.status === 'settled') return jsonResponse({ claim, tx_signature: claim.tx_signature, status: 'settled' });
    if (!['eligible', 'failed', 'approved', 'pending_chain'].includes(claim.status)) {
      return jsonResponse({ error: 'Claim is not eligible for settlement.' }, 400);
    }

    const settlementEnabled = Deno.env.get('CHALLENGE_SETTLEMENT_ENABLED') === 'true';
    if (!settlementEnabled) {
      const message = 'Claim approved. Enable CHALLENGE_SETTLEMENT_ENABLED after relayer audit to send USDC.';
      const { data: updated, error: updateError } = await admin
        .from('bot_challenge_claims')
        .update({
          status: 'approved',
          error_message: message,
          updated_at: new Date().toISOString()
        })
        .eq('id', claim.id)
        .select('*')
        .single();
      if (updateError) throw updateError;

      await admin.from('chain_events').insert({
        event_type: 'challenge_claim_requested',
        challenge_id: claim.challenge_id,
        claim_id: claim.id,
        status: 'pending',
        payload: {
          wallet_address: claim.wallet_address,
          amount_usdc: claim.amount_usdc,
          settlement_enabled: false,
          message
        }
      });

      return jsonResponse({
        claim: updated,
        status: 'approved',
        tx_signature: null,
        message
      });
    }

    const { data: pending, error: pendingError } = await admin
      .from('bot_challenge_claims')
      .update({
        status: 'pending_chain',
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', claim.id)
      .select('*')
      .single();
    if (pendingError) throw pendingError;

    let txSignature: string;
    try {
      txSignature = await settleClaimWithRelayer({
        challenge: claim.bot_challenges,
        claim: pending
      });
    } catch (settleErr) {
      const message = settleErr?.message || 'Failed to settle claim on-chain.';
      const { data: failed, error: failedError } = await admin
        .from('bot_challenge_claims')
        .update({
          status: 'failed',
          error_message: message,
          updated_at: new Date().toISOString()
        })
        .eq('id', claim.id)
        .select('*')
        .single();
      if (failedError) throw failedError;

      await admin.from('chain_events').insert({
        event_type: 'challenge_claim_settlement_failed',
        challenge_id: claim.challenge_id,
        claim_id: claim.id,
        status: 'failed',
        payload: {
          wallet_address: claim.wallet_address,
          amount_usdc: claim.amount_usdc,
          message
        }
      });

      return jsonResponse({
        claim: failed,
        status: 'failed',
        tx_signature: null,
        error: message
      }, 400);
    }

    const { data: settled, error: settledError } = await admin
      .from('bot_challenge_claims')
      .update({
        status: 'settled',
        tx_signature: txSignature,
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', claim.id)
      .select('*')
      .single();
    if (settledError) throw settledError;

    await admin
      .from('bot_challenges')
      .update({
        claims_paid: (claim.bot_challenges.claims_paid || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', claim.challenge_id);

    await admin.from('chain_events').insert({
      event_type: 'challenge_claim_settled',
      challenge_id: claim.challenge_id,
      claim_id: claim.id,
      tx_signature: txSignature,
      status: 'confirmed',
      payload: {
        wallet_address: claim.wallet_address,
        amount_usdc: claim.amount_usdc,
        settlement_enabled: true
      }
    });

    return jsonResponse({
      claim: settled,
      status: 'settled',
      tx_signature: txSignature
    });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Failed to claim reward.' }, 400);
  }
});
