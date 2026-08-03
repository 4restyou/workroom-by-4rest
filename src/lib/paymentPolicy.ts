// 결제·취소 버튼을 언제 보여줄지 정하는 규칙.
//
// PortOne SDK나 supabase 클라이언트에 의존하지 않는 순수 함수만 둔다.
// (lib/portone.ts는 SDK를 import 하므로 그대로는 테스트하기 어렵다.)
//
// 중요: 여기서 내리는 판단은 전부 "버튼을 보여줄지" 수준의 UX 결정이다.
// 실제 권한·금액·시점 검증은 서버(엣지 함수 + DB 트리거)가 다시 한다.

import type { Reservation } from "./types";

/** 결제를 더 진행할 수 없는 결제 상태. */
const SETTLED_PAYMENT_STATUSES = new Set(["paid", "refunded", "service"]);

/** 결제/구독을 붙일 수 있는 예약 상태. */
const PAYABLE_STATUSES = new Set(["pending", "confirmed"]);

function isPayableReservation(reservation: Reservation): boolean {
  return (
    PAYABLE_STATUSES.has(reservation.status) &&
    !SETTLED_PAYMENT_STATUSES.has(reservation.payment_status ?? "unpaid") &&
    (reservation.price_at_booking ?? 0) > 0
  );
}

export type PaymentAvailability = {
  /** SITE.booking.paymentEnabled — 결제창 노출 자체를 끄는 스위치 */
  paymentEnabled: boolean;
  /** 단건 결제 채널 키가 설정돼 있는지 */
  hasOneOffChannel: boolean;
  /** 정기결제(빌링) 채널 키가 설정돼 있는지 */
  hasBillingChannel: boolean;
};

/** 예약현황에서 '카드 결제하기'를 띄울지. */
export function canPayOnline(reservation: Reservation, available: PaymentAvailability): boolean {
  return (
    available.paymentEnabled &&
    available.hasOneOffChannel &&
    reservation.payment_preference === "online" &&
    isPayableReservation(reservation)
  );
}

/** 월권 예약에서 '정기결제 등록'을 띄울지. */
export function canSubscribe(reservation: Reservation, available: PaymentAvailability): boolean {
  const passName = reservation.pass_name_snapshot || reservation.pass_type;
  return (
    available.paymentEnabled &&
    available.hasBillingChannel &&
    passName.includes("월권") &&
    isPayableReservation(reservation)
  );
}

/**
 * 회원이 예약을 취소할 수 있는 시점인지. 이용 시작 전까지만 가능하다.
 * 서버(refund-reservation)와 DB 트리거가 같은 기준을 다시 적용한다.
 */
export function canCancelReservation(reservation: Pick<Reservation, "date" | "start_time">, nowMs = Date.now()): boolean {
  const start = new Date(`${reservation.date}T${(reservation.start_time ?? "00:00").slice(0, 5)}:00+09:00`).getTime();
  if (Number.isNaN(start)) return false;
  return nowMs < start;
}

/**
 * 취소했지만 아직 환불이 반영되지 않은 상태.
 * 정상 흐름에서는 서버가 환불까지 마치므로, 이 상태는 운영자가 수동 취소했거나
 * 환불 반영이 실패한 경우에만 남는다 — 회원에게 계속 보여 줘야 한다.
 */
export function isRefundPending(reservation: Reservation): boolean {
  return reservation.status === "canceled" && reservation.payment_status === "paid";
}
