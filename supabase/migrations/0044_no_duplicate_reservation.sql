-- 같은 사람이 같은 자리를 두 번 신청하지 못하게 막는다.
--
-- 결제 단계에서 오류 화면을 본 손님이 처음부터 다시 신청하면서 같은 예약이 두 건
-- 걸리는 일이 있었다. 한 건은 결제까지 갔고 다른 한 건은 운영자가 손으로 취소했다.
-- 손님은 두 번 잡힌 줄 모르고, 운영자는 좌석이 두 칸 나간 것으로 보인다.
--
-- 화면에서 버튼을 잠그는 것만으로는 막지 못한다. 신청이 서버에는 저장됐는데
-- 응답이 끊겨 손님 화면에만 오류가 보이는 경우가 실제 원인이기 때문이다.
-- 그래서 데이터베이스에서 막는다.
--
-- 취소된 예약은 제외한다(취소 후 같은 시간에 다시 잡는 것은 정상이다).
-- 회원 연결이 없는 수기·워크인 예약도 제외한다(서로 다른 손님이 같은 값을 가질 수 있다).

create unique index if not exists reservations_no_duplicate_active
on public.reservations (profile_id, pass_type, date, start_time)
where profile_id is not null
  and deleted_at is null
  and status in ('pending', 'confirmed');

comment on index public.reservations_no_duplicate_active is
  '같은 회원이 같은 이용권·날짜·시작시간으로 진행 중인 예약을 두 건 만들지 못하게 한다.';
