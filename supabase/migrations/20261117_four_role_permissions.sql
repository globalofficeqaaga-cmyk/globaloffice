-- Four dashboard roles + independent granular permissions.
-- Apply after the existing setup_all.sql. This migration is non-destructive.
alter table public.profiles add column if not exists permissions jsonb not null default '[]'::jsonb;

-- Convert legacy Accounts role into Staff + finance permissions; Accounts is a permission set, not a role.
update public.profiles
set role = 'staff',
    permissions = coalesce(permissions, '[]'::jsonb) || '["view_team_profiles","view_finance","manage_finance","create_staff_accounts"]'::jsonb
where role = 'accounts';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'director', 'management', 'staff'));

-- Keep Admin profile private; Director/Management and users with team-profile permission
-- may see non-admin profiles. Admin can see and manage all profiles.
create or replace function public.can_view_team_profiles()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'director', 'management')
        or p.permissions @> '["view_team_profiles"]'::jsonb
      )
  );
$$;
revoke all on function public.can_view_team_profiles() from public, anon;
grant execute on function public.can_view_team_profiles() to authenticated;

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_private_admin" on public.profiles;
create policy "profiles_select_private_admin"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (role <> 'admin' and public.can_view_team_profiles())
    or public.is_admin()
  );

-- Existing role-escalation trigger remains in place. Permission writes are restricted
-- by the server-side account-management API; do not replace the existing trigger here.
notify pgrst, 'reload schema';

-- Management users can delegate account creation and permission setup as requested.
update public.profiles
set permissions = (
  select coalesce(jsonb_agg(distinct p.permission), '[]'::jsonb)
  from jsonb_array_elements_text(coalesce(public.profiles.permissions, '[]'::jsonb) || '["view_team_profiles","create_staff_accounts","manage_user_permissions"]'::jsonb) as p(permission)
)
where role = 'management';

-- Finance is permission-based, never granted to Management, and no longer depends on
-- the retired standalone Accounts role.
create or replace function public.is_admin_or_accounts()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or (
          p.role <> 'management'
          and (
            p.permissions @> '["view_finance"]'::jsonb
            or p.permissions @> '["manage_finance"]'::jsonb
          )
        )
      )
  );
$$;

revoke all on function public.is_admin_or_accounts() from public, anon;
grant execute on function public.is_admin_or_accounts() to authenticated;

-- The SECURITY DEFINER directory must independently enforce the same privacy rule:
-- no non-admin caller can discover the Admin profile through the RPC.
drop function if exists public.get_team_directory();
create or replace function public.get_team_directory()
returns table (
  id uuid,
  user_id text,
  role text,
  name text,
  designation text,
  phone text,
  personal_phone text,
  whatsapp text,
  social_link text,
  photo_url text,
  cover_url text,
  joining_date text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if not public.is_admin() and not public.can_view_team_profiles() then
    raise exception 'Team profile permission required.';
  end if;

  return query
  select p.id, p.user_id, p.role, p.name, p.designation, p.phone,
         p.personal_phone, p.whatsapp, p.social_link, p.photo_url,
         p.cover_url, p.joining_date
  from public.profiles p
  where p.role <> 'admin'
  order by case p.role when 'director' then 1 when 'management' then 2 else 3 end, p.name asc;
end;
$$;

revoke all on function public.get_team_directory() from public, anon;
grant execute on function public.get_team_directory() to authenticated;

notify pgrst, 'reload schema';

-- Operational visibility: Director and Management can read company-wide records.
create or replace function public.can_view_all_operations()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'director', 'management')
  );
$$;
revoke all on function public.can_view_all_operations() from public, anon;
grant execute on function public.can_view_all_operations() to authenticated;

-- Management is read-only. Staff can maintain their own records; explicit edit
-- permissions can be granted to other non-Management roles.
create or replace function public.can_edit_client_records()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'management'
      and (p.role = 'admin' or p.role = 'staff' or p.permissions @> '["edit_clients"]'::jsonb)
  );
$$;
revoke all on function public.can_edit_client_records() from public, anon;
grant execute on function public.can_edit_client_records() to authenticated;

create or replace function public.can_delete_client_records()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'management'
      and (p.role = 'admin' or p.permissions @> '["delete_clients"]'::jsonb)
  );
$$;
revoke all on function public.can_delete_client_records() from public, anon;
grant execute on function public.can_delete_client_records() to authenticated;

-- Company-wide read policies for leadership; Staff remains scoped to own records.
drop policy if exists "clients_select_owner_or_admin" on public.clients;
create policy "clients_select_owner_or_admin"
  on public.clients for select to authenticated
  using (auth.uid() = staff_id or public.can_view_all_operations());

drop policy if exists "meetings_select_owner_or_admin" on public.meetings;
create policy "meetings_select_owner_or_admin"
  on public.meetings for select to authenticated
  using (auth.uid() = staff_id or public.can_view_all_operations());

drop policy if exists "medicals_select_owner_or_admin" on public.medicals;
create policy "medicals_select_owner_or_admin"
  on public.medicals for select to authenticated
  using (auth.uid() = staff_id or public.can_view_all_operations());

drop policy if exists "interviews_select_owner_or_admin" on public.interviews;
create policy "interviews_select_owner_or_admin"
  on public.interviews for select to authenticated
  using (auth.uid() = staff_id or public.can_view_all_operations());

drop policy if exists "staff_daily_logs_select" on public.staff_daily_logs;
create policy "staff_daily_logs_select"
  on public.staff_daily_logs for select to authenticated
  using (auth.uid() = staff_id or public.can_view_all_operations());

