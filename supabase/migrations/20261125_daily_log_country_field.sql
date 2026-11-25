-- Add a separate destination country field to daily conversation logs.
alter table public.staff_daily_logs
  add column if not exists contact_country text not null default '';

notify pgrst, 'reload schema';
