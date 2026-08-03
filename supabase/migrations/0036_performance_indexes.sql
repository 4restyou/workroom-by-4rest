-- 성능: 조회 경로에 맞는 인덱스 추가.
--
-- reservations는 이 서비스에서 가장 많이 읽는 테이블인데 기본키 외 인덱스가
-- 하나도 없어 모든 조회가 순차 스캔이었다. RLS(profile_id = auth.uid())까지
-- 매 행에 적용되므로 행이 늘수록 회원 화면·예약 가능 여부 확인이 함께 느려진다.
--
-- 동시성: 운영 중 테이블 잠금을 피하려고 concurrently를 쓰고 싶지만, 마이그레이션
-- 파일은 트랜잭션으로 실행될 수 있어 여기서는 일반 create index를 쓴다.
-- 데이터가 큰 경우에는 이 파일 대신 아래 문장을 psql에서 concurrently로 실행할 것.

-- 회원 화면: 내 예약을 최신순으로. RLS 조건(profile_id)과 정렬(date)을 함께 태운다.
create index if not exists reservations_profile_date_idx
  on public.reservations (profile_id, date desc);

-- 관리자 목록·통계: 삭제되지 않은 예약을 날짜순으로. 부분 인덱스라 크기가 작다.
create index if not exists reservations_active_date_idx
  on public.reservations (date desc)
  where deleted_at is null;

-- '확인 대기'·상태별 탭과 대시보드 집계.
create index if not exists reservations_status_date_idx
  on public.reservations (status, date desc)
  where deleted_at is null;

-- 잔여 좌석 계산(check_reservation_capacity)과 예약 달력: 좌석 유형 + 날짜 범위.
create index if not exists reservations_seat_date_idx
  on public.reservations (seat_type_id, date)
  where deleted_at is null;

-- 장기 이용권(주간·월권) 기간 조회: 오늘이 이용 기간에 걸치는 예약 찾기.
create index if not exists reservations_access_period_idx
  on public.reservations (access_end_date, access_start_date)
  where access_end_date is not null;

-- 관리자 입퇴실 화면은 프로필 구분 없이 최근 순으로 읽는다
-- (기존 인덱스는 profile_id가 선두라 이 정렬에 쓰이지 못한다).
create index if not exists attendance_check_in_idx
  on public.attendance (check_in_at desc);

-- 예약별 문의·이력 조회.
create index if not exists reservation_inquiries_reservation_idx
  on public.reservation_inquiries (reservation_id, created_at);

-- 회원 검색(이름·연락처)과 회원 목록 정렬.
create index if not exists profiles_role_created_idx
  on public.profiles (role, created_at desc);
