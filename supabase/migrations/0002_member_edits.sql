-- 0002: member-editable reservations + inquiry editing
-- (Incremental over 0001_baseline. Also folded into schema.sql.)

-- Reservation guard now runs on INSERT and UPDATE so member edits are
-- re-validated (capacity excludes the row itself); price/snapshot re-filled.
create or replace function public.before_reservation_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled text;
  v_pass public.passes%rowtype;
  v_hours public.business_hours%rowtype;
  v_dow integer;
  v_capacity integer;
  v_booked integer;
  v_revalidate boolean;
begin
  if tg_op = 'INSERT' then
    select value into v_enabled from public.space_settings where key = 'reservation_enabled';
    if coalesce(v_enabled, 'true') <> 'true' then
      raise exception '현재 예약을 받고 있지 않습니다.';
    end if;
  end if;

  if new.pass_type is distinct from '기타 문의' then
    select * into v_pass
    from public.passes
    where name = new.pass_type and is_active = true
    order by sort_order
    limit 1;
    if found then
      new.pass_id := v_pass.id;
      new.pass_name_snapshot := v_pass.name;
      new.price_at_booking := v_pass.price;
      new.seat_type_id := v_pass.seat_type_id;
    end if;
  end if;

  if tg_op = 'INSERT' then
    v_revalidate := true;
  else
    v_revalidate := new.date is distinct from old.date
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
      or new.seat_type_id is distinct from old.seat_type_id
      or coalesce(new.people, 1) is distinct from coalesce(old.people, 1);
  end if;

  if v_revalidate and new.start_time is not null and new.end_time is not null then
    if new.end_time <= new.start_time then
      raise exception '종료 시간은 시작 시간보다 늦어야 합니다.';
    end if;

    v_dow := extract(dow from new.date);
    select * into v_hours from public.business_hours where weekday = v_dow;
    if found then
      if v_hours.is_closed then
        raise exception '선택하신 날짜는 휴무일입니다.';
      end if;
      if new.start_time < v_hours.open_time or new.end_time > v_hours.close_time then
        raise exception '운영 시간(% - %) 안에서만 예약할 수 있습니다.',
          to_char(v_hours.open_time, 'HH24:MI'), to_char(v_hours.close_time, 'HH24:MI');
      end if;
    end if;

    if new.seat_type_id is not null and new.status in ('pending', 'confirmed') then
      perform pg_advisory_xact_lock(hashtext(new.seat_type_id::text || new.date::text));
      select capacity into v_capacity from public.seat_types where id = new.seat_type_id and is_active = true;
      if v_capacity is null then
        raise exception '선택하신 좌석을 사용할 수 없습니다.';
      end if;
      select coalesce(sum(coalesce(people, 1)), 0) into v_booked
      from public.reservations
      where date = new.date
        and seat_type_id = new.seat_type_id
        and status in ('pending', 'confirmed')
        and start_time is not null and end_time is not null
        and start_time < new.end_time and end_time > new.start_time
        and id is distinct from new.id;
      if v_booked + greatest(coalesce(new.people, 1), 1) > v_capacity then
        raise exception '선택한 시간대의 잔여 좌석이 부족합니다. (잔여 %석)', greatest(v_capacity - v_booked, 0);
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists before_reservation_insert on reservations;
drop trigger if exists before_reservation_write on reservations;
create trigger before_reservation_write
before insert or update on reservations
for each row execute function public.before_reservation_write();

drop function if exists public.before_reservation_insert();

-- Members can cancel / re-request their own reservation (not self-confirm).
drop policy if exists "reservations_owner_update" on reservations;
create policy "reservations_owner_update"
on reservations
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid() and status in ('pending', 'canceled'));

-- Inquiry editing.
alter table reservation_inquiries add column if not exists edited_at timestamp with time zone;

drop policy if exists "reservation_inquiries_update_own" on reservation_inquiries;
create policy "reservation_inquiries_update_own"
on reservation_inquiries
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create or replace function public.guard_inquiry_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.admin_reply := old.admin_reply;
    new.replied_at := old.replied_at;
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_inquiry_update on reservation_inquiries;
create trigger guard_inquiry_update
before update on reservation_inquiries
for each row execute function public.guard_inquiry_update();
