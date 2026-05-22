# Firebase Auth + Supabase Setup

This app keeps Firebase only for Google sign-in and uses Supabase for game data.

## Supabase Dashboard

1. Open Authentication > Third-party Auth.
2. Add Firebase Auth.
3. Enter the Firebase project ID: `baghchal-26da2`.
4. Run `supabase/schema.sql` in the Supabase SQL editor.

## Firebase Claim Requirement

Supabase expects Firebase JWTs to include:

```json
{ "role": "authenticated" }
```

Set this once for existing users with Firebase Admin, and add it for new users
from a Firebase Auth trigger or Identity Platform blocking function.

After setting the claim, users may need a fresh Firebase token. The app asks
Firebase for the current ID token when creating Supabase requests.

## App Environment

Set these public frontend values:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

## One-Time Data Migration

Run after schema setup:

```bash
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account", "...":"..."}' \
npm run migrate:firebase:supabase
```

You can also use `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`
instead of `FIREBASE_SERVICE_ACCOUNT_JSON`.
