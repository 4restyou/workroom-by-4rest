import { describe, expect, it } from "vitest";
import { groupLogsByReservation, reservationMoney, sumRevenue, type RevenueLog, type RevenueReservation } from "./revenue";

function reservation(overrides: Partial<RevenueReservation> = {}): RevenueReservation {
  return {
    id: "r1",
    payment_status: "paid",
    price_at_booking: 229000,
    pass_name_snapshot: "월권 자유석",
    pass_type: "월권 자유석",
    ...overrides,
  };
}

const log = (action: RevenueLog["action"], amount: number, id = "r1"): RevenueLog => ({
  reservation_id: id,
  action,
  amount,
});

describe("reservationMoney", () => {
  it("subtracts a partial refund even though the reservation is still 'paid'", () => {
    // 부분 환불은 결제가 남아 있어 payment_status가 paid로 유지된다.
    // 예전 계산은 여기서 229,000원을 그대로 매출로 잡았다.
    const money = reservationMoney(reservation(), [log("confirm", 229000), log("refund", 150000)]);
    expect(money).toEqual({ charged: 229000, refunded: 150000, net: 79000 });
  });

  it("nets a fully refunded booking to zero", () => {
    const money = reservationMoney(reservation({ payment_status: "refunded" }), [
      log("confirm", 229000),
      log("refund", 229000),
    ]);
    expect(money.net).toBe(0);
    expect(money.refunded).toBe(229000);
  });

  it("adds up recurring charges across cycles", () => {
    const money = reservationMoney(reservation(), [
      log("subscribe", 229000),
      log("recurring", 229000),
      log("recurring", 229000),
    ]);
    expect(money.charged).toBe(687000);
    expect(money.net).toBe(687000);
  });

  it("falls back to the booked price for on-site payments with no ledger entry", () => {
    const money = reservationMoney(reservation({ price_at_booking: 40000 }), []);
    expect(money).toEqual({ charged: 40000, refunded: 0, net: 40000 });
  });

  it("treats a status-only refund as a full refund when nothing is in the ledger", () => {
    const money = reservationMoney(reservation({ payment_status: "refunded", price_at_booking: 40000 }), []);
    expect(money).toEqual({ charged: 40000, refunded: 40000, net: 0 });
  });

  it("uses the current pass price when the booking never stored one", () => {
    const money = reservationMoney(
      reservation({ price_at_booking: null }),
      [],
      new Map([["월권 자유석", 229000]]),
    );
    expect(money.charged).toBe(229000);
  });

  it("counts an unpaid booking as nothing", () => {
    const money = reservationMoney(reservation({ payment_status: "unpaid" }), []);
    expect(money).toEqual({ charged: 0, refunded: 0, net: 0 });
  });

  it("ignores zero and negative ledger amounts", () => {
    const money = reservationMoney(reservation(), [log("confirm", 229000), log("refund", 0), log("refund", -5)]);
    expect(money.refunded).toBe(0);
  });
});

describe("sumRevenue", () => {
  it("reports revenue net of refunds and the refunded total separately", () => {
    const reservations = [
      reservation({ id: "a" }),
      reservation({ id: "b", price_at_booking: 40000 }),
      reservation({ id: "c", payment_status: "unpaid" }),
    ];
    const logs = groupLogsByReservation([
      log("confirm", 229000, "a"),
      log("refund", 150000, "a"),
      log("confirm", 40000, "b"),
    ]);
    expect(sumRevenue(reservations, logs)).toEqual({ revenue: 119000, charged: 269000, refunded: 150000 });
  });

  it("leaves free (service) bookings out of revenue and refunds", () => {
    const reservations = [reservation({ id: "s", payment_status: "service" })];
    expect(sumRevenue(reservations, new Map())).toEqual({ revenue: 0, charged: 0, refunded: 0 });
  });
});