-- Leadership can add clients, but Management cannot update or remove any records.
drop policy if exists "clients_update_owner_or_admin" on public.clients;
create policy "clients_update_owner_or_admin"
  on public.clients for update to authenticated
  using (public.is_admin() or (auth.uid() = staff_id and public.can_edit_client_records()))
  with check (public.is_admin() or (auth.uid() = staff_id and public.can_edit_client_records()));

drop policy if exists "clients_delete_owner_or_admin" on public.clients;
drop policy if exists "clients_delete_admin_only" on public.clients;
create policy "clients_delete_admin_only"
  on public.clients for delete to authenticated
  using (public.is_admin() or (auth.uid() = staff_id and public.can_delete_client_records()));

-- Finance view and finance entry management are separate capabilities.
create or replace function public.can_manage_finance()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or (p.role <> 'management' and p.permissions @> '["manage_finance"]'::jsonb)
      )
  );
$$;
revoke all on function public.can_manage_finance() from public, anon;
grant execute on function public.can_manage_finance() to authenticated;

drop policy if exists "account_ledger_insert_admin_or_accounts" on public.account_ledger;
create policy "account_ledger_insert_admin_or_accounts"
  on public.account_ledger for insert to authenticated
  with check (public.can_manage_finance() and (public.is_admin() or account_owner_id = auth.uid()));

drop policy if exists "account_ledger_update_admin_only" on public.account_ledger;
create policy "account_ledger_update_admin_only"
  on public.account_ledger for update to authenticated
  using (public.can_manage_finance())
  with check (public.can_manage_finance());

notify pgrst, 'reload schema';

create or replace function public.can_manage_operational_records()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role <> 'management'
      and (p.role = 'admin' or p.role = 'staff' or p.permissions @> '["edit_clients"]'::jsonb)
  );
$$;
revoke all on function public.can_manage_operational_records() from public, anon;
grant execute on function public.can_manage_operational_records() to authenticated;

-- Keep operational record writes unavailable to Management (client creation remains allowed).
drop policy if exists "meetings_insert_owner_or_admin" on public.meetings;
create policy "meetings_insert_owner_or_admin"
  on public.meetings for insert to authenticated
  with check (auth.uid() = staff_id and public.can_manage_operational_records() or public.is_admin());

drop policy if exists "meetings_update_owner_or_admin" on public.meetings;
create policy "meetings_update_owner_or_admin"
  on public.meetings for update to authenticated
  using (public.is_admin() or (auth.uid() = staff_id and public.can_manage_operational_records()))
  with check (public.is_admin() or (auth.uid() = staff_id and public.can_manage_operational_records()));

drop policy if exists "medicals_insert_owner_or_admin" on public.medicals;
create policy "medicals_insert_owner_or_admin"
  on public.medicals for insert to authenticated
  with check (auth.uid() = staff_id and public.can_manage_operational_records() or public.is_admin());

drop policy if exists "medicals_update_owner_or_admin" on public.medicals;
create policy "medicals_update_owner_or_admin"
  on public.medicals for update to authenticated
  using (public.is_admin() or (auth.uid() = staff_id and public.can_manage_operational_records()))
  with check (public.is_admin() or (auth.uid() = staff_id and public.can_manage_operational_records()));

drop policy if exists "interviews_insert_owner_or_admin" on public.interviews;
create policy "interviews_insert_owner_or_admin"
  on public.interviews for insert to authenticated
  with check (auth.uid() = staff_id and public.can_manage_operational_records() or public.is_admin());

drop policy if exists "interviews_update_owner_or_admin" on public.interviews;
create policy "interviews_update_owner_or_admin"
  on public.interviews for update to authenticated
  using (public.is_admin() or (auth.uid() = staff_id and public.can_manage_operational_records()))
  with check (public.is_admin() or (auth.uid() = staff_id and public.can_manage_operational_records()));

drop policy if exists "staff_attendance_insert" on public.staff_attendance;
create policy "staff_attendance_insert"
  on public.staff_attendance for insert to authenticated
  with check (auth.uid() = staff_id and public.can_manage_operational_records() or public.is_admin());

drop policy if exists "staff_attendance_update" on public.staff_attendance;
create policy "staff_attendance_update"
  on public.staff_attendance for update to authenticated
  using (public.is_admin() or (auth.uid() = staff_id and public.can_manage_operational_records()))
  with check (public.is_admin() or (auth.uid() = staff_id and public.can_manage_operational_records()));

drop policy if exists "staff_daily_logs_insert" on public.staff_daily_logs;
create policy "staff_daily_logs_insert"
  on public.staff_daily_logs for insert to authenticated
  with check (auth.uid() = staff_id and public.can_manage_operational_records() or public.is_admin());

drop policy if exists "staff_daily_logs_update" on public.staff_daily_logs;
create policy "staff_daily_logs_update"
  on public.staff_daily_logs for update to authenticated
  using (public.is_admin() or (auth.uid() = staff_id and public.can_manage_operational_records()))
  with check (public.is_admin() or (auth.uid() = staff_id and public.can_manage_operational_records()));

notify pgrst, 'reload schema';


-- SECURITY FIX: authenticated users may edit their own profile fields, but must
-- never grant themselves permissions. Only the service role or an Admin may
-- change the permissions JSON. Keep this check inside Postgres, not only in API code.
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
     or session_user in ('service_role', 'postgres', 'supabase_admin')
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
    if new.permissions is distinct from old.permissions then
      raise exception 'Only administrators can change user permissions.';
    end if;
  end if;

  return new;
end;
$$;
