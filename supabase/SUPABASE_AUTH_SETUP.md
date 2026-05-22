# Supabase Auth Setup

The beta now uses Supabase only. Firebase is no longer part of runtime auth or
database access.

## Supabase Dashboard

1. Open Authentication > Providers.
2. Enable Google.
3. Add your Google OAuth client ID and secret.
4. Add redirect URLs for local and production:

```txt
http://localhost:5173
http://127.0.0.1:5173
https://baghchal.khelnekatha.com
https://baghchal-tan.vercel.app
```

## Database

Run `supabase/schema.sql` in the Supabase SQL editor.

## App Environment

Set these values locally and on Vercel:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
VITE_AUTH_REDIRECT_URL=https://baghchal.khelnekatha.com
```
