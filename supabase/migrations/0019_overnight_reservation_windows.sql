-- Treat an overnight closing time (for example 08:00-01:00) as one
-- operating day. Reservation.date remains the date on which use starts.

alter table public.reservations drop constraint if exists reservations_time_order;
alter table public.reservations
  add constraint reservations_time_order
  check (start_time is null or end_time is null or start_time <> end_time);

alter table public.business_date_exceptions drop constraint if exists business_date_exceptions_check;
alter table public.business_date_exceptions drop constraint if exists business_date_exceptions_time_window;
alter table public.business_date_exceptions
  add constraint business_date_exceptions_time_window
  check (is_closed or close_time <> open_time);

create or replace function public.booking_end_at(
  p_date date,
  p_start_time time,
  p_end_time time
)
returns timestamp with time zone
language sql
immutable
set search_path = public
as $$
  select ((p_date + p_end_time) at time zone 'Asia/Seoul')
    + case when p_end_time <= p_start_time then interval '1 day' else interval '0' end;
$$;

create or replace function public.check_reservation_capacity(
  p_date date,
  p_start_time time,
  p_end_time time,
  p_seat_type_id uuid,
  p_people integer default 1
)
returns table (
  available boolean,
  capacity integer,
  booked integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  seat_capacity integer;
  booked_people integer;
  v_start_min integer := extract(epoch from p_start_time)::integer / 60;
  v_end_min integer := extract(epoch from p_end_time)::integer / 60;
begin
  if v_end_min <= v_start_min then v_end_min := v_end_min + 1440; end if;
  if p_seat_type_id is null then
    return query select true, null::integer, 0, null::integer;
    return;
  end if;

  select st.capacity into seat_capacity
  from public.seat_types st
  where st.id = p_seat_type_id and st.is_active = true;

  if seat_capacity is null then
    return query select false, 0, 0, 0;
    return;
  end if;

  select coalesce(sum(coalesce(r.people, 1)), 0) into booked_people
  from public.reservations r
  where r.date = p_date
    and r.seat_type_id = p_seat_type_id
    and r.status in ('pending', 'confirmed')
    and r.start_time is not null
    and r.end_time is not null
    and (extract(epoch from r.start_time)::integer / 60) < v_end_min
    and (
      extract(epoch from r.end_time)::integer / 60
      + case when r.end_time <= r.start_time then 1440 else 0 end
    ) > v_start_min;

  return query select
    booked_people + greatest(coalesce(p_people, 1), 1) <= seat_capacity,
    seat_capacity,
    booked_people,
    greatest(seat_capacity - booked_people, 0);
end;
$$;

create or replace function public.validate_reservation_date_exception()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exception public.business_date_exceptions%rowtype;
  v_revalidate boolean;
  v_open_min integer;
  v_close_min integer;
  v_start_min integer;
  v_end_min integer;
begin
  v_revalidate := tg_op = 'INSERT'
    or new.date is distinct from old.date
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time;
  if not v_revalidate or new.start_time is null or new.end_time is null then return new; end if;

  select * into v_exception from public.business_date_exceptions where date = new.date;
  if found then
    if v_exception.is_closed then
      raise exception '선택하신 날짜는 휴무일입니다.%',
        case when nullif(v_exception.note, '') is null then '' else ' ' || v_exception.note end;
    end if;
    v_open_min := extract(epoch from v_exception.open_time)::integer / 60;
    v_close_min := extract(epoch from v_exception.close_time)::integer / 60;
    v_start_min := extract(epoch from new.start_time)::integer / 60;
    v_end_min := extract(epoch from new.end_time)::integer / 60;
    if v_close_min <= v_open_min then v_close_min := v_close_min + 1440; end if;
    if v_end_min <= v_start_min then v_end_min := v_end_min + 1440; end if;
    if v_start_min < v_open_min or v_end_min > v_close_min then
      raise exception '해당 날짜의 운영 시간(% - % 익일) 안에서만 예약할 수 있습니다.',
        to_char(v_exception.open_time, 'HH24:MI'), to_char(v_exception.close_time, 'HH24:MI');
    end if;
  end if;
  return new;
end;
$$;

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
  v_exception public.business_date_exceptions%rowtype;
  v_dow integer;
  v_capacity integer;
  v_booked integer;
  v_revalidate boolean;
  v_open_min integer;
  v_close_min integer;
  v_start_min integer;
  v_end_min integer;
  v_pass_name text;
begin
  if tg_op = 'INSERT' and not public.is_admin() then
    select value into v_enabled from public.space_settings where key = 'reservation_enabled';
    if coalesce(v_enabled, 'true') <> 'true' then raise exception '현재 예약을 받고 있지 않습니다.'; end if;
  end if;

  if new.pass_type is distinct from '기타 문의' then
    select * into v_pass from public.passes
    where name = new.pass_type and is_active = true order by sort_order limit 1;
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
    v_start_min := extract(epoch from new.start_time)::integer / 60;
    v_end_min := extract(epoch from new.end_time)::integer / 60;
    if v_end_min <= v_start_min then v_end_min := v_end_min + 1440; end if;
    if v_end_min - v_start_min <= 0 or v_end_min - v_start_min >= 1440 then
      raise exception '종료 시간을 확인해 주세요.';
    end if;

    v_pass_name := coalesce(new.pass_name_snapshot, new.pass_type, '');
    if v_pass_name ilike '%3시간%' and v_end_min - v_start_min <> 180 then
      raise exception '3시간권은 시작 시간부터 3시간으로 예약해 주세요.';
    elsif v_pass_name ilike '%추가 1시간%' and v_end_min - v_start_min <> 60 then
      raise exception '추가 1시간은 시작 시간부터 1시간으로 예약해 주세요.';
    end if;

    select * into v_exception from public.business_date_exceptions where date = new.date;
    if found then
      if v_exception.is_closed then
        raise exception '선택하신 날짜는 휴무일입니다.%',
          case when nullif(v_exception.note, '') is null then '' else ' ' || v_exception.note end;
      end if;
      v_open_min := extract(epoch from v_exception.open_time)::integer / 60;
      v_close_min := extract(epoch from v_exception.close_time)::integer / 60;
    else
      v_dow := extract(dow from new.date);
      select * into v_hours from public.business_hours where weekday = v_dow;
      if found and v_hours.is_closed then raise exception '선택하신 날짜는 휴무일입니다.'; end if;
      if found then
        v_open_min := extract(epoch from v_hours.open_time)::integer / 60;
        v_close_min := extract(epoch from v_hours.close_time)::integer / 60;
      end if;
    end if;

    if v_open_min is not null then
      if v_close_min <= v_open_min then v_close_min := v_close_min + 1440; end if;
      if v_start_min < v_open_min or v_end_min > v_close_min then
        raise exception '운영 시간 안에서만 예약할 수 있습니다.';
      end if;
    end if;

    if new.seat_type_id is not null and new.status in ('pending', 'confirmed') then
      perform pg_advisory_xact_lock(hashtext(new.seat_type_id::text || new.date::text));
      select capacity into v_capacity from public.seat_types where id = new.seat_type_id and is_active = true;
      if v_capacity is null then raise exception '선택하신 좌석을 사용할 수 없습니다.'; end if;
      select coalesce(sum(coalesce(people, 1)), 0) into v_booked
      from public.reservations
      where date = new.date
        and seat_type_id = new.seat_type_id
        and status in ('pending', 'confirmed')
        and start_time is not null and end_time is not null
        and (extract(epoch from start_time)::integer / 60) < v_end_min
        and (
          extract(epoch from end_time)::integer / 60
          + case when end_time <= start_time then 1440 else 0 end
        ) > v_start_min
        and id is distinct from new.id;
      if v_booked + greatest(coalesce(new.people, 1), 1) > v_capacity then
        raise exception '선택한 시간대의 잔여 좌석이 부족합니다. (잔여 %석)', greatest(v_capacity - v_booked, 0);
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.claim_reservation_end_reminders()
returns table (
  reservation_id uuid,
  member_name text,
  phone text,
  reservation_date date,
  end_time time,
  pass_name text
)
language sql
security definer
set search_path = public
as $$
  update public.reservations r
  set end_reminder_attempted_at = now()
  from (
    select r2.id
    from public.reservations r2
    where r2.status = 'confirmed'
      and r2.deleted_at is null
      and r2.access_start_date is null
      and r2.start_time is not null
      and r2.end_time is not null
      and r2.end_reminder_attempted_at is null
      and public.booking_end_at(r2.date, r2.start_time, r2.end_time) > now()
      and public.booking_end_at(r2.date, r2.start_time, r2.end_time) <= now() + interval '20 minutes'
      and exists (
        select 1 from public.attendance a
        where a.reservation_id = r2.id and a.check_out_at is null
      )
    for update skip locked
  ) candidate
  where r.id = candidate.id
  returning r.id, r.name, r.phone, r.date, r.end_time, coalesce(r.pass_name_snapshot, r.pass_type);
$$;

revoke all on function public.claim_reservation_end_reminders() from public, anon, authenticated;
grant execute on function public.claim_reservation_end_reminders() to service_role;

-- A checkout just after midnight must still find the open attendance record.
create or replace function public.attendance_check_out()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'message', '로그인이 필요합니다.'); end if;
  select a.id into v_id
  from public.attendance a
  where a.profile_id = v_uid
    and a.check_out_at is null
    and a.check_in_at >= now() - interval '24 hours'
  order by a.check_in_at desc limit 1;
  if v_id is null then
    return jsonb_build_object('ok', false, 'message', '출근 기록이 없거나 이미 퇴근했어요.');
  end if;
  update public.attendance set check_out_at = now() where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.attendance_check_out() to authenticated;

