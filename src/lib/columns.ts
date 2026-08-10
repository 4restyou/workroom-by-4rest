// PostgREST select 컬럼 목록의 단일 출처.
//
// 같은 테이블을 14곳(reservations)·12곳(attendance)에서 각각 조회하면서 어떤
// 곳은 select("*"), 어떤 곳은 손으로 적은 컬럼 목록을 쓰고 있었다. 컬럼이 하나
// 늘어날 때마다 어디를 고쳐야 하는지 알 수 없고, select("*")는 쓰지 않는 큰
// 텍스트 컬럼까지 실어 나른다. 목록을 여기 모아 두고 화면은 이 상수를 쓴다.
//
// 값은 반드시 리터럴 문자열로 둔다 — supabase-js는 select 문자열을 타입 수준에서
// 파싱해 행 타입을 만들기 때문에, 배열 join 등으로 만든 string을 넘기면 추론이
// 깨져 결과가 GenericStringError[]가 된다.

/** 목록·집계용 예약 컬럼. 관리자 메모·요청사항 같은 큰 텍스트는 제외한다. */
export const RESERVATION_LIST_COLUMNS =
  "id,profile_id,name,phone,date,start_time,end_time,people,status,payment_status,payment_preference,price_at_booking,pass_type,pass_name_snapshot,seat_type_id,access_start_date,access_end_date,access_weekdays,access_paused_from,access_paused_until,deleted_at,created_at";

/** 잔여 좌석 계산에 필요한 최소 컬럼. */
export const RESERVATION_AVAILABILITY_COLUMNS = "date,start_time,end_time,people,status";

/** 회원 대시보드의 다음 예약 카드. */
export const RESERVATION_SUMMARY_COLUMNS = "id,pass_name_snapshot,pass_type,date,start_time,end_time,status,people";

/** 출근 기록: 화면은 시각만 쓴다. */
export const ATTENDANCE_COLUMNS = "id,profile_id,reservation_id,check_in_at,check_out_at";

/** 이용권 목록(가격표·예약 화면). */
export const PASS_COLUMNS = "id,name,description,price,min_people,seat_type_id,is_active,sort_order";

/** 회원 목록. */
export const PROFILE_LIST_COLUMNS = "id,full_name,email,phone,address,admin_note,created_at,role";

/** 쿠폰 목록. */
export const COUPON_COLUMNS = "id,profile_id,code,label,status,issued_at,used_at";
