-- ============================================================================
-- Persistent Website CMS & Controls Table (public.site_settings)
-- Allows Admin to manage website logo, poster slider, photos, contacts, and features.
-- Safe & idempotent: run once in Supabase Dashboard -> SQL Editor.
-- ============================================================================

create table if not exists public.site_settings (
  id text primary key default 'default',
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

-- Public & authenticated visitors can read published site settings
drop policy if exists "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read"
  on public.site_settings
  for select
  to anon, authenticated
  using (true);

-- Only Administrators can insert or update website settings
drop policy if exists "site_settings_admin_insert" on public.site_settings;
create policy "site_settings_admin_insert"
  on public.site_settings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "site_settings_admin_update" on public.site_settings;
create policy "site_settings_admin_update"
  on public.site_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
