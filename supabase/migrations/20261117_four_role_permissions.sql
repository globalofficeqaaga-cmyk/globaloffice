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

-- Prevent non-admin users from changing roles or granting themselves permissions.
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
    nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), ''),
    ''
  );
  if v_jwt_role = 'service_role'
     or current_user in ('service_role', 'postgres', 'supabase_admin')
     or (auth.uid() is null and v_jwt_role = '') then
    return new;
  end if;
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.permissions is distinct from old.permissions
       or new.user_id is distinct from old.user_id
       or new.email is distinct from old.email then
      raise exception 'Only administrators can change roles, permissions, or login identifiers.';
    end if;
  end if;
  return new;
end;
$$;
notify pgrst, 'reload schema';
