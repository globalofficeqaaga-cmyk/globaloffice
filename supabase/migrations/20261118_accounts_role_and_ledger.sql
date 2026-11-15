-- ============================================================================
-- Accounts Role Dashboard + Debit/Credit Ledger Table & RLS Policies
-- Safe & idempotent: never drops existing tables or records.
-- Run once in Supabase Dashboard -> SQL Editor (or via supabase/setup_all.sql).
-- ============================================================================

-- 1. Allow 'accounts' role alongside 'admin' and 'staff' in public.profiles
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'staff', 'accounts'));

-- Helper function: checks whether current user is admin or accounts
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

-- 2. RPC: Admin creates a Staff OR Accounts Dashboard login directly (no email confirmation needed)
create or replace function public.admin_create_user_account(
  p_user_id text,
  p_password text,
  p_name text,
  p_role text default 'staff',
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
  v_clean_role text := lower(trim(coalesce(p_role, 'staff')));
  v_clean_email text := trim(coalesce(p_email, ''));
  v_default_desig text;
  v_new_id uuid := gen_random_uuid();
  v_profile public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can create user accounts.';
  end if;

  if v_clean_role not in ('staff', 'accounts') then
    raise exception 'Role must be staff or accounts.';
  end if;

  if v_clean_uid = '' or v_clean_name = '' or length(v_clean_pass) < 4 then
    raise exception 'Name, User ID, and Password (min 4 chars) are required.';
  end if;

  if exists (select 1 from public.profiles where lower(user_id) = lower(v_clean_uid)) then
    raise exception 'A user with this User ID already exists.';
  end if;

  if v_clean_email = '' then
    v_clean_email := lower(regexp_replace(v_clean_uid, '[^a-zA-Z0-9._-]', '', 'g')) || '@' || v_clean_role || '.globalpathways.local';
  end if;

  if exists (select 1 from auth.users where lower(email) = lower(v_clean_email)) then
    raise exception 'An account with this email already exists.';
  end if;

  v_default_desig := case
    when v_clean_role = 'accounts' then 'Accounts & Finance Officer'
    else 'Visa & Recruitment Coordinator'
  end;

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
      'role', v_clean_role,
      'designation', coalesce(nullif(trim(p_designation), ''), v_default_desig),
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

  insert into public.profiles (
    id, user_id, email, role, name, designation, phone, whatsapp, social_link, photo_url, cover_url
  )
  values (
    v_new_id,
    v_clean_uid,
    v_clean_email,
    v_clean_role,
    v_clean_name,
    coalesce(nullif(trim(p_designation), ''), v_default_desig),
    coalesce(trim(p_phone), ''),
    coalesce(nullif(trim(p_whatsapp), ''), coalesce(trim(p_phone), '')),
    coalesce(trim(p_social_link), ''),
    coalesce(trim(p_photo_url), ''),
    coalesce(trim(p_cover_url), '')
  )
  on conflict (id) do update
    set role = excluded.role,
        user_id = excluded.user_id,
        name = excluded.name,
        designation = excluded.designation,
        phone = excluded.phone,
        whatsapp = excluded.whatsapp,
        social_link = excluded.social_link,
        photo_url = excluded.photo_url,
        cover_url = excluded.cover_url
  returning * into v_profile;

  return to_jsonb(v_profile);
end;
$$;

revoke all on function public.admin_create_user_account(text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.admin_create_user_account(text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- Allow admin_update_staff_credentials to reset User ID & Password for both staff and accounts users
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
    raise exception 'Only administrators can reset user credentials.';
  end if;

  if not exists (select 1 from public.profiles where id = p_staff_id and role in ('staff', 'accounts')) then
    raise exception 'User account not found.';
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

-- 3. ACCOUNT_LEDGER TABLE (Debit & Credit Entries)
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

-- Both Admin and Accounts can view active Debit/Credit ledger entries
drop policy if exists "account_ledger_select_admin_or_accounts" on public.account_ledger;
create policy "account_ledger_select_admin_or_accounts"
  on public.account_ledger
  for select
  to authenticated
  using (public.is_admin_or_accounts());

-- Both Admin and Accounts can insert new Debit/Credit entries
drop policy if exists "account_ledger_insert_admin_or_accounts" on public.account_ledger;
create policy "account_ledger_insert_admin_or_accounts"
  on public.account_ledger
  for insert
  to authenticated
  with check (
    public.is_admin_or_accounts()
    and (public.is_admin() or account_owner_id = auth.uid())
  );

-- Only Admin can edit, soft-delete, or restore Debit/Credit ledger entries
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

-- Enhance audit summary to include ledger entry title
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

drop trigger if exists trg_account_ledger_version on public.account_ledger;
create trigger trg_account_ledger_version
  before insert or update on public.account_ledger
  for each row
  execute function public.bump_version_and_meta();

drop trigger if exists trg_account_ledger_audit on public.account_ledger;
create trigger trg_account_ledger_audit
  after insert or update on public.account_ledger
  for each row
  execute function public.record_audit_log();

notify pgrst, 'reload schema';
