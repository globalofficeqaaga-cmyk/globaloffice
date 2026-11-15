-- ============================================================================
-- Global Pathways / GlobalOffice — Supabase PostgreSQL Schema & RLS Policies
-- Run this script once in your Supabase Dashboard -> SQL Editor.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. PROFILES TABLE (Linked 1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id text unique not null,
  email text unique not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  name text not null,
  designation text not null default 'Visa & Recruitment Coordinator',
  phone text not null default '',
  whatsapp text not null default '',
  social_link text not null default '',
  photo_url text not null default '',
  cover_url text not null default '',
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Helper function: checks whether the current authenticated user is an admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- Prevent non-admin users from escalating their own role via UPDATE
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only administrators can change user roles.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_self_escalation on public.profiles;
create trigger trg_prevent_role_self_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_role_self_escalation();

-- Automatically create a profile row whenever a user registers via Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_name text;
begin
  v_user_id := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'user_id'), ''),
    split_part(coalesce(new.email, new.id::text), '@', 1) || '_' || substr(new.id::text, 1, 4)
  );
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, 'User'), '@', 1)
  );

  insert into public.profiles (
    id,
    user_id,
    email,
    role,
    name,
    designation,
    phone,
    whatsapp,
    social_link,
    photo_url,
    cover_url
  )
  values (
    new.id,
    v_user_id,
    coalesce(new.email, ''),
    'staff',
    v_name,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'designation'), ''), 'Visa & Recruitment Coordinator'),
    coalesce(trim(new.raw_user_meta_data ->> 'phone'), ''),
    coalesce(trim(new.raw_user_meta_data ->> 'whatsapp'), coalesce(trim(new.raw_user_meta_data ->> 'phone'), '')),
    coalesce(trim(new.raw_user_meta_data ->> 'social_link'), ''),
    coalesce(trim(new.raw_user_meta_data ->> 'photo_url'), ''),
    coalesce(trim(new.raw_user_meta_data ->> 'cover_url'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Profiles RLS Policies
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_own_staff" on public.profiles;
create policy "profiles_insert_own_staff"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id and role = 'staff');

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_delete_admin_only" on public.profiles;
create policy "profiles_delete_admin_only"
  on public.profiles
  for delete
  to authenticated
  using (public.is_admin() and auth.uid() <> id);

-- ----------------------------------------------------------------------------
-- 2. CLIENTS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  phone text not null,
  address text not null default '',
  passport_number text not null default '',
  trade text not null default '',
  destination_country text not null default '',
  expected_salary text not null default '',
  status text not null default 'Document Collection',
  medical_done boolean not null default false,
  medical_status text not null default 'Not Started',
  medical_center text not null default '',
  medical_location text not null default '',
  total_payable numeric(12, 2) not null default 0,
  total_paid numeric(12, 2) not null default 0,
  pending_items text not null default '',
  documents jsonb not null default '[]'::jsonb,
  payments jsonb not null default '[]'::jsonb,
  notes text not null default '',
  version integer not null default 1,
  client_request_id text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_staff_id on public.clients(staff_id);
create index if not exists idx_clients_phone on public.clients(phone);
create index if not exists idx_clients_deleted_at on public.clients(deleted_at);
create unique index if not exists idx_clients_request_id on public.clients(client_request_id) where client_request_id is not null;

alter table public.clients enable row level security;

drop policy if exists "clients_select_owner_or_admin" on public.clients;
create policy "clients_select_owner_or_admin"
  on public.clients
  for select
  to authenticated
  using (auth.uid() = staff_id or public.is_admin());

drop policy if exists "clients_insert_owner_or_admin" on public.clients;
create policy "clients_insert_owner_or_admin"
  on public.clients
  for insert
  to authenticated
  with check (auth.uid() = staff_id or public.is_admin());

drop policy if exists "clients_update_owner_or_admin" on public.clients;
create policy "clients_update_owner_or_admin"
  on public.clients
  for update
  to authenticated
  using (auth.uid() = staff_id or public.is_admin())
  with check (auth.uid() = staff_id or public.is_admin());

drop policy if exists "clients_delete_owner_or_admin" on public.clients;
create policy "clients_delete_owner_or_admin"
  on public.clients
  for delete
  to authenticated
  using (auth.uid() = staff_id or public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. MEETINGS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  client_phone text not null default '',
  meeting_with text not null,
  location text not null,
  date_time text not null,
  purpose text not null default '',
  status text not null default 'Scheduled',
  notes text not null default '',
  version integer not null default 1,
  client_request_id text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_meetings_staff_id on public.meetings(staff_id);
create index if not exists idx_meetings_deleted_at on public.meetings(deleted_at);
create unique index if not exists idx_meetings_request_id on public.meetings(client_request_id) where client_request_id is not null;

alter table public.meetings enable row level security;

drop policy if exists "meetings_select_owner_or_admin" on public.meetings;
create policy "meetings_select_owner_or_admin"
  on public.meetings
  for select
  to authenticated
  using (auth.uid() = staff_id or public.is_admin());

drop policy if exists "meetings_insert_owner_or_admin" on public.meetings;
create policy "meetings_insert_owner_or_admin"
  on public.meetings
  for insert
  to authenticated
  with check (auth.uid() = staff_id or public.is_admin());

drop policy if exists "meetings_update_owner_or_admin" on public.meetings;
create policy "meetings_update_owner_or_admin"
  on public.meetings
  for update
  to authenticated
  using (auth.uid() = staff_id or public.is_admin())
  with check (auth.uid() = staff_id or public.is_admin());

drop policy if exists "meetings_delete_owner_or_admin" on public.meetings;
create policy "meetings_delete_owner_or_admin"
  on public.meetings
  for delete
  to authenticated
  using (auth.uid() = staff_id or public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. MEDICALS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.medicals (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  candidate_name text not null,
  candidate_phone text not null default '',
  medical_center text not null,
  medical_location text not null,
  test_date text not null,
  result text not null default 'Pending',
  amount_paid numeric(12, 2) not null default 0,
  amount_receivable numeric(12, 2) not null default 0,
  payment_purpose text not null default '',
  notes text not null default '',
  version integer not null default 1,
  client_request_id text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_medicals_staff_id on public.medicals(staff_id);
create index if not exists idx_medicals_deleted_at on public.medicals(deleted_at);
create unique index if not exists idx_medicals_request_id on public.medicals(client_request_id) where client_request_id is not null;

alter table public.medicals enable row level security;

drop policy if exists "medicals_select_owner_or_admin" on public.medicals;
create policy "medicals_select_owner_or_admin"
  on public.medicals
  for select
  to authenticated
  using (auth.uid() = staff_id or public.is_admin());

drop policy if exists "medicals_insert_owner_or_admin" on public.medicals;
create policy "medicals_insert_owner_or_admin"
  on public.medicals
  for insert
  to authenticated
  with check (auth.uid() = staff_id or public.is_admin());

drop policy if exists "medicals_update_owner_or_admin" on public.medicals;
create policy "medicals_update_owner_or_admin"
  on public.medicals
  for update
  to authenticated
  using (auth.uid() = staff_id or public.is_admin())
  with check (auth.uid() = staff_id or public.is_admin());

drop policy if exists "medicals_delete_owner_or_admin" on public.medicals;
create policy "medicals_delete_owner_or_admin"
  on public.medicals
  for delete
  to authenticated
  using (auth.uid() = staff_id or public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. INTERVIEWS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  candidate_names text not null,
  client_count integer not null default 1 check (client_count >= 1),
  interviewer_or_company text not null,
  trade text not null default '',
  interview_date text not null,
  interview_time text not null default '',
  location text not null,
  status text not null default 'Upcoming',
  notes text not null default '',
  version integer not null default 1,
  client_request_id text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_interviews_staff_id on public.interviews(staff_id);
create index if not exists idx_interviews_deleted_at on public.interviews(deleted_at);
create unique index if not exists idx_interviews_request_id on public.interviews(client_request_id) where client_request_id is not null;

alter table public.interviews enable row level security;

drop policy if exists "interviews_select_owner_or_admin" on public.interviews;
create policy "interviews_select_owner_or_admin"
  on public.interviews
  for select
  to authenticated
  using (auth.uid() = staff_id or public.is_admin());

drop policy if exists "interviews_insert_owner_or_admin" on public.interviews;
create policy "interviews_insert_owner_or_admin"
  on public.interviews
  for insert
  to authenticated
  with check (auth.uid() = staff_id or public.is_admin());

drop policy if exists "interviews_update_owner_or_admin" on public.interviews;
create policy "interviews_update_owner_or_admin"
  on public.interviews
  for update
  to authenticated
  using (auth.uid() = staff_id or public.is_admin())
  with check (auth.uid() = staff_id or public.is_admin());

drop policy if exists "interviews_delete_owner_or_admin" on public.interviews;
create policy "interviews_delete_owner_or_admin"
  on public.interviews
  for delete
  to authenticated
  using (auth.uid() = staff_id or public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. SECURE RPC FUNCTIONS
-- ----------------------------------------------------------------------------

-- Normalize phone numbers consistently for client status lookup
create or replace function public.normalize_phone(p_input text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  v_digits := regexp_replace(coalesce(p_input, ''), '\D', '', 'g');
  if left(v_digits, 3) = '880' and length(v_digits) >= 13 then
    return substr(v_digits, 3);
  end if;
  return v_digits;
end;
$$;

-- Resolve a User ID (or email) to the auth email during sign-in without exposing profiles table
create or replace function public.resolve_login_email(p_identifier text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where lower(user_id) = lower(trim(p_identifier))
     or lower(email) = lower(trim(p_identifier))
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- Public Client Status Lookup by Phone Number (returns ONLY the single matched client & coordinator contact)
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

revoke all on function public.lookup_client_by_phone(text) from public;
grant execute on function public.lookup_client_by_phone(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. IMMUTABLE AUDIT LOGS, VERSIONING TRIGGERS & STORAGE BUCKETS
-- ----------------------------------------------------------------------------
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

drop policy if exists "audit_logs_select_admin_or_actor" on public.audit_logs;
create policy "audit_logs_select_admin_or_actor"
  on public.audit_logs
  for select
  to authenticated
  using (public.is_admin() or actor_id = auth.uid());

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

create or replace function public.bump_profile_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.version := coalesce(old.version, 1) + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_version on public.profiles;
create trigger trg_profiles_version
  before update on public.profiles
  for each row
  execute function public.bump_profile_version();

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

-- Private Storage Bucket for Client Documents & Attachments + Staff Media Bucket
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

drop policy if exists "client_docs_select_owner_or_admin" on storage.objects;
create policy "client_docs_select_owner_or_admin"
  on storage.objects for select to authenticated
  using (bucket_id = 'client-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "client_docs_insert_owner_or_admin" on storage.objects;
create policy "client_docs_insert_owner_or_admin"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'client-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "client_docs_update_owner_or_admin" on storage.objects;
create policy "client_docs_update_owner_or_admin"
  on storage.objects for update to authenticated
  using (bucket_id = 'client-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "client_docs_delete_owner_or_admin" on storage.objects;
create policy "client_docs_delete_owner_or_admin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'client-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "staff_media_public_read" on storage.objects;
create policy "staff_media_public_read"
  on storage.objects for select to public
  using (bucket_id = 'staff-media');

drop policy if exists "staff_media_owner_insert" on storage.objects;
create policy "staff_media_owner_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "staff_media_owner_update" on storage.objects;
create policy "staff_media_owner_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'staff-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "staff_media_owner_delete" on storage.objects;
create policy "staff_media_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'staff-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ----------------------------------------------------------------------------
-- 8. ADMIN PROMOTION HELPER (Run manually in SQL Editor for your admin email)
-- ----------------------------------------------------------------------------
-- After registering your admin user via the Sign Up modal, run:
--   update public.profiles set role = 'admin', user_id = 'admin' where email = 'your-admin-email@example.com';