create or replace function public.attendance_check_in(
  p_token text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_goal int;
  v_reward text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_now timestamptz := now();
  v_res uuid;
  v_booking_date date;
  v_existing uuid;
  v_count int;
  v_coupon boolean := false;
  v_has_res boolean;
  v_lat text;
  v_lng text;
  v_radius text;
  v_dist double precision;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'AUTH', 'message', '로그인이 필요합니다.'); end if;
  select value into v_token from public.space_settings where key = 'attendance_qr_token';
  if v_token is null or p_token is distinct from v_token then
    return jsonb_build_object('ok', false, 'code', 'TOKEN', 'message', '유효하지 않은 QR입니다.');
  end if;

  select exists (
    select 1 from public.reservations r
    where r.profile_id = v_uid and r.status = 'confirmed' and r.deleted_at is null
      and (
        (
          r.access_start_date is null
          and (r.date = v_today or (r.date = v_today - 1 and r.end_time <= r.start_time))
        )
        or (
          r.access_start_date is not null
          and v_today between r.access_start_date and r.access_end_date
          and extract(dow from v_today)::smallint = any(r.access_weekdays)
          and not (
            r.access_paused_from is not null
            and v_today between r.access_paused_from and r.access_paused_until
          )
          and not exists (
            select 1 from public.business_date_exceptions e where e.date = v_today and e.is_closed
          )
          and (
            exists (select 1 from public.business_date_exceptions e where e.date = v_today and not e.is_closed)
            or not coalesce((
              select h.is_closed from public.business_hours h
              where h.weekday = extract(dow from v_today)::integer
            ), false)
          )
        )
      )
  ) into v_has_res;
  if not v_has_res then
    return jsonb_build_object('ok', false, 'code', 'NO_RESERVATION', 'message', '오늘 이용 가능한 확정 예약이 없어요.');
  end if;

  select r.id, case when r.access_start_date is null then r.date else v_today end
  into v_res, v_booking_date
  from public.reservations r
  where r.profile_id = v_uid and r.status = 'confirmed' and r.deleted_at is null
    and (
      (
        r.access_start_date is null
        and (r.date = v_today or (r.date = v_today - 1 and r.end_time <= r.start_time))
      )
      or (
        r.access_start_date is not null
        and v_today between r.access_start_date and r.access_end_date
        and extract(dow from v_today)::smallint = any(r.access_weekdays)
        and not (
          r.access_paused_from is not null
          and v_today between r.access_paused_from and r.access_paused_until
        )
        and not exists (
          select 1 from public.business_date_exceptions e where e.date = v_today and e.is_closed
        )
        and (
          exists (select 1 from public.business_date_exceptions e where e.date = v_today and not e.is_closed)
          or not coalesce((
            select h.is_closed from public.business_hours h
            where h.weekday = extract(dow from v_today)::integer
          ), false)
        )
      )
    )
    and v_now >= (((case when r.access_start_date is null then r.date else v_today end) + coalesce(r.start_time, time '00:00')) at time zone 'Asia/Seoul') - interval '30 min'
    and v_now <= public.booking_end_at(
      case when r.access_start_date is null then r.date else v_today end,
      coalesce(r.start_time, time '00:00'),
      coalesce(r.end_time, time '23:59')
    )
  order by r.date, r.start_time nulls last
  limit 1;
  if v_res is null then return jsonb_build_object('ok', false, 'code', 'TIME', 'message', '지금은 이용 시간이 아니에요.'); end if;

  select value into v_lat from public.space_settings where key = 'attendance_lat';
  select value into v_lng from public.space_settings where key = 'attendance_lng';
  select value into v_radius from public.space_settings where key = 'attendance_radius_m';
  if v_lat is not null and v_lat <> '' and v_lng is not null and v_lng <> '' then
    if p_lat is null or p_lng is null then
      return jsonb_build_object('ok', false, 'code', 'LOCATION', 'message', '위치 확인이 필요해요. 위치 권한을 허용해 주세요.');
    end if;
    v_dist := 6371000 * acos(least(1, greatest(-1,
      sin(radians(p_lat)) * sin(radians(v_lat::double precision))
      + cos(radians(p_lat)) * cos(radians(v_lat::double precision)) * cos(radians(v_lng::double precision - p_lng))
    )));
    if v_dist > coalesce(nullif(v_radius, '')::double precision, 150) then
      return jsonb_build_object('ok', false, 'code', 'LOCATION', 'message', '매장 근처에서만 출근할 수 있어요.');
    end if;
  end if;

  select id into v_existing from public.attendance
  where profile_id = v_uid and check_out_at is null and check_in_at >= now() - interval '24 hours'
  order by check_in_at desc limit 1;
  if v_existing is not null then
    select count(*) into v_count from public.attendance where profile_id = v_uid;
    return jsonb_build_object('ok', true, 'already', true, 'stamps', v_count, 'message', '이미 입실 처리되었습니다.');
  end if;

  insert into public.attendance (profile_id, reservation_id) values (v_uid, v_res);
  select count(*) into v_count from public.attendance where profile_id = v_uid;
  select coalesce(nullif(value, '')::int, 10) into v_goal from public.space_settings where key = 'attendance_stamp_goal';
  if v_goal is null or v_goal < 1 then v_goal := 10; end if;
  if v_count > 0 and v_count % v_goal = 0 then
    select value into v_reward from public.space_settings where key = 'attendance_reward_label';
    insert into public.coupons (profile_id, label) values (v_uid, coalesce(nullif(v_reward, ''), '보상'));
    v_coupon := true;
  end if;
  return jsonb_build_object('ok', true, 'already', false, 'stamps', v_count, 'goal', v_goal, 'coupon', v_coupon);
end;
$$;

grant execute on function public.attendance_check_in(text, double precision, double precision) to authenticated;
