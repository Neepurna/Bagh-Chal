drop policy if exists "Signed-in players can join waiting rooms." on public.rooms;
create policy "Signed-in players can join waiting rooms."
on public.rooms for update
to authenticated
using (status = 'waiting' and guest_id is null and (select auth.uid()) <> host_id)
with check (status = 'playing' and guest_id = (select auth.uid()) and (select auth.uid()) <> host_id);

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
