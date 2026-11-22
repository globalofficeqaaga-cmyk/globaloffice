-- Ensure the explicit Add clients permission is honored by the INSERT RLS policy.
-- Users without that permission may still add records assigned to themselves only
-- when the existing policy explicitly allows their own staff_id.
drop policy if exists clients_insert_owner_or_admin on public.clients;

create policy clients_insert_owner_or_admin
on public.clients
for insert
to authenticated
with check (
  auth.uid() = staff_id
  or public.is_admin()
  or public.is_sub_admin()
  or public.can_add_client_records()
);
