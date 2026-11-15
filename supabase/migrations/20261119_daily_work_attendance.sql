-- ============================================================================
-- Migration: Daily Staff Attendance, Daily Client Counts, and Conversation Logs
-- Adds:
--   1. public.staff_attendance (Daily Check-In / Check-Out & Attendance Status)
--   2. public.staff_daily_logs ("Kar sathe ki ki kotha holo" call/visit notes)
--   3. Profiles read visibility for Accounts role so Accounts Dashboard sees Staff roster
--   4. Safe SECURITY DEFINER RPC get_daily_client_activity() for Admin & Accounts
-- ============================================================================

-- 1. Allow Accounts role to view profiles directory (Staff & Accounts roster)
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_select_own_or_admin_or_accounts" on public.profiles;
create policy "profiles_select_own_or_admin_or_accounts"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id or public.is_admin_or_accounts());

-- 2. Daily Attendance Table
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
  using (auth.uid() = staff_id or public.is_admin_or_accounts());

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
  using (public.is_admin());

drop trigger if exists trg_staff_attendance_version on public.staff_attendance;
create trigger trg_staff_attendance_version
  before insert or update on public.staff_attendance
  for each row
  execute function public.bump_version_and_meta();

drop trigger if exists trg_staff_attendance_audit on public.staff_attendance;
create trigger trg_staff_attendance_audit
  after insert or update on public.staff_attendance
  for each row
  execute function public.record_audit_log();

-- 3. Daily Conversation / Call Logs Table ("Kar sathe ki ki kotha holo")
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

drop trigger if exists trg_staff_daily_logs_version on public.staff_daily_logs;
create trigger trg_staff_daily_logs_version
  before insert or update on public.staff_daily_logs
  for each row
  execute function public.bump_version_and_meta();

drop trigger if exists trg_staff_daily_logs_audit on public.staff_daily_logs;
create trigger trg_staff_daily_logs_audit
  after insert or update on public.staff_daily_logs
  for each row
  execute function public.record_audit_log();

-- 4. Update audit summary trigger to support attendance_date and contact_name
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

-- 5. Safe RPC for Admin & Accounts to see how many clients each staff added daily
--    (Exposes only non-sensitive summary fields; passports/documents/notes stay locked behind clients RLS)
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

revoke all on function public.get_daily_client_activity() from public;
grant execute on function public.get_daily_client_activity() to authenticated;

notify pgrst, 'reload schema';
