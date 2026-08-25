// 쿠폰을 결제에 붙일 때의 규칙.
//
// 서버(migration 0048)가 같은 판단을 다시 한다. 여기서 정하는 건 '손님에게
// 무엇을 보여줄지'다. 두 곳이 어긋나면 고를 수 있다고 보여준 쿠폰이 저장할 때
// 거절당하므로, 조건을 똑같이 맞춘다.

import { discountedPrice } from "./discount";

export type RedeemableCoupon = {
  id: string;
  code: string;
  label: string;
  status: "issued" | "used";
  /** 할인율(%). 0이면 현물 쿠폰이라 결제에 못 쓴다. */
  discount_percent?: number | null;
  /** month_pass = 월권 결제에만. */
  applies_to?: string | null;
};

/** 이 이용권에 이 쿠폰을 쓸 수 있는가. */
export function couponAppliesToPass(coupon: RedeemableCoupon, passName: string): boolean {
  if (coupon.status !== "issued") return false;
  if (Math.round(Number(coupon.discount_percent ?? 0)) <= 0) return false;
  if ((coupon.applies_to ?? "month_pass") === "month_pass") return passName.includes("월권");
  return true;
}

/** 이 예약에 쓸 수 있는 쿠폰만, 할인율이 큰 것부터. */
export function usableCoupons(coupons: RedeemableCoupon[], passName: string): RedeemableCoupon[] {
  return coupons
    .filter((coupon) => couponAppliesToPass(coupon, passName))
    .sort((a, b) => Number(b.discount_percent ?? 0) - Number(a.discount_percent ?? 0));
}

export type CouponQuote = {
  /** 쿠폰을 빼기 전 금액(이용권 할인은 반영). 정기결제는 이 금액으로 이어진다. */
  before: number;
  /** 쿠폰까지 적용한 이번 결제 금액. */
  after: number;
  /** 쿠폰으로 실제로 줄어든 금액. 0이면 쿠폰을 써도 이득이 없다. */
  saved: number;
};

/**
 * 이용권 할인과 쿠폰이 겹치면 **더 유리한 쪽 하나만** 적용한다.
 * 20% 판촉 위에 10%를 또 얹으면 운영자가 예상하지 못한 금액이 나온다.
 */
export function couponQuote(
  unitPrice: number,
  people: number,
  passPercent: number,
  couponPercent: number,
): CouponQuote {
  const heads = Math.max(1, Math.round(people) || 1);
  const pass = Math.max(0, Math.round(passPercent) || 0);
  const coupon = Math.max(0, Math.round(couponPercent) || 0);

  const before = discountedPrice(unitPrice, pass) * heads;
  const after = discountedPrice(unitPrice, Math.max(pass, coupon)) * heads;
  return { before, after, saved: Math.max(0, before - after) };
}
