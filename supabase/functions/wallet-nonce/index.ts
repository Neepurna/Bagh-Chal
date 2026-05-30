import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { ensureUserProfile, getAdminClient, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const user = await requireUser(req);
    await ensureUserProfile(user);
    const { wallet_address } = await req.json();
    if (!wallet_address || typeof wallet_address !== 'string') {
      return jsonResponse({ error: 'wallet_address is required.' }, 400);
    }

    const nonce = crypto.randomUUID();
    const issuedAt = new Date().toISOString();
    const message = [
      'BaghChal USDC Bot Bounty',
      `Wallet: ${wallet_address}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`
    ].join('\n');

    const admin = getAdminClient();
    const { error } = await admin.from('wallet_links').upsert({
      auth_user_id: user.id,
      wallet_address,
      wallet_chain: 'solana',
      nonce,
      nonce_message: message,
      nonce_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      updated_at: issuedAt
    }, { onConflict: 'wallet_address' });

    if (error) throw error;
    return jsonResponse({ wallet_address, message, expires_in_seconds: 600 });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Failed to create wallet nonce.' }, 400);
  }
});
