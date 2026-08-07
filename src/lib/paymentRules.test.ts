// 서버(엣지 함수)가 실제로 쓰는 결제·취소 판정 규칙 테스트.
// 대상 모듈은 supabase/functions/_shared/paymentRules.ts 로, Deno 런타임과
// 여기서 같은 파일을 import 한다 — 배포되는 로직 그대로를 검증한다.
import { describe, expect, it } from "vitest";
import {
  decideCancellation,
  decidePaymentConfirmation,
  isPaymentId,
  isUuid,
  reservationStartMs,
  prorateRefund,
  type CancelInput,
  type ConfirmInput,
} from "../../supabase/functions/_shared/paymentRules";

function confirmInput(overrides: Partial<ConfirmInput> = {}): ConfirmInput {
  return {
    reservationStatus: "pending",
    reservationPaymentStatus: "unpaid",
    priceAtBooking: 14000,
    providerStatus: "PAID",
    providerCurrency: "KRW",
    providerAmount: 14000,
    ...overrides,
  };
}

describe("decidePaymentConfirmation", () => {
  it("금액과 통화가 맞으면 결제완료로 반영하고 예약을 자동 확정한다", () => {
    expect(decidePaymentConfirmation(confirmInput())).toEqual({ kind: "apply", autoConfirm: true });
  });

  it("확정된 예약에 결제가 들어와도 그대로 반영한다", () => {
    expect(decidePaymentConfirmation(confirmInput({ reservationStatus: "confirmed" }))).toEqual({
      kind: "apply",
      autoConfirm: true,
    });
  });

  it("취소·노쇼된 예약은 결제를 반영하되 자동 확정하지 않는다", () => {
    // 운영자가 판단해야 하는 상황이라 상태를 되살리지 않는다.
    for (const status of ["canceled", "no_show", "completed"]) {
      expect(decidePaymentConfirmation(confirmInput({ reservationStatus: status }))).toEqual({
        kind: "apply",
        autoConfirm: false,
      });
    }
  });

  it("결제 금액이 예약 금액보다 적으면 거절한다 (금액 위조 방어)", () => {
    const decision = decidePaymentConfirmation(confirmInput({ providerAmount: 100 }));
    expect(decision).toMatchObject({ kind: "reject", code: "AMOUNT_MISMATCH" });
  });

  it("결제 금액이 더 많아도 거절한다 (부분·초과 결제 불허)", () => {
    expect(decidePaymentConfirmation(confirmInput({ providerAmount: 20000 }))).toMatchObject({
      kind: "reject",
      code: "AMOUNT_MISMATCH",
    });
  });

  it("원화가 아니면 거절한다", () => {
    expect(decidePaymentConfirmation(confirmInput({ providerCurrency: "USD" }))).toMatchObject({
      kind: "reject",
      code: "AMOUNT_MISMATCH",
    });
  });

  it("예약 금액이 비어 있으면 0원 결제도 거절한다", () => {
    // Number(null) === 0 이라 대조만으로는 통과해 버린다. 양수 검사가 필요하다.
    expect(decidePaymentConfirmation(confirmInput({ priceAtBooking: null, providerAmount: 0 }))).toMatchObject({
      kind: "reject",
      code: "AMOUNT_MISMATCH",
    });
  });

  it("예약 금액이 0이면 거절한다", () => {
    expect(decidePaymentConfirmation(confirmInput({ priceAtBooking: 0, providerAmount: 0 }))).toMatchObject({
      kind: "reject",
      code: "AMOUNT_MISMATCH",
    });
  });

  it("PG 결제가 완료 상태가 아니면 거절한다", () => {
    for (const status of ["READY", "FAILED", "CANCELLED", undefined]) {
      expect(decidePaymentConfirmation(confirmInput({ providerStatus: status }))).toMatchObject({ kind: "reject" });
    }
  });

  it("이미 결제된 대기 예약은 예약만 확정한다 (중복 청구 없음)", () => {
    const decision = decidePaymentConfirmation(
      confirmInput({ reservationPaymentStatus: "paid", reservationStatus: "pending" }),
    );
    expect(decision).toEqual({ kind: "confirm_only", code: "PAID_RESERVATION_CONFIRMED" });
  });

  it("이미 결제·확정된 예약은 아무 것도 하지 않는다", () => {
    expect(
      decidePaymentConfirmation(confirmInput({ reservationPaymentStatus: "paid", reservationStatus: "confirmed" })),
    ).toEqual({ kind: "noop", code: "ALREADY_PAID" });
  });

  it("이미 결제된 예약이면 금액이 달라도 재청구를 시도하지 않는다", () => {
    // 결제 상태 확인이 금액 대조보다 앞선다 — 웹훅이 여러 번 와도 안전하다.
    const decision = decidePaymentConfirmation(
      confirmInput({ reservationPaymentStatus: "paid", reservationStatus: "confirmed", providerAmount: 1 }),
    );
    expect(decision.kind).toBe("noop");
  });
});

