create table if not exists public.analytics_events (
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

create index if not exists analytics_events_created_idx
on public.analytics_events (created_at desc);

create index if not exists analytics_events_guest_mode_idx
on public.analytics_events (is_guest, game_mode, event_type, created_at desc);

create index if not exists analytics_events_user_idx
on public.analytics_events (auth_user_id, created_at desc)
where auth_user_id is not null;

alter table public.analytics_events enable row level security;

grant insert on public.analytics_events to anon, authenticated;

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
