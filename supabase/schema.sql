-- Clean Supabase-only schema for BaghChal.
-- Auth is handled by Supabase Google OAuth; app data is protected with auth.uid().
-- Beta clean-slate reset: drops previous Firebase-UID app tables if present.

create extension if not exists pgcrypto;

drop table if exists public.notifications cascade;
drop table if exists public.friendships cascade;
drop table if exists public.games cascade;
drop table if exists public.rooms cascade;
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
  game_mode text not null check (game_mode in ('ai', 'multiplayer')),
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
create index if not exists analytics_events_created_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_guest_mode_idx on public.analytics_events (is_guest, game_mode, event_type, created_at desc);
create index if not exists analytics_events_user_idx on public.analytics_events (auth_user_id, created_at desc)
where auth_user_id is not null;

alter table public.player_profiles enable row level security;
alter table public.games enable row level security;
alter table public.friendships enable row level security;
alter table public.notifications enable row level security;
alter table public.rooms enable row level security;
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

drop policy if exists "Host can delete waiting room." on public.rooms;
create policy "Host can delete waiting room."
on public.rooms for delete
to authenticated
using ((select auth.uid()) = host_id and status = 'waiting');

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
