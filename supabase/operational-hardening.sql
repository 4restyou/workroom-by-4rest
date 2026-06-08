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

create or replace function public.guard_reservation_member_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_start_at timestamp with time zone;
  changes_schedule boolean;
begin
  -- Admins and trusted server functions may update operational/payment fields.
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if auth.uid() is null or old.profile_id is distinct from auth.uid() then
    raise exception '본인 예약만 수정할 수 있습니다.';
  end if;

  if old.status not in ('pending', 'confirmed') then
    raise exception '대기 또는 확정 상태의 예약만 수정할 수 있습니다.';
  end if;

  old_start_at := (old.date + coalesce(old.start_time, time '00:00')) at time zone 'Asia/Seoul';
  changes_schedule := new.date is distinct from old.date
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time;

  if (changes_schedule or new.status is distinct from old.status)
     and old_start_at <= now() then
    raise exception '예약 시작 시간이 지나 수정하거나 취소할 수 없습니다.';
  end if;

  -- Members may only re-request date/time changes or cancel. Everything else
  -- is restored so crafted API calls cannot touch admin/payment fields.
  new.profile_id := old.profile_id;
  new.name := old.name;
  new.phone := old.phone;
  new.email := old.email;
  new.pass_type := old.pass_type;
  new.people := old.people;
  new.message := old.message;
  new.pass_id := old.pass_id;
  new.pass_name_snapshot := old.pass_name_snapshot;
  new.price_at_booking := old.price_at_booking;
  new.seat_type_id := old.seat_type_id;
  new.payment_method := old.payment_method;
  new.payment_status := old.payment_status;
  new.payment_key := old.payment_key;
  new.admin_note := old.admin_note;
  new.notified_at := old.notified_at;
  new.deleted_at := old.deleted_at;
  new.created_at := old.created_at;

  return new;
end;
$$;

drop trigger if exists aa_guard_reservation_member_update on public.reservations;
create trigger aa_guard_reservation_member_update
before update on public.reservations
for each row execute function public.guard_reservation_member_update();

create or replace function public.prevent_member_privilege_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL editor / service-role maintenance and existing admins may manage roles.
  if auth.role() = 'service_role' or auth.uid() is null or public.is_admin() then
    return new;
  end if;

  new.role = old.role;
  new.membership_status = old.membership_status;
  return new;
end;
$$;

create or replace function public.prevent_member_privilege_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL editor / service-role maintenance and existing admins may create admins.
  if auth.role() = 'service_role' or auth.uid() is null or public.is_admin() then
    return new;
  end if;

  new.role := 'user';
  new.membership_status := 'approved';
  return new;
end;
$$;

drop trigger if exists prevent_member_privilege_insert on public.profiles;
create trigger prevent_member_privilege_insert
before insert on public.profiles
for each row execute function public.prevent_member_privilege_insert();

drop trigger if exists prevent_member_privilege_update on public.profiles;
create trigger prevent_member_privilege_update
before update on public.profiles
for each row execute function public.prevent_member_privilege_update();

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and role = 'user'
  and membership_status = 'approved'
);
