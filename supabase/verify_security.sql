-- ============================================================================
-- Non-Destructive Post-Migration Security Verification Suite
-- Run AFTER executing supabase/setup_all.sql in Supabase SQL Editor.
-- Safe to run anytime: read-only checks + rolled-back assertions (BEGIN/ROLLBACK).
-- ============================================================================

-- TEST 1: Verify all 12 required tables exist and have Row Level Security (RLS) enabled
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles',
    'clients',
    'meetings',
    'medicals',
    'interviews',
    'site_settings',
    'account_ledger',
    'staff_attendance',
    'staff_daily_logs',
    'audit_logs',
    'tracking_rate_limits',
    'team_messages'
  )
order by c.relname;

-- TEST 2: Verify obsolete insecure auth.users SQL functions were dropped (expected: 0 rows)
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'update_own_credentials',
    'admin_create_user_account',
    'admin_create_staff_account',
    'admin_update_staff_credentials'
  );

-- TEST 3: Audit every SECURITY DEFINER function and its EXECUTE grants
select
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and p.prosecdef = true
order by p.proname;

-- Expected results for TEST 3:
--   bump_profile_version              | anon: false | auth: false
--   bump_version_and_meta             | anon: false | auth: false
--   check_rate_limit                  | anon: false | auth: false
--   get_daily_client_activity         | anon: false | auth: true (checks is_admin_or_accounts inside)
--   get_team_directory                | anon: false | auth: true (requires auth.uid() is not null)
--   handle_new_user                   | anon: false | auth: false
--   is_admin                          | anon: false | auth: true
--   is_admin_or_accounts              | anon: false | auth: true
--   lookup_client_by_phone            | anon: true  | auth: true (rate-limited, exact match, non-sensitive only)
--   prevent_role_self_escalation      | anon: false | auth: false
--   protect_team_message_immutability | anon: false | auth: false
--   record_audit_log                  | anon: false | auth: false
--   resolve_login_email               | anon: true  | auth: true (rate-limited, user_id only)

-- TEST 4: Audit tracking_rate_limits & audit_logs table privileges for anon/authenticated
select
  t.table_name,
  has_table_privilege('anon', 'public.' || t.table_name, 'SELECT') as anon_select,
  has_table_privilege('anon', 'public.' || t.table_name, 'INSERT') as anon_insert,
  has_table_privilege('authenticated', 'public.' || t.table_name, 'INSERT') as auth_insert,
  has_table_privilege('authenticated', 'public.' || t.table_name, 'UPDATE') as auth_update,
  has_table_privilege('authenticated', 'public.' || t.table_name, 'DELETE') as auth_delete
from (values ('tracking_rate_limits'), ('audit_logs')) as t(table_name);

-- TEST 5: Verify RLS policies on all public operational tables
select
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- TEST 6: Transactional negative tests for exact phone length & role-escalation trigger (ROLLBACK safe)
begin;
  -- 6a. Partial phone numbers (< 10 digits) must be rejected
  do $$
  declare
    v_err text;
  begin
    begin
      perform public.lookup_client_by_phone('45678');
      raise exception 'SECURITY TEST FAILED: Partial phone number was accepted!';
    exception when others then
      v_err := sqlerrm;
      if position('at least 10 digits' in v_err) = 0 then
        raise exception 'Unexpected error for short phone test: %', v_err;
      end if;
    end;
  end $$;

  -- 6b. If at least one non-admin profile exists, verify trigger blocks self-escalation
  do $$
  declare
    v_staff_id uuid;
    v_err text;
  begin
    select id into v_staff_id from public.profiles where role <> 'admin' limit 1;
    if v_staff_id is not null then
      perform set_config('request.jwt.claim.sub', v_staff_id::text, true);
      perform set_config('request.jwt.claim.role', 'authenticated', true);
      begin
        update public.profiles set role = 'admin' where id = v_staff_id;
        raise exception 'SECURITY TEST FAILED: Non-admin escalated role to admin!';
      exception when others then
        v_err := sqlerrm;
        if position('Only administrators can change user roles' in v_err) = 0 then
          raise exception 'Unexpected error for escalation test: %', v_err;
        end if;
      end;
    end if;
  end $$;
rollback;
