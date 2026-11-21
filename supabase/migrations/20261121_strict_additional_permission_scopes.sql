-- Enforce explicitly selected permissions instead of granting report/team access
-- implicitly from the Director or Management dashboard role.

create or replace function public.can_view_all_operations()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or coalesce(p.permissions, '[]'::jsonb) @> '["view_all_reports"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
      )
  );
$function$;

create or replace function public.can_view_team_profiles()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or coalesce(p.permissions, '[]'::jsonb) @> '["view_team_profiles"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["view_all_reports"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
      )
  );
$function$;

create or replace function public.can_send_team_messages()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or coalesce(p.permissions, '[]'::jsonb) @> '["send_messages"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
      )
  );
$function$;

drop policy if exists clients_select_owner_or_admin on public.clients;
create policy clients_select_owner_or_admin
on public.clients
for select
to authenticated
using (
  auth.uid() = staff_id
  or public.can_view_all_operations()
  or public.can_add_client_records()
  or public.can_edit_client_records()
  or public.can_delete_client_records()
);

drop policy if exists team_messages_insert_sender on public.team_messages;
create policy team_messages_insert_sender
on public.team_messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and public.can_send_team_messages()
);

create or replace function public.send_team_message(
  p_recipient_id uuid,
  p_body text,
  p_client_request_id text default null::text,
  p_attachment_path text default null::text,
  p_attachment_name text default null::text,
  p_attachment_mime text default null::text,
  p_attachment_size bigint default null::bigint,
  p_expires_at timestamp with time zone default null::timestamp with time zone
)
returns setof public.team_messages
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sender uuid;
begin
  v_sender := auth.uid();
  if v_sender is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (select 1 from public.profiles where id = v_sender) then
    raise exception 'Your account profile is not active. Please sign in again.';
  end if;

  if not public.can_send_team_messages() then
    raise exception 'Send messages permission is required.';
  end if;

  if p_recipient_id is not null and not exists (
    select 1 from public.profiles where id = p_recipient_id
  ) then
    raise exception 'The selected recipient is not an active team member.';
  end if;

  if length(trim(coalesce(p_body, ''))) > 2000 then
    raise exception 'Message is too long.';
  end if;

  if length(trim(coalesce(p_body, ''))) = 0 and p_attachment_path is null then
    raise exception 'Write a message or attach a file.';
  end if;

  if p_attachment_size is not null and p_attachment_size > 20971520 then
    raise exception 'Attachment exceeds 20 MB.';
  end if;

  if p_client_request_id is not null then
    return query
      select *
      from public.team_messages
      where client_request_id = p_client_request_id
        and sender_id = v_sender;
    if found then
      return;
    end if;
  end if;

  return query
    insert into public.team_messages (
      sender_id, recipient_id, body, client_request_id,
      attachment_path, attachment_name, attachment_mime,
      attachment_size, expires_at
    )
    values (
      v_sender, p_recipient_id, trim(coalesce(p_body, '')),
      p_client_request_id, p_attachment_path, p_attachment_name,
      p_attachment_mime, p_attachment_size, p_expires_at
    )
    returning *;
end;
$function$;
