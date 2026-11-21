create or replace function public.is_active_team_call_member(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.profiles p where p.id = p_user_id);
$$;

revoke all on function public.is_active_team_call_member(uuid) from public, anon;
grant execute on function public.is_active_team_call_member(uuid) to authenticated;

drop policy if exists team_call_sessions_insert_caller on public.team_call_sessions;
create policy team_call_sessions_insert_caller
  on public.team_call_sessions for insert to authenticated
  with check (
    auth.uid() = caller_id
    and callee_id <> auth.uid()
    and public.is_active_team_call_member(callee_id)
    and public.is_active_team_call_member(auth.uid())
  );
