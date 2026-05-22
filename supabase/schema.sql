-- Supabase database for BaghChal with Firebase Auth kept as the identity layer.
-- Configure Supabase Authentication > Third-party Auth > Firebase first.
-- RLS policies compare Firebase JWT `sub` with each row's `firebase_uid`.

create extension if not exists pgcrypto;

create or replace function public.current_firebase_uid()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'sub', '');
$$;

create table if not exists public.player_profiles (
  firebase_uid text primary key,
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

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null references public.player_profiles(firebase_uid) on delete cascade,
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

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  owner_uid text not null references public.player_profiles(firebase_uid) on delete cascade,
  friend_uid text not null references public.player_profiles(firebase_uid) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  direction text check (direction in ('sent', 'received')),
  friend_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_uid, friend_uid)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_uid text not null references public.player_profiles(firebase_uid) on delete cascade,
  sender_uid text references public.player_profiles(firebase_uid) on delete set null,
  type text not null,
  status text default 'pending',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  host_uid text not null references public.player_profiles(firebase_uid) on delete cascade,
  guest_uid text references public.player_profiles(firebase_uid) on delete set null,
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

create index if not exists games_player_updated_idx on public.games (firebase_uid, updated_at desc);
create index if not exists player_profiles_leaderboard_idx on public.player_profiles (leaderboard_score desc, rating desc);
create index if not exists friendships_owner_idx on public.friendships (owner_uid, status);
create index if not exists notifications_recipient_idx on public.notifications (recipient_uid, created_at desc);
create index if not exists rooms_player_idx on public.rooms (host_uid, guest_uid, updated_at desc);

alter table public.player_profiles enable row level security;
alter table public.games enable row level security;
alter table public.friendships enable row level security;
alter table public.notifications enable row level security;
alter table public.rooms enable row level security;

drop policy if exists "Public leaderboard profiles are readable." on public.player_profiles;
create policy "Public leaderboard profiles are readable."
on public.player_profiles for select
to authenticated, anon
using (true);

drop policy if exists "Players create their own profile." on public.player_profiles;
create policy "Players create their own profile."
on public.player_profiles for insert
to authenticated
with check (public.current_firebase_uid() = firebase_uid);

drop policy if exists "Players update their own profile." on public.player_profiles;
create policy "Players update their own profile."
on public.player_profiles for update
to authenticated
using (public.current_firebase_uid() = firebase_uid)
with check (public.current_firebase_uid() = firebase_uid);

drop policy if exists "Players read own games." on public.games;
create policy "Players read own games."
on public.games for select
to authenticated
using (public.current_firebase_uid() = firebase_uid);

drop policy if exists "Players insert own games." on public.games;
create policy "Players insert own games."
on public.games for insert
to authenticated
with check (public.current_firebase_uid() = firebase_uid);

drop policy if exists "Players update own games." on public.games;
create policy "Players update own games."
on public.games for update
to authenticated
using (public.current_firebase_uid() = firebase_uid)
with check (public.current_firebase_uid() = firebase_uid);

drop policy if exists "Players read their friendships." on public.friendships;
create policy "Players read their friendships."
on public.friendships for select
to authenticated
using (public.current_firebase_uid() in (owner_uid, friend_uid));

drop policy if exists "Players manage owned friendships." on public.friendships;
create policy "Players manage owned friendships."
on public.friendships for all
to authenticated
using (public.current_firebase_uid() = owner_uid)
with check (public.current_firebase_uid() = owner_uid);

drop policy if exists "Players read their notifications." on public.notifications;
create policy "Players read their notifications."
on public.notifications for select
to authenticated
using (public.current_firebase_uid() = recipient_uid);

drop policy if exists "Players create notifications they send." on public.notifications;
create policy "Players create notifications they send."
on public.notifications for insert
to authenticated
with check (public.current_firebase_uid() = sender_uid);

drop policy if exists "Players delete their notifications." on public.notifications;
create policy "Players delete their notifications."
on public.notifications for delete
to authenticated
using (public.current_firebase_uid() = recipient_uid);

drop policy if exists "Room players can read room." on public.rooms;
create policy "Room players can read room."
on public.rooms for select
to authenticated
using (public.current_firebase_uid() in (host_uid, guest_uid));

drop policy if exists "Host can create room." on public.rooms;
create policy "Host can create room."
on public.rooms for insert
to authenticated
with check (public.current_firebase_uid() = host_uid);

drop policy if exists "Room players can update room." on public.rooms;
create policy "Room players can update room."
on public.rooms for update
to authenticated
using (public.current_firebase_uid() in (host_uid, guest_uid))
with check (public.current_firebase_uid() in (host_uid, guest_uid));
