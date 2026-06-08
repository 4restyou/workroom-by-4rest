import { Link } from "react-router-dom";
import Section from "../components/Section";
import { buttonClass, card, tintCard } from "../lib/ui";

export default function PaymentFail() {
  return (
    <main className="pb-16">
      <Section eyebrow="Payment" title="결제 안내" accent="coral">
        <div className={`${card} grid gap-4 p-6`}>
          <p className={`${tintCard("yellow")} p-3 text-sm font-bold`}>
            현재 온라인 카드 결제는 사용하지 않습니다. 결제 안내는 예약 확정 후 문자로 보내드립니다.
          </p>
          <Link className={buttonClass("primary", "lg", "w-full sm:w-auto")} to="/account?tab=reservations">
            예약현황으로 돌아가기
          </Link>
        </div>
      </Section>
    </main>
  );
}
