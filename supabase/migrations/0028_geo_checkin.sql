-- 위치 기반 자동 출근(입실): QR 토큰 없이 현재 위치만으로 체크인.
-- 매장 좌표(attendance_lat/lng)가 설정된 경우에만 동작하며, 검증(오늘 예약·
-- 이용 시간창·지오펜스 거리·중복 방지·스탬프/쿠폰)은 기존
-- attendance_check_in을 내부 호출해 전부 재사용한다.
-- 위치 좌표는 확인에만 쓰고 저장하지 않는다(기존 정책 동일).

create or replace function public.attendance_check_in_geo(
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_lat text;
  v_lng text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH', 'message', '로그인이 필요합니다.');
  end if;

  -- 위치 기반 출근은 매장 좌표가 설정돼 있어야만 허용 (물리적 방문 증빙)
  select value into v_lat from public.space_settings where key = 'attendance_lat';
  select value into v_lng from public.space_settings where key = 'attendance_lng';
  if v_lat is null or v_lat = '' or v_lng is null or v_lng = '' then
    return jsonb_build_object('ok', false, 'code', 'GEO_DISABLED', 'message', '위치 기반 출근이 아직 설정되지 않았습니다.');
  end if;
  if p_lat is null or p_lng is null then
    return jsonb_build_object('ok', false, 'code', 'LOCATION', 'message', '위치 확인이 필요해요. 위치 권한을 허용해 주세요.');
  end if;

  select value into v_token from public.space_settings where key = 'attendance_qr_token';
  if v_token is null or v_token = '' then
    return jsonb_build_object('ok', false, 'code', 'TOKEN', 'message', '출근 설정이 아직 준비되지 않았습니다.');
  end if;

  -- 거리·예약·시간창·중복·스탬프 로직은 기존 함수가 검증한다.
  return public.attendance_check_in(v_token, p_lat, p_lng);
end;
$$;

grant execute on function public.attendance_check_in_geo(double precision, double precision) to authenticated;
