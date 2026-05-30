import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

export function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}

export function getUserClient(req: Request) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: req.headers.get('Authorization') || ''
      }
    },
    auth: { persistSession: false }
  });
}

export async function requireUser(req: Request) {
  const client = getUserClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Error('Sign in required.');
  }
  return data.user;
}

export async function ensureUserProfile(user: { id: string; email?: string | null }) {
  const admin = getAdminClient();
  const { error } = await admin.from('player_profiles').upsert({
    auth_user_id: user.id,
    display_name: user.email?.split('@')[0] || 'Player',
    email: user.email || null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'auth_user_id' });

  if (error) throw error;
}
