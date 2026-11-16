-- ============================================================================
-- Minimal, Idempotent & Non-Destructive Migration:
-- Fix Staff & Accounts Profile Creation, Role Escalation Trigger & Metadata Sync
-- Safe to run on live production data (never drops tables or deletes rows).
-- ============================================================================

-- 1. Ensure all required profile columns exist cleanly
alter table public.profiles add column if not exists user_id text;
alter table public.profiles add column if not exists email text not null default '';
alter table public.profiles add column if not exists role text not null default 'staff';
alter table public.profiles add column if not exists name text not null default 'Staff Member';
alter table public.profiles add column if not exists designation text not null default 'Visa & Recruitment Coordinator';
alter table public.profiles add column if not exists phone text not null default '';
alter table public.profiles add column if not exists whatsapp text not null default '';
alter table public.profiles add column if not exists social_link text not null default '';
alter table public.profiles add column if not exists photo_url text not null default '';
alter table public.profiles add column if not exists cover_url text not null default '';
alter table public.profiles add column if not exists version integer not null default 1;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- Ensure role check constraint permits admin, staff, and accounts
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'staff', 'accounts'));

create unique index if not exists idx_profiles_user_id_unique on public.profiles(user_id);
create unique index if not exists idx_profiles_user_id_lower_unique on public.profiles(lower(user_id));

-- 2. Allow server-side service_role Admin API updates while blocking browser self-escalation
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

-- 3. Ensure auth.users -> public.profiles trigger saves complete profile fields
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
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'whatsapp'), ''), coalesce(trim(new.raw_user_meta_data ->> 'phone'), '')),
    coalesce(trim(new.raw_user_meta_data ->> 'social_link'), ''),
    coalesce(trim(new.raw_user_meta_data ->> 'photo_url'), ''),
    coalesce(trim(new.raw_user_meta_data ->> 'cover_url'), '')
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

-- 4. Refresh PostgREST schema cache
notify pgrst, 'reload schema';
