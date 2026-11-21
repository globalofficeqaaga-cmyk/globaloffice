-- Limit authenticated call participants to call-state fields only.
-- RLS still ensures that only a caller/callee can update their call session.
revoke update on table public.team_call_sessions from authenticated;
grant update (status, started_at, ended_at, duration_seconds)
on table public.team_call_sessions to authenticated;
