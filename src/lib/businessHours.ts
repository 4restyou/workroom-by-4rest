import type { BusinessDateException, BusinessHour } from "./types";

// 운영시간·휴무 판정의 단일 출처.
//
// 같은 규칙이 예약 화면과 관리자 예약 화면에 각각 복사돼 있었다. 휴무 정책이
// 바뀔 때 한쪽만 고쳐지면 회원 달력과 장기 이용권 기본 요일이 서로 다른 답을
// 내놓게 되므로, 판정을 여기로 모은다.

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export type HoursByWeekday = Record<number, BusinessHour | undefined>;

/** 휴무가 아닌 요일. 전부 휴무로 설정된 비정상 상태에서는 전체 요일로 되돌린다. */
export function openWeekdaysFrom(hoursByWeekday: HoursByWeekday): number[] {
  const open = ALL_WEEKDAYS.filter((day) => !hoursByWeekday[day]?.is_closed);
  return open.length ? open : ALL_WEEKDAYS;
}

/** business_hours 행 목록에서 바로 영업 요일을 구한다(관리자 화면처럼 맵이 없을 때). */
export function openWeekdaysFromRows(rows: Pick<BusinessHour, "weekday" | "is_closed">[]): number[] {
  const closed = new Set(rows.filter((row) => row.is_closed).map((row) => row.weekday));
  const open = ALL_WEEKDAYS.filter((day) => !closed.has(day));
  return open.length ? open : ALL_WEEKDAYS;
}

/** weekday를 키로 하는 조회용 맵. */
export function hoursByWeekdayFrom(rows: BusinessHour[]): HoursByWeekday {
  return Object.fromEntries(rows.map((row) => [row.weekday, row]));
}

/**
 * 해당 날짜에 적용되는 운영시간. 날짜 예외(임시 휴무·단축 운영)가 요일 설정을
 * 덮어쓴다 — 예외가 있으면 그 값이 곧 그날의 운영시간이다.
 */
export function hoursForDate(
  date: string,
  hoursByWeekday: HoursByWeekday,
  exceptions: Record<string, BusinessDateException | undefined>,
): BusinessHour | BusinessDateException | undefined {
  if (!date) return undefined;
  const exception = exceptions[date];
  if (exception) return exception;
  return hoursByWeekday[new Date(`${date}T00:00:00`).getDay()];
}

/** 그날 영업하지 않는지. */
export function isClosedOn(
  date: string,
  hoursByWeekday: HoursByWeekday,
  exceptions: Record<string, BusinessDateException | undefined>,
): boolean {
  return hoursForDate(date, hoursByWeekday, exceptions)?.is_closed ?? false;
}
