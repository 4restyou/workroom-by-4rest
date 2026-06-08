// Supabase Edge Function: confirm a Toss payment for a reservation and mark it
// paid. Called by /payment/success after Toss redirects back.
//
// Required secrets:
//   TOSS_SECRET_KEY                - Toss Payments secret key
//   SUPABASE_URL                   - (auto-provided)
//   SUPABASE_SERVICE_ROLE_KEY      - (auto-provided)
//
// Deploy with --no-verify-jwt; the function verifies the order against the DB
// (orderId = reservation id, amount must match price_at_booking) and Toss.

const TOSS_SECRET_KEY = Deno.env.get("TOSS_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { paymentKey, orderId, amount } = await request.json();
    if (!paymentKey || !orderId || !amount) return json({ ok: false, message: "잘못된 결제 요청입니다." }, 400);
    if (!TOSS_SECRET_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
      return json({ ok: false, message: "결제 설정이 완료되지 않았습니다." }, 500);
    }

    const authHeaders = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` };

    // 1) Look up the reservation (orderId == reservation id).
    const lookup = await fetch(
      `${SUPABASE_URL}/rest/v1/reservations?id=eq.${orderId}&select=id,status,payment_status,price_at_booking`,
      { headers: authHeaders },
    );
    const rows = (await lookup.json()) as Array<{ status: string; payment_status: string | null; price_at_booking: number | null }>;
    const reservation = Array.isArray(rows) ? rows[0] : null;

    if (!reservation) return json({ ok: false, message: "예약을 찾을 수 없습니다." }, 404);
    if (reservation.payment_status === "paid") return json({ ok: true, alreadyPaid: true });
    if (reservation.status !== "confirmed") return json({ ok: false, message: "확정된 예약만 결제할 수 있습니다." }, 400);
    if (Number(reservation.price_at_booking) !== Number(amount)) {
      return json({ ok: false, message: "결제 금액이 예약 금액과 일치하지 않습니다." }, 400);
    }

    // 2) Confirm the payment with Toss using the secret key.
    const confirm = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${TOSS_SECRET_KEY}:`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    const result = await confirm.json();
    if (!confirm.ok) {
      console.error("[confirm-payment] toss error", confirm.status, result);
      return json({ ok: false, message: result?.message ?? "결제 승인에 실패했습니다." }, 400);
    }

    // 3) Mark the reservation paid.
    await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${orderId}`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ payment_status: "paid", payment_method: "카드", payment_key: paymentKey }),
    });

    return json({ ok: true });
  } catch (error) {
    console.error("[confirm-payment] handler error", error);
    return json({ ok: false, message: "결제 처리 중 오류가 발생했습니다." }, 500);
  }
});
