import { createClient } from '@supabase/supabase-js';

let client = null;
let sessionPromise = null;

export function isSupabaseConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;

  client = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    }
  );

  return client;
}

export async function ensureSupabasePlayer() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data: existing } = await supabase.auth.getSession();
      if (existing?.session?.user) return existing.session.user;

      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.warn('[supabase] anonymous sign-in failed:', error.message);
        return null;
      }
      return data?.user || null;
    })();
  }

  return sessionPromise;
}
