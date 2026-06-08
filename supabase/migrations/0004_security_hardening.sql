-- Security hardening for member-editable surfaces.
-- Keeps SMS webhook protection in Edge Function code; this migration handles DB
-- privilege boundaries for reservations and profiles.

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
