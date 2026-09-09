// 정기결제가 매 회차 얼마를 청구하는지. 엣지 함수가 쓰는 모듈을 그대로 검증한다.
import { describe, expect, it } from "vitest";
import { discountedPrice as clientDiscount } from "./discount";
import { discountedPrice, recurringChargeAmount } from "../../supabase/functions/_shared/pricing";

// 월권 자유석: 정가 249,000원. 20% 할인이 10월 31일까지.
const base = {
  baseAmount: 249000,
  unitPrice: 249000,
  people: 1,
  discountPercent: 20,
  discountUntil: "2026-10-31",
};

describe("recurringChargeAmount", () => {
  it("charges the discounted price while the discount is running", () => {
    expect(recurringChargeAmount({ ...base, onDate: "2026-10-05" })).toBe(199200);
    expect(recurringChargeAmount({ ...base, onDate: "2026-10-31" })).toBe(199200);
  });

  it("goes back to the list price the day after it ends", () => {
    expect(recurringChargeAmount({ ...base, onDate: "2026-11-01" })).toBe(249000);
  });

  it("charges the list price when there is no discount", () => {
    expect(recurringChargeAmount({ ...base, discountPercent: 0, discountUntil: null, onDate: "2026-10-05" })).toBe(249000);
  });

  it("ignores a discount with no end date", () => {
    expect(recurringChargeAmount({ ...base, discountUntil: null, onDate: "2026-10-05" })).toBe(249000);
  });

  it("never charges more than the member agreed to", () => {
    // 정가를 299,000으로 올려도 이미 구독 중인 회원은 249,000 그대로.
    expect(recurringChargeAmount({ ...base, unitPrice: 299000, discountPercent: 0, discountUntil: null, onDate: "2026-11-01" })).toBe(249000);
  });

  it("follows a price cut down", () => {
    // 정가를 199,000으로 내리면 그건 따라간다 — 회원에게 유리한 방향.
    expect(recurringChargeAmount({ ...base, unitPrice: 199000, discountPercent: 0, discountUntil: null, onDate: "2026-11-01" })).toBe(199000);
  });

  it("falls back to the agreed amount when the pass is gone", () => {
    // 이용권을 삭제했더라도 청구는 계속돼야 한다.
    expect(recurringChargeAmount({ ...base, unitPrice: null, onDate: "2026-10-05" })).toBe(249000);
  });

  it("counts people", () => {
    expect(recurringChargeAmount({ ...base, baseAmount: 498000, people: 2, onDate: "2026-10-05" })).toBe(398400);
  });
});

describe("할인 계산은 한 규칙", () => {
  it("matches the rule the screens use", () => {
    for (const price of [14000, 25000, 149000, 249000, 299000]) {
      for (const percent of [0, 5, 10, 20, 33]) {
        expect(discountedPrice(price, percent)).toBe(clientDiscount(price, percent));
      }
    }
  });
});
