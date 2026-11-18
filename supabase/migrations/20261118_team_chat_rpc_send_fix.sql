create or replace function public.send_team_message(
  p_recipient_id uuid,
  p_body text,
  p_client_request_id text default null,
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_mime text default null,
  p_attachment_size bigint default null,
  p_expires_at timestamptz default null
)
returns setof public.team_messages
language plpgsql security definer set search_path = public
as $$
declare v_sender uuid;
begin
  v_sender := auth.uid();
  if v_sender is null then raise exception 'Authentication required.'; end if;
  if not exists (select 1 from public.profiles where id = v_sender) then raise exception 'Your account profile is not active. Please sign in again.'; end if;
  if p_recipient_id is not null and not exists (select 1 from public.profiles where id = p_recipient_id) then raise exception 'The selected recipient is not an active team member.'; end if;
  if length(trim(coalesce(p_body,''))) > 2000 then raise exception 'Message is too long.'; end if;
  if length(trim(coalesce(p_body,''))) = 0 and p_attachment_path is null then raise exception 'Write a message or attach a file.'; end if;
  if p_attachment_size is not null and p_attachment_size > 20971520 then raise exception 'Attachment exceeds 20 MB.'; end if;
  if p_client_request_id is not null then
    return query select * from public.team_messages where client_request_id = p_client_request_id and sender_id = v_sender;
    if found then return; end if;
  end if;
  return query insert into public.team_messages(sender_id,recipient_id,body,client_request_id,attachment_path,attachment_name,attachment_mime,attachment_size,expires_at)
    values(v_sender,p_recipient_id,trim(coalesce(p_body,'')),p_client_request_id,p_attachment_path,p_attachment_name,p_attachment_mime,p_attachment_size,p_expires_at)
    returning *;
end;
$$;
revoke all on function public.send_team_message(uuid,text,text,text,text,text,bigint,timestamptz) from public, anon;
grant execute on function public.send_team_message(uuid,text,text,text,text,text,bigint,timestamptz) to authenticated;
notify pgrst, 'reload schema';