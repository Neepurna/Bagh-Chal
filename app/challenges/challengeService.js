import { getSupabaseClient } from '../services/supabaseClient.js';
import { BOT_BOUNTY_CHALLENGES, getChallengeConfig } from './challengeConfig.js';
import { connectPhantomWallet, signWalletMessage } from '../wallet/solanaWallet.js';

const FUNCTION_REGION = String(import.meta.env?.VITE_SUPABASE_FUNCTION_REGION || '').trim();

export function isChallengeBackendConfigured() {
  return Boolean(getSupabaseClient());
}

export async function loadBotChallenges() {
  const supabase = getSupabaseClient();
  if (!supabase) return BOT_BOUNTY_CHALLENGES;

  const { data, error } = await supabase
    .from('bot_challenges')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error || !Array.isArray(data) || data.length === 0) {
    if (error) console.warn('[challenge] challenge load failed:', error.message);
    return BOT_BOUNTY_CHALLENGES;
  }

  return data.map((row) => ({
    ...getChallengeConfig(row.id),
    id: row.id,
    season: row.season,
    title: row.title,
    subtitle: row.description,
    botId: row.bot_id,
    botName: row.bot_name,
    botProfile: row.bot_profile,
    prizeUsdc: Number(row.prize_usdc || 0),
    maxClaims: row.max_claims,
    claimsPaid: row.claims_paid,
    status: row.status
  })).filter((challenge) => challenge.playerSide);
}

export async function loadLinkedWallet() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('wallet_links')
    .select('wallet_address,verified_at')
    .not('verified_at', 'is', null)
    .order('verified_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[wallet] linked wallet load failed:', error.message);
    return null;
  }
  return data || null;
}

export async function connectAndLinkWallet() {
  const wallet = await connectPhantomWallet();
  if (!wallet.ok) return wallet;

  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const nonce = await invokeFunction('wallet-nonce', {
    wallet_address: wallet.publicKey
  });
  if (!nonce.ok) return nonce;

  const signature = await signWalletMessage(nonce.data.message);
  const linked = await invokeFunction('wallet-link', {
    wallet_address: wallet.publicKey,
    message: nonce.data.message,
    signature
  });
  if (!linked.ok) return linked;

  return { ok: true, walletAddress: wallet.publicKey };
}

export async function startChallengeAttempt(challengeId) {
  return invokeFunction('challenge-start', { challenge_id: challengeId });
}

export async function submitChallengeMove(attemptId, move) {
  return invokeFunction('challenge-move', {
    attempt_id: attemptId,
    move
  });
}

export async function resignChallengeAttempt(attemptId) {
  return invokeFunction('challenge-resign', {
    attempt_id: attemptId
  });
}

export async function submitChallengeResult(attemptId) {
  return invokeFunction('challenge-submit-result', {
    attempt_id: attemptId
  });
}

export async function claimChallengeReward(claimId) {
  return invokeFunction('challenge-claim', {
    claim_id: claimId
  });
}

async function invokeFunction(name, body) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' };

  const invokeOptions = { body };
  // Optional: force regional invocation (best if set to the same region as your Supabase DB).
  // Leave unset to use default edge routing.
  if (FUNCTION_REGION) invokeOptions.region = FUNCTION_REGION;

  const { data, error } = await supabase.functions.invoke(name, invokeOptions);
  if (error) {
    return { ok: false, error: error.message || `Function ${name} failed.` };
  }
  if (data?.error) {
    return { ok: false, error: data.error, data };
  }
  return { ok: true, data };
}
