-- ============================================================================
-- Non-Destructive Production Hardening Migration for Existing Supabase DB
-- Safe to run multiple times (idempotent). Never drops tables or wipes data.
-- ============================================================================

-- 1. Add versioning, idempotency keys, soft-deletion, and audit metadata columns
alter table public.profiles
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

alter table public.clients
  add column if not exists version integer not null default 1,
  add column if not exists client_request_id text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

alter table public.meetings
  add column if not exists version integer not null default 1,
  add column if not exists client_request_id text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

alter table public.medicals
  add column if not exists version integer not null default 1,
  add column if not exists client_request_id text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

alter table public.interviews
  add column if not exists version integer not null default 1,
  add column if not exists client_request_id text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

-- 2. Partial unique indexes for safe network retry idempotency (prevents duplicates)
create unique index if not exists idx_clients_request_id
  on public.clients(client_request_id) where client_request_id is not null;

create unique index if not exists idx_meetings_request_id
  on public.meetings(client_request_id) where client_request_id is not null;

create unique index if not exists idx_medicals_request_id
  on public.medicals(client_request_id) where client_request_id is not null;

create unique index if not exists idx_interviews_request_id
  on public.interviews(client_request_id) where client_request_id is not null;

create index if not exists idx_clients_deleted_at on public.clients(deleted_at);
create index if not exists idx_meetings_deleted_at on public.meetings(deleted_at);
create index if not exists idx_medicals_deleted_at on public.medicals(deleted_at);
create index if not exists idx_interviews_deleted_at on public.interviews(deleted_at);

-- 3. Immutable Audit Log Table
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'SOFT_DELETE', 'RESTORE')),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default '',
  changed_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_record_id on public.audit_logs(record_id);

alter table public.audit_logs enable row level security;

-- Only admins can view full audit logs; staff can view audit entries they performed
drop policy if exists "audit_logs_select_admin_or_actor" on public.audit_logs;
create policy "audit_logs_select_admin_or_actor"
  on public.audit_logs
  for select
  to authenticated
  using (public.is_admin() or actor_id = auth.uid());

-- 4. Version Bump & Audit Trigger Functions
create or replace function public.bump_version_and_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.version := coalesce(new.version, 1);
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := coalesce(new.updated_by, auth.uid());
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), old.updated_by);
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_version on public.profiles;
create trigger trg_profiles_version
  before update on public.profiles
  for each row
  execute function public.bump_version_and_meta();

drop trigger if exists trg_clients_version on public.clients;
create trigger trg_clients_version
  before insert or update on public.clients
  for each row
  execute function public.bump_version_and_meta();

drop trigger if exists trg_meetings_version on public.meetings;
create trigger trg_meetings_version
  before insert or update on public.meetings
  for each row
  execute function public.bump_version_and_meta();

drop trigger if exists trg_medicals_version on public.medicals;
create trigger trg_medicals_version
  before insert or update on public.medicals
  for each row
  execute function public.bump_version_and_meta();

drop trigger if exists trg_interviews_version on public.interviews;
create trigger trg_interviews_version
  before insert or update on public.interviews
  for each row
  execute function public.bump_version_and_meta();

create or replace function public.record_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor_name text;
  v_action text;
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb := '{}'::jsonb;
  v_key text;
begin
  v_actor_id := auth.uid();
  select name into v_actor_name from public.profiles where id = v_actor_id limit 1;
  v_actor_name := coalesce(v_actor_name, 'System');

  if tg_op = 'INSERT' then
    v_action := 'INSERT';
    v_new := to_jsonb(new);
    v_diff := jsonb_build_object(
      'summary', coalesce(v_new ->> 'name', v_new ->> 'candidate_name', v_new ->> 'client_name', v_new ->> 'candidate_names', 'New record')
    );
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);

    if (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then
      v_action := 'SOFT_DELETE';
    elsif (v_old ->> 'deleted_at') is not null and (v_new ->> 'deleted_at') is null then
      v_action := 'RESTORE';
    else
      v_action := 'UPDATE';
    end if;

    for v_key in select jsonb_object_keys(v_new)
    loop
      if v_key in ('version', 'updated_at', 'updated_by', 'client_request_id') then
        continue;
      end if;
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        if v_key in ('passport_number', 'documents') then
          v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object('changed', true));
        else
          v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
        end if;
      end if;
    end loop;

    if v_diff = '{}'::jsonb then
      return new;
    end if;
  end if;

  insert into public.audit_logs (table_name, record_id, action, actor_id, actor_name, changed_fields)
  values (tg_table_name, new.id, v_action, v_actor_id, v_actor_name, v_diff);

  return new;
end;
$$;

drop trigger if exists trg_clients_audit on public.clients;
create trigger trg_clients_audit
  after insert or update on public.clients
  for each row
  execute function public.record_audit_log();

drop trigger if exists trg_meetings_audit on public.meetings;
create trigger trg_meetings_audit
  after insert or update on public.meetings
  for each row
  execute function public.record_audit_log();

drop trigger if exists trg_medicals_audit on public.medicals;
create trigger trg_medicals_audit
  after insert or update on public.medicals
  for each row
  execute function public.record_audit_log();

drop trigger if exists trg_interviews_audit on public.interviews;
create trigger trg_interviews_audit
  after insert or update on public.interviews
  for each row
  execute function public.record_audit_log();

