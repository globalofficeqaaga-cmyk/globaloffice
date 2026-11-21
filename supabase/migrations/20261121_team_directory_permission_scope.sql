-- Messaging and permission managers need the directory only to choose
-- recipients or administer accounts; role labels alone do not grant access.
create or replace function public.can_view_team_profiles()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or coalesce(p.permissions, '[]'::jsonb) @> '["view_team_profiles"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["view_all_reports"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["send_messages"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["manage_user_permissions"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
      )
  );
$function$;
