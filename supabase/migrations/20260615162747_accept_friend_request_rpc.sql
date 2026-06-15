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
