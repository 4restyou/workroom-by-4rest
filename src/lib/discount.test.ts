import { describe, expect, it } from "vitest";
import { activeDiscount, bookingDiscountNote, discountLabel, discountedPrice } from "./discount";

describe("discountedPrice", () => {
  it("matches the server rule: floor to 10원", () => {
    // 서버(migration 0047)와 결과가 다르면 화면 금액과 승인 금액이 갈린다.
    expect(discountedPrice(14000, 20)).toBe(11200);
    expect(discountedPrice(5000, 15)).toBe(4250);
    expect(discountedPrice(3333, 10)).toBe(2990); // 2999.7 → 10원 단위 내림
  });

  it("returns the list price when there is no discount", () => {
    expect(discountedPrice(14000, 0)).toBe(14000);
    expect(discountedPrice(14000, -5)).toBe(14000);
  });

  it("never gives more than 90% off", () => {
    // 실수로 100을 넣어도 공짜가 되지는 않는다.
    expect(discountedPrice(10000, 100)).toBe(1000);
  });

  it("rounds toward the customer, but never by more than 9원", () => {
    // 내림이므로 항상 손님에게 유리한 쪽이다. 그 폭이 10원을 넘지 않아야
    // 정가 대비 얼마가 빠지는지 설명할 수 있다.
    for (const price of [3300, 5000, 14000, 25000, 99900, 300000]) {
      for (const percent of [5, 7, 13, 20, 33, 50]) {
        const exact = (price * (100 - percent)) / 100;
        const value = discountedPrice(price, percent);
        expect(value).toBeLessThanOrEqual(exact);
        expect(exact - value).toBeLessThan(10);
      }
    }
  });
});

describe("activeDiscount", () => {
  const pass = { price: 14000, discount_percent: 20, discount_until: "2026-08-31" };

  it("applies through the last day", () => {
    expect(activeDiscount(pass, "2026-08-31")).toEqual({ percent: 20, until: "2026-08-31", price: 11200, listPrice: 14000 });
  });

  it("stops by itself the day after", () => {
    // 운영자가 지우는 걸 잊어도 정가로 돌아간다.
    expect(activeDiscount(pass, "2026-09-01")).toBeNull();
  });

  it("ignores a discount with no end date", () => {
    expect(activeDiscount({ price: 14000, discount_percent: 20, discount_until: null }, "2026-08-18")).toBeNull();
  });

  it("ignores a zero or missing rate", () => {
    expect(activeDiscount({ price: 14000, discount_percent: 0, discount_until: "2026-08-31" }, "2026-08-18")).toBeNull();
    expect(activeDiscount({ price: 14000 }, "2026-08-18")).toBeNull();
  });

  it("puts no badge on a free pass", () => {
    // 0원짜리는 깎을 게 없다. 아무것도 안 깎이는 '할인' 배지는 달지 않는다.
    expect(activeDiscount({ price: 0, discount_percent: 20, discount_until: "2026-12-31" }, "2026-08-18")).toBeNull();
  });
});

describe("labels", () => {
  it("says how much and until when", () => {
    expect(discountLabel({ percent: 20, until: "2026-08-31", price: 11200, listPrice: 14000 })).toBe("20% 할인 · 8월 31일까지");
  });

  it("tells a member what the discount took off their booking", () => {
    expect(
      bookingDiscountNote({ price_at_booking: 22400, list_price_at_booking: 28000, discount_percent_at_booking: 20 }),
    ).toBe("정가 28,000원 · 20% 할인 (5,600원 절약)");
  });

  it("counts a coupon the same way", () => {
    // 이용권 할인은 없고 쿠폰만 쓴 월권 예약.
    expect(
      bookingDiscountNote({ price_at_booking: 224100, list_price_at_booking: 249000, coupon_percent_at_booking: 10 }),
    ).toBe("정가 249,000원 · 10% 할인 (24,900원 절약)");
  });

  it("stays quiet on a booking that had no discount", () => {
    expect(bookingDiscountNote({ price_at_booking: 28000, list_price_at_booking: 28000 })).toBeNull();
    // migration 0047 이전 예약 — 할인 기록 자체가 없다.
    expect(bookingDiscountNote({ price_at_booking: 28000 })).toBeNull();
  });
});
