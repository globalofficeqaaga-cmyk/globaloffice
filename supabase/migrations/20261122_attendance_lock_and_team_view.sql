-- ============================================================================
-- Migration: Lock Attendance Edits & Enable Team-Wide Attendance Viewing
-- Safe, idempotent migration — preserves all existing attendance records.
-- ============================================================================

-- 1. Allow all authenticated team members (Admin, Staff/Managers, Accounts)
--    to view team attendance records for overview & A4 printing.
drop policy if exists "staff_attendance_select" on public.staff_attendance;
create policy "staff_attendance_select"
  on public.staff_attendance
  for select
  to authenticated
  using (auth.uid() is not null);

-- 2. Block hard deletion of attendance records even by Admin.
drop policy if exists "staff_attendance_delete_admin" on public.staff_attendance;
create policy "staff_attendance_delete_admin"
  on public.staff_attendance
  for delete
  to authenticated
  using (false);

-- 3. Enforce strict immutability on existing attendance rows:
--    Once recorded, only a one-time Check-Out time is permitted when
--    check_out_time is currently empty and status is not Leave.
create or replace function public.enforce_attendance_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.staff_id is distinct from old.staff_id
     or new.attendance_date is distinct from old.attendance_date
     or new.status is distinct from old.status
     or new.check_in_time is distinct from old.check_in_time
     or new.work_location is distinct from old.work_location
     or new.notes is distinct from old.notes
     or new.deleted_at is distinct from old.deleted_at
  then
    raise exception 'Attendance records are locked and cannot be edited or deleted once recorded.';
  end if;

  if new.check_out_time is distinct from old.check_out_time then
    if coalesce(old.check_out_time, '') <> '' or old.status = 'Leave' then
      raise exception 'Check-out time is already locked and cannot be edited.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_staff_attendance_lock on public.staff_attendance;
create trigger trg_staff_attendance_lock
  before update on public.staff_attendance
  for each row
  execute function public.enforce_attendance_immutability();
