-- ============================================================================
-- Global Pathways / GlobalOffice — Production Hardened Supabase Schema & RLS
-- Safe & Idempotent: Preserves all existing records, never drops tables or
--                    truncates data.
-- Security Audit Highlights:
--   1. Public phone tracking returns minimal non-sensitive visa/medical status
--      only (NO passport numbers, addresses, documents, payments, or notes).
--   2. Exact normalized phone matching (>=10 digits) + DB rate limiting.
--   3. ZERO direct INSERT/UPDATE on auth.users or auth.identities; staff and
--      accounts users are provisioned server-side via Supabase Auth Admin API.
--   4. Strict SECURITY DEFINER audit & least-privilege EXECUTE revocations.
--   5. Role-escalation protection trigger & verified RLS for anon/staff/accounts/admin.
--   6. ZERO hardcoded default admin/admin passwords.
-- Run once in Supabase Dashboard -> SQL Editor -> New query.
-- ============================================================================

create extension if not exists pgcrypto;

-- Drop obsolete insecure credential RPCs that touched auth.users directly
drop function if exists public.update_own_credentials(text, text);
drop function if exists public.admin_create_user_account(text, text, text, text, text, text, text, text, text, text, text);
drop function if exists public.admin_create_staff_account(text, text, text, text, text, text, text, text, text, text);
drop function if exists public.admin_update_staff_credentials(uuid, text, text);

-- ----------------------------------------------------------------------------
-- 1. PROFILES TABLE (Linked 1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id text unique not null,
  email text unique not null default '',
  role text not null default 'staff' check (role in ('admin', 'staff', 'accounts')),
  name text not null,
  designation text not null default 'Visa & Recruitment Coordinator',
  phone text not null default '',
  personal_phone text not null default '',
  whatsapp text not null default '',
  social_link text not null default '',
  photo_url text not null default '',
  cover_url text not null default '',
  joining_date text not null default '',
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Non-destructive column upgrades for existing tables
alter table public.profiles add column if not exists user_id text;
alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists role text not null default 'staff';
alter table public.profiles add column if not exists name text not null default 'Staff Member';
alter table public.profiles add column if not exists designation text not null default 'Visa & Recruitment Coordinator';
alter table public.profiles add column if not exists phone text not null default '';
alter table public.profiles add column if not exists personal_phone text not null default '';
alter table public.profiles add column if not exists whatsapp text not null default '';
alter table public.profiles add column if not exists social_link text not null default '';
alter table public.profiles add column if not exists photo_url text not null default '';
alter table public.profiles add column if not exists cover_url text not null default '';
alter table public.profiles add column if not exists joining_date text not null default '';
alter table public.profiles add column if not exists version integer not null default 1;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists created_at timestamptz not null default now();

update public.profiles
set user_id = coalesce(
  nullif(trim(user_id), ''),
  nullif(split_part(coalesce(email, ''), '@', 1), ''),
  'user'
) || '_' || substr(id::text, 1, 4)
where user_id is null or trim(user_id) = '';

alter table public.profiles alter column user_id set not null;
create unique index if not exists idx_profiles_user_id_unique on public.profiles(user_id);
create unique index if not exists idx_profiles_user_id_lower_unique on public.profiles(lower(user_id));

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'staff', 'accounts'));

alter table public.profiles enable row level security;

-- Role helpers (authenticated callers only)
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

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.is_admin_or_accounts()
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
      and role in ('admin', 'accounts')
  );
$$;

revoke all on function public.is_admin_or_accounts() from public, anon;
grant execute on function public.is_admin_or_accounts() to authenticated;

-- Prevent non-admin API callers from escalating roles or altering login identifiers.
-- Direct SQL Editor superuser and server-side service_role Admin API updates remain permitted.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jwt_role text := '';
begin
  v_jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
      ''
    ),
    ''
  );

  if v_jwt_role = 'service_role'
     or current_user in ('service_role', 'postgres', 'supabase_admin')
     or (auth.uid() is null and v_jwt_role = '') then
    return new;
  end if;

  if not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only administrators can change user roles.';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'Only administrators can change login User IDs.';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Email cannot be altered directly.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_role_self_escalation() from public, anon, authenticated;

