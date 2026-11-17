-- Public client tracking must return only the public tracking contract.
-- Match the full normalized phone number, never a suffix/partial number.
create or replace function public.lookup_client_by_phone(p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_client public.clients%rowtype;
  v_staff public.profiles%rowtype;
  v_meetings jsonb;
  v_medicals jsonb;
  v_interviews jsonb;
begin
  v_norm := public.normalize_phone(p_phone);
  if length(v_norm) < 10 or length(v_norm) > 15 then return null; end if;

  select * into v_client from public.clients c
  where c.deleted_at is null and public.normalize_phone(c.phone) = v_norm
  order by c.updated_at desc limit 1;
  if not found then return null; end if;

  select * into v_staff from public.profiles p where p.id = v_client.staff_id limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'meetingWith', m.meeting_with, 'location', m.location,
    'dateTime', m.date_time, 'status', m.status
  ) order by m.created_at desc), '[]'::jsonb) into v_meetings
  from public.meetings m where m.deleted_at is null
    and (m.client_id = v_client.id or public.normalize_phone(m.client_phone) = v_norm);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', med.id, 'medicalCenter', med.medical_center,
    'medicalLocation', med.medical_location, 'testDate', med.test_date, 'result', med.result
  ) order by med.created_at desc), '[]'::jsonb) into v_medicals
  from public.medicals med where med.deleted_at is null
    and (med.client_id = v_client.id or public.normalize_phone(med.candidate_phone) = v_norm);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', iv.id, 'interviewerOrCompany', iv.interviewer_or_company,
    'trade', iv.trade, 'interviewDate', iv.interview_date,
    'interviewTime', iv.interview_time, 'location', iv.location, 'status', iv.status
  ) order by iv.created_at desc), '[]'::jsonb) into v_interviews
  from public.interviews iv where iv.deleted_at is null and iv.client_id = v_client.id;

  return jsonb_build_object(
    'client', jsonb_build_object(
      'id', v_client.id, 'name', v_client.name, 'phone', v_client.phone,
      'trade', v_client.trade, 'destinationCountry', v_client.destination_country,
      'status', v_client.status, 'medicalDone', v_client.medical_done,
      'medicalStatus', v_client.medical_status, 'medicalCenter', v_client.medical_center,
      'medicalLocation', v_client.medical_location, 'updatedAt', v_client.updated_at
    ),
    'staff', case when v_staff.id is not null then jsonb_build_object(
      'id', v_staff.id, 'name', v_staff.name, 'designation', v_staff.designation,
      'phone', v_staff.phone, 'whatsapp', v_staff.whatsapp,
      'socialLink', v_staff.social_link, 'photoUrl', v_staff.photo_url, 'coverUrl', v_staff.cover_url
    ) else null end,
    'meetings', v_meetings, 'medicals', v_medicals, 'interviews', v_interviews
  );
end;
$$;
revoke all on function public.lookup_client_by_phone(text) from public;
grant execute on function public.lookup_client_by_phone(text) to anon, authenticated;
