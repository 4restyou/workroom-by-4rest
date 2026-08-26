import { describe, expect, it } from "vitest";
import { pendingPeriodExtensions, accessEndDate, passUsableDays } from "./reservations";

// 일요일(0) 휴무, 월~토(1~6) 영업
const OPEN = [1, 2, 3, 4, 5, 6];

describe("passUsableDays", () => {
  it("주간권은 한 주의 영업일 수만큼(6일)", () => {
    expect(passUsableDays("주간권", OPEN.length)).toBe(6);
  });

  it("월권은 4주치 영업일(24일)", () => {
    expect(passUsableDays("월권 자유석", OPEN.length)).toBe(24);
  });

  it("휴무가 없으면 7일·28일이 된다", () => {
    expect(passUsableDays("주간권", 7)).toBe(7);
    expect(passUsableDays("월권 지정석", 7)).toBe(28);
  });
});

describe("accessEndDate", () => {
  it("월요일에 시작한 주간권은 토요일에 끝난다", () => {
    // 2026-08-03은 월요일
    expect(accessEndDate("2026-08-03", "주간권", OPEN)).toBe("2026-08-08");
  });

  it("종료일은 항상 영업일이다 — 휴무일로 끝나지 않는다", () => {
    // 수요일 시작: 수·목·금·토 + (일 휴무) + 월·화 = 6영업일
    expect(accessEndDate("2026-08-05", "주간권", OPEN)).toBe("2026-08-11");
  });

  it("월요일에 시작한 월권은 4주 뒤 토요일에 끝난다", () => {
    expect(accessEndDate("2026-08-03", "월권 자유석", OPEN)).toBe("2026-08-29");
  });

  it("휴무가 없으면 주간권은 7일 뒤(시작일 포함)", () => {
    expect(accessEndDate("2026-08-03", "주간권", [0, 1, 2, 3, 4, 5, 6])).toBe("2026-08-09");
  });
});

describe("accessEndDate — 특정일 휴무", () => {
  // 월-토 영업(일요일 정기휴무).
  const OPEN_DAYS = [1, 2, 3, 4, 5, 6];

  it("pushes the end date out by each closed day", () => {
    // 8월 3일(월) 시작 주간권은 원래 8월 8일(토)까지. 8월 5일을 쉬면 하루 밀린다.
    expect(accessEndDate("2026-08-03", "주간권", OPEN_DAYS, ["2026-08-05"])).toBe("2026-08-10");
  });

  it("pushes it out three days for three closures", () => {
    const end = accessEndDate("2026-08-03", "주간권", OPEN_DAYS, ["2026-08-04", "2026-08-05", "2026-08-06"]);
    expect(end).toBe("2026-08-12");
  });

  it("ignores closures outside the period", () => {
    expect(accessEndDate("2026-08-03", "주간권", OPEN_DAYS, ["2026-09-01"])).toBe("2026-08-08");
  });

  it("ignores a closure that falls on a day already closed", () => {
    // 일요일은 원래 안 여는 날이라 세지 않았다. 다시 빼도 종료일은 그대로.
    expect(accessEndDate("2026-08-03", "주간권", OPEN_DAYS, ["2026-08-09"])).toBe("2026-08-08");
  });
});

describe("pendingPeriodExtensions", () => {
  const OPEN_DAYS = [1, 2, 3, 4, 5, 6];
  const pass = (overrides: Record<string, unknown> = {}) => ({
    id: "r1",
    name: "김지현",
    status: "confirmed",
    pass_type: "주간권",
    pass_name_snapshot: "주간권",
    access_start_date: "2026-08-03",
    access_end_date: "2026-08-08",
    payment_status: "paid",
    ...overrides,
  });

  it("finds the pass that lost a day", () => {
    expect(pendingPeriodExtensions([pass()], OPEN_DAYS, ["2026-08-05"], "2026-08-04")).toEqual([
      { id: "r1", name: "김지현", passName: "주간권", from: "2026-08-08", to: "2026-08-10" },
    ]);
  });

  it("leaves a finished pass alone", () => {
    // 이미 끝난 이용권의 종료일을 늘리면 안 쓴 날이 되살아난다.
    expect(pendingPeriodExtensions([pass()], OPEN_DAYS, ["2026-08-05"], "2026-09-01")).toEqual([]);
  });

  it("skips anything not confirmed or already refunded", () => {
    expect(pendingPeriodExtensions([pass({ status: "canceled" })], OPEN_DAYS, ["2026-08-05"], "2026-08-04")).toEqual([]);
    expect(pendingPeriodExtensions([pass({ payment_status: "refunded" })], OPEN_DAYS, ["2026-08-05"], "2026-08-04")).toEqual([]);
  });

  it("never shortens a period", () => {
    // 휴무를 취소해도 이미 안내한 종료일은 그대로 둔다.
    const already = pass({ access_end_date: "2026-08-20" });
    expect(pendingPeriodExtensions([already], OPEN_DAYS, ["2026-08-05"], "2026-08-04")).toEqual([]);
  });

  it("says nothing when there are no closures", () => {
    expect(pendingPeriodExtensions([pass()], OPEN_DAYS, [], "2026-08-04")).toEqual([]);
  });
});