drop trigger if exists trg_prevent_role_self_escalation on public.profiles;
create trigger trg_prevent_role_self_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_role_self_escalation();

-- Automatically create a 'staff' profile row whenever a user is created in Supabase Auth.
-- Always forces role = 'staff' regardless of user metadata.
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

  if exists (
    select 1 from public.profiles
    where lower(user_id) = lower(v_user_id) and id <> new.id
  ) then
    v_user_id := v_user_id || '_' || substr(new.id::text, 1, 4);
  end if;

  insert into public.profiles (
    id,
    user_id,
    email,
    role,
    name,
    designation,
    phone,
    personal_phone,
    whatsapp,
    social_link,
    photo_url,
    cover_url,
    joining_date
  )
  values (
    new.id,
    v_user_id,
    coalesce(new.email, ''),
    'staff',
    v_name,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'designation'), ''), 'Visa & Recruitment Coordinator'),
    coalesce(trim(new.raw_user_meta_data ->> 'phone'), ''),
    coalesce(trim(new.raw_user_meta_data ->> 'personal_phone'), ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'whatsapp'), ''), coalesce(trim(new.raw_user_meta_data ->> 'phone'), '')),
    coalesce(trim(new.raw_user_meta_data ->> 'social_link'), ''),
    coalesce(trim(new.raw_user_meta_data ->> 'photo_url'), ''),
    coalesce(trim(new.raw_user_meta_data ->> 'cover_url'), ''),
    coalesce(trim(new.raw_user_meta_data ->> 'joining_date'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Profiles RLS Policies (all authenticated team members can view team profiles; anon blocked)
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_select_own_or_admin_or_accounts" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() is not null);

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

alter table public.clients add column if not exists version integer not null default 1;
alter table public.clients add column if not exists client_request_id text;
alter table public.clients add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.clients add column if not exists updated_by uuid references public.profiles(id) on delete set null;
alter table public.clients add column if not exists deleted_at timestamptz;
alter table public.clients add column if not exists deleted_by uuid references public.profiles(id) on delete set null;
alter table public.clients add column if not exists updated_at timestamptz not null default now();

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
drop policy if exists "clients_delete_admin_only" on public.clients;
create policy "clients_delete_admin_only"
  on public.clients
  for delete
  to authenticated
  using (public.is_admin());

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

alter table public.meetings add column if not exists version integer not null default 1;
alter table public.meetings add column if not exists client_request_id text;
alter table public.meetings add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.meetings add column if not exists updated_by uuid references public.profiles(id) on delete set null;
alter table public.meetings add column if not exists updated_at timestamptz not null default now();
alter table public.meetings add column if not exists deleted_at timestamptz;
alter table public.meetings add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

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
drop policy if exists "meetings_delete_admin_only" on public.meetings;
create policy "meetings_delete_admin_only"
  on public.meetings
  for delete
  to authenticated
  using (public.is_admin());

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

alter table public.medicals add column if not exists version integer not null default 1;
alter table public.medicals add column if not exists client_request_id text;
alter table public.medicals add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.medicals add column if not exists updated_by uuid references public.profiles(id) on delete set null;
alter table public.medicals add column if not exists updated_at timestamptz not null default now();
alter table public.medicals add column if not exists deleted_at timestamptz;
alter table public.medicals add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

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
drop policy if exists "medicals_delete_admin_only" on public.medicals;
create policy "medicals_delete_admin_only"
  on public.medicals
  for delete
  to authenticated
  using (public.is_admin());

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

alter table public.interviews add column if not exists version integer not null default 1;
alter table public.interviews add column if not exists client_request_id text;
alter table public.interviews add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.interviews add column if not exists updated_by uuid references public.profiles(id) on delete set null;
alter table public.interviews add column if not exists updated_at timestamptz not null default now();
alter table public.interviews add column if not exists deleted_at timestamptz;
alter table public.interviews add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

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
drop policy if exists "interviews_delete_admin_only" on public.interviews;
create policy "interviews_delete_admin_only"
  on public.interviews
  for delete
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. WEBSITE CMS SETTINGS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.site_settings (
  id text primary key default 'default',
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read"
  on public.site_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "site_settings_admin_insert" on public.site_settings;
create policy "site_settings_admin_insert"
  on public.site_settings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "site_settings_admin_update" on public.site_settings;
create policy "site_settings_admin_update"
  on public.site_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "site_settings_admin_delete" on public.site_settings;
create policy "site_settings_admin_delete"
  on public.site_settings
  for delete
  to authenticated
  using (public.is_admin());

insert into public.site_settings (id, settings)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 7. ACCOUNT LEDGER TABLE (Debit & Credit Entries)
--    Accounts + Admin can read & insert; ONLY Admin can update/remove.
-- ----------------------------------------------------------------------------
create table if not exists public.account_ledger (
  id uuid primary key default gen_random_uuid(),
  account_owner_id uuid not null references public.profiles(id) on delete restrict,
  entry_type text not null check (entry_type in ('credit', 'debit')),
  amount numeric(14, 2) not null check (amount >= 0),
  title text not null,
  category text not null default 'General',
  party_name text not null default '',
  reference_no text not null default '',
  entry_date text not null,
  payment_method text not null default 'Cash',
  notes text not null default '',
  created_by_name text not null default '',
  version integer not null default 1,
  client_request_id text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_account_ledger_owner on public.account_ledger(account_owner_id);
create index if not exists idx_account_ledger_type on public.account_ledger(entry_type);
create index if not exists idx_account_ledger_date on public.account_ledger(entry_date desc);
create index if not exists idx_account_ledger_deleted_at on public.account_ledger(deleted_at);
create unique index if not exists idx_account_ledger_request_id on public.account_ledger(client_request_id) where client_request_id is not null;

alter table public.account_ledger enable row level security;

drop policy if exists "account_ledger_select_admin_or_accounts" on public.account_ledger;
create policy "account_ledger_select_admin_or_accounts"
  on public.account_ledger
  for select
  to authenticated
  using (public.is_admin_or_accounts());

drop policy if exists "account_ledger_insert_admin_or_accounts" on public.account_ledger;
create policy "account_ledger_insert_admin_or_accounts"
  on public.account_ledger
  for insert
  to authenticated
  with check (
    public.is_admin_or_accounts()
    and (public.is_admin() or account_owner_id = auth.uid())
  );

drop policy if exists "account_ledger_update_admin_only" on public.account_ledger;
create policy "account_ledger_update_admin_only"
  on public.account_ledger
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "account_ledger_delete_admin_only" on public.account_ledger;
create policy "account_ledger_delete_admin_only"
  on public.account_ledger
  for delete
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. STAFF ATTENDANCE & DAILY CONVERSATION LOGS
-- ----------------------------------------------------------------------------
create table if not exists public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  staff_name text not null default '',
  staff_role text not null default 'staff',
  attendance_date text not null,
  status text not null default 'Present' check (status in ('Present', 'Late', 'Field Work', 'Half Day', 'Leave')),
  check_in_time text not null default '',
  check_out_time text not null default '',
  work_location text not null default 'Office',
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

create index if not exists idx_staff_attendance_staff_id on public.staff_attendance(staff_id);
create index if not exists idx_staff_attendance_date on public.staff_attendance(attendance_date desc);
create index if not exists idx_staff_attendance_deleted_at on public.staff_attendance(deleted_at);
create unique index if not exists idx_staff_attendance_unique_day
  on public.staff_attendance(staff_id, attendance_date)
  where deleted_at is null;
create unique index if not exists idx_staff_attendance_request_id
  on public.staff_attendance(client_request_id)
  where client_request_id is not null;

alter table public.staff_attendance enable row level security;

drop policy if exists "staff_attendance_select" on public.staff_attendance;
create policy "staff_attendance_select"
  on public.staff_attendance
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists "staff_attendance_insert" on public.staff_attendance;
create policy "staff_attendance_insert"
  on public.staff_attendance
  for insert
  to authenticated
  with check (auth.uid() = staff_id or public.is_admin());

drop policy if exists "staff_attendance_update" on public.staff_attendance;
create policy "staff_attendance_update"
  on public.staff_attendance
  for update
  to authenticated
  using (auth.uid() = staff_id or public.is_admin())
  with check (auth.uid() = staff_id or public.is_admin());

drop policy if exists "staff_attendance_delete_admin" on public.staff_attendance;
create policy "staff_attendance_delete_admin"
  on public.staff_attendance
  for delete
  to authenticated
  using (false);

create table if not exists public.staff_daily_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  staff_name text not null default '',
  staff_role text not null default 'staff',
  client_id uuid references public.clients(id) on delete set null,
  log_date text not null,
  log_time text not null default '',
  contact_name text not null,
  contact_phone text not null default '',
  channel text not null default 'Phone Call' check (channel in ('Phone Call', 'WhatsApp', 'Office Visit', 'Video Call', 'Field Visit')),
  topic text not null default '',
  discussion_summary text not null default '',
  outcome text not null default 'Follow Up Needed' check (outcome in ('Interested', 'Follow Up Needed', 'Document Promised', 'Payment Promised', 'Confirmed', 'Not Interested', 'Resolved')),
  next_follow_up_date text not null default '',
  version integer not null default 1,
  client_request_id text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staff_daily_logs_staff_id on public.staff_daily_logs(staff_id);
create index if not exists idx_staff_daily_logs_date on public.staff_daily_logs(log_date desc);
create index if not exists idx_staff_daily_logs_deleted_at on public.staff_daily_logs(deleted_at);
create unique index if not exists idx_staff_daily_logs_request_id
  on public.staff_daily_logs(client_request_id)
  where client_request_id is not null;

alter table public.staff_daily_logs enable row level security;

drop policy if exists "staff_daily_logs_select" on public.staff_daily_logs;
create policy "staff_daily_logs_select"
  on public.staff_daily_logs
  for select
  to authenticated
  using (auth.uid() = staff_id or public.is_admin_or_accounts());

drop policy if exists "staff_daily_logs_insert" on public.staff_daily_logs;
create policy "staff_daily_logs_insert"
  on public.staff_daily_logs
  for insert
  to authenticated
  with check (auth.uid() = staff_id or public.is_admin());

drop policy if exists "staff_daily_logs_update" on public.staff_daily_logs;
create policy "staff_daily_logs_update"
  on public.staff_daily_logs
  for update
  to authenticated
  using (auth.uid() = staff_id or public.is_admin())
  with check (auth.uid() = staff_id or public.is_admin());

drop policy if exists "staff_daily_logs_delete_admin" on public.staff_daily_logs;
create policy "staff_daily_logs_delete_admin"
  on public.staff_daily_logs
  for delete
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 9. AUDIT LOGS, RATE LIMITING & VERSIONING TRIGGERS
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
revoke insert, update, delete on table public.audit_logs from public, anon, authenticated;

drop policy if exists "audit_logs_select_admin_or_actor" on public.audit_logs;
drop policy if exists "audit_logs_select_admin_only" on public.audit_logs;
create policy "audit_logs_select_admin_only"
  on public.audit_logs
  for select
  to authenticated
  using (public.is_admin());

-- Internal rate-limiting buckets (no direct client read/write allowed)
create table if not exists public.tracking_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  blocked_until timestamptz
);

alter table public.tracking_rate_limits enable row level security;
revoke all on table public.tracking_rate_limits from public, anon, authenticated;

create or replace function public.check_rate_limit(
  p_bucket text,
  p_window_seconds integer,
  p_max_requests integer,
  p_block_seconds integer
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.tracking_rate_limits%rowtype;
begin
  select *
  into v_row
  from public.tracking_rate_limits
  where bucket_key = p_bucket
  for update;

  if not found then
    insert into public.tracking_rate_limits (bucket_key, window_started_at, request_count, blocked_until)
    values (p_bucket, v_now, 1, null)
    on conflict (bucket_key) do update
      set window_started_at = case
            when public.tracking_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
              then v_now
            else public.tracking_rate_limits.window_started_at
          end,
          request_count = case
            when public.tracking_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
              then 1
            else public.tracking_rate_limits.request_count + 1
          end,
          blocked_until = case
            when public.tracking_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
              then null
            else public.tracking_rate_limits.blocked_until
          end;
    return;
  end if;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    raise exception 'Too many requests. Please wait a few minutes before trying again.'
      using errcode = 'P0001';
  end if;

  if v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    update public.tracking_rate_limits
    set window_started_at = v_now,
        request_count = 1,
        blocked_until = null
    where bucket_key = p_bucket;
    return;
  end if;

  if v_row.request_count >= p_max_requests then
    update public.tracking_rate_limits
    set request_count = v_row.request_count + 1,
        blocked_until = v_now + make_interval(secs => p_block_seconds)
    where bucket_key = p_bucket;

    raise exception 'Too many requests. Please wait a few minutes before trying again.'
      using errcode = 'P0001';
  end if;

  update public.tracking_rate_limits
  set request_count = v_row.request_count + 1
  where bucket_key = p_bucket;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer, integer) from public, anon, authenticated;

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

revoke all on function public.bump_version_and_meta() from public, anon, authenticated;

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

revoke all on function public.bump_profile_version() from public, anon, authenticated;

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
      'summary', coalesce(
        v_new ->> 'title',
        v_new ->> 'contact_name',
        v_new ->> 'attendance_date',
        v_new ->> 'name',
        v_new ->> 'candidate_name',
        v_new ->> 'client_name',
        v_new ->> 'candidate_names',
        'New record'
      )
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
        if v_key in ('passport_number', 'documents', 'payments', 'address') then
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

revoke all on function public.record_audit_log() from public, anon, authenticated;

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

drop trigger if exists trg_account_ledger_version on public.account_ledger;
create trigger trg_account_ledger_version
  before insert or update on public.account_ledger
  for each row
  execute function public.bump_version_and_meta();

drop trigger if exists trg_staff_attendance_version on public.staff_attendance;
create trigger trg_staff_attendance_version
  before insert or update on public.staff_attendance
  for each row
  execute function public.bump_version_and_meta();

create or replace function public.enforce_attendance_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.staff_id is distinct from old.staff_id
     or new.attendance_date is distinct from old.attendance_date
     or new.status is distinct from old.status
     or new.check_in_time is distinct from old.check_in_time
     or new.work_location is distinct from old.work_location
     or new.notes is distinct from old.notes
     or new.deleted_at is distinct from old.deleted_at
  then
    raise exception 'Attendance records are locked and cannot be edited or deleted once recorded.';
  end if;

  if new.check_out_time is distinct from old.check_out_time then
    if coalesce(old.check_out_time, '') <> '' or old.status = 'Leave' then
      raise exception 'Check-out time is already locked and cannot be edited.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_staff_attendance_lock on public.staff_attendance;
create trigger trg_staff_attendance_lock
  before update on public.staff_attendance
  for each row
  execute function public.enforce_attendance_immutability();

drop trigger if exists trg_staff_daily_logs_version on public.staff_daily_logs;
create trigger trg_staff_daily_logs_version
  before insert or update on public.staff_daily_logs
  for each row
  execute function public.bump_version_and_meta();

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

drop trigger if exists trg_account_ledger_audit on public.account_ledger;
create trigger trg_account_ledger_audit
  after insert or update on public.account_ledger
  for each row
  execute function public.record_audit_log();

drop trigger if exists trg_staff_attendance_audit on public.staff_attendance;
create trigger trg_staff_attendance_audit
  after insert or update on public.staff_attendance
  for each row
  execute function public.record_audit_log();

drop trigger if exists trg_staff_daily_logs_audit on public.staff_daily_logs;
create trigger trg_staff_daily_logs_audit
  after insert or update on public.staff_daily_logs
  for each row
  execute function public.record_audit_log();

-- ----------------------------------------------------------------------------
-- 10. SECURE RPC FUNCTIONS
-- ----------------------------------------------------------------------------
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

revoke all on function public.normalize_phone(text) from public;
grant execute on function public.normalize_phone(text) to anon, authenticated;

-- Rate-limited User ID -> Auth email resolver (no arbitrary email probing)
create or replace function public.resolve_login_email(p_identifier text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ident text := trim(coalesce(p_identifier, ''));
  v_email text;
begin
  if length(v_ident) < 2 or length(v_ident) > 120 then
    return null;
  end if;

  perform public.check_rate_limit('login_resolve_global', 60, 60, 60);
  perform public.check_rate_limit('login_resolve:' || lower(v_ident), 300, 15, 300);

  select email
  into v_email
  from public.profiles
  where lower(user_id) = lower(v_ident)
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- Public phone-number tracking:
--   * Exact normalized phone number required (10..15 digits, NO partial LIKE matching)
--   * Rate-limited (per-phone & global burst protection)
--   * Returns ONLY minimal, non-sensitive visa & medical status fields
--     (NEVER passportNumber, address, documents, payments, totals, or internal notes)
create or replace function public.lookup_client_by_phone(p_phone text)
returns jsonb
language plpgsql
volatile
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
  if length(v_norm) < 10 or length(v_norm) > 15 then
    raise exception 'Please enter a valid complete phone number (at least 10 digits).'
      using errcode = 'P0001';
  end if;

  perform public.check_rate_limit('client_lookup_global', 60, 30, 60);
  perform public.check_rate_limit('client_lookup_phone:' || v_norm, 300, 5, 300);

  select *
  into v_client
  from public.clients c
  where c.deleted_at is null
    and public.normalize_phone(c.phone) = v_norm
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
    'meetingWith', m.meeting_with,
    'location', m.location,
    'dateTime', m.date_time,
    'status', m.status
  ) order by m.created_at desc), '[]'::jsonb)
  into v_meetings
  from public.meetings m
  where m.deleted_at is null
    and (
      m.client_id = v_client.id
      or public.normalize_phone(m.client_phone) = v_norm
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', med.id,
    'medicalCenter', med.medical_center,
    'medicalLocation', med.medical_location,
    'testDate', med.test_date,
    'result', med.result
  ) order by med.created_at desc), '[]'::jsonb)
  into v_medicals
  from public.medicals med
  where med.deleted_at is null
    and (
      med.client_id = v_client.id
      or public.normalize_phone(med.candidate_phone) = v_norm
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', iv.id,
    'interviewerOrCompany', iv.interviewer_or_company,
    'trade', iv.trade,
    'interviewDate', iv.interview_date,
    'interviewTime', iv.interview_time,
    'location', iv.location,
    'status', iv.status
  ) order by iv.created_at desc), '[]'::jsonb)
  into v_interviews
  from public.interviews iv
  where iv.deleted_at is null
    and iv.client_id = v_client.id;

  return jsonb_build_object(
    'client', jsonb_build_object(
      'id', v_client.id,
      'name', v_client.name,
      'phone', v_client.phone,
      'trade', v_client.trade,
      'destinationCountry', v_client.destination_country,
      'status', v_client.status,
      'medicalDone', v_client.medical_done,
      'medicalStatus', v_client.medical_status,
      'medicalCenter', v_client.medical_center,
      'medicalLocation', v_client.medical_location,
      'updatedAt', v_client.updated_at
    ),
    'staff', case when v_staff.id is not null then jsonb_build_object(
      'id', v_staff.id,
      'name', v_staff.name,
      'designation', v_staff.designation,
      'phone', v_staff.phone,
      'whatsapp', v_staff.whatsapp,
      'socialLink', v_staff.social_link,
      'photoUrl', v_staff.photo_url,
      'coverUrl', v_staff.cover_url
    ) else null end,
    'meetings', v_meetings,
    'medicals', v_medicals,
    'interviews', v_interviews
  );
