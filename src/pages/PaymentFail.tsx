import { Link } from "react-router-dom";
import Section from "../components/Section";
import { buttonClass, card, tintCard } from "../lib/ui";

export default function PaymentFail() {
  return (
    <main className="pb-16">
      <Section eyebrow="Payment" title="결제 안내" accent="coral">
        <div className={`${card} grid gap-4 p-6`}>
          <p className={`${tintCard("yellow")} p-3 text-sm font-bold`}>
            결제가 완료되지 않았습니다. ‘예약현황’에서 다시 결제하거나, 현장 결제(카드·현금)를 원하시면 별도로 문의해 주세요.
          </p>
          <Link className={buttonClass("primary", "lg", "w-full sm:w-auto")} to="/account?tab=reservations">
            예약현황으로 돌아가기
          </Link>
        </div>
      </Section>
    </main>
  );
}
