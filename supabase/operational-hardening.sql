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

create table if not exists public.reservation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null default 'updated',
  before_status text,
  after_status text,
  before_payment_status text,
  after_payment_status text,
  before_admin_note text,
  after_admin_note text,
  created_at timestamp with time zone default now()
);

alter table public.reservation_audit_logs enable row level security;

drop policy if exists "reservation_audit_logs_admin_select" on public.reservation_audit_logs;
create policy "reservation_audit_logs_admin_select"
on public.reservation_audit_logs
for select
to authenticated
using (public.is_admin());

grant select on public.reservation_audit_logs to authenticated;

create or replace function public.log_reservation_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_action text := 'updated';
begin
  if old.status is not distinct from new.status
     and old.payment_status is not distinct from new.payment_status
     and old.admin_note is not distinct from new.admin_note
     and old.deleted_at is not distinct from new.deleted_at then
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    next_action := 'archived';
  end if;

  insert into public.reservation_audit_logs (
    reservation_id,
    actor_id,
    action,
    before_status,
    after_status,
    before_payment_status,
    after_payment_status,
    before_admin_note,
    after_admin_note
  )
  values (
    new.id,
    auth.uid(),
    next_action,
    old.status,
    new.status,
    old.payment_status,
    new.payment_status,
    old.admin_note,
    new.admin_note
  );

  return new;
end;
$$;

drop trigger if exists on_reservation_audit_update on public.reservations;
create trigger on_reservation_audit_update
after update of status, payment_status, admin_note, deleted_at on public.reservations
for each row execute function public.log_reservation_update();