function cancelInput(overrides: Partial<CancelInput> = {}): CancelInput {
  return {
    ownerId: "11111111-1111-4111-8111-111111111111",
    callerId: "11111111-1111-4111-8111-111111111111",
    status: "confirmed",
    paymentStatus: "paid",
    paymentKey: "wr-abcd1234-1700000000000",
    date: "2026-08-10",
    startTime: "09:00:00",
    // 2026-08-10 09:00 KST 하루 전
    nowMs: Date.parse("2026-08-09T00:00:00+09:00"),
    ...overrides,
  };
}

describe("decideCancellation", () => {
  it("본인의 결제된 예약을 시작 전에 취소하면 환불까지 진행한다", () => {
    expect(decideCancellation(cancelInput())).toEqual({ kind: "cancel", refund: true });
  });

  it("미결제 예약은 환불 없이 취소만 한다", () => {
    expect(decideCancellation(cancelInput({ paymentStatus: "unpaid", paymentKey: null }))).toEqual({
      kind: "cancel",
      refund: false,
    });
  });

  it("무료(서비스) 예약은 환불 대상이 아니다", () => {
    expect(decideCancellation(cancelInput({ paymentStatus: "service" }))).toEqual({ kind: "cancel", refund: false });
  });

  it("이미 환불된 예약을 다시 취소해도 중복 환불하지 않는다", () => {
    expect(decideCancellation(cancelInput({ paymentStatus: "refunded" }))).toEqual({ kind: "cancel", refund: false });
  });

  it("결제 식별자가 형식에 맞지 않으면 환불을 시도하지 않는다", () => {
    expect(decideCancellation(cancelInput({ paymentKey: "short" }))).toEqual({ kind: "cancel", refund: false });
    expect(decideCancellation(cancelInput({ paymentKey: "has spaces and $$" }))).toEqual({
      kind: "cancel",
      refund: false,
    });
  });

  it("남의 예약은 취소할 수 없다", () => {
    const decision = decideCancellation(cancelInput({ callerId: "22222222-2222-4222-8222-222222222222" }));
    expect(decision).toMatchObject({ kind: "reject", status: 403, code: "OWNERSHIP_MISMATCH" });
  });

  it("주인 없는(익명화된) 예약도 취소할 수 없다", () => {
    expect(decideCancellation(cancelInput({ ownerId: null }))).toMatchObject({ kind: "reject", status: 403 });
  });

  it("이용 시작 시간이 지나면 취소·환불을 거절한다", () => {
    const decision = decideCancellation(cancelInput({ nowMs: Date.parse("2026-08-10T09:00:01+09:00") }));
    expect(decision).toMatchObject({ kind: "reject", status: 400, code: "START_TIME_PASSED" });
  });

  it("시작 정각도 거절한다 (경계값)", () => {
    expect(decideCancellation(cancelInput({ nowMs: Date.parse("2026-08-10T09:00:00+09:00") }))).toMatchObject({
      kind: "reject",
      code: "START_TIME_PASSED",
    });
  });

  it("시작 1초 전은 허용한다 (경계값)", () => {
    expect(decideCancellation(cancelInput({ nowMs: Date.parse("2026-08-10T08:59:59+09:00") }))).toEqual({
      kind: "cancel",
      refund: true,
    });
  });

  it("이미 취소된 예약은 성공으로 처리하고 다시 환불하지 않는다", () => {
    expect(decideCancellation(cancelInput({ status: "canceled" }))).toEqual({ kind: "already_canceled" });
  });

  it("소유권 검사가 취소 여부 검사보다 앞선다", () => {
    const decision = decideCancellation(
      cancelInput({ status: "canceled", callerId: "22222222-2222-4222-8222-222222222222" }),
    );
    expect(decision).toMatchObject({ kind: "reject", code: "OWNERSHIP_MISMATCH" });
  });

  it("시작 시각이 없으면 그날 자정을 기준으로 본다", () => {
    const base = cancelInput({ startTime: null, date: "2026-08-10" });
    expect(decideCancellation({ ...base, nowMs: Date.parse("2026-08-09T23:59:00+09:00") })).toMatchObject({
      kind: "cancel",
    });
    expect(decideCancellation({ ...base, nowMs: Date.parse("2026-08-10T00:00:01+09:00") })).toMatchObject({
      kind: "reject",
      code: "START_TIME_PASSED",
    });
  });
});

describe("reservationStartMs", () => {
  it("한국 시간으로 해석한다", () => {
    expect(reservationStartMs("2026-08-10", "09:00:00")).toBe(Date.parse("2026-08-10T00:00:00Z"));
  });

  it("해석할 수 없는 날짜는 NaN을 돌려준다", () => {
    expect(Number.isNaN(reservationStartMs("not-a-date", "09:00"))).toBe(true);
  });
});

