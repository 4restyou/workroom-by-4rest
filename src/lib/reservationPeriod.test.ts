import { describe, expect, it } from "vitest";
import { accessEndDate, passUsableDays } from "./reservations";

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
