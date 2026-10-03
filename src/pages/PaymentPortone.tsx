import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Section from "../components/Section";
import { confirmBillingIssue, confirmPayment } from "../lib/portone";
import { buttonClass, tintCard } from "../lib/ui";

// PortOne 결제창의 모바일 리디렉션 복귀 지점. SDK가 paymentId(성공) 또는
// code/message(실패)를 쿼리로 붙여 보낸다. 성공 케이스는 서버 검증을 거쳐
// 예약을 결제완료·확정으로 반영한 뒤 결과를 보여준다.
export default function PaymentPortone() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<"checking" | "done" | "pending" | "failed">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function run() {
      const code = searchParams.get("code");
      const paymentId = searchParams.get("paymentId");
      const billingKey = searchParams.get("billingKey");
      const res = searchParams.get("res");
      if (code) {
        if (!active) return;
        setState("failed");
        setMessage(searchParams.get("message") ?? "결제가 완료되지 않았습니다.");
        return;
      }
      // 정기결제(빌링키) 리디렉션 복귀: billingKey + 예약 id로 첫 결제·구독 등록.
      if (billingKey && res) {
        const result = await confirmBillingIssue(res, billingKey);
        if (!active) return;
        setState(result.ok ? "done" : "failed");
        setMessage(result.message);
        return;
      }
      if (!paymentId) {
        if (!active) return;
        setState("failed");
        setMessage("결제 정보가 없습니다. 예약현황에서 결제 상태를 확인해 주세요.");
        return;
      }
      const result = await confirmPayment(paymentId);
      if (!active) return;
      // 승인 반영이 늦는 것과 결제가 안 된 것은 다르다. 늦은 것을 빨간 실패
      // 화면으로 보여 주면 손님이 다시 결제하려 들고, 그게 이중 결제가 된다.
      setState(result.ok ? "done" : result.pending ? "pending" : "failed");
      setMessage(result.message);
    }
    void run();
    return () => {
      active = false;
    };
  }, [searchParams]);

  return (
    <main className="pb-16">
      <Section
        eyebrow="결제"
        title={state === "done" ? "결제 완료" : state === "failed" ? "결제 확인 실패" : "결제 확인 중"}
        accent="yellow"
      >
        {state === "checking" ? (
          <p className={`${tintCard("yellow")} p-5 font-bold`}>결제를 확인하고 있습니다…</p>
        ) : (
          <div className={`${tintCard(state === "done" ? "sky" : state === "pending" ? "yellow" : "danger")} p-5`}>
            <p className="font-bold leading-7">{message}</p>
            {state === "done" ? (
              <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
                확정 문자가 발송됩니다. 방문 전에 필요한 안내는 ‘방문 안내’에서 볼 수 있어요.
              </p>
            ) : null}
            {state === "pending" ? (
              <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
                카드사 승인이 반영되는 데 몇 초에서 몇 분이 걸릴 수 있습니다. 예약현황에 자동으로 반영되니{" "}
                <b>다시 결제하지 말아 주세요.</b> 10분이 지나도 반영되지 않으면 운영자에게 문의해 주세요.
              </p>
            ) : null}
            {state === "failed" ? (
              <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
                이미 결제가 이루어졌다면 잠시 후 예약현황에 자동 반영됩니다. 반영되지 않으면 운영자에게 문의해 주세요.
              </p>
            ) : null}
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Link className={buttonClass("primary", "md")} to="/account?tab=reservations">
            예약현황으로
          </Link>
          {state === "done" ? (
            <Link className={buttonClass("secondary", "md")} to="/visit">
              방문 안내
            </Link>
          ) : null}
          <Link className={buttonClass("secondary", "md")} to="/">
            홈으로
          </Link>
        </div>
      </Section>
    </main>
  );
}
