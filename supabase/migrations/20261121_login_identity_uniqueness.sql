-- Keep User IDs and profile email lookups unique regardless of letter case or surrounding spaces.
-- Existing rows were audited before adding these constraints.
create unique index if not exists profiles_user_id_ci_unique_idx
  on public.profiles (lower(btrim(user_id)))
  where user_id is not null and btrim(user_id) <> '';

create unique index if not exists profiles_email_ci_unique_idx
  on public.profiles (lower(btrim(email)))
  where email is not null and btrim(email) <> '';
