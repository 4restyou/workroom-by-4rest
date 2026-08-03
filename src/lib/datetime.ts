// KST 날짜·시간 포맷 공용 모듈.
//
// Intl 포매터는 "생성"이 "포맷"보다 50배가량 비싸다(측정: 2만 회 기준 1528ms 대
// 30ms). 기존에는 화면마다 같은 헬퍼를 두고 호출할 때마다 새 포매터를 만들어서,
// 목록 한 번 그릴 때 수백 개의 포매터가 생성되고 버려졌다.
// 여기서 인스턴스를 한 번만 만들어 재사용한다.

const KST = "Asia/Seoul";

const isoDateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: KST });
const dateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const longDateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, hour: "2-digit", minute: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: KST, hour: "2-digit", hourCycle: "h23" });
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: KST, weekday: "short" });
const dayMonthFmt = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, month: "long", day: "numeric", weekday: "short" });
const inputPartsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** KST 기준 YYYY-MM-DD. */
export function kstDate(value: string | Date): string {
  return isoDateFmt.format(typeof value === "string" ? new Date(value) : value);
}

/** 오늘(KST) YYYY-MM-DD. */
export function kstToday(): string {
  return isoDateFmt.format(new Date());
}

/** "8월 3일 14:20" */
export function kstDateTime(value: string | Date): string {
  return dateTimeFmt.format(typeof value === "string" ? new Date(value) : value);
}

/** "8월 3일 오후 02:20" 형태(월 이름을 길게). */
export function kstLongDateTime(value: string | Date): string {
  return longDateTimeFmt.format(typeof value === "string" ? new Date(value) : value);
}

/** "14:20" */
export function kstTime(value: string | Date): string {
  return timeFmt.format(typeof value === "string" ? new Date(value) : value);
}

/** KST 기준 0–23 시. */
export function kstHour(value: string | Date): number {
  return Number(hourFmt.format(typeof value === "string" ? new Date(value) : value));
}

/** KST 기준 요일 인덱스(일=0). 알 수 없으면 -1. */
export function kstWeekdayIndex(value: string | Date): number {
  return WEEKDAYS.indexOf(weekdayFmt.format(typeof value === "string" ? new Date(value) : value));
}

/** "8월 3일 (월)" */
export function kstDayLabel(value: string | Date): string {
  return dayMonthFmt.format(typeof value === "string" ? new Date(value) : value);
}

/** datetime-local 입력값(KST) "YYYY-MM-DDTHH:mm". */
export function toKstInputValue(value: string | Date): string {
  const parts = inputPartsFmt.formatToParts(typeof value === "string" ? new Date(value) : value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** datetime-local(KST) 문자열 → ISO. */
export function fromKstInputValue(value: string): string {
  return new Date(`${value}:00+09:00`).toISOString();
}
