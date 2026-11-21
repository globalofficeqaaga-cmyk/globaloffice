alter table public.staff_daily_logs add column if not exists next_follow_up_time text, add column if not exists edit_history jsonb not null default '[]'::jsonb;
create or replace function public.track_staff_daily_log_edits() returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.edit_history := coalesce(old.edit_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('changed_at', now(), 'log_date', old.log_date, 'log_time', old.log_time, 'outcome', old.outcome, 'next_follow_up_date', old.next_follow_up_date, 'next_follow_up_time', old.next_follow_up_time, 'contact_name', old.contact_name, 'topic', old.topic, 'discussion_summary', old.discussion_summary));
  return new;
end; $$;
drop trigger if exists staff_daily_logs_track_edits on public.staff_daily_logs;
create trigger staff_daily_logs_track_edits before update on public.staff_daily_logs for each row execute function public.track_staff_daily_log_edits();
comment on column public.staff_daily_logs.next_follow_up_time is 'Local follow-up time in HH:MM format';
comment on column public.staff_daily_logs.edit_history is 'Previous conversation log snapshots recorded on every edit';