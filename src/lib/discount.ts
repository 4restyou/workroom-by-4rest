// 이용권 할인 계산.
//
// 같은 규칙이 서버(migration 0047의 discounted_price)에도 있다. 금액을 정하는
// 쪽은 언제나 서버이고 여기는 '손님에게 보여줄 값'을 구한다. 두 곳이 어긋나면
// 화면에 적힌 금액과 카드에 승인되는 금액이 달라지므로, 내림 규칙까지 똑같이 맞춘다.

import { formatPrice } from "./format";

export type DiscountablePass = {
  price: number;
  discount_percent?: number | null;
  discount_until?: string | null;
};

export type ActiveDiscount = {
  percent: number;
  /** 마지막 적용일 (YYYY-MM-DD). */
  until: string;
  /** 할인된 1인 금액. */
  price: number;
  /** 할인 전 1인 금액. */
  listPrice: number;
};

/** 정가와 할인율로 할인가를 구한다. 10원 단위 내림 — 서버와 같은 규칙. */
export function discountedPrice(price: number, percent: number): number {
  if (!Number.isFinite(price)) return price;
  const rate = Math.min(Math.max(Math.round(percent) || 0, 0), 90);
  if (rate <= 0) return price;
  return Math.max(0, Math.floor((price * (100 - rate)) / 1000) * 10);
}

/**
 * 오늘 이 이용권에 걸린 할인. 없으면 null.
 * 종료일이 없는 할인은 인정하지 않는다 — 끝나지 않는 할인은 실수로 남은 것이다.
 */
export function activeDiscount(pass: DiscountablePass, today: string): ActiveDiscount | null {
  const percent = Math.round(Number(pass.discount_percent ?? 0));
  const until = pass.discount_until ?? null;
  if (!percent || percent <= 0 || !until) return null;
  if (today > until) return null;

  const price = discountedPrice(pass.price, percent);
  if (price >= pass.price) return null;
  return { percent, until, price, listPrice: pass.price };
}

/** "8월 31일까지" — 할인 배지에 붙일 기한 문구. */
export function discountDeadlineLabel(until: string): string {
  const [, month, day] = until.split("-");
  if (!month || !day) return "";
  return `${Number(month)}월 ${Number(day)}일까지`;
}

/** "20% 할인 · 8월 31일까지" */
export function discountLabel(discount: ActiveDiscount): string {
  return `${discount.percent}% 할인 · ${discountDeadlineLabel(discount.until)}`;
}

export type BookedDiscount = {
  price_at_booking: number | null;
  list_price_at_booking?: number | null;
  discount_percent_at_booking?: number | null;
  /** 쿠폰으로 적용된 할인율(migration 0048). */
  coupon_percent_at_booking?: number | null;
};

/**
 * 예약에 남은 할인 기록으로 "정가 28,000원 · 20% 할인 (5,600원 절약)" 문구를 만든다.
 * 할인 없이 잡힌 예약이면 null — 아무 표시도 하지 않는다.
 */
export function bookingDiscountNote(reservation: BookedDiscount): string | null {
  // 이용권 할인과 쿠폰이 겹치면 서버가 더 유리한 쪽 하나만 적용한다. 표시도 같게.
  const percent = Math.max(
    Math.round(Number(reservation.discount_percent_at_booking ?? 0)),
    Math.round(Number(reservation.coupon_percent_at_booking ?? 0)),
  );
  const list = Number(reservation.list_price_at_booking ?? 0);
  const paid = Number(reservation.price_at_booking ?? 0);
  if (percent <= 0 || list <= paid) return null;
  return `정가 ${formatPrice(list)} · ${percent}% 할인 (${formatPrice(list - paid)} 절약)`;
}
