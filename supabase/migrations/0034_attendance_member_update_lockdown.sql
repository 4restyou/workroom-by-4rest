-- 출근 기록(attendance) 회원 수정 범위 축소.
--
-- 0007에서 회원에게 attendance 테이블 전체 UPDATE 권한을 준 탓에, 회원이 자신의
-- check_in_at을 과거 날짜로 바꿔치기해 "오늘 출근 없음" 상태를 만든 뒤 출근 RPC를
-- 다시 호출하는 식으로 스탬프(서로 다른 출근 날짜 수)를 무한히 늘려 보상 쿠폰을
-- 반복 발급받을 수 있었다. reservation_id도 바꿀 수 있어 남의 예약에 종료 알림이
-- 발송되게 만들 수도 있었다.
--
-- 회원 화면이 실제로 쓰는 건 '지난 방문 퇴근 시각 입력'뿐이므로 회원은
-- check_out_at만, 그것도 아직 비어 있을 때만 채울 수 있게 한다.
-- 관리자는 기존처럼 시간 정정이 가능해야 하므로(같은 authenticated 롤이라 컬럼
-- 권한으로는 구분 불가) 트리거로 구분한다.

revoke update on public.attendance from authenticated;
grant update (check_in_at, check_out_at, reservation_id) on public.attendance to authenticated;

create or replace function public.guard_attendance_member_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 관리자는 시간 정정·기록 수정을 그대로 할 수 있다.
  if public.is_admin() then
    return new;
  end if;

  -- 회원은 소유자·입실시각·연결 예약을 바꿀 수 없다.
  new.profile_id := old.profile_id;
  new.reservation_id := old.reservation_id;
  new.check_in_at := old.check_in_at;

  -- 이미 퇴근이 기록된 건 회원이 다시 바꿀 수 없다.
  if old.check_out_at is not null and new.check_out_at is distinct from old.check_out_at then
    raise exception '이미 퇴근이 기록된 출근입니다.';
  end if;

  -- 퇴근 시각은 출근 이후여야 한다.
  if new.check_out_at is not null and new.check_out_at <= old.check_in_at then
    raise exception '퇴근 시각은 출근 시각보다 늦어야 합니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_attendance_member_update on public.attendance;
create trigger guard_attendance_member_update
  before update on public.attendance
  for each row execute function public.guard_attendance_member_update();
