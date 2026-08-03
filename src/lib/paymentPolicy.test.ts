import { describe, expect, it } from "vitest";
import {
  canCancelReservation,
  canPayOnline,
  canSubscribe,
  isRefundPending,
  type PaymentAvailability,
} from "./paymentPolicy";
import type { Reservation } from "./types";

const ALL_AVAILABLE: PaymentAvailability = {
  paymentEnabled: true,
  hasOneOffChannel: true,
  hasBillingChannel: true,
};

function reservation(overrides: Partial<Reservation> = {}) {
  return {
    id: "r1",
    status: "pending",
    payment_status: "unpaid",
    payment_preference: "online",
    price_at_booking: 14000,
    pass_type: "3시간권",
    pass_name_snapshot: null,
    date: "2026-08-10",
    start_time: "09:00:00",
    ...overrides,
  } as Reservation;
}

describe("canPayOnline", () => {
  it("온라인 결제를 고른 미결제 예약에 결제 버튼을 띄운다", () => {
    expect(canPayOnline(reservation(), ALL_AVAILABLE)).toBe(true);
    expect(canPayOnline(reservation({ status: "confirmed" }), ALL_AVAILABLE)).toBe(true);
  });

  it("이미 정산이 끝난 예약에는 띄우지 않는다", () => {
    for (const paymentStatus of ["paid", "refunded", "service"] as const) {
      expect(canPayOnline(reservation({ payment_status: paymentStatus }), ALL_AVAILABLE)).toBe(false);
    }
  });

  it("현장 결제를 고른 예약에는 띄우지 않는다", () => {
    expect(canPayOnline(reservation({ payment_preference: "onsite" }), ALL_AVAILABLE)).toBe(false);
  });

  it("취소·노쇼·완료된 예약에는 띄우지 않는다", () => {
    for (const status of ["canceled", "no_show", "completed"] as const) {
      expect(canPayOnline(reservation({ status }), ALL_AVAILABLE)).toBe(false);
    }
  });

  it("금액이 0 이하면 띄우지 않는다", () => {
    expect(canPayOnline(reservation({ price_at_booking: 0 }), ALL_AVAILABLE)).toBe(false);
    expect(canPayOnline(reservation({ price_at_booking: null }), ALL_AVAILABLE)).toBe(false);
  });

  it("결제 스위치가 꺼져 있거나 채널 키가 없으면 띄우지 않는다", () => {
    expect(canPayOnline(reservation(), { ...ALL_AVAILABLE, paymentEnabled: false })).toBe(false);
    expect(canPayOnline(reservation(), { ...ALL_AVAILABLE, hasOneOffChannel: false })).toBe(false);
  });
});

describe("canSubscribe", () => {
  it("월권 예약에만 정기결제를 띄운다", () => {
    expect(canSubscribe(reservation({ pass_type: "월권 자유석" }), ALL_AVAILABLE)).toBe(true);
    expect(canSubscribe(reservation({ pass_type: "3시간권" }), ALL_AVAILABLE)).toBe(false);
    expect(canSubscribe(reservation({ pass_type: "주간권" }), ALL_AVAILABLE)).toBe(false);
  });

  it("이용권 이름은 예약 시점 스냅샷을 우선한다", () => {
    // 운영자가 이용권 이름을 바꿔도 지난 예약의 판단이 흔들리면 안 된다.
    const item = reservation({ pass_type: "3시간권", pass_name_snapshot: "월권 지정석" });
    expect(canSubscribe(item, ALL_AVAILABLE)).toBe(true);
  });

  it("정기결제 채널이 없으면 띄우지 않는다", () => {
    const item = reservation({ pass_type: "월권 자유석" });
    expect(canSubscribe(item, { ...ALL_AVAILABLE, hasBillingChannel: false })).toBe(false);
  });

  it("이미 결제된 월권에는 띄우지 않는다", () => {
    const item = reservation({ pass_type: "월권 자유석", payment_status: "paid" });
    expect(canSubscribe(item, ALL_AVAILABLE)).toBe(false);
  });
});

describe("canCancelReservation", () => {
  const item = { date: "2026-08-10", start_time: "09:00:00" };

  it("이용 시작 전에는 취소할 수 있다", () => {
    expect(canCancelReservation(item, Date.parse("2026-08-10T08:59:59+09:00"))).toBe(true);
  });

  it("시작 정각부터는 취소할 수 없다", () => {
    expect(canCancelReservation(item, Date.parse("2026-08-10T09:00:00+09:00"))).toBe(false);
  });

  it("한국 시간 기준으로 판단한다", () => {
    // UTC로 보면 아직 8/9 이지만 KST로는 이미 시작한 시각이다.
    expect(canCancelReservation(item, Date.parse("2026-08-10T00:30:00Z"))).toBe(false);
  });

  it("날짜를 해석할 수 없으면 취소 버튼을 감춘다", () => {
    expect(canCancelReservation({ date: "", start_time: null }, Date.now())).toBe(false);
  });
});

describe("isRefundPending", () => {
  it("취소됐지만 결제완료로 남아 있는 예약만 환불 대기로 본다", () => {
    expect(isRefundPending(reservation({ status: "canceled", payment_status: "paid" }))).toBe(true);
    expect(isRefundPending(reservation({ status: "canceled", payment_status: "refunded" }))).toBe(false);
    expect(isRefundPending(reservation({ status: "confirmed", payment_status: "paid" }))).toBe(false);
  });
});
