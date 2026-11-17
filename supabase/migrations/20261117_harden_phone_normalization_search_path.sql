create or replace function public.normalize_phone(p_input text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_digits text;
begin
  v_digits := regexp_replace(coalesce(p_input, ''), '\D', '', 'g');
  if left(v_digits, 3) = '880' and length(v_digits) >= 13 then
    return substr(v_digits, 3);
  end if;
  return v_digits;
end;
$$;
