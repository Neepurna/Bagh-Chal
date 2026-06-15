-- Clean Supabase-only schema for BaghChal.
-- Auth is handled by Supabase Google OAuth; app data is protected with auth.uid().
-- Beta clean-slate reset: drops previous Firebase-UID app tables if present.

create extension if not exists pgcrypto;

drop table if exists public.notifications cascade;
drop table if exists public.friendships cascade;
drop table if exists public.games cascade;
drop table if exists public.rooms cascade;
drop table if exists public.chain_events cascade;
drop table if exists public.bot_challenge_claims cascade;
drop table if exists public.bot_challenge_moves cascade;
drop table if exists public.bot_challenge_attempts cascade;
drop table if exists public.bot_challenges cascade;
drop table if exists public.wallet_links cascade;
drop table if exists public.analytics_events cascade;
drop table if exists public.player_profiles cascade;

create table public.player_profiles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null default 'Player',
  email text,
  photo_url text,
  rating integer not null default 500 check (rating >= 100),
  games_played integer not null default 0 check (games_played >= 0),
  tiger_wins integer not null default 0 check (tiger_wins >= 0),
  goat_wins integer not null default 0 check (goat_wins >= 0),
  rated_wins integer not null default 0 check (rated_wins >= 0),
  rated_losses integer not null default 0 check (rated_losses >= 0),
  adventure_level integer not null default 0 check (adventure_level between 0 and 6),
  adventure_completed integer not null default 0 check (adventure_completed between 0 and 6),
  leaderboard_score integer not null default 167,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references public.player_profiles(auth_user_id) on delete cascade,
  status text not null check (status in ('active', 'completed')),
  game_mode text not null check (game_mode in ('ai', 'multiplayer', 'challenge')),
  player_side text not null check (player_side in ('tiger', 'goat')),
  opponent_side text not null check (opponent_side in ('tiger', 'goat')),
  ai_difficulty text check (ai_difficulty in ('easy', 'medium', 'hard')),
  match_rating_type text not null default 'unrated' check (match_rating_type in ('rated', 'unrated')),
  adventure_bot_id text,
  board_state jsonb not null,
  winner text check (winner in ('tiger', 'goat', 'draw') or winner is null),
  rating_delta integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.player_profiles(auth_user_id) on delete cascade,
  friend_id uuid not null references public.player_profiles(auth_user_id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  direction text check (direction in ('sent', 'received')),
  friend_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, friend_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.player_profiles(auth_user_id) on delete cascade,
  sender_id uuid references public.player_profiles(auth_user_id) on delete set null,
  type text not null,
  status text default 'pending',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique,
  host_id uuid not null references public.player_profiles(auth_user_id) on delete cascade,
  guest_id uuid references public.player_profiles(auth_user_id) on delete set null,
  host_username text,
  guest_username text,
  host_side text not null check (host_side in ('tiger', 'goat')),
  guest_side text check (guest_side in ('tiger', 'goat')),
  time_control text,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  board_state jsonb not null default '{}'::jsonb,
  winner text check (winner in ('tiger', 'goat', 'draw') or winner is null),
  winner_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wallet_links (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references public.player_profiles(auth_user_id) on delete cascade,
  wallet_address text not null unique,
  wallet_chain text not null default 'solana' check (wallet_chain = 'solana'),
  nonce text,
  nonce_message text,
  nonce_expires_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bot_challenges (
  id text primary key,
  season text not null,
  title text not null,
  description text,
  bot_id text not null,
  bot_name text not null,
  bot_side text not null check (bot_side in ('tiger', 'goat')),
  player_side text not null check (player_side in ('tiger', 'goat')),
  bot_profile text not null,
  prize_usdc numeric(12, 6) not null default 2 check (prize_usdc > 0),
  max_claims integer not null default 1 check (max_claims >= 0),
  claims_paid integer not null default 0 check (claims_paid >= 0),
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'expired')),
  solana_cluster text not null default 'mainnet-beta',
  usdc_mint text not null default 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  solana_challenge_pda text,
  solana_vault_address text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bot_challenge_attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id text not null references public.bot_challenges(id) on delete cascade,
  auth_user_id uuid not null references public.player_profiles(auth_user_id) on delete cascade,
  wallet_address text not null,
  status text not null default 'active' check (status in ('active', 'won', 'lost', 'draw', 'expired', 'abandoned')),
  canonical_state jsonb not null,
  winner text check (winner in ('tiger', 'goat', 'draw') or winner is null),
  move_count integer not null default 0 check (move_count >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.bot_challenge_moves (
  id bigserial primary key,
  attempt_id uuid not null references public.bot_challenge_attempts(id) on delete cascade,
  challenge_id text not null references public.bot_challenges(id) on delete cascade,
  auth_user_id uuid not null references public.player_profiles(auth_user_id) on delete cascade,
  move_number integer not null check (move_number >= 0),
  actor text not null check (actor in ('player', 'bot')),
  move jsonb not null,
  resulting_state jsonb not null,
  created_at timestamptz not null default now(),
  unique(attempt_id, move_number, actor)
);

create table public.bot_challenge_claims (
  id uuid primary key default gen_random_uuid(),
  challenge_id text not null references public.bot_challenges(id) on delete cascade,
  season text not null,
  auth_user_id uuid not null references public.player_profiles(auth_user_id) on delete cascade,
  wallet_address text not null,
  attempt_id uuid not null references public.bot_challenge_attempts(id) on delete cascade,
  amount_usdc numeric(12, 6) not null check (amount_usdc > 0),
  status text not null default 'eligible' check (status in ('eligible', 'pending_chain', 'approved', 'settled', 'failed')),
  tx_signature text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(challenge_id, season, wallet_address)
);

create table public.chain_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  challenge_id text references public.bot_challenges(id) on delete set null,
  claim_id uuid references public.bot_challenge_claims(id) on delete set null,
  tx_signature text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (length(trim(event_type)) > 0),
  is_guest boolean not null,
  game_mode text,
  player_side text check (player_side in ('tiger', 'goat') or player_side is null),
  ai_difficulty text check (ai_difficulty in ('easy', 'medium', 'hard') or ai_difficulty is null),
  winner text check (winner in ('tiger', 'goat', 'draw') or winner is null),
  move_count integer check (move_count >= 0 or move_count is null),
  duration_seconds integer check (duration_seconds >= 0 or duration_seconds is null),
  created_at timestamptz not null default now(),
  check (
    (is_guest = true and auth_user_id is null)
    or
    (is_guest = false and auth_user_id is not null)
  )
);

create index if not exists games_player_updated_idx on public.games (auth_user_id, updated_at desc);
create index if not exists player_profiles_leaderboard_idx on public.player_profiles (leaderboard_score desc, rating desc);
create index if not exists friendships_owner_idx on public.friendships (owner_id, status);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index if not exists rooms_player_idx on public.rooms (host_id, guest_id, updated_at desc);
create index if not exists rooms_code_idx on public.rooms (room_code);
create index if not exists wallet_links_user_idx on public.wallet_links (auth_user_id, verified_at desc);
create index if not exists bot_challenges_status_idx on public.bot_challenges (status, starts_at desc);
create index if not exists bot_attempts_user_idx on public.bot_challenge_attempts (auth_user_id, challenge_id, started_at desc);
create index if not exists bot_attempts_daily_idx on public.bot_challenge_attempts (auth_user_id, challenge_id, started_at);
create index if not exists bot_moves_attempt_idx on public.bot_challenge_moves (attempt_id, move_number);
create index if not exists bot_claims_user_idx on public.bot_challenge_claims (auth_user_id, challenge_id, created_at desc);
create index if not exists chain_events_claim_idx on public.chain_events (claim_id, created_at desc);
create index if not exists analytics_events_created_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_guest_mode_idx on public.analytics_events (is_guest, game_mode, event_type, created_at desc);
create index if not exists analytics_events_user_idx on public.analytics_events (auth_user_id, created_at desc)
where auth_user_id is not null;

alter table public.player_profiles enable row level security;
alter table public.games enable row level security;
alter table public.friendships enable row level security;
alter table public.notifications enable row level security;
alter table public.rooms enable row level security;
alter table public.wallet_links enable row level security;
alter table public.bot_challenges enable row level security;
alter table public.bot_challenge_attempts enable row level security;
alter table public.bot_challenge_moves enable row level security;
alter table public.bot_challenge_claims enable row level security;
alter table public.chain_events enable row level security;
alter table public.analytics_events enable row level security;

grant insert on public.analytics_events to anon, authenticated;

drop policy if exists "Public leaderboard profiles are readable." on public.player_profiles;
create policy "Public leaderboard profiles are readable."
on public.player_profiles for select
to authenticated, anon
using (true);

drop policy if exists "Players create their own profile." on public.player_profiles;
create policy "Players create their own profile."
on public.player_profiles for insert
to authenticated
with check ((select auth.uid()) = auth_user_id);

drop policy if exists "Players update their own profile." on public.player_profiles;
create policy "Players update their own profile."
on public.player_profiles for update
to authenticated
using ((select auth.uid()) = auth_user_id)
with check ((select auth.uid()) = auth_user_id);

drop policy if exists "Players read own games." on public.games;
create policy "Players read own games."
on public.games for select
to authenticated
using ((select auth.uid()) = auth_user_id);

drop policy if exists "Players insert own games." on public.games;
create policy "Players insert own games."
on public.games for insert
to authenticated
with check ((select auth.uid()) = auth_user_id);

drop policy if exists "Players update own games." on public.games;
create policy "Players update own games."
on public.games for update
to authenticated
using ((select auth.uid()) = auth_user_id)
with check ((select auth.uid()) = auth_user_id);

drop policy if exists "Players read their friendships." on public.friendships;
create policy "Players read their friendships."
on public.friendships for select
to authenticated
using ((select auth.uid()) in (owner_id, friend_id));

drop policy if exists "Players manage owned friendships." on public.friendships;
create policy "Players manage owned friendships."
on public.friendships for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Players can accept friendship requests sent to them." on public.friendships;
create policy "Players can accept friendship requests sent to them."
on public.friendships for update
to authenticated
using ((select auth.uid()) = friend_id and status = 'pending')
with check ((select auth.uid()) = friend_id and status = 'accepted');

create or replace function public.accept_friend_request(request_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_id uuid;
  requester_username text;
  accepter_username text;
  accepter_photo text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select
    (payload->>'from')::uuid,
    coalesce(payload->>'fromUsername', 'Friend')
  into requester_id, requester_username
  from public.notifications
  where id = request_notification_id
    and recipient_id = auth.uid()
    and type = 'friend_request';

  if requester_id is null then
    raise exception 'Friend request not found';
  end if;

  select
    coalesce(username, display_name, 'Player'),
    coalesce(photo_url, '')
  into accepter_username, accepter_photo
  from public.player_profiles
  where auth_user_id = auth.uid();

  insert into public.friendships (
    owner_id,
    friend_id,
    status,
    direction,
    friend_username,
    updated_at
  ) values (
    auth.uid(),
    requester_id,
    'accepted',
    'received',
    requester_username,
    now()
  )
  on conflict (owner_id, friend_id) do update set
    status = 'accepted',
    direction = 'received',
    friend_username = excluded.friend_username,
    updated_at = now();

  insert into public.friendships (
    owner_id,
    friend_id,
    status,
    direction,
    friend_username,
    updated_at
  ) values (
    requester_id,
    auth.uid(),
    'accepted',
    'sent',
    coalesce(accepter_username, 'Player'),
    now()
  )
  on conflict (owner_id, friend_id) do update set
    status = 'accepted',
    direction = 'sent',
    friend_username = excluded.friend_username,
    updated_at = now();

  delete from public.notifications
  where id = request_notification_id
    and recipient_id = auth.uid();

  insert into public.notifications (
    recipient_id,
    sender_id,
    type,
    status,
    payload
  ) values (
    requester_id,
    auth.uid(),
    'friend_accepted',
    'pending',
    jsonb_build_object(
      'from', auth.uid(),
      'fromUsername', coalesce(accepter_username, 'Player'),
      'fromPhoto', coalesce(accepter_photo, '')
    )
  );
end;
$$;

revoke all on function public.accept_friend_request(uuid) from public;
revoke all on function public.accept_friend_request(uuid) from anon;
grant execute on function public.accept_friend_request(uuid) to authenticated;

drop policy if exists "Players read their notifications." on public.notifications;
create policy "Players read their notifications."
on public.notifications for select
to authenticated
using ((select auth.uid()) = recipient_id);

drop policy if exists "Players create notifications they send." on public.notifications;
create policy "Players create notifications they send."
on public.notifications for insert
to authenticated
with check ((select auth.uid()) = sender_id);

drop policy if exists "Players delete their notifications." on public.notifications;
create policy "Players delete their notifications."
on public.notifications for delete
to authenticated
using ((select auth.uid()) = recipient_id);

drop policy if exists "Room players can read room." on public.rooms;
create policy "Room players can read room."
on public.rooms for select
to authenticated
using ((select auth.uid()) in (host_id, guest_id));

drop policy if exists "Waiting rooms are joinable by signed-in players." on public.rooms;
create policy "Waiting rooms are joinable by signed-in players."
on public.rooms for select
to authenticated
using (status = 'waiting');

drop policy if exists "Room player can create room." on public.rooms;
create policy "Room player can create room."
on public.rooms for insert
to authenticated
with check ((select auth.uid()) in (host_id, guest_id));

drop policy if exists "Room players can update room." on public.rooms;
create policy "Room players can update room."
on public.rooms for update
to authenticated
using ((select auth.uid()) in (host_id, guest_id))
with check ((select auth.uid()) in (host_id, guest_id));

drop policy if exists "Signed-in players can join waiting rooms." on public.rooms;
create policy "Signed-in players can join waiting rooms."
on public.rooms for update
to authenticated
using (status = 'waiting' and guest_id is null and (select auth.uid()) <> host_id)
with check (status = 'playing' and guest_id = (select auth.uid()) and (select auth.uid()) <> host_id);

drop policy if exists "Host can delete waiting room." on public.rooms;
create policy "Host can delete waiting room."
on public.rooms for delete
to authenticated
using ((select auth.uid()) = host_id and status = 'waiting');

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end $$;

drop policy if exists "Verified wallets are readable by owner." on public.wallet_links;
create policy "Verified wallets are readable by owner."
on public.wallet_links for select
to authenticated
using ((select auth.uid()) = auth_user_id);

drop policy if exists "Active bot challenges are readable." on public.bot_challenges;
create policy "Active bot challenges are readable."
on public.bot_challenges for select
to authenticated, anon
using (status in ('active', 'paused'));

drop policy if exists "Players read own challenge attempts." on public.bot_challenge_attempts;
create policy "Players read own challenge attempts."
on public.bot_challenge_attempts for select
to authenticated
using ((select auth.uid()) = auth_user_id);

drop policy if exists "Players read own challenge moves." on public.bot_challenge_moves;
create policy "Players read own challenge moves."
on public.bot_challenge_moves for select
to authenticated
using ((select auth.uid()) = auth_user_id);

drop policy if exists "Players read own challenge claims." on public.bot_challenge_claims;
create policy "Players read own challenge claims."
on public.bot_challenge_claims for select
to authenticated
using ((select auth.uid()) = auth_user_id);

drop policy if exists "Players read own chain events." on public.chain_events;
create policy "Players read own chain events."
on public.chain_events for select
to authenticated
using (
  exists (
    select 1
    from public.bot_challenge_claims c
    where c.id = chain_events.claim_id
      and c.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "Guests can insert anonymous analytics events." on public.analytics_events;
create policy "Guests can insert anonymous analytics events."
on public.analytics_events for insert
to anon
with check (
  auth_user_id is null
  and is_guest = true
);

drop policy if exists "Signed in users can insert own analytics events." on public.analytics_events;
create policy "Signed in users can insert own analytics events."
on public.analytics_events for insert
to authenticated
with check (
  auth_user_id = (select auth.uid())
  and is_guest = false
);

insert into public.bot_challenges (
  id, season, title, description, bot_id, bot_name, bot_side, player_side, bot_profile, prize_usdc, max_claims, status
) values
  (
    'defeat-tiger-bot',
    'season-1',
    'Defeat Tiger Bot',
    'Play Goat against Bhairav Apex and trap every tiger.',
    'bhairav-apex',
    'Bhairav Apex',
    'tiger',
    'goat',
    'tiger_apex',
    4,
    1,
    'active'
  ),
  (
    'defeat-goat-bot',
    'season-1',
    'Defeat Goat Bot',
    'Play Tiger against Patan Chainmaster and capture five goats.',
    'patan-chain',
    'Patan Chainmaster',
    'goat',
    'tiger',
    'goat_deep_chain',
    2,
    1,
    'active'
  )
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  bot_id = excluded.bot_id,
  bot_name = excluded.bot_name,
  bot_side = excluded.bot_side,
  player_side = excluded.player_side,
  bot_profile = excluded.bot_profile,
  prize_usdc = excluded.prize_usdc,
  max_claims = excluded.max_claims,
  status = excluded.status,
  updated_at = now();
