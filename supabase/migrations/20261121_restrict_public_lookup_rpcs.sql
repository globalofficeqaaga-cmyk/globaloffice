-- Restrict privileged public lookup functions to the server service role.
-- Browser clients must use the rate-limited /api/auth/login and /api/client-lookup routes.
revoke all on function public.lookup_client_by_phone(text) from public, anon, authenticated;
grant execute on function public.lookup_client_by_phone(text) to service_role;

revoke all on function public.resolve_login_email(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text) to service_role;
