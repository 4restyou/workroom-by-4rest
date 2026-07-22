-- 출근 도장(스탬프)은 하루 1회만 적립.
-- 퇴실 후 재입장하면 입실 기록은 새로 남지만(운영 기록 유지) 도장·쿠폰은
-- 오늘 첫 입실에만 적립된다. 스탬프 수는 '입실한 날짜 수' 기준으로 계산.
-- (0019의 attendance_check_in 재정의 — 검증 로직은 동일)

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
  v_first_today boolean := true;
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
    select count(distinct (check_in_at at time zone 'Asia/Seoul')::date) into v_count
    from public.attendance where profile_id = v_uid;
    return jsonb_build_object('ok', true, 'already', true, 'stamps', v_count, 'message', '이미 입실 처리되었습니다.');
  end if;

  -- 도장은 하루 1회: 오늘 첫 입실인지 먼저 확인 (재입실은 기록만 남긴다)
  select not exists (
    select 1 from public.attendance
    where profile_id = v_uid and (check_in_at at time zone 'Asia/Seoul')::date = v_today
  ) into v_first_today;

  insert into public.attendance (profile_id, reservation_id) values (v_uid, v_res);
  select count(distinct (check_in_at at time zone 'Asia/Seoul')::date) into v_count
  from public.attendance where profile_id = v_uid;
  select coalesce(nullif(value, '')::int, 10) into v_goal from public.space_settings where key = 'attendance_stamp_goal';
  if v_goal is null or v_goal < 1 then v_goal := 10; end if;
  if v_first_today and v_count > 0 and v_count % v_goal = 0 then
    select value into v_reward from public.space_settings where key = 'attendance_reward_label';
    insert into public.coupons (profile_id, label) values (v_uid, coalesce(nullif(v_reward, ''), '보상'));
    v_coupon := true;
  end if;
  if v_first_today then
    return jsonb_build_object('ok', true, 'already', false, 'stamps', v_count, 'goal', v_goal, 'coupon', v_coupon);
  end if;
  return jsonb_build_object('ok', true, 'already', false, 'stamps', v_count, 'goal', v_goal, 'coupon', false,
    'message', '다시 입실 처리했어요. 도장은 하루에 한 번 적립돼요.');
end;
$$;


grant execute on function public.attendance_check_in(text, double precision, double precision) to authenticated;
