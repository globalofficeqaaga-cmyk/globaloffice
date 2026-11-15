-- ============================================================================
-- Admin Seed (admin / admin) + Credential Management RPCs for Supabase
-- Safe & idempotent: never overwrites an existing admin account if already set up.
-- Run this in Supabase Dashboard -> SQL Editor.
-- ============================================================================

create extension if not exists pgcrypto;

-- 1. Seed default Admin account (User ID: admin, Password: admin) ONLY if no admin exists yet
do $$
declare
  v_admin_uid uuid;
  v_admin_email text := 'admin@globalpathways.local';
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    select id into v_admin_uid from auth.users where lower(email) = v_admin_email limit 1;

    if v_admin_uid is null then
      v_admin_uid := gen_random_uuid();
      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        v_admin_uid,
        'authenticated',
        'authenticated',
        v_admin_email,
        crypt('admin', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"user_id":"admin","name":"System Administrator","designation":"Managing Director"}'::jsonb,
        now(),
        now(),
        '',
        '',
        '',
        ''
      );

      insert into auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      )
      values (
        gen_random_uuid(),
        v_admin_uid,
        v_admin_uid::text,
        jsonb_build_object('sub', v_admin_uid::text, 'email', v_admin_email),
        'email',
        now(),
        now(),
        now()
      )
      on conflict do nothing;
    end if;

    insert into public.profiles (
      id,
      user_id,
      email,
      role,
      name,
      designation
    )
    values (
      v_admin_uid,
      'admin',
      v_admin_email,
      'admin',
      'System Administrator',
      'Managing Director'
    )
    on conflict (id) do update
      set role = 'admin',
          user_id = 'admin';
  end if;
end $$;

-- 2. RPC: Authenticated user updates their own User ID (Admin) and/or Password
create or replace function public.update_own_credentials(
  p_new_user_id text default null,
  p_new_password text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_clean_uid text;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if not found then
    raise exception 'Profile not found.';
  end if;

  if p_new_user_id is not null and trim(p_new_user_id) <> '' then
    v_clean_uid := trim(p_new_user_id);
    if v_role <> 'admin' then
      raise exception 'Only administrators can change their own login User ID.';
    end if;
    if exists (
      select 1 from public.profiles
      where id <> v_uid and lower(user_id) = lower(v_clean_uid)
    ) then
      raise exception 'Another account already uses this User ID.';
    end if;

    update public.profiles
    set user_id = v_clean_uid
    where id = v_uid;
  end if;

  if p_new_password is not null and trim(p_new_password) <> '' then
    if length(trim(p_new_password)) < 4 then
      raise exception 'New password must be at least 4 characters.';
    end if;

    update auth.users
    set encrypted_password = crypt(trim(p_new_password), gen_salt('bf')),
        updated_at = now()
    where id = v_uid;
  end if;
end;
$$;

revoke all on function public.update_own_credentials(text, text) from public;
grant execute on function public.update_own_credentials(text, text) to authenticated;

-- 3. RPC: Admin creates a Staff account directly with User ID & Password (no email confirmation needed)
create or replace function public.admin_create_staff_account(
  p_user_id text,
  p_password text,
  p_name text,
  p_email text default '',
  p_designation text default 'Visa & Recruitment Coordinator',
  p_phone text default '',
  p_whatsapp text default '',
  p_social_link text default '',
  p_photo_url text default '',
  p_cover_url text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_clean_uid text := trim(coalesce(p_user_id, ''));
  v_clean_pass text := trim(coalesce(p_password, ''));
  v_clean_name text := trim(coalesce(p_name, ''));
  v_clean_email text := trim(coalesce(p_email, ''));
  v_new_id uuid := gen_random_uuid();
  v_profile public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can create staff accounts.';
  end if;

  if v_clean_uid = '' or v_clean_name = '' or length(v_clean_pass) < 4 then
    raise exception 'Staff Name, User ID, and Password (min 4 chars) are required.';
  end if;

  if exists (select 1 from public.profiles where lower(user_id) = lower(v_clean_uid)) then
    raise exception 'A user with this User ID already exists.';
  end if;

  if v_clean_email = '' then
    v_clean_email := lower(regexp_replace(v_clean_uid, '[^a-zA-Z0-9._-]', '', 'g')) || '@staff.globalpathways.local';
  end if;

  if exists (select 1 from auth.users where lower(email) = lower(v_clean_email)) then
    raise exception 'An account with this email already exists.';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_new_id,
    'authenticated',
    'authenticated',
    v_clean_email,
    crypt(v_clean_pass, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'user_id', v_clean_uid,
      'name', v_clean_name,
      'designation', coalesce(nullif(trim(p_designation), ''), 'Visa & Recruitment Coordinator'),
      'phone', coalesce(trim(p_phone), ''),
      'whatsapp', coalesce(nullif(trim(p_whatsapp), ''), coalesce(trim(p_phone), '')),
      'social_link', coalesce(trim(p_social_link), ''),
      'photo_url', coalesce(trim(p_photo_url), ''),
      'cover_url', coalesce(trim(p_cover_url), '')
    ),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    v_new_id,
    v_new_id::text,
    jsonb_build_object('sub', v_new_id::text, 'email', v_clean_email),
    'email',
    now(),
    now(),
    now()
  )
  on conflict do nothing;

  select * into v_profile from public.profiles where id = v_new_id;
  if not found then
    insert into public.profiles (
      id, user_id, email, role, name, designation, phone, whatsapp, social_link, photo_url, cover_url
    )
    values (
      v_new_id,
      v_clean_uid,
      v_clean_email,
      'staff',
      v_clean_name,
      coalesce(nullif(trim(p_designation), ''), 'Visa & Recruitment Coordinator'),
      coalesce(trim(p_phone), ''),
      coalesce(nullif(trim(p_whatsapp), ''), coalesce(trim(p_phone), '')),
      coalesce(trim(p_social_link), ''),
      coalesce(trim(p_photo_url), ''),
      coalesce(trim(p_cover_url), '')
    )
    returning * into v_profile;
  end if;

  return to_jsonb(v_profile);
end;
$$;

revoke all on function public.admin_create_staff_account(text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.admin_create_staff_account(text, text, text, text, text, text, text, text, text, text) to authenticated;

-- 4. RPC: Admin updates or resets a Staff member's User ID and/or Password
create or replace function public.admin_update_staff_credentials(
  p_staff_id uuid,
  p_user_id text default null,
  p_new_password text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_clean_uid text;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can reset staff credentials.';
  end if;

  if not exists (select 1 from public.profiles where id = p_staff_id and role = 'staff') then
    raise exception 'Staff account not found.';
  end if;

  if p_user_id is not null and trim(p_user_id) <> '' then
    v_clean_uid := trim(p_user_id);
    if exists (
      select 1 from public.profiles
      where id <> p_staff_id and lower(user_id) = lower(v_clean_uid)
    ) then
      raise exception 'Another account already uses this User ID.';
    end if;

    update public.profiles
    set user_id = v_clean_uid
    where id = p_staff_id;
  end if;

  if p_new_password is not null and trim(p_new_password) <> '' then
    if length(trim(p_new_password)) < 4 then
      raise exception 'Password must be at least 4 characters.';
    end if;

    update auth.users
    set encrypted_password = crypt(trim(p_new_password), gen_salt('bf')),
        updated_at = now()
    where id = p_staff_id;
  end if;
end;
$$;

revoke all on function public.admin_update_staff_credentials(uuid, text, text) from public;
grant execute on function public.admin_update_staff_credentials(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
