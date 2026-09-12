-- 출입구 비밀번호를 공개 읽기에서 뺀다.
--
-- space_settings 는 anon·authenticated 가 읽을 수 있다(운영시간·안내 문구를
-- 예약 화면이 로그인 없이 보여줘야 하기 때문). 예외 목록에 QR 토큰과 좌표만
-- 있었는데, 거기에 door_code 를 넣어 버렸다. 그 상태로는 로그인조차 하지 않은
-- 사람이 API 한 번으로 문 비밀번호를 읽는다.
--
-- 비밀번호는 관리자만 읽는다. 회원에게 보여 줄 일이 생기면, 전체 설정을 여는
-- 대신 '오늘 이용 권한이 있는가'를 확인하는 함수를 따로 만든다.

drop policy if exists "space_settings_public_read_safe" on public.space_settings;
create policy "space_settings_public_read_safe"
on public.space_settings
for select
to anon, authenticated
using (
  key not in (
    'attendance_qr_token',
    'attendance_lat',
    'attendance_lng',
    'attendance_radius_m',
    'door_code'
  )
  or public.is_admin()
);
