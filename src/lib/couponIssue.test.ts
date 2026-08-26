import { describe, expect, it } from "vitest";
import { couponScopeOf, describeCoupon, normalizeCouponPercent } from "./couponIssue";

describe("normalizeCouponPercent", () => {
  it("keeps a sensible rate", () => {
    expect(normalizeCouponPercent(10)).toBe(10);
    expect(normalizeCouponPercent("25")).toBe(25);
  });

  it("never issues more than 90%", () => {
    // 손이 미끄러져 100을 넣어도 공짜 쿠폰이 나가지 않는다.
    expect(normalizeCouponPercent(100)).toBe(90);
    expect(normalizeCouponPercent(-5)).toBe(0);
  });

  it("treats junk as no discount", () => {
    expect(normalizeCouponPercent("")).toBe(0);
    expect(normalizeCouponPercent("이십")).toBe(0);
    expect(normalizeCouponPercent(null)).toBe(0);
  });

  it("rounds a typed decimal", () => {
    expect(normalizeCouponPercent("12.6")).toBe(13);
  });
});

describe("couponScopeOf", () => {
  it("defaults to the monthly pass", () => {
    // 범위를 잘못 넓히면 3시간권까지 깎인다. 모르면 좁은 쪽.
    expect(couponScopeOf(undefined)).toBe("month");
    expect(couponScopeOf("아무거나")).toBe("month");
  });

  it("reads the value the coupon stores", () => {
    expect(couponScopeOf("time")).toBe("time");
    expect(couponScopeOf("any")).toBe("any");
    // 0048에서 쓰던 예전 값도 그대로 읽힌다.
    expect(couponScopeOf("month_pass")).toBe("month");
  });
});

describe("describeCoupon", () => {
  it("says what the member gets", () => {
    expect(describeCoupon(10, "month")).toBe("월권 10% 할인");
    expect(describeCoupon(20, "time")).toBe("시간권 20% 할인");
    expect(describeCoupon(15, "any")).toBe("전 이용권 15% 할인");
    expect(describeCoupon(0, "any")).toBe("결제 할인이 없는 현물 쿠폰");
  });
});
