-- Team chat attachment actions, message deletion, and storage-aware expiry cleanup.
-- Safe to run repeatedly.

create or replace function public.attest_team_message_attachment(p_message_id uuid)
returns public.team_messages
language plpgsql security definer set search_path = public, storage as $$
declare v_message public.team_messages;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  update public.team_messages
     set attachment_received_at = coalesce(attachment_received_at, now()),
         attachment_received_by = coalesce(attachment_received_by, auth.uid())
   where id = p_message_id
     and attachment_path is not null
     and sender_id <> auth.uid()
     and (recipient_id = auth.uid() or recipient_id is null)
     and (expires_at is null or expires_at > now())
   returning * into v_message;
  if not found then raise exception 'Only the recipient can attest an active attachment.'; end if;
  return v_message;
end;
$$;
revoke all on function public.attest_team_message_attachment(uuid) from public, anon;
grant execute on function public.attest_team_message_attachment(uuid) to authenticated;

create or replace function public.verify_team_message_attachment(p_message_id uuid, p_note text default null)
returns public.team_messages
language plpgsql security definer set search_path = public as $$
declare v_message public.team_messages;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.permissions @> '["manage_finance"]'::jsonb)
  ) then raise exception 'Admin or Accounts verification permission required.'; end if;
  update public.team_messages
     set attachment_verified_at = now(),
         attachment_verified_by = auth.uid(),
         attachment_verification_note = nullif(left(trim(coalesce(p_note, '')), 500), '')
   where id = p_message_id
     and attachment_path is not null
     and attachment_received_at is not null
     and (expires_at is null or expires_at > now())
   returning * into v_message;
  if not found then raise exception 'Attachment must be received before verification.'; end if;
  return v_message;
end;
$$;
revoke all on function public.verify_team_message_attachment(uuid, text) from public, anon;
grant execute on function public.verify_team_message_attachment(uuid, text) to authenticated;

create or replace function public.delete_team_message(p_message_id uuid)
returns boolean
language plpgsql security definer set search_path = public, storage as $$
declare v_message public.team_messages;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into v_message from public.team_messages where id = p_message_id for update;
  if not found then return false; end if;
  if v_message.sender_id <> auth.uid() and not public.is_admin() then
    raise exception 'You can delete only your own messages. Admin can delete any message.';
  end if;
  if v_message.attachment_path is not null then
    delete from storage.objects
    where bucket_id = 'team-chat-files' and name = v_message.attachment_path;
  end if;
  delete from public.team_messages where id = p_message_id;
  return true;
end;
$$;
revoke all on function public.delete_team_message(uuid) from public, anon;
grant execute on function public.delete_team_message(uuid) to authenticated;

create or replace function public.cleanup_expired_team_messages()
returns integer language plpgsql security definer set search_path = public, storage as $$
declare deleted_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  delete from storage.objects o
  using public.team_messages m
  where o.bucket_id = 'team-chat-files'
    and o.name = m.attachment_path
    and m.expires_at is not null
    and m.expires_at <= now();
  delete from public.team_messages where expires_at is not null and expires_at <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function public.cleanup_expired_team_messages() from public, anon;
grant execute on function public.cleanup_expired_team_messages() to authenticated;

create or replace function public.cleanup_expired_team_messages_before_insert()
returns trigger language plpgsql security definer set search_path = public, storage as $$
begin
  delete from storage.objects o
  using public.team_messages m
  where o.bucket_id = 'team-chat-files'
    and o.name = m.attachment_path
    and m.expires_at is not null
    and m.expires_at <= now();
  delete from public.team_messages where expires_at is not null and expires_at <= now();
  return new;
end;
$$;
revoke all on function public.cleanup_expired_team_messages_before_insert() from public, anon, authenticated;
drop trigger if exists trg_cleanup_expired_team_messages on public.team_messages;
create trigger trg_cleanup_expired_team_messages before insert on public.team_messages
  for each row execute function public.cleanup_expired_team_messages_before_insert();

notify pgrst, 'reload schema';

-- Ensure scheduled expiry cleanup also removes private Storage objects.
create or replace function public.purge_expired_team_messages()
returns integer language plpgsql security definer set search_path = public, storage as $$
declare deleted_count integer;
begin
  delete from storage.objects o
  using public.team_messages m
  where o.bucket_id = 'team-chat-files'
    and o.name = m.attachment_path
    and m.expires_at is not null
    and m.expires_at <= now();
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

create or replace function public.cleanup_expired_team_messages_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.purge_expired_team_messages();
  return new;
end;
$$;
revoke all on function public.cleanup_expired_team_messages_before_insert() from public, anon, authenticated;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'purge-expired-team-chat-messages';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'purge-expired-team-chat-messages',
    '*/5 * * * *',
    'select public.purge_expired_team_messages();'
  );
end $$;
notify pgrst, 'reload schema';
