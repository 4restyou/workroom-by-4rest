// 예약 한 건의 실제 입금·환불 금액.
//
// 매출 화면은 payment_status와 이용권 정가만 보고 계산했다. 부분 환불을 도입한
// 뒤로는 이 방식이 틀린다: 부분 환불은 결제가 남아 있어 payment_status가 'paid'로
// 유지되므로, 229,000원 월권에서 150,000원을 돌려줘도
//   - 실결제 매출에는 229,000원이 그대로 남고
//   - 환불 지표에는 0원이 잡혔다.
// 주 단위 정산을 쓰는 이상 중도 해지(=부분 환불)가 일상적인 경우라, 매출이 환불액만큼
// 계속 부풀려진다.
//
// 그래서 금액은 결제 원장(reservation_payment_logs)에서 읽는다. 다만 현장 결제·수기
// 처리 예약은 원장에 기록이 없으므로, 원장이 비어 있을 때만 예약 금액으로 되돌아간다.

export type PaymentLogAction = "confirm" | "subscribe" | "recurring" | "refund";

export type RevenueLog = {
  reservation_id: string;
  action: PaymentLogAction;
  amount: number | null;
};

export type RevenueReservation = {
  id: string;
  payment_status: string | null;
  price_at_booking: number | null;
  pass_name_snapshot: string | null;
  pass_type: string;
};

export type ReservationMoney = {
  /** 실제로 받은 금액(환불 전). */
  charged: number;
  /** 돌려준 금액. */
  refunded: number;
  /** 남은 매출 = charged - refunded (음수는 0으로). */
  net: number;
};

/** 예약별로 원장 항목을 모아 둔 맵. */
export function groupLogsByReservation(logs: readonly RevenueLog[]): Map<string, RevenueLog[]> {
  const grouped = new Map<string, RevenueLog[]>();
  for (const log of logs) {
    const list = grouped.get(log.reservation_id);
    if (list) list.push(log);
    else grouped.set(log.reservation_id, [log]);
  }
  return grouped;
}

export function reservationMoney(
  reservation: RevenueReservation,
  logs: readonly RevenueLog[] | undefined,
  listPrices?: ReadonlyMap<string, number>,
): ReservationMoney {
  let charged = 0;
  let refunded = 0;
  for (const log of logs ?? []) {
    const amount = Number(log.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (log.action === "refund") refunded += amount;
    else charged += amount;
  }

  const status = reservation.payment_status ?? "unpaid";
  const bookedPrice =
    reservation.price_at_booking ??
    listPrices?.get(reservation.pass_name_snapshot || reservation.pass_type) ??
    0;

  // 현장 결제·수기 확정은 원장에 남지 않는다. 상태가 결제/환불이면 예약 금액으로 본다.
  if (charged === 0 && (status === "paid" || status === "refunded")) charged = bookedPrice;
  // 카드사 밖에서 돌려주고 상태만 바꾼 경우(계좌 이체 환불 등)도 전액 환불로 본다.
  if (refunded === 0 && status === "refunded") refunded = charged;

  return { charged, refunded, net: Math.max(0, charged - refunded) };
}

export type RevenueTotals = {
  /** 환불을 뺀 실제 매출. */
  revenue: number;
  /** 받은 금액 합계(환불 전). */
  charged: number;
  /** 돌려준 금액 합계. */
  refunded: number;
};

export function sumRevenue(
  reservations: readonly RevenueReservation[],
  logsByReservation: ReadonlyMap<string, RevenueLog[]>,
  listPrices?: ReadonlyMap<string, number>,
): RevenueTotals {
  let charged = 0;
  let refunded = 0;
  for (const reservation of reservations) {
    // 서비스(무료) 예약은 매출·환불 어디에도 넣지 않는다.
    if ((reservation.payment_status ?? "unpaid") === "service") continue;
    const money = reservationMoney(reservation, logsByReservation.get(reservation.id), listPrices);
    charged += money.charged;
    refunded += money.refunded;
  }
  return { revenue: Math.max(0, charged - refunded), charged, refunded };
}
