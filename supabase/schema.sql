create table if not exists public.player_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  rating integer not null default 500 check (rating >= 100),
  games_played integer not null default 0 check (games_played >= 0),
  tiger_wins integer not null default 0 check (tiger_wins >= 0),
  goat_wins integer not null default 0 check (goat_wins >= 0),
  rated_wins integer not null default 0 check (rated_wins >= 0),
  rated_losses integer not null default 0 check (rated_losses >= 0),
  adventure_level integer not null default 0 check (adventure_level between 0 and 6),
  adventure_completed integer not null default 0 check (adventure_completed between 0 and 6),
  leaderboard_score integer not null default 500,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key,
  player_id uuid not null references auth.users(id) on delete cascade,
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

create index if not exists games_player_updated_idx on public.games (player_id, updated_at desc);
create index if not exists player_profiles_leaderboard_idx on public.player_profiles (leaderboard_score desc, rating desc);

alter table public.player_profiles enable row level security;
alter table public.games enable row level security;

drop policy if exists "Players can view public leaderboard profiles." on public.player_profiles;
create policy "Players can view public leaderboard profiles."
on public.player_profiles for select
to authenticated, anon
using (true);

drop policy if exists "Players can upsert their own profile." on public.player_profiles;
create policy "Players can upsert their own profile."
on public.player_profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Players can update their own profile." on public.player_profiles;
create policy "Players can update their own profile."
on public.player_profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Players can view their own games." on public.games;
create policy "Players can view their own games."
on public.games for select
to authenticated
using ((select auth.uid()) = player_id);

drop policy if exists "Players can insert their own games." on public.games;
create policy "Players can insert their own games."
on public.games for insert
to authenticated
with check ((select auth.uid()) = player_id);

drop policy if exists "Players can update their own games." on public.games;
create policy "Players can update their own games."
on public.games for update
to authenticated
using ((select auth.uid()) = player_id)
with check ((select auth.uid()) = player_id);
