-- Private finance receipt upload and verification.
alter table public.account_ledger
  add column if not exists receipt_path text,
  add column if not exists receipt_status text not null default 'not_submitted',
  add column if not exists receipt_uploaded_at timestamptz,
  add column if not exists receipt_verified_at timestamptz,
  add column if not exists receipt_verified_by uuid references public.profiles(id);

alter table public.account_ledger
  drop constraint if exists account_ledger_receipt_status_check;
alter table public.account_ledger
  add constraint account_ledger_receipt_status_check
  check (receipt_status in ('not_submitted','pending','verified','rejected'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('account-receipts','account-receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false, file_size_limit=10485760, allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists "account_receipts_select_finance" on storage.objects;
create policy "account_receipts_select_finance" on storage.objects
for select to authenticated
using (bucket_id='account-receipts' and public.is_admin_or_accounts());

drop policy if exists "account_receipts_insert_finance" on storage.objects;
create policy "account_receipts_insert_finance" on storage.objects
for insert to authenticated
with check (bucket_id='account-receipts' and public.can_manage_finance()
  and (public.is_admin() or (storage.foldername(name))[1]=auth.uid()::text));

drop policy if exists "account_receipts_delete_finance" on storage.objects;
create policy "account_receipts_delete_finance" on storage.objects
for delete to authenticated
using (bucket_id='account-receipts' and public.can_manage_finance());

-- Trigger-only functions must not be callable as RPCs.
revoke all on function public.prevent_role_self_escalation() from public, anon, authenticated;
revoke all on function public.record_audit_log() from public, anon, authenticated;
revoke all on function public.bump_profile_version() from public, anon, authenticated;
revoke all on function public.bump_version_and_meta() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- Privileged account-management functions require a signed-in Admin; internal checks still enforce Admin.
revoke all on function public.admin_create_staff_account(text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.admin_create_staff_account(text,text,text,text,text,text,text,text,text,text) to authenticated;
revoke all on function public.admin_create_user_account(text,text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.admin_create_user_account(text,text,text,text,text,text,text,text,text,text,text) to authenticated;
revoke all on function public.admin_update_staff_credentials(uuid,text,text) from public, anon;
grant execute on function public.admin_update_staff_credentials(uuid,text,text) to authenticated;
revoke all on function public.get_daily_client_activity() from public, anon;
grant execute on function public.get_daily_client_activity() to authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.update_own_credentials(text,text) from public, anon;
grant execute on function public.update_own_credentials(text,text) to authenticated;

notify pgrst, 'reload schema';
