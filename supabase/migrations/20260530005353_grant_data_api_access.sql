-- Explicit Data API grants for Supabase-managed roles.
--
-- Supabase is moving away from auto-exposing tables in `public` via PostgREST/GraphQL.
-- Without explicit GRANTs, client libraries (supabase-js) may see 404s like:
-- "Could not find the table ... in the schema cache".

grant usage on schema public to anon, authenticated, service_role;

-- Most tables use UUIDs, but a few use (big)serial, so sequences must be reachable too.
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- Anonymous (not signed in) access: leaderboard + bot bounty list.
grant select on table public.player_profiles to anon;
grant select on table public.bot_challenges to anon;

-- Signed-in access: allow the app surface to operate; RLS still controls row-level access.
grant select, insert, update, delete on table public.player_profiles to authenticated;
grant select, insert, update, delete on table public.games to authenticated;
grant select, insert, update, delete on table public.friendships to authenticated;
grant select, insert, update, delete on table public.notifications to authenticated;
grant select, insert, update, delete on table public.rooms to authenticated;
grant select, insert, update, delete on table public.wallet_links to authenticated;
grant select on table public.bot_challenges to authenticated;
grant select on table public.bot_challenge_attempts to authenticated;
grant select on table public.bot_challenge_moves to authenticated;
grant select on table public.bot_challenge_claims to authenticated;
grant select on table public.chain_events to authenticated;
grant insert on table public.analytics_events to anon, authenticated;

-- Server-side (Edge Functions, admin scripts): full access.
grant select, insert, update, delete on table public.analytics_events to service_role;
grant select, insert, update, delete on table public.bot_challenges to service_role;
grant select, insert, update, delete on table public.bot_challenge_attempts to service_role;
grant select, insert, update, delete on table public.bot_challenge_moves to service_role;
grant select, insert, update, delete on table public.bot_challenge_claims to service_role;
grant select, insert, update, delete on table public.chain_events to service_role;
grant select, insert, update, delete on table public.friendships to service_role;
grant select, insert, update, delete on table public.games to service_role;
grant select, insert, update, delete on table public.notifications to service_role;
grant select, insert, update, delete on table public.player_profiles to service_role;
grant select, insert, update, delete on table public.rooms to service_role;
grant select, insert, update, delete on table public.wallet_links to service_role;
