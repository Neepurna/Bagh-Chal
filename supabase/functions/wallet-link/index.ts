import nacl from 'https://esm.sh/tweetnacl@1.0.3';
import bs58 from 'https://esm.sh/bs58@6.0.0';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getAdminClient, requireUser } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const user = await requireUser(req);
    const { wallet_address, message, signature } = await req.json();
    if (!wallet_address || !message || !signature) {
      return jsonResponse({ error: 'wallet_address, message, and signature are required.' }, 400);
    }

    const admin = getAdminClient();
    const { data: link, error: lookupError } = await admin
      .from('wallet_links')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!link || link.nonce_message !== message) return jsonResponse({ error: 'Wallet nonce not found.' }, 400);
    if (link.nonce_expires_at && new Date(link.nonce_expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: 'Wallet nonce expired.' }, 400);
    }

    const publicKey = bs58.decode(wallet_address);
    const signatureBytes = Uint8Array.from(atob(signature), (char) => char.charCodeAt(0));
    const verified = nacl.sign.detached.verify(new TextEncoder().encode(message), signatureBytes, publicKey);
    if (!verified) return jsonResponse({ error: 'Wallet signature verification failed.' }, 400);

    const verifiedAt = new Date().toISOString();
    const { error } = await admin
      .from('wallet_links')
      .update({
        verified_at: verifiedAt,
        nonce: null,
        nonce_message: null,
        nonce_expires_at: null,
        updated_at: verifiedAt
      })
      .eq('id', link.id);
    if (error) throw error;

    return jsonResponse({ wallet_address, verified_at: verifiedAt });
  } catch (err) {
    return jsonResponse({ error: err.message || 'Failed to link wallet.' }, 400);
  }
});
