// 예약 금액이 이용권 정가 x 인원과 맞는지 확인한다.
//
// 금액은 서버 트리거가 정하지만, 트리거가 아직 적용되지 않았거나 예전 규칙으로
// 저장된 예약이 남아 있을 수 있다. 그 상태로 결제하면 화면에 적힌 금액과 다른
// 금액이 카드에 승인된다(2명 예약인데 1인분만 청구되는 식).
//
// 결제 직전에 한 번 더 대조해서, 어긋나면 결제를 열지 않고 알린다.

import { discountedPrice } from "./discount";

export type PricedReservation = {
  price_at_booking: number | null;
  people: number | null;
  pass_type: string;
  pass_name_snapshot: string | null;
  /** 예약 시점에 적용된 할인율(migration 0047). 없으면 할인 없음으로 본다. */
  discount_percent_at_booking?: number | null;
};

export type PriceCheck = {
  expected: number;
  actual: number;
  /** 실제 저장 금액이 기대값과 다르다. */
  mismatched: boolean;
};

export function reservationPassName(reservation: PricedReservation) {
  return reservation.pass_name_snapshot || reservation.pass_type;
}

/**
 * 이용권 정가와 인원으로 기대 금액을 구한다.
 * 정가를 모르면(이용권이 목록에서 사라졌거나 문의 상품) null — 확인하지 않는다.
 */
export function checkReservationPrice(
  reservation: PricedReservation,
  unitPrice: number | null | undefined,
): PriceCheck | null {
  if (unitPrice === null || unitPrice === undefined) return null;
  const unit = Number(unitPrice);
  if (!Number.isFinite(unit) || unit <= 0) return null;

  const people = Math.max(1, Number(reservation.people ?? 1));
  // 할인가로 잡힌 예약은 그 금액이 맞다. 정가와만 비교하면 할인 예약이 전부
  // '금액 오류'로 막힌다.
  const discount = Math.max(0, Number(reservation.discount_percent_at_booking ?? 0));
  const expected = discountedPrice(unit, discount) * people;
  const actual = Number(reservation.price_at_booking ?? 0);
  return { expected, actual, mismatched: actual !== expected };
}