-- 5. Update lookup_client_by_phone to exclude soft-deleted records
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
  if length(v_norm) < 6 then
    return null;
  end if;

  select *
  into v_client
  from public.clients c
  where c.deleted_at is null
    and (
      public.normalize_phone(c.phone) = v_norm
      or public.normalize_phone(c.phone) like '%' || v_norm
      or v_norm like '%' || public.normalize_phone(c.phone)
    )
  order by c.updated_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select *
  into v_staff
  from public.profiles p
  where p.id = v_client.staff_id
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'staffId', m.staff_id,
    'clientId', m.client_id,
    'clientName', m.client_name,
    'clientPhone', m.client_phone,
    'meetingWith', m.meeting_with,
    'location', m.location,
    'dateTime', m.date_time,
    'purpose', m.purpose,
    'status', m.status,
    'notes', m.notes,
    'createdAt', m.created_at
  ) order by m.created_at desc), '[]'::jsonb)
  into v_meetings
  from public.meetings m
  where m.deleted_at is null
    and (
      m.client_id = v_client.id
      or public.normalize_phone(m.client_phone) = public.normalize_phone(v_client.phone)
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', med.id,
    'staffId', med.staff_id,
    'clientId', med.client_id,
    'candidateName', med.candidate_name,
    'candidatePhone', med.candidate_phone,
    'medicalCenter', med.medical_center,
    'medicalLocation', med.medical_location,
    'testDate', med.test_date,
    'result', med.result,
    'amountPaid', med.amount_paid,
    'amountReceivable', med.amount_receivable,
    'paymentPurpose', med.payment_purpose,
    'notes', med.notes,
    'createdAt', med.created_at
  ) order by med.created_at desc), '[]'::jsonb)
  into v_medicals
  from public.medicals med
  where med.deleted_at is null
    and (
      med.client_id = v_client.id
      or public.normalize_phone(med.candidate_phone) = public.normalize_phone(v_client.phone)
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', iv.id,
    'staffId', iv.staff_id,
    'clientId', iv.client_id,
    'candidateNames', iv.candidate_names,
    'clientCount', iv.client_count,
    'interviewerOrCompany', iv.interviewer_or_company,
    'trade', iv.trade,
    'interviewDate', iv.interview_date,
    'interviewTime', iv.interview_time,
    'location', iv.location,
    'status', iv.status,
    'notes', iv.notes,
    'createdAt', iv.created_at
  ) order by iv.created_at desc), '[]'::jsonb)
  into v_interviews
  from public.interviews iv
  where iv.deleted_at is null
    and (
      iv.client_id = v_client.id
      or lower(iv.candidate_names) like '%' || lower(v_client.name) || '%'
    );

  return jsonb_build_object(
    'client', jsonb_build_object(
      'id', v_client.id,
      'staffId', v_client.staff_id,
      'name', v_client.name,
      'phone', v_client.phone,
      'address', v_client.address,
      'passportNumber', v_client.passport_number,
      'trade', v_client.trade,
      'destinationCountry', v_client.destination_country,
      'expectedSalary', v_client.expected_salary,
      'status', v_client.status,
      'medicalDone', v_client.medical_done,
      'medicalStatus', v_client.medical_status,
      'medicalCenter', v_client.medical_center,
      'medicalLocation', v_client.medical_location,
      'totalPayable', v_client.total_payable,
      'totalPaid', v_client.total_paid,
      'pendingItems', v_client.pending_items,
      'documents', v_client.documents,
      'payments', v_client.payments,
      'notes', v_client.notes,
      'version', v_client.version,
      'createdAt', v_client.created_at,
      'updatedAt', v_client.updated_at
    ),
    'staff', case when v_staff.id is not null then jsonb_build_object(
      'id', v_staff.id,
      'userId', v_staff.user_id,
      'role', v_staff.role,
      'name', v_staff.name,
      'designation', v_staff.designation,
      'phone', v_staff.phone,
      'whatsapp', v_staff.whatsapp,
      'socialLink', v_staff.social_link,
      'photoUrl', v_staff.photo_url,
      'coverUrl', v_staff.cover_url,
      'createdAt', v_staff.created_at
    ) else null end,
    'meetings', v_meetings,
    'medicals', v_medicals,
    'interviews', v_interviews
  );
end;
$$;

-- 6. Private Storage Bucket for Client Documents & Attachments + Staff Media Bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-documents',
  'client-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-media',
  'staff-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Private Storage RLS Policies for client-documents (Owner staff or Admin only)
drop policy if exists "client_docs_select_owner_or_admin" on storage.objects;
create policy "client_docs_select_owner_or_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'client-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "client_docs_insert_owner_or_admin" on storage.objects;
create policy "client_docs_insert_owner_or_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'client-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "client_docs_update_owner_or_admin" on storage.objects;
create policy "client_docs_update_owner_or_admin"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'client-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "client_docs_delete_owner_or_admin" on storage.objects;
create policy "client_docs_delete_owner_or_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'client-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- Staff Media Storage RLS Policies (Public read for client lookup card; owner/admin write)
drop policy if exists "staff_media_public_read" on storage.objects;
create policy "staff_media_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'staff-media');

drop policy if exists "staff_media_owner_insert" on storage.objects;
create policy "staff_media_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'staff-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "staff_media_owner_update" on storage.objects;
create policy "staff_media_owner_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'staff-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "staff_media_owner_delete" on storage.objects;
create policy "staff_media_owner_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'staff-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
