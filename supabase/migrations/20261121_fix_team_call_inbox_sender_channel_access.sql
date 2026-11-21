drop policy if exists team_call_inbox_receive on realtime.messages;
create policy team_call_inbox_receive
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and (
      topic = 'call-inbox:' || (select auth.uid())::text
      or (
        topic like 'call-inbox:%'
        and exists (
          select 1
          from public.team_call_sessions s
          where s.callee_id::text = split_part(topic, ':', 2)
            and s.caller_id = (select auth.uid())
            and s.status = 'ringing'
        )
      )
    )
  );
