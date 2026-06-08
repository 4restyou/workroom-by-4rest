import { Link, useSearchParams } from "react-router-dom";
import Section from "../components/Section";
import { buttonClass, card, tintCard } from "../lib/ui";

export default function PaymentFail() {
  const [params] = useSearchParams();
  const message = params.get("message") ?? "결제가 취소되었거나 실패했습니다.";

  return (
    <main className="pb-16">
      <Section eyebrow="Payment" title="결제 실패" accent="coral">
        <div className={`${card} grid gap-4 p-6`}>
          <p className={`${tintCard("danger")} p-3 text-sm font-bold`}>{message}</p>
          <Link className={buttonClass("primary", "lg", "w-full sm:w-auto")} to="/account?tab=reservations">
            예약현황으로 돌아가기
          </Link>
        </div>
      </Section>
    </main>
  );
}
