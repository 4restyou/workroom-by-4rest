// 쿠폰을 결제에 붙일 때의 규칙.
//
// 서버(migration 0048)가 같은 판단을 다시 한다. 여기서 정하는 건 '손님에게
// 무엇을 보여줄지'다. 두 곳이 어긋나면 고를 수 있다고 보여준 쿠폰이 저장할 때
// 거절당하므로, 조건을 똑같이 맞춘다.

import { discountedPrice } from "./discount";

/** 쿠폰을 쓸 수 있는 이용권 종류. 서버(migration 0050)와 같은 값이다. */
export type CouponScope = "time" | "day" | "week" | "month" | "any";

export const couponScopeLabels: Record<CouponScope, string> = {
  time: "시간권",
  day: "종일권",
  week: "주간권",
  month: "월권",
  any: "전 이용권",
};

export const couponScopeOptions: Array<{ value: CouponScope; label: string }> = [
  { value: "time", label: "시간권 (3시간권 · 추가 1시간)" },
  { value: "day", label: "종일권" },
  { value: "week", label: "주간권" },
  { value: "month", label: "월권 (자유석 · 지정석)" },
  { value: "any", label: "전 이용권" },
];

/** 저장된 값을 범위로 읽는다. month_pass 는 0048에서 쓰던 예전 값. */
export function couponScopeOf(value: unknown): CouponScope {
  if (value === "month_pass") return "month";
  if (value === "time" || value === "day" || value === "week" || value === "month" || value === "any") return value;
  return "month";
}

/**
 * 이용권 이름이 이 범위에 드는가. 서버의 pass_matches_coupon_scope 와 같은 규칙.
 * 어긋나면 고를 수 있다고 보여준 쿠폰이 저장할 때 거절당한다.
 */
export function passMatchesCouponScope(passName: string, scope: CouponScope): boolean {
  switch (scope) {
    case "any": return true;
    case "time": return passName.includes("시간");
    case "day": return passName.includes("종일");
    case "week": return passName.includes("주간");
    case "month": return passName.includes("월권");
  }
}

export type RedeemableCoupon = {
  id: string;
  code: string;
  label: string;
  status: "issued" | "used";
  /** 할인율(%). 0이면 현물 쿠폰이라 결제에 못 쓴다. */
  discount_percent?: number | null;
  /** 적용 범위 — time · day · week · month · any. */
  applies_to?: string | null;
};

/** 이 이용권에 이 쿠폰을 쓸 수 있는가. */
export function couponAppliesToPass(coupon: RedeemableCoupon, passName: string): boolean {
  if (coupon.status !== "issued") return false;
  if (Math.round(Number(coupon.discount_percent ?? 0)) <= 0) return false;
  return passMatchesCouponScope(passName, couponScopeOf(coupon.applies_to));
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
