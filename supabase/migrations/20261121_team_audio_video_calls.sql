-- Peer-to-peer audio/video call signalling and call history.
create table if not exists public.team_call_sessions (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('audio', 'video')),
  status text not null default 'ringing'
    check (status in ('ringing', 'accepted', 'rejected', 'missed', 'completed', 'cancelled', 'failed', 'busy')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  constraint team_call_sessions_distinct_participants check (caller_id <> callee_id)
);

create index if not exists team_call_sessions_caller_created_idx
  on public.team_call_sessions (caller_id, created_at desc);
create index if not exists team_call_sessions_callee_created_idx
  on public.team_call_sessions (callee_id, created_at desc);

alter table public.team_call_sessions enable row level security;
grant select, insert on public.team_call_sessions to authenticated;
grant update (status, started_at, ended_at, duration_seconds) on public.team_call_sessions to authenticated;

drop policy if exists team_call_sessions_select_participant on public.team_call_sessions;
create policy team_call_sessions_select_participant
  on public.team_call_sessions for select to authenticated
  using (auth.uid() = caller_id or auth.uid() = callee_id);

drop policy if exists team_call_sessions_insert_caller on public.team_call_sessions;
create policy team_call_sessions_insert_caller
  on public.team_call_sessions for insert to authenticated
  with check (
    auth.uid() = caller_id
    and callee_id <> auth.uid()
    and exists (select 1 from public.profiles p where p.id = callee_id)
    and exists (select 1 from public.profiles p where p.id = auth.uid())
  );

drop policy if exists team_call_sessions_update_participant on public.team_call_sessions;
create policy team_call_sessions_update_participant
  on public.team_call_sessions for update to authenticated
  using (auth.uid() = caller_id or auth.uid() = callee_id)
  with check (auth.uid() = caller_id or auth.uid() = callee_id);

create or replace function public.prevent_team_call_participant_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.caller_id <> old.caller_id
     or new.callee_id <> old.callee_id
     or new.media_type <> old.media_type
     or new.created_at <> old.created_at then
    raise exception 'Call participants and call type cannot be changed.';
  end if;
  return new;
end;
$$;

drop trigger if exists team_call_sessions_immutable_participants on public.team_call_sessions;
create trigger team_call_sessions_immutable_participants
  before update on public.team_call_sessions
  for each row execute function public.prevent_team_call_participant_change();

revoke all on function public.prevent_team_call_participant_change() from public, anon, authenticated;

-- Private inbox topics: any signed-in team member may send an invite, only
-- the intended recipient can subscribe and receive it.
drop policy if exists team_call_inbox_receive on realtime.messages;
create policy team_call_inbox_receive
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and topic = 'call-inbox:' || (select auth.uid())::text
  );

drop policy if exists team_call_inbox_send on realtime.messages;
create policy team_call_inbox_send
  on realtime.messages for insert to authenticated
  with check (
    extension = 'broadcast'
    and topic like 'call-inbox:%'
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()))
  );

-- Call-room topics are only readable/writable by the two participants in the
-- corresponding persisted call session.
drop policy if exists team_call_room_receive on realtime.messages;
create policy team_call_room_receive
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and exists (
      select 1
      from public.team_call_sessions s
      where topic = 'call-room:' || s.id::text
        and (s.caller_id = (select auth.uid()) or s.callee_id = (select auth.uid()))
    )
  );

drop policy if exists team_call_room_send on realtime.messages;
create policy team_call_room_send
  on realtime.messages for insert to authenticated
  with check (
    extension = 'broadcast'
    and exists (
      select 1
      from public.team_call_sessions s
      where topic = 'call-room:' || s.id::text
        and (s.caller_id = (select auth.uid()) or s.callee_id = (select auth.uid()))
    )
  );

notify pgrst, 'reload schema';
