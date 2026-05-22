import { createClient } from '@supabase/supabase-js';

let client = null;
let firebaseAuth = null;

export function isSupabaseConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function configureSupabaseFirebaseAuth(auth) {
  firebaseAuth = auth || null;
  client = null;
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;

  client = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      accessToken: async () => {
        return (await firebaseAuth?.currentUser?.getIdToken(false)) ?? null;
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  return client;
}
