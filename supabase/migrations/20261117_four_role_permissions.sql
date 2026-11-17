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
