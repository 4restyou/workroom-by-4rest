import { describe, expect, it } from "vitest";
import { hoursByWeekdayFrom, hoursForDate, isClosedOn, openWeekdaysFrom, openWeekdaysFromRows } from "./businessHours";
import type { BusinessDateException, BusinessHour } from "./types";

function hour(weekday: number, isClosed = false): BusinessHour {
  return { weekday, open_time: "08:00:00", close_time: "01:00:00", is_closed: isClosed } as BusinessHour;
}

describe("openWeekdays", () => {
  it("휴무 요일을 제외한다", () => {
    const rows = [hour(0, true), hour(1), hour(2), hour(3), hour(4), hour(5), hour(6)];
    expect(openWeekdaysFromRows(rows)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(openWeekdaysFrom(hoursByWeekdayFrom(rows))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("설정이 없으면 전체 요일로 본다", () => {
    expect(openWeekdaysFromRows([])).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("전부 휴무인 비정상 설정에서는 전체 요일로 되돌린다", () => {
    const rows = [0, 1, 2, 3, 4, 5, 6].map((day) => hour(day, true));
    expect(openWeekdaysFromRows(rows)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("hoursForDate", () => {
  // 2026-08-03은 월요일.
  const byWeekday = hoursByWeekdayFrom([hour(1)]);

  it("날짜 예외가 요일 설정을 덮어쓴다", () => {
    const exception = { date: "2026-08-03", open_time: "10:00:00", close_time: "18:00:00", is_closed: false } as BusinessDateException;
    expect(hoursForDate("2026-08-03", byWeekday, { "2026-08-03": exception })).toBe(exception);
  });

  it("예외가 없으면 요일 설정을 쓴다", () => {
    expect(hoursForDate("2026-08-03", byWeekday, {})?.open_time).toBe("08:00:00");
  });

  it("임시 휴무 예외를 휴무로 판정한다", () => {
    const closed = { date: "2026-08-03", open_time: "08:00:00", close_time: "01:00:00", is_closed: true } as BusinessDateException;
    expect(isClosedOn("2026-08-03", byWeekday, { "2026-08-03": closed })).toBe(true);
  });

  it("설정이 아예 없는 날은 휴무로 보지 않는다", () => {
    expect(isClosedOn("2026-08-04", {}, {})).toBe(false);
  });
});
