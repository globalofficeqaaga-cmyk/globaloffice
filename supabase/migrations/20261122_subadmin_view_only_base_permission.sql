-- Replace the old report-viewer flag with the explicit Subadmin – View Only permission.
-- Preserve each user's other separately granted permissions.
update public.profiles p
set permissions = (
  select coalesce(jsonb_agg(permission order by permission), '[]'::jsonb)
  from (
    select distinct case
      when value = 'view_all_reports' then 'sub_admin_view_only'
      else value
    end as permission
    from jsonb_array_elements_text(coalesce(p.permissions, '[]'::jsonb)) as item(value)
  ) normalized
)
where coalesce(p.permissions, '[]'::jsonb) @> '["view_all_reports"]'::jsonb;

create or replace function public.is_admin_or_accounts()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin_view_only"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["view_finance"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["manage_finance"]'::jsonb
      )
  );
$function$;

create or replace function public.can_view_all_operations()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin_view_only"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
      )
  );
$function$;

create or replace function public.can_view_team_profiles()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or coalesce(p.permissions, '[]'::jsonb) @> '["view_team_profiles"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin_view_only"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["send_messages"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["manage_user_permissions"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
      )
  );
$function$;

create or replace function private.can_view_all_client_records()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (
        p.role = 'admin'
        or coalesce(p.permissions, '[]'::jsonb) @> '["view_all_clients"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin_view_only"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
      )
  );
$function$;
