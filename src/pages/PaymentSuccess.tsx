import { Link } from "react-router-dom";
import Section from "../components/Section";
import { SITE } from "../lib/site";
import { buttonClass, card, tintCard } from "../lib/ui";

export default function PaymentSuccess() {
  return (
    <main className="pb-16">
      <Section eyebrow="Payment" title="결제 안내" accent="mint">
        <div className={`${card} grid gap-4 p-6`}>
          <p className={`${tintCard("yellow")} p-3 text-sm font-bold`}>
            {SITE.booking.onlinePayment} {SITE.booking.onsitePayment}
          </p>
          <Link className={buttonClass("primary", "lg", "w-full sm:w-auto")} to="/account?tab=reservations">
            예약현황으로
          </Link>
        </div>
      </Section>
    </main>
  );
}