describe("식별자 검증", () => {
  it("UUID 형식만 통과시킨다", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("11111111-1111-4111-8111-11111111111")).toBe(false);
    expect(isUuid("'; drop table reservations; --")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it("결제 식별자는 길이와 문자 집합을 제한한다", () => {
    expect(isPaymentId("wr-abcd1234-1700000000000")).toBe(true);
    expect(isPaymentId("short")).toBe(false);
    expect(isPaymentId("a".repeat(121))).toBe(false);
    // PostgREST 필터에 그대로 들어가므로 특수문자를 막는다.
    expect(isPaymentId("abcdefgh&or=1")).toBe(false);
  });
});

describe("prorateRefund (주 단위 정산)", () => {
  // 4주(28일) 월권 280,000원 = 주당 70,000원
  const base = { paidAmount: 280000, startDate: "2026-08-01", endDate: "2026-08-28" };

  it("이용 시작 전에는 전액을 환불한다", () => {
    const result = prorateRefund({ ...base, onDate: "2026-07-31" });
    expect(result.refundAmount).toBe(280000);
    expect(result.usedWeeks).toBe(0);
  });

  it("첫 주에 해지하면 1주만 소진된다", () => {
    const result = prorateRefund({ ...base, onDate: "2026-08-03" });
    expect(result.totalWeeks).toBe(4);
    expect(result.usedWeeks).toBe(1);
    expect(result.remainingWeeks).toBe(3);
    expect(result.refundAmount).toBe(210000);
  });

  it("주 경계를 넘으면 다음 주가 소진된다", () => {
    // 8일차 = 2주차 시작
    const result = prorateRefund({ ...base, onDate: "2026-08-08" });
    expect(result.usedWeeks).toBe(2);
    expect(result.refundAmount).toBe(140000);
  });

  it("7일차까지는 아직 1주차다", () => {
    const result = prorateRefund({ ...base, onDate: "2026-08-07" });
    expect(result.usedWeeks).toBe(1);
    expect(result.refundAmount).toBe(210000);
  });

  it("마지막 주에 들어가면 환불할 잔여가 없다", () => {
    expect(prorateRefund({ ...base, onDate: "2026-08-22" }).refundAmount).toBe(0);
  });

  it("기간이 끝난 뒤에는 0원이다", () => {
    const result = prorateRefund({ ...base, onDate: "2026-09-05" });
    expect(result.remainingWeeks).toBe(0);
    expect(result.refundAmount).toBe(0);
  });

  it("주간권(1주 이하)은 일 단위로 정산한다 — 주 단위면 전액 몰수가 되기 때문", () => {
    // 7일 149,000원, 3일차에 해지 → 남은 4일치
    const result = prorateRefund({ paidAmount: 149000, startDate: "2026-08-03", endDate: "2026-08-09", onDate: "2026-08-05" });
    expect(result.unit).toBe("day");
    expect(result.totalDays).toBe(7);
    expect(result.usedDays).toBe(3);
    expect(result.remainingDays).toBe(4);
    expect(result.refundAmount).toBe(85142); // 149000 * 4/7 내림
  });

  it("주간권도 시작 전이면 전액 환불한다", () => {
    const result = prorateRefund({ paidAmount: 149000, startDate: "2026-08-03", endDate: "2026-08-09", onDate: "2026-08-01" });
    expect(result.refundAmount).toBe(149000);
  });

  it("주간권 마지막 날에는 잔여가 없다", () => {
    expect(prorateRefund({ paidAmount: 149000, startDate: "2026-08-03", endDate: "2026-08-09", onDate: "2026-08-09" }).refundAmount).toBe(0);
  });

  it("월권은 여전히 주 단위로 정산한다", () => {
    const result = prorateRefund({ ...base, onDate: "2026-08-10" });
    expect(result.unit).toBe("week");
    expect(result.refundAmount).toBe(140000);
  });

  it("원 단위로 내림해 과다 환불을 막는다", () => {
    // 100000 * 3/4 = 75000 (딱 떨어지므로 나누어떨어지지 않는 금액으로 확인)
    const result = prorateRefund({ paidAmount: 100001, startDate: "2026-08-01", endDate: "2026-08-28", onDate: "2026-08-01" });
    expect(result.refundAmount).toBe(75000); // 100001 * 3/4 = 75000.75 → 내림
  });

  it("기간 정보가 잘못되면 0원으로 막는다(자동 환불 금지)", () => {
    expect(prorateRefund({ paidAmount: 100000, startDate: "", endDate: "", onDate: "2026-08-01" }).refundAmount).toBe(0);
  });
});
