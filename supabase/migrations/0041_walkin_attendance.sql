-- 예약 없이 온 손님(워크인)을 기록할 수 있게 한다.
--
-- 지금까지 워크인을 처리하려면 (1) 예약 화면에서 수기 예약을 만들고 (2) 입퇴실
-- 화면으로 옮겨 다시 찾아 도장을 찍어야 했다. 카운터에 손님을 세워 두고 화면을
-- 두 번 오가야 했고, 회원이 아닌 손님은 아예 기록할 방법이 없었다
-- (attendance.profile_id가 NOT NULL이라 출석 행을 만들 수 없었다).
--
-- 그 결과 비회원 워크인은 매출에도, '현재 이용' 인원에도 잡히지 않았다.
--
-- 여기서는 출석에 회원 연결을 선택으로 바꿔 비회원 입실도 남길 수 있게 한다.
-- 도장·쿠폰은 회원 단위라 비회원 행은 스탬프를 쌓지 않는다(의도된 동작).

alter table public.attendance alter column profile_id drop not null;

comment on column public.attendance.profile_id is
  '회원 연결. 예약 없이 방문한 비회원 워크인은 null이며, 이 경우 스탬프·쿠폰은 쌓이지 않는다.';

-- 조회 정책은 그대로 둔다: profile_id가 null이면 `profile_id = auth.uid()`가
-- 참이 되지 않으므로 비회원 워크인 기록은 관리자만 볼 수 있다.
