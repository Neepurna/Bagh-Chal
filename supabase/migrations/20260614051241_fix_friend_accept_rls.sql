drop policy if exists "Players can accept friendship requests sent to them." on public.friendships;
create policy "Players can accept friendship requests sent to them."
on public.friendships for update
to authenticated
using ((select auth.uid()) = friend_id and status = 'pending')
with check ((select auth.uid()) = friend_id and status = 'accepted');
