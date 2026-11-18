-- Team chat send hotfix: remove SQL-based Storage deletion from message triggers.
drop trigger if exists trg_cleanup_expired_team_messages on public.team_messages;

create or replace function public.purge_expired_team_messages()
returns integer language plpgsql security definer set search_path = public as $$
declare deleted_count integer;
begin
  delete from public.team_messages where expires_at is not null and expires_at <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function public.purge_expired_team_messages() from public, anon, authenticated;
grant execute on function public.purge_expired_team_messages() to service_role;

create or replace function public.cleanup_expired_team_messages()
returns integer language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  return public.purge_expired_team_messages();
end;
$$;
revoke all on function public.cleanup_expired_team_messages() from public, anon;
grant execute on function public.cleanup_expired_team_messages() to authenticated;

drop function if exists public.delete_team_message(uuid);
create function public.delete_team_message(p_message_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_message public.team_messages;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_message from public.team_messages where id = p_message_id for update;
  if not found then return null; end if;
  if v_message.sender_id <> auth.uid() and not public.is_admin() then
    raise exception 'You can delete only your own messages. Admin can delete any message.';
  end if;
  delete from public.team_messages where id = p_message_id;
  return v_message.attachment_path;
end;
$$;
revoke all on function public.delete_team_message(uuid) from public, anon;
grant execute on function public.delete_team_message(uuid) to authenticated;

drop policy if exists team_chat_files_delete_participants on storage.objects;
create policy team_chat_files_delete_participants on storage.objects
for delete to authenticated using (
  bucket_id = 'team-chat-files' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (storage.foldername(name))[2] = auth.uid()::text
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
);
notify pgrst, 'reload schema';
