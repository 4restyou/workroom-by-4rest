-- 두 가지를 고친다.
--
-- 1) 인원 곱셈이 저장되지 않던 문제.
--    예약 저장에는 BEFORE 트리거가 둘 붙어 있고, 이름 순서대로 실행된다.
--      ab_reservation_pass_pricing  (0037/0043) — 금액 = 이용권 가격 x 인원
--      before_reservation_write     (0002/0019) — 운영시간·정원 검증
--    그런데 뒤에 도는 before_reservation_write가 price_at_booking을 이용권 정가로
--    다시 덮어써서, 0043의 인원 곱셈이 조용히 사라지고 있었다. 2명이 예약하면
--    화면 요약은 2배로 보이는데 실제 저장·청구는 1인분이었다.
--    가격·좌석 결정은 ab_ 트리거 한 곳에만 두고, 여기서는 검증만 한다.
--
-- 2) 운영자가 서비스로 시간을 넣어 줄 때 3시간으로 고정되던 문제.
--    '3시간권은 시작 시간부터 3시간으로 예약해 주세요' 규칙이 관리자에게도 적용돼
--    1시간만 서비스로 넣어 줄 수 없었다. 이 규칙은 손님 예약이 요금과 어긋나지
--    않게 하려는 것이므로 관리자·서비스 롤은 예외로 둔다.


create or replace function public.before_reservation_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled text;
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

  -- 가격·이용권·좌석은 ab_reservation_pass_pricing(0037/0043)이 정한다.
  -- 여기서 다시 덮어쓰면 인원 곱셈이 사라진다(트리거는 이름 순서대로 실행되고
  -- 'ab_' 가 'before_' 보다 먼저이므로, 이 함수가 마지막 값을 남긴다).

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

    -- 이용권 이름에 맞는 이용 시간 강제. 손님 예약이 요금과 어긋나지 않게 하려는
    -- 규칙이라, 운영자가 서비스로 1시간만 넣어 주는 것까지 막을 이유는 없다.
    v_pass_name := coalesce(new.pass_name_snapshot, new.pass_type, '');
    if not (public.is_admin() or auth.role() = 'service_role') then
      if v_pass_name ilike '%3시간%' and v_end_min - v_start_min <> 180 then
        raise exception '3시간권은 시작 시간부터 3시간으로 예약해 주세요.';
      elsif v_pass_name ilike '%추가 1시간%' and v_end_min - v_start_min <> 60 then
        raise exception '추가 1시간은 시작 시간부터 1시간으로 예약해 주세요.';
      end if;
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