end;
$$;

revoke all on function public.lookup_client_by_phone(text) from public;
grant execute on function public.lookup_client_by_phone(text) to anon, authenticated;

drop function if exists public.get_daily_client_activity();
create or replace function public.get_daily_client_activity()
returns table (
  client_id uuid,
  staff_id uuid,
  staff_name text,
  client_name text,
  phone text,
  trade text,
  destination_country text,
  status text,
  created_date text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_or_accounts() then
    raise exception 'Only Administrator and Accounts roles can view cross-staff client activity.';
  end if;

  return query
  select
    c.id as client_id,
    c.staff_id,
    coalesce(p.name, 'Unassigned') as staff_name,
    c.name as client_name,
    c.phone,
    c.trade,
    c.destination_country,
    c.status,
    to_char((c.created_at at time zone 'Asia/Dhaka')::date, 'YYYY-MM-DD') as created_date,
    c.created_at
  from public.clients c
  left join public.profiles p on p.id = c.staff_id
  where c.deleted_at is null
  order by c.created_at desc;
end;
$$;

revoke all on function public.get_daily_client_activity() from public, anon;
grant execute on function public.get_daily_client_activity() to authenticated;

-- ----------------------------------------------------------------------------
-- 11. STORAGE BUCKETS & ACCESS POLICIES
-- ----------------------------------------------------------------------------
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
  using (bucket_id = 'client-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))
  with check (bucket_id = 'client-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

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
  using (bucket_id = 'staff-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()))
  with check (bucket_id = 'staff-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "staff_media_owner_delete" on storage.objects;
create policy "staff_media_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'staff-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ----------------------------------------------------------------------------
-- 11b. REAL-TIME TEAM MESSAGING (ALL AUTHENTICATED TEAM MEMBERS)
-- ----------------------------------------------------------------------------
create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete cascade,
  body text not null default '',
  read_at timestamptz,
  client_request_id text,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.team_messages add column if not exists attachment_path text;
alter table public.team_messages add column if not exists attachment_name text;
alter table public.team_messages add column if not exists attachment_mime text;
alter table public.team_messages add column if not exists attachment_size bigint;
alter table public.team_messages add column if not exists expires_at timestamptz;
alter table public.team_messages alter column body set default '';

alter table public.team_messages drop constraint if exists team_messages_body_check;
alter table public.team_messages drop constraint if exists team_messages_body_or_file;
alter table public.team_messages add constraint team_messages_body_or_file check (
  char_length(trim(body)) between 0 and 2000
  and (char_length(trim(body)) > 0 or attachment_path is not null)
);
alter table public.team_messages drop constraint if exists team_messages_attachment_size;
alter table public.team_messages add constraint team_messages_attachment_size check (
  attachment_size is null or attachment_size between 1 and 20971520
);

create index if not exists idx_team_messages_sender on public.team_messages(sender_id);
create index if not exists idx_team_messages_recipient on public.team_messages(recipient_id);
create index if not exists idx_team_messages_created_at on public.team_messages(created_at desc);
create index if not exists idx_team_messages_expires_at on public.team_messages(expires_at) where expires_at is not null;
create unique index if not exists idx_team_messages_request_id
  on public.team_messages(client_request_id) where client_request_id is not null;

alter table public.team_messages enable row level security;

create or replace function public.protect_team_message_immutability()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id is distinct from old.id
     or new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.body is distinct from old.body
     or new.client_request_id is distinct from old.client_request_id
     or new.attachment_path is distinct from old.attachment_path
     or new.attachment_name is distinct from old.attachment_name
     or new.attachment_mime is distinct from old.attachment_mime
     or new.attachment_size is distinct from old.attachment_size
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at then
    raise exception 'Message content and sender/recipient cannot be modified.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_team_message_immutability() from public, anon, authenticated;
drop trigger if exists trg_protect_team_message_immutability on public.team_messages;
create trigger trg_protect_team_message_immutability
  before update on public.team_messages for each row
  execute function public.protect_team_message_immutability();

drop policy if exists "team_messages_select_participants" on public.team_messages;
create policy "team_messages_select_participants" on public.team_messages
  for select to authenticated
  using (
    (recipient_id is null or auth.uid() = sender_id or auth.uid() = recipient_id)
    and (expires_at is null or expires_at > now())
  );

drop policy if exists "team_messages_insert_sender" on public.team_messages;
create policy "team_messages_insert_sender" on public.team_messages
  for insert to authenticated with check (auth.uid() = sender_id);

drop policy if exists "team_messages_update_recipient_read" on public.team_messages;
create policy "team_messages_update_recipient_read" on public.team_messages
  for update to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

drop policy if exists "team_messages_delete_participant" on public.team_messages;
create policy "team_messages_delete_participant" on public.team_messages
  for delete to authenticated
  using (
    expires_at is not null and expires_at <= now()
    and (auth.uid() = sender_id or auth.uid() = recipient_id)
  );

create or replace function public.cleanup_expired_team_messages()
returns integer language plpgsql security definer set search_path = public as $$
declare deleted_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  delete from public.team_messages where expires_at is not null and expires_at <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function public.cleanup_expired_team_messages() from public, anon;
grant execute on function public.cleanup_expired_team_messages() to authenticated;

create or replace function public.cleanup_expired_team_messages_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.team_messages where expires_at is not null and expires_at <= now();
  return new;
end;
$$;
revoke all on function public.cleanup_expired_team_messages_before_insert() from public, anon, authenticated;
drop trigger if exists trg_cleanup_expired_team_messages on public.team_messages;
create trigger trg_cleanup_expired_team_messages before insert on public.team_messages
  for each row execute function public.cleanup_expired_team_messages_before_insert();

-- Private chat file bucket; direct chat files are visible only to sender/recipient.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-chat-files', 'team-chat-files', false, 20971520,
  array[
    'image/jpeg','image/png','image/webp','application/pdf','text/plain',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip'
  ]
)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "team_chat_files_select_participants" on storage.objects;
create policy "team_chat_files_select_participants" on storage.objects
  for select to authenticated using (
    bucket_id = 'team-chat-files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] = auth.uid()::text
      or (
        (storage.foldername(name))[2] = 'all'
        and exists (select 1 from public.profiles p where p.id = auth.uid())
      )
    )
  );

drop policy if exists "team_chat_files_insert_sender" on storage.objects;
create policy "team_chat_files_insert_sender" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'team-chat-files' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "team_chat_files_delete_participants" on storage.objects;
create policy "team_chat_files_delete_participants" on storage.objects
  for delete to authenticated using (
    bucket_id = 'team-chat-files'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] = auth.uid()::text
      or ((storage.foldername(name))[2] = 'all' and public.is_admin())
    )
  );

-- Enable Realtime delivery for direct and group messages.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_messages'
    ) then
      alter publication supabase_realtime add table public.team_messages;
    end if;
  end if;
end $$;

-- 12. ADMIN USER SETUP (SUPPORED BY SUPABASE AUTHENTICATION — NO DEFAULT PASSWORD)
-- ----------------------------------------------------------------------------
-- After running this script:
-- 1. In Supabase Dashboard -> Authentication -> Providers -> Email:
--    Set Minimum Password Length to 12.
-- 2. In Supabase Dashboard -> Authentication -> Users -> Add user -> Create new user:
--    Enter your real admin email and a STRONG password (at least 12 characters),
--    and check "Auto Confirm User".
-- 3. Run this promotion query once in Supabase SQL Editor replacing the email:
--
--    update public.profiles
--    set role = 'admin',
--        user_id = 'admin',
--        name = 'System Administrator',
--        designation = 'Managing Director'
--    where lower(email) = lower('your-admin-email@example.com');
--
-- 4. Set server-only SUPABASE_SERVICE_ROLE_KEY in your server environment secrets
--    (never VITE_*) so the Admin Dashboard can create/reset/delete Staff and
--    Accounts logins securely via Supabase Auth Admin APIs.

notify pgrst, 'reload schema';
