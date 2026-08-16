// 시간권 → 종일권 전환의 확인 단계.
//
// 두 곳에서 쓴다.
//   1) 이용 중 화면 — 종료가 가까워졌을 때 "종일권으로 변경"
//   2) 예약 화면 — 종일권을 새로 결제하려는 순간 "이미 낸 돈이 있으니 전환하세요"
// 문구가 갈리면 같은 동작인데 다르게 읽히므로 여기 한 곳에 둔다.
//
// 버튼에는 금액을 적지 않는다. 얼마가 빠지고 얼마를 더 내는지는 이 확인 단계에서
// 보여 준다.

import { confirmDialog } from "./confirm";
import { formatPrice } from "./format";
import { upgradeToDayPass, type PayResult, type UpgradeQuote } from "./portone";

export type UpgradeCustomer = { name: string; phone: string; email?: string | null };

/** 확인 창을 띄우고 전환을 실행한다. 사용자가 닫으면 null. */
export async function confirmAndUpgrade(quote: UpgradeQuote, customer: UpgradeCustomer): Promise<PayResult | null> {
  const paying = quote.amountDue > 0;
  const ok = await confirmDialog({
    title: paying ? `${quote.dayPassName}으로 변경할까요?` : `추가 결제 없이 ${quote.dayPassName}으로 변경할까요?`,
    description: paying
      ? [
          `${quote.dayPassName} ${formatPrice(quote.dayPassTotal)}`,
          `이미 결제하신 금액 ${formatPrice(quote.alreadyPaid)}`,
          `추가 결제 ${formatPrice(quote.amountDue)}`,
          "",
          "변경하면 오늘 마감까지 이용하실 수 있어요.",
        ].join("\n")
      : [
          `이미 결제하신 금액(${formatPrice(quote.alreadyPaid)})이 ${quote.dayPassName} 금액 이상이라 추가 결제 없이 변경됩니다.`,
          "오늘 마감까지 이용하실 수 있어요.",
        ].join("\n"),
    confirmLabel: paying ? "결제하고 변경" : "변경하기",
  });
  if (!ok) return null;
  return upgradeToDayPass(quote, customer);
}
