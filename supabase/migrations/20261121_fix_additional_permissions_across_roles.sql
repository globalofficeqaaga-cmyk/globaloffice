create or replace function public.can_manage_finance()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["manage_finance"]'::jsonb
      )
  );
$$;

create or replace function public.is_admin_or_accounts()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["view_all_reports"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["view_finance"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["manage_finance"]'::jsonb
      )
  );
$$;

create or replace function public.can_manage_operational_records()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'staff')
        or coalesce(p.permissions, '[]'::jsonb) @> '["edit_clients"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
      )
  );
$$;

create or replace function public.can_view_all_operations()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'director', 'management')
        or coalesce(p.permissions, '[]'::jsonb) @> '["view_all_reports"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
      )
  );
$$;

create or replace function public.can_view_team_profiles()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'director', 'management')
        or coalesce(p.permissions, '[]'::jsonb) @> '["view_team_profiles"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["view_all_reports"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
      )
  );
$$;

create or replace function public.can_edit_client_records()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or coalesce(p.permissions, '[]'::jsonb) @> '["edit_clients"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
      )
  );
$$;

create or replace function public.can_delete_client_records()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or coalesce(p.permissions, '[]'::jsonb) @> '["delete_clients"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
      )
  );
$$;

create or replace function public.can_add_client_records()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or coalesce(p.permissions, '[]'::jsonb) @> '["add_clients"]'::jsonb
        or coalesce(p.permissions, '[]'::jsonb) @> '["sub_admin"]'::jsonb
      )
  );
$$;

drop policy if exists clients_insert_owner_or_admin on public.clients;
create policy clients_insert_owner_or_admin
on public.clients for insert to authenticated
with check (
  auth.uid() = staff_id
  or public.is_admin()
  or public.is_sub_admin()
  or public.can_add_client_records()
);

drop policy if exists clients_update_owner_or_admin on public.clients;
create policy clients_update_owner_or_admin
on public.clients for update to authenticated
using (
  public.is_admin()
  or public.is_sub_admin()
  or public.can_edit_client_records()
  or auth.uid() = staff_id
)
with check (
  public.is_admin()
  or public.is_sub_admin()
  or public.can_edit_client_records()
  or auth.uid() = staff_id
);

drop policy if exists clients_delete_admin_only on public.clients;
create policy clients_delete_admin_only
on public.clients for delete to authenticated
using (
  public.is_admin()
  or public.is_sub_admin()
  or public.can_delete_client_records()
);

grant execute on function public.can_add_client_records() to authenticated;
