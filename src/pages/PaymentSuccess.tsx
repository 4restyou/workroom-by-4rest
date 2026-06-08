import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Section from "../components/Section";
import { buttonClass, card, tintCard } from "../lib/ui";

type State = "loading" | "ok" | "error";

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const paymentKey = params.get("paymentKey");
    const orderId = params.get("orderId");
    const amount = params.get("amount");
    if (!paymentKey || !orderId || !amount) {
      setState("error");
      setMessage("결제 정보가 올바르지 않습니다.");
      return;
    }

    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url) {
      setState("error");
      setMessage("결제 설정이 완료되지 않았습니다.");
      return;
    }

    void fetch(`${url}/functions/v1/confirm-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(anon ? { apikey: anon, Authorization: `Bearer ${anon}` } : {}),
      },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
        if (response.ok && data.ok) {
          setState("ok");
        } else {
          setState("error");
          setMessage(data.message ?? "결제 승인에 실패했습니다.");
        }
      })
      .catch(() => {
        setState("error");
        setMessage("결제 처리 중 오류가 발생했습니다.");
      });
  }, [params]);

  return (
    <main className="pb-16">
      <Section eyebrow="Payment" title={state === "ok" ? "결제 완료" : "결제 확인"} accent="mint">
        <div className={`${card} grid gap-4 p-6`}>
          {state === "loading" ? <p className="font-bold">결제를 확인하고 있습니다…</p> : null}
          {state === "ok" ? (
            <div>
              <p className="text-lg font-bold">결제가 완료되었습니다 🎉</p>
              <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">예약현황에서 결제 내역을 확인할 수 있습니다.</p>
            </div>
          ) : null}
          {state === "error" ? <p className={`${tintCard("danger")} p-3 text-sm font-bold`}>{message}</p> : null}
          <Link className={buttonClass("primary", "lg", "w-full sm:w-auto")} to="/account?tab=reservations">
            예약현황으로
          </Link>
        </div>
      </Section>
    </main>
  );
}
