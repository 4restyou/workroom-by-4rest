import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Section from "../components/Section";
import { confirmPayment } from "../lib/portone";
import { buttonClass, tintCard } from "../lib/ui";

// PortOne 결제창의 모바일 리디렉션 복귀 지점. SDK가 paymentId(성공) 또는
// code/message(실패)를 쿼리로 붙여 보낸다. 성공 케이스는 서버 검증을 거쳐
// 예약을 결제완료로 반영한 뒤 결과를 보여준다.
export default function PaymentPortone() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<"checking" | "done" | "failed">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function run() {
      const code = searchParams.get("code");
      const paymentId = searchParams.get("paymentId");
      if (code) {
        if (!active) return;
        setState("failed");
        setMessage(searchParams.get("message") ?? "결제가 완료되지 않았습니다.");
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
      setState(result.ok ? "done" : "failed");
      setMessage(result.message);
    }
    void run();
    return () => {
      active = false;
    };
  }, [searchParams]);

  return (
    <main className="pb-16">
      <Section eyebrow="Payment" title={state === "done" ? "결제 완료" : state === "failed" ? "결제 확인 실패" : "결제 확인 중"} accent="yellow">
        {state === "checking" ? (
          <p className={`${tintCard("yellow")} p-5 font-bold`}>결제를 확인하고 있습니다…</p>
        ) : (
          <div className={`${tintCard(state === "done" ? "sky" : "danger")} p-5`}>
            <p className="font-bold leading-7">{message}</p>
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
          <Link className={buttonClass("secondary", "md")} to="/">
            홈으로
          </Link>
        </div>
      </Section>
    </main>
  );
}
