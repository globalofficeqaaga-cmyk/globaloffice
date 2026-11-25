-- Add Trade details to daily call / conversation logs.
alter table public.staff_daily_logs
  add column if not exists contact_address text not null default '',
  add column if not exists contact_age integer;

notify pgrst, 'reload schema';
