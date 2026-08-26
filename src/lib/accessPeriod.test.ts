// 프론트엔드와 엣지 함수가 같은 기간을 내놓는지 대조한다.
// 두 구현이 갈리면 회원이 예약 화면에서 본 종료일과 자동청구가 잡아 주는
// 종료일이 달라진다 — 돈을 받고 나서 기간이 줄어드는 셈이다.
import { describe, expect, it } from "vitest";
import { accessEndDate as clientEndDate } from "./reservations";
import { accessEndDate as serverEndDate, passUsableDays } from "../../supabase/functions/_shared/accessPeriod";

const OPEN_DAYS = [1, 2, 3, 4, 5, 6];

describe("월권 = 4주 · 영업일 24일", () => {
  it("counts 24 usable days a month, 6 a week", () => {
    expect(passUsableDays("월권 자유석", OPEN_DAYS.length)).toBe(24);
    expect(passUsableDays("주간권", OPEN_DAYS.length)).toBe(6);
  });

  it("agrees with the booking screen", () => {
    const cases: Array<[string, string, string[]]> = [
      ["2026-08-03", "월권 자유석", []],
      ["2026-08-03", "월권 자유석", ["2026-08-05", "2026-08-12", "2026-08-19"]],
      ["2026-08-05", "주간권", ["2026-08-06"]],
      ["2026-09-01", "월권 지정석", ["2026-09-07"]],
    ];
    for (const [start, pass, closed] of cases) {
      expect(serverEndDate(start, pass, OPEN_DAYS, closed)).toBe(clientEndDate(start, pass, OPEN_DAYS, closed));
    }
  });

  it("pushes the end date out one day per closure", () => {
    const plain = serverEndDate("2026-08-03", "월권 자유석", OPEN_DAYS);
    const withClosures = serverEndDate("2026-08-03", "월권 자유석", OPEN_DAYS, ["2026-08-05", "2026-08-12", "2026-08-19"]);
    expect(withClosures > plain).toBe(true);
  });
});
