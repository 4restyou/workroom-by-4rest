-- Run this once on an existing WORKROOM by 4REST Supabase project.
-- It tightens data integrity without requiring service-role keys in the frontend.

alter table public.reservations
  add column if not exists deleted_at timestamp with time zone;

update public.reservations
set people = 1
where people is null or people < 1;

update public.reservations
set people = 12
where people > 12;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_people_range'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_people_range check (people between 1 and 12);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_name_not_blank'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_name_not_blank check (btrim(name) <> '');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_phone_not_blank'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_phone_not_blank check (btrim(phone) <> '');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_pass_type_not_blank'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_pass_type_not_blank check (btrim(pass_type) <> '');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_time_order'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_time_order check (
        start_time is null
        or end_time is null
        or start_time < end_time
      );
  end if;
end $$;

with ranked_passes as (
  select
    id,
    row_number() over (
      partition by name
      order by is_active desc, sort_order asc, created_at asc
    ) as row_number
  from public.passes
)
update public.passes
set is_active = false
where id in (
  select id
  from ranked_passes
  where row_number > 1
);

create unique index if not exists passes_active_name_unique
on public.passes (name)
where is_active = true;
