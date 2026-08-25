import { describe, expect, it } from "vitest";
import { couponAppliesToPass, couponQuote, usableCoupons, type RedeemableCoupon } from "./coupon";

const coupon = (overrides: Partial<RedeemableCoupon> = {}): RedeemableCoupon => ({
  id: "c1",
  code: "ABCD1234",
  label: "월권 10% 할인",
  status: "issued",
  discount_percent: 10,
  applies_to: "month_pass",
  ...overrides,
});

describe("couponAppliesToPass", () => {
  it("works on either monthly pass", () => {
    expect(couponAppliesToPass(coupon(), "월권 자유석")).toBe(true);
    expect(couponAppliesToPass(coupon(), "월권 지정석")).toBe(true);
  });

  it("does not work on the time passes", () => {
    // 월권 전용 쿠폰이라 3시간권에 쓰면 서버가 거절한다. 보여주지도 않는다.
    expect(couponAppliesToPass(coupon(), "3시간권")).toBe(false);
    expect(couponAppliesToPass(coupon(), "주간권")).toBe(false);
  });

  it("ignores a coupon already used", () => {
    expect(couponAppliesToPass(coupon({ status: "used" }), "월권 자유석")).toBe(false);
  });

  it("ignores a coupon with no discount", () => {
    // 커피 한 잔 같은 현물 쿠폰 — 결제에 붙일 게 없다.
    expect(couponAppliesToPass(coupon({ discount_percent: 0 }), "월권 자유석")).toBe(false);
    expect(couponAppliesToPass(coupon({ discount_percent: null }), "월권 자유석")).toBe(false);
  });

  it("lets an any-pass coupon work anywhere", () => {
    expect(couponAppliesToPass(coupon({ applies_to: "any" }), "3시간권")).toBe(true);
  });
});

describe("usableCoupons", () => {
  it("keeps only what can be used, biggest discount first", () => {
    const list = usableCoupons(
      [coupon({ id: "a", discount_percent: 10 }), coupon({ id: "b", status: "used" }), coupon({ id: "c", discount_percent: 20 })],
      "월권 자유석",
    );
    expect(list.map((item) => item.id)).toEqual(["c", "a"]);
  });
});

describe("couponQuote", () => {
  it("takes 10% off the monthly pass", () => {
    expect(couponQuote(249000, 1, 0, 10)).toEqual({ before: 249000, after: 224100, saved: 24900 });
  });

  it("keeps the bigger discount when a promotion is already running", () => {
    // 이용권 할인 20% > 쿠폰 10% — 쿠폰을 써도 금액이 안 바뀐다.
    expect(couponQuote(249000, 1, 20, 10)).toEqual({ before: 199200, after: 199200, saved: 0 });
  });

  it("uses the coupon when it beats the running promotion", () => {
    const quote = couponQuote(249000, 1, 5, 10);
    expect(quote.before).toBe(236550);
    expect(quote.after).toBe(224100);
    expect(quote.saved).toBe(12450);
  });

  it("counts every person", () => {
    expect(couponQuote(249000, 2, 0, 10).after).toBe(448200);
  });
});
