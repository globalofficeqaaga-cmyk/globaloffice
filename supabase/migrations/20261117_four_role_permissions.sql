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
  select coalesce(jsonb_agg(distinct permission), '[]'::jsonb)
  from jsonb_array_elements_text(coalesce(public.profiles.permissions, '[]'::jsonb) || '["view_team_profiles","create_staff_accounts","manage_user_permissions"]'::jsonb) as permission
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
