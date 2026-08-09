import type { Reservation } from "./types";

export function reservationPassName(reservation: Reservation) {
  return reservation.pass_name_snapshot || reservation.pass_type;
}

export function isLongTermReservation(reservation: Reservation) {
  const name = reservationPassName(reservation);
  return Boolean(reservation.access_start_date && reservation.access_end_date) || name.includes("주간권") || name.includes("월권");
}

export function reservationCoversDate(reservation: Reservation, date: string) {
  if (!isLongTermReservation(reservation)) return reservation.date === date;

  const start = reservation.access_start_date ?? reservation.date;
  const end = reservation.access_end_date ?? reservation.date;
  if (date < start || date > end) return false;

  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (reservation.access_weekdays?.length && !reservation.access_weekdays.includes(weekday)) return false;

  const paused = reservation.access_paused_from && reservation.access_paused_until
    && date >= reservation.access_paused_from
    && date <= reservation.access_paused_until;
  return !paused;
}

export function reservationStartTime(reservation: Reservation, date = reservation.date) {
  return new Date(`${date}T${(reservation.start_time ?? "00:00").slice(0, 5)}:00+09:00`).getTime();
}

export function reservationEndTime(reservation: Reservation, date = reservation.date) {
  const start = (reservation.start_time ?? "00:00").slice(0, 5);
  const end = (reservation.end_time ?? "23:59").slice(0, 5);
  const timestamp = new Date(`${date}T${end}:00+09:00`);
  if (end <= start) timestamp.setDate(timestamp.getDate() + 1);
  return timestamp.getTime();
}

// 이용권 이름으로 장기 이용권 여부·기간(주)을 판정한다. 예약 생성 시 이용 기간을
// 계산하는 데 쓰고, 관리자 화면의 기간 자동 계산과 같은 규칙을 공유한다.
export function isLongTermPassName(name: string) {
  return name.includes("주간") || name.includes("월권") || name.includes("월간");
}

// 장기 이용권 기간은 "영업일 기준"으로 센다.
//
// 일요일 휴무이므로 한 주의 이용 가능일은 6일이다. 주간권은 6일(월 시작이면
// 토요일까지), 월권은 4주치인 24일이 된다. 이렇게 계산하면 종료일이 항상
// 이용할 수 있는 날이 되어, "종료일인데 문이 닫혀 있다"는 혼선이 사라진다.
// 공휴일은 정상 영업이므로 따로 제외하지 않는다.
export function passUsableDays(name: string, openWeekdayCount: number): number {
  const perWeek = openWeekdayCount > 0 ? openWeekdayCount : 7;
  return passPeriodWeeks(name) * perWeek;
}

/** 시작일부터 이용 가능일을 usableDays만큼 채운 마지막 날짜. */
export function accessEndDate(startDate: string, passName: string, openWeekdays: number[]): string {
  if (!startDate) return startDate;
  const open = openWeekdays.length ? openWeekdays : [0, 1, 2, 3, 4, 5, 6];
  const target = passUsableDays(passName, open.length);
  const openSet = new Set(open);

  const cursor = new Date(`${startDate}T00:00:00`);
  let counted = 0;
  let lastOpen = startDate;
  // 무한 루프 방지: 필요한 날의 3배까지만 탐색한다.
  for (let step = 0; step < target * 3 + 7 && counted < target; step += 1) {
    if (openSet.has(cursor.getDay())) {
      counted += 1;
      lastOpen = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return lastOpen;
}

export function passPeriodWeeks(name: string): number {
  const matched = name.match(/(\d+)\s*주/);
  if (matched) return Number(matched[1]);
  if (name.includes("월권") || name.includes("월간")) return 4;
  if (name.includes("주간")) return 1;
  return 4;
}

export function addDaysStr(dateStr: string, days: number): string {
  if (!dateStr) return dateStr;
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Supabase/트리거 오류를 회원이 읽을 수 있는 문구로 바꾼다. 고객 안내용으로
// 작성된 트리거 메시지는 그대로 쓰고, 그 외 DB 원문은 노출하지 않는다.
export function readableReservationError(error: { code?: string; message?: string }) {
  const message = error.message?.trim() ?? "";
  const customerFacing = ["예약", "운영 시간", "휴무일", "좌석", "종료 시간"].some((word) => message.includes(word));
  if (customerFacing) return message;
  if (error.code === "42501") return "로그인 정보가 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.";
  return "처리 중 문제가 생겼습니다. 입력 내용을 확인하거나 잠시 후 다시 시도해 주세요.";
}
