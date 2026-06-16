create or replace function public.send_game_challenge(
  target_user_id uuid,
  selected_side text default 'random',
  selected_time_control text default '5m'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  challenger_id uuid := auth.uid();
  challenger_username text;
  challenger_photo text;
  challenger_side text;
  opponent_side text;
  notification_id uuid;
begin
  if challenger_id is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null or target_user_id = challenger_id then
    raise exception 'Invalid challenge target';
  end if;

  if selected_side not in ('tiger', 'goat', 'random') then
    raise exception 'Invalid challenge side';
  end if;

  if selected_time_control not in ('3m', '5m', '10m', 'infinite') then
    raise exception 'Invalid time control';
  end if;

  if not exists (
    select 1
    from public.friendships
    where owner_id = challenger_id
      and friend_id = target_user_id
      and status = 'accepted'
  ) then
    raise exception 'Players must be friends before challenging';
  end if;

  challenger_side := case
    when selected_side = 'random' then
      case when random() > 0.5 then 'tiger' else 'goat' end
    else selected_side
  end;
  opponent_side := case when challenger_side = 'tiger' then 'goat' else 'tiger' end;

  select
    coalesce(username, display_name, 'Player'),
    coalesce(photo_url, '')
  into challenger_username, challenger_photo
  from public.player_profiles
  where auth_user_id = challenger_id;

  insert into public.notifications (
    recipient_id,
    sender_id,
    type,
    status,
    payload
  ) values (
    target_user_id,
    challenger_id,
    'challenge',
    'pending',
    jsonb_build_object(
      'from', challenger_id,
      'fromUsername', coalesce(challenger_username, 'Player'),
      'fromPhoto', coalesce(challenger_photo, ''),
      'challengerSide', challenger_side,
      'opponentSide', opponent_side,
      'challengeTime', selected_time_control
    )
  )
  returning id into notification_id;

  return jsonb_build_object(
    'challenge_id', notification_id,
    'challenger_side', challenger_side,
    'opponent_side', opponent_side
  );
end;
$$;

revoke all on function public.send_game_challenge(uuid, text, text) from public;
revoke all on function public.send_game_challenge(uuid, text, text) from anon;
grant execute on function public.send_game_challenge(uuid, text, text) to authenticated;
