-- Make the sub-admin permission behave like an Admin for operational CRUD.
-- Existing row ownership and role-specific policies remain in place for other users.
do $$
declare
  t text;
begin
  foreach t in array array['account_ledger','meetings','medicals','interviews','staff_attendance','staff_daily_logs','site_settings']
  loop
    execute format('drop policy if exists sub_admin_full_manage on public.%I', t);
    execute format(
      'create policy sub_admin_full_manage on public.%I for all to authenticated using (public.is_sub_admin()) with check (public.is_sub_admin())',
      t
    );
  end loop;
end $$;

create or replace function public.delete_team_message(p_message_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_message public.team_messages;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_message
  from public.team_messages
  where id = p_message_id
  for update;

  if not found then
    return null;
  end if;

  if v_message.sender_id <> auth.uid()
     and not public.is_admin()
     and not public.is_sub_admin() then
    raise exception 'You can delete only your own messages. Admin or Sub-admin can delete any message.';
  end if;

  delete from public.team_messages where id = p_message_id;
  return v_message.attachment_path;
end;
$function$;

create or replace function public.verify_team_message_attachment(
  p_message_id uuid,
  p_note text default null
)
returns public.team_messages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_message public.team_messages;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or p.permissions @> '["sub_admin"]'::jsonb
        or p.permissions @> '["manage_finance"]'::jsonb
      )
  ) then
    raise exception 'Admin, Sub-admin or Accounts verification permission required.';
  end if;

  update public.team_messages
     set attachment_verified_at = now(),
         attachment_verified_by = auth.uid(),
         attachment_verification_note = nullif(left(trim(coalesce(p_note, '')), 500), '')
   where id = p_message_id
     and attachment_path is not null
     and attachment_received_at is not null
     and (expires_at is null or expires_at > now())
   returning * into v_message;

  if not found then
    raise exception 'Attachment must be received before verification.';
  end if;

  return v_message;
end;
$function$;
