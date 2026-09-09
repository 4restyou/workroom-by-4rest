// 정기결제 청구 금액 — 결제하는 날 기준.
//
// 예전에는 등록할 때의 금액을 구독에 복사해 두고 매 회차 그대로 청구했다.
// 그러면 할인 기간에 등록한 회원은 할인이 끝나도 영원히 할인가를 내고,
// 할인 전에 등록한 회원은 할인 중에도 정가를 낸다. 둘 다 틀렸다.
//
// 규칙은 두 줄이다.
//   1) 결제하는 날 그 이용권에 할인이 걸려 있으면 할인가로 청구한다.
//   2) 등록할 때 동의한 금액보다 더 받지는 않는다.
//
// 2)가 필요한 이유: 정가를 올렸을 때 이미 구독 중인 회원의 카드에서 말없이
// 더 빠져나가면 그건 사고다. 반대로 정가를 내리면 그건 따라간다(회원에게
// 유리한 방향이라 통보 없이 적용해도 문제가 없다).

/** 정가와 할인율로 할인가를 구한다. 10원 단위 내림 — DB·프론트엔드와 같은 규칙. */
export function discountedPrice(price: number, percent: number): number {
  if (!Number.isFinite(price)) return price;
  const rate = Math.min(Math.max(Math.round(percent) || 0, 0), 90);
  if (rate <= 0) return price;
  return Math.max(0, Math.floor((price * (100 - rate)) / 1000) * 10);
}

export type RecurringChargeInput = {
  /** 등록할 때 회원이 동의한 금액(정가 기준). 이보다 더 받지 않는다. */
  baseAmount: number;
  /** 이용권의 현재 1인 정가. 모르면 null — 그때는 baseAmount 를 쓴다. */
  unitPrice?: number | null;
  people?: number | null;
  /** 이용권에 걸린 할인율(%). */
  discountPercent?: number | null;
  /** 할인 마지막 날 (YYYY-MM-DD). */
  discountUntil?: string | null;
  /** 결제하는 날 (YYYY-MM-DD, KST). */
  onDate: string;
};

/** 이번 회차에 청구할 금액. */
export function recurringChargeAmount(input: RecurringChargeInput): number {
  const base = Math.max(0, Math.round(Number(input.baseAmount) || 0));
  const unit = Number(input.unitPrice ?? 0);
  if (!Number.isFinite(unit) || unit <= 0) return base;

  const people = Math.max(1, Math.round(Number(input.people ?? 1)) || 1);
  const percent = Math.round(Number(input.discountPercent ?? 0)) || 0;
  const until = input.discountUntil ?? null;
  // 할인은 종료일이 있어야 인정한다(0047과 같은 규칙).
  const active = percent > 0 && until !== null && input.onDate <= until;

  const current = discountedPrice(unit, active ? percent : 0) * people;
  return Math.min(base, current);
}
