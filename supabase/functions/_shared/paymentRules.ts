// 결제·환불 판정 규칙. 의존성이 전혀 없는 순수 함수만 둔다.
//
// 이유: 금액 대조, 중복 결제 처리, 취소 가능 시점 같은 "돈이 걸린 판단"이
// 엣지 함수 핸들러 안에 흩어져 있으면 테스트할 수가 없다. Deno(엣지 함수)와
// vitest(src/lib/paymentRules.test.ts) 양쪽에서 그대로 import 할 수 있도록
// Deno·Node API를 쓰지 않는다.

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isPaymentId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 120 && /^[A-Za-z0-9_-]+$/.test(value);
}

// ── 결제 확인 ─────────────────────────────────────────────────────────

export type ConfirmInput = {
  /** 예약의 현재 상태 (pending/confirmed/canceled/…) */
  reservationStatus: string;
  /** 예약의 현재 결제 상태 (unpaid/paid/refunded/service/…) */
  reservationPaymentStatus: string | null;
  /** 예약 시점에 서버가 확정한 금액. 클라이언트 값이 아니다. */
  priceAtBooking: number | null;
  /** PortOne API로 다시 조회한 결제 상태 */
  providerStatus: string | undefined;
  providerCurrency: string | undefined;
  providerAmount: number;
};

export type ConfirmDecision =
  /** 이미 결제완료인데 예약이 대기 상태 → 예약만 확정한다. */
  | { kind: "confirm_only"; code: "PAID_RESERVATION_CONFIRMED" }
  /** 이미 결제·확정까지 끝난 예약 → 아무것도 하지 않는다. */
  | { kind: "noop"; code: "ALREADY_PAID" }
  /** 결제완료로 반영한다. autoConfirm이면 예약도 확정한다. */
  | { kind: "apply"; autoConfirm: boolean }
  | { kind: "reject"; code: string; message: string };

// 결제 상태를 예약에 반영할 수 있는 예약 상태. 취소·노쇼된 예약은 결제가
// 확인돼도 자동 확정하지 않고 운영자 판단으로 넘긴다.
const AUTO_CONFIRMABLE = new Set(["pending", "confirmed"]);

export function decidePaymentConfirmation(input: ConfirmInput): ConfirmDecision {
  // 1) 이미 결제된 예약: 재확인 요청이 중복으로 들어와도 두 번 청구되지 않는다.
  if (input.reservationPaymentStatus === "paid") {
    return input.reservationStatus === "pending"
      ? { kind: "confirm_only", code: "PAID_RESERVATION_CONFIRMED" }
      : { kind: "noop", code: "ALREADY_PAID" };
  }

  // 2) PG에서 결제가 완료 상태가 아니면 반영하지 않는다.
  if (input.providerStatus !== "PAID") {
    return {
      kind: "reject",
      code: input.providerStatus ?? "UNKNOWN",
      message: "결제가 완료되지 않았습니다.",
    };
  }

  // 3) 통화·금액이 예약 금액과 정확히 일치해야 한다. 이 대조가 금액 위조를
  //    막는 마지막 관문이므로 부분 결제도 허용하지 않는다.
  //
  //    price_at_booking이 비어 있으면(Number(null) === 0) 0원 결제가 그대로
  //    통과해 버리므로, 양수인지도 반드시 확인한다.
  const expected = input.priceAtBooking === null ? Number.NaN : Number(input.priceAtBooking);
  if (
    input.providerCurrency !== "KRW" ||
    !Number.isFinite(expected) ||
    expected <= 0 ||
    input.providerAmount !== expected
  ) {
    return {
      kind: "reject",
      code: "AMOUNT_MISMATCH",
      message: `결제 금액(${input.providerAmount})이 예약 금액(${input.priceAtBooking})과 다릅니다.`,
    };
  }

  return { kind: "apply", autoConfirm: AUTO_CONFIRMABLE.has(input.reservationStatus) };
}

// ── 취소 / 환불 ───────────────────────────────────────────────────────

export type CancelInput = {
  ownerId: string | null;
  callerId: string;
  status: string;
  paymentStatus: string | null;
  paymentKey: string | null;
  /** 예약 날짜 (YYYY-MM-DD) */
  date: string;
  /** 시작 시각 (HH:MM 또는 HH:MM:SS). 없으면 자정으로 본다. */
  startTime: string | null;
  /** 판정 시점 (epoch ms) */
  nowMs: number;
};

