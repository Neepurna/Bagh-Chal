
create table if not exists public.analytics_events (
  id bigserial primary key,
  session_id text not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('game_start', 'game_end', 'page_view')),
  game_mode text check (game_mode in ('ai', 'multiplayer', 'challenge', 'sandbox')),
  player_side text check (player_side in ('tiger', 'goat')),
  ai_difficulty text check (ai_difficulty in ('easy', 'medium', 'hard')),
  winner text check (winner in ('tiger', 'goat', 'draw')),
  move_count integer,
  duration_seconds integer,
  is_guest boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_session_idx on public.analytics_events (session_id, created_at desc);
create index if not exists analytics_events_type_idx on public.analytics_events (event_type, created_at desc);
create index if not exists analytics_events_created_idx on public.analytics_events (created_at desc);

alter table public.analytics_events enable row level security;

create policy "Anyone can insert analytics events"
  on public.analytics_events for insert
  to anon, authenticated
  with check (true);
;
