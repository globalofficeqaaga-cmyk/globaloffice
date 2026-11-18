-- Safe opportunistic cleanup for expired team-chat attachments.
create or replace function public.get_expired_team_message_attachments()
returns table(attachment_path text) language sql stable security definer set search_path=public as $$
 select m.attachment_path from public.team_messages m where m.expires_at is not null and m.expires_at<=now() and m.attachment_path is not null and (m.sender_id=auth.uid() or m.recipient_id=auth.uid() or m.recipient_id is null);
$$;
revoke all on function public.get_expired_team_message_attachments() from public,anon;
grant execute on function public.get_expired_team_message_attachments() to authenticated;
drop policy if exists team_chat_files_delete_participants on storage.objects;
create policy team_chat_files_delete_participants on storage.objects for delete to authenticated using (bucket_id='team-chat-files' and exists (select 1 from public.team_messages m where m.attachment_path=storage.objects.name and m.expires_at is not null and m.expires_at<=now() and (m.sender_id=auth.uid() or m.recipient_id=auth.uid() or m.recipient_id is null or public.is_admin())));
create or replace function public.purge_expired_team_messages() returns integer language plpgsql security definer set search_path=public,storage as $$ declare deleted_count integer; begin delete from public.team_messages m where m.expires_at is not null and m.expires_at<=now() and (m.attachment_path is null or not exists(select 1 from storage.objects o where o.bucket_id='team-chat-files' and o.name=m.attachment_path)); get diagnostics deleted_count=row_count; return deleted_count; end; $$;
revoke all on function public.purge_expired_team_messages() from public,anon,authenticated;
grant execute on function public.purge_expired_team_messages() to service_role;
create or replace function public.cleanup_expired_team_messages() returns integer language plpgsql security definer set search_path=public as $$ begin if auth.uid() is null then raise exception 'Authentication required.'; end if; return public.purge_expired_team_messages(); end; $$;
revoke all on function public.cleanup_expired_team_messages() from public,anon;
grant execute on function public.cleanup_expired_team_messages() to authenticated;
notify pgrst, 'reload schema';
