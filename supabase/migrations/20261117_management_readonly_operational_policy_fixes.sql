-- Keep Director/Management read-only across operational records.
drop policy if exists "meetings_delete_owner_or_admin" on public.meetings;
create policy "meetings_delete_owner_or_admin" on public.meetings
for delete to authenticated
using (public.is_admin() or (auth.uid() = staff_id and public.can_manage_operational_records()));

drop policy if exists "medicals_delete_owner_or_admin" on public.medicals;
create policy "medicals_delete_owner_or_admin" on public.medicals
for delete to authenticated
using (public.is_admin() or (auth.uid() = staff_id and public.can_manage_operational_records()));

drop policy if exists "interviews_delete_owner_or_admin" on public.interviews;
create policy "interviews_delete_owner_or_admin" on public.interviews
for delete to authenticated
using (public.is_admin() or (auth.uid() = staff_id and public.can_manage_operational_records()));

-- Management and Director may read team attendance; Management still cannot write it.
drop policy if exists "staff_attendance_select" on public.staff_attendance;
create policy "staff_attendance_select" on public.staff_attendance
for select to authenticated
using (auth.uid() = staff_id or public.can_view_all_operations() or public.is_admin_or_accounts());

notify pgrst, 'reload schema';
