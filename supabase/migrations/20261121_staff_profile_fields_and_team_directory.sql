-- ============================================================================
-- Minimal, Idempotent & Non-Destructive Migration:
-- Add Personal Phone Number & Joining Date to Staff/Team Profiles,
-- and allow all authenticated team roles (Admin, Staff, Accounts) to view
-- every team member's profile safely (anonymous callers remain blocked).
-- Preserves all existing records.
-- ============================================================================

-- 1. Add personal_phone and joining_date columns safely
alter table public.profiles add column if not exists personal_phone text not null default '';
alter table public.profiles add column if not exists joining_date text not null default '';

-- 2. Update auth.users -> public.profiles trigger to copy personal_phone & joining_date
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

-- 3. Allow all authenticated team members (Admin, Staff, Accounts) to read team profiles
--    while keeping anonymous/unauthenticated callers completely blocked.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_select_own_or_admin_or_accounts" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() is not null);

-- 4. Update get_team_directory RPC with official phone, personal phone, whatsapp, social, cover, and joining date
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

  return query
  select
    p.id,
    p.user_id,
    p.role,
    p.name,
    p.designation,
    p.phone,
    p.personal_phone,
    p.whatsapp,
    p.social_link,
    p.photo_url,
    p.cover_url,
    p.joining_date
  from public.profiles p
  order by
    case p.role when 'admin' then 1 when 'accounts' then 2 else 3 end,
    p.name asc;
end;
$$;

revoke all on function public.get_team_directory() from public, anon;
grant execute on function public.get_team_directory() to authenticated;

-- 5. Refresh PostgREST schema cache
notify pgrst, 'reload schema';
