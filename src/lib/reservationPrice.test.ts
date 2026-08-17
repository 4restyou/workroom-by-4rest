import { describe, expect, it } from "vitest";
import { checkReservationPrice, type PricedReservation } from "./reservationPrice";

function reservation(overrides: Partial<PricedReservation> = {}): PricedReservation {
  return {
    price_at_booking: 14000,
    people: 1,
    pass_type: "3시간권",
    pass_name_snapshot: "3시간권",
    ...overrides,
  };
}

describe("checkReservationPrice", () => {
  it("accepts a single-person booking at the list price", () => {
    expect(checkReservationPrice(reservation(), 14000)).toEqual({ expected: 14000, actual: 14000, mismatched: false });
  });

  it("flags a two-person booking still stored at one person's price", () => {
    // 실제로 일어난 사고: 2인 예약인데 14,000원으로 저장돼 결제도 1인분만 될 뻔했다.
    const check = checkReservationPrice(reservation({ people: 2, price_at_booking: 14000 }), 14000);
    expect(check).toEqual({ expected: 28000, actual: 14000, mismatched: true });
  });

  it("accepts a two-person booking priced per head", () => {
    expect(checkReservationPrice(reservation({ people: 2, price_at_booking: 28000 }), 14000)?.mismatched).toBe(false);
  });

  it("treats a missing people count as one person", () => {
    expect(checkReservationPrice(reservation({ people: null }), 14000)?.mismatched).toBe(false);
  });

  it("flags an amount that is too high as well", () => {
    expect(checkReservationPrice(reservation({ price_at_booking: 99000 }), 14000)?.mismatched).toBe(true);
  });

  it("skips the check when the pass price is unknown", () => {
    // 문의 상품이나 목록에서 사라진 이용권 — 대조할 기준이 없으니 막지 않는다.
    expect(checkReservationPrice(reservation(), null)).toBeNull();
    expect(checkReservationPrice(reservation(), undefined)).toBeNull();
    expect(checkReservationPrice(reservation(), 0)).toBeNull();
  });

  it("flags a booking with no stored amount", () => {
    expect(checkReservationPrice(reservation({ price_at_booking: null }), 14000)).toEqual({
      expected: 14000,
      actual: 0,
      mismatched: true,
    });
  });
});