export type CancelDecision =
  | { kind: "already_canceled" }
  /** 취소를 실행한다. refund가 true면 PG 승인 취소를 먼저 실행해야 한다. */
  | { kind: "cancel"; refund: boolean }
  | { kind: "reject"; status: number; code: string; message: string };

/** 예약 시작 시각(KST)을 epoch ms로 바꾼다. 파싱 불가면 NaN. */
export function reservationStartMs(date: string, startTime: string | null): number {
  return new Date(`${date}T${(startTime ?? "00:00").slice(0, 5)}:00+09:00`).getTime();
}

export function decideCancellation(input: CancelInput): CancelDecision {
  if (input.ownerId !== input.callerId) {
    return { kind: "reject", status: 403, code: "OWNERSHIP_MISMATCH", message: "본인 예약만 취소할 수 있습니다." };
  }
  if (input.status === "canceled") {
    return { kind: "already_canceled" };
  }

  // 이용 시작 전까지만 취소·환불할 수 있다(약관과 DB 트리거가 같은 기준).
  // 시각을 해석할 수 없으면 막지 않는다 — DB 트리거가 최종 관문이다.
  const startMs = reservationStartMs(input.date, input.startTime);
  if (Number.isFinite(startMs) && input.nowMs >= startMs) {
    return {
      kind: "reject",
      status: 400,
      code: "START_TIME_PASSED",
      message: "예약 시간이 지나 취소·환불이 불가합니다.",
    };
  }

  // 결제완료 + 유효한 결제 식별자가 있을 때만 환불을 시도한다.
  // (환불 완료·서비스 예약은 되돌릴 금액이 없다.)
  const refund = input.paymentStatus === "paid" && isPaymentId(input.paymentKey);
  return { kind: "cancel", refund };
}

// ── 장기 이용권 일할 환불 ─────────────────────────────────────────────
//
// 약관은 "이용 기간 중 환불 시 이용한 일수를 일할 계산해 차감한 잔액을 환불"
// 한다고 약속한다. 그 계산을 여기 한 곳에 두고 관리자 화면(미리보기)과 엣지
// 함수(실제 부분 취소)가 같은 금액을 쓰게 한다.

export type ProrateInput = {
  /** 결제 금액(원) */
  paidAmount: number;
  /** 이용 기간 시작일 (YYYY-MM-DD) */
  startDate: string;
  /** 이용 기간 종료일 (YYYY-MM-DD, 이 날짜까지 이용) */
  endDate: string;
  /** 환불 기준일 (YYYY-MM-DD). 보통 오늘(KST). */
  onDate: string;
};

export type ProrateResult = {
  /** 전체 이용 일수 */
  totalDays: number;
  /** 이미 지난(사용한) 일수 */
  usedDays: number;
  /** 남은 일수 — 환불 대상 */
  remainingDays: number;
  /** 환불 금액(원, 원 단위 내림) */
  refundAmount: number;
};

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00+09:00`).getTime();
  const b = new Date(`${to}T00:00:00+09:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.round((b - a) / 86400000);
}

/**
 * 남은 일수만큼 환불액을 계산한다.
 * - 기간 시작 전이면 전액 환불(아직 하루도 쓰지 않았다).
 * - 기간이 끝났으면 0원.
 * - 기준일 당일은 "사용한 날"로 본다(그날 이용이 가능하므로).
 */
export function prorateRefund(input: ProrateInput): ProrateResult {
  const totalDays = daysBetween(input.startDate, input.endDate) + 1;
  const amount = Math.max(0, Math.floor(input.paidAmount));

  if (!Number.isFinite(totalDays) || totalDays <= 0) {
    return { totalDays: 0, usedDays: 0, remainingDays: 0, refundAmount: 0 };
  }

  const elapsed = daysBetween(input.startDate, input.onDate);
  if (!Number.isFinite(elapsed)) {
    return { totalDays, usedDays: 0, remainingDays: 0, refundAmount: 0 };
  }

  // 시작 전 취소: 사용한 날이 없으므로 전액.
  if (elapsed < 0) {
    return { totalDays, usedDays: 0, remainingDays: totalDays, refundAmount: amount };
  }

  const usedDays = Math.min(totalDays, elapsed + 1);
  const remainingDays = Math.max(0, totalDays - usedDays);
  const refundAmount = Math.floor((amount * remainingDays) / totalDays);
  return { totalDays, usedDays, remainingDays, refundAmount };
}
