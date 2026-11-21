drop policy if exists account_ledger_delete_admin_only on public.account_ledger;

create policy account_ledger_delete_admin_only
on public.account_ledger
for delete
to authenticated
using (public.can_manage_finance());
