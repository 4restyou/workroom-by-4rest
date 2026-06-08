-- Privacy consent + profile completion gate.
-- Adds a consent timestamp and extends update_my_profile to record it.

alter table public.profiles
  add column if not exists consented_at timestamp with time zone;

drop function if exists public.update_my_profile(text, text, text);

create or replace function public.update_my_profile(
  p_full_name text,
  p_phone text,
  p_address text,
  p_consent boolean default false
)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile profiles;
begin
  update public.profiles
  set
    full_name = nullif(trim(p_full_name), ''),
    phone = nullif(trim(p_phone), ''),
    address = nullif(trim(p_address), ''),
    consented_at = case when p_consent and consented_at is null then now() else consented_at end
  where id = auth.uid()
  returning * into updated_profile;

  if updated_profile.id is null then
    insert into public.profiles (id, email, full_name, phone, address, consented_at)
    values (
      auth.uid(),
      coalesce((auth.jwt() ->> 'email'), ''),
      nullif(trim(p_full_name), ''),
      nullif(trim(p_phone), ''),
      nullif(trim(p_address), ''),
      case when p_consent then now() else null end
    )
    returning * into updated_profile;
  end if;

  return updated_profile;
end;
$$;
