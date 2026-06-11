-- 출근부 강화: 이용 시간대에만 출근 + (선택) 현재 위치 반경 검증.
-- 위치는 검증에만 쓰고 저장하지 않음(위치정보 보관 회피).

-- 1) 매장 좌표/반경 설정 (비워두면 위치 게이트 OFF)
insert into public.space_settings (key, value) values
  ('attendance_lat', ''),
  ('attendance_lng', ''),
  ('attendance_radius_m', '150')
on conflict (key) do nothing;

-- 2) 체크인 RPC 교체: 시간대 + 위치(선택) 검증 추가
drop function if exists public.attendance_check_in(text);

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
  v_existing uuid;
  v_count int;
  v_coupon boolean := false;
  v_has_res boolean;
  v_lat text;
  v_lng text;
  v_radius text;
  v_dist double precision;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH', 'message', '로그인이 필요합니다.');
  end if;

  select value into v_token from public.space_settings where key = 'attendance_qr_token';
  if v_token is null or p_token is distinct from v_token then
    return jsonb_build_object('ok', false, 'code', 'TOKEN', 'message', '유효하지 않은 QR입니다.');
  end if;

  select exists (
    select 1 from public.reservations
    where profile_id = v_uid and status = 'confirmed' and date = v_today
  ) into v_has_res;
  if not v_has_res then
    return jsonb_build_object('ok', false, 'code', 'NO_RESERVATION', 'message', '오늘 확정된 예약이 없어요.');
  end if;

  -- 이용 시간대 (시작 30분 전 ~ 종료) 안의 예약 찾기
  select id into v_res
  from public.reservations
  where profile_id = v_uid and status = 'confirmed' and date = v_today
    and v_now >= ((date + coalesce(start_time, time '00:00')) at time zone 'Asia/Seoul') - interval '30 min'
    and v_now <= ((date + coalesce(end_time, time '23:59')) at time zone 'Asia/Seoul')
  order by start_time nulls last
  limit 1;
  if v_res is null then
    return jsonb_build_object('ok', false, 'code', 'TIME', 'message', '지금은 이용 시간이 아니에요.');
  end if;

  -- 위치 게이트(매장 좌표가 설정된 경우에만). 좌표는 저장하지 않음.
  select value into v_lat from public.space_settings where key = 'attendance_lat';
  select value into v_lng from public.space_settings where key = 'attendance_lng';
  select value into v_radius from public.space_settings where key = 'attendance_radius_m';
  if v_lat is not null and v_lat <> '' and v_lng is not null and v_lng <> '' then
    if p_lat is null or p_lng is null then
      return jsonb_build_object('ok', false, 'code', 'LOCATION', 'message', '위치 확인이 필요해요. 위치 권한을 허용해 주세요.');
    end if;
    v_dist := 6371000 * acos(least(1, greatest(-1,
      sin(radians(p_lat)) * sin(radians(v_lat::double precision)) +
      cos(radians(p_lat)) * cos(radians(v_lat::double precision)) * cos(radians(v_lng::double precision - p_lng))
    )));
    if v_dist > coalesce(nullif(v_radius, '')::double precision, 150) then
      return jsonb_build_object('ok', false, 'code', 'LOCATION', 'message', '매장 근처에서만 출근할 수 있어요.');
    end if;
  end if;

  select id into v_existing
  from public.attendance
  where profile_id = v_uid and (check_in_at at time zone 'Asia/Seoul')::date = v_today
  limit 1;
  if v_existing is not null then
    select count(*) into v_count from public.attendance where profile_id = v_uid;
    return jsonb_build_object('ok', true, 'already', true, 'stamps', v_count, 'message', '오늘은 이미 출근했어요.');
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

-- 3) 퇴근 RPC: 같은 날 이용 시간 종료 2시간 이내까지만
create or replace function public.attendance_check_out()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_id uuid;
  v_date date;
  v_end time;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'message', '로그인이 필요합니다.');
  end if;

  select a.id, r.date, r.end_time into v_id, v_date, v_end
  from public.attendance a
  left join public.reservations r on r.id = a.reservation_id
  where a.profile_id = v_uid
    and a.check_out_at is null
    and (a.check_in_at at time zone 'Asia/Seoul')::date = v_today
  order by a.check_in_at desc
  limit 1;

  if v_id is null then
    return jsonb_build_object('ok', false, 'message', '출근 기록이 없거나 이미 퇴근했어요.');
  end if;

  update public.attendance set check_out_at = now() where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.attendance_check_out() to authenticated;
