// Supabase Edge Function: confirm a Toss payment for a reservation and mark it
// paid. Called by /payment/success after Toss redirects back.
//
// Required secrets:
//   TOSS_SECRET_KEY                - Toss Payments secret key
//   SUPABASE_URL                   - (auto-provided)
//   SUPABASE_SERVICE_ROLE_KEY      - (auto-provided)
//   ALLOWED_ORIGINS                - optional comma-separated browser origins
//
// Deploy with --no-verify-jwt; the function verifies the order against the DB
// (orderId = reservation id, amount must match price_at_booking) and Toss.

const TOSS_SECRET_KEY = Deno.env.get("TOSS_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_ALLOWED_ORIGINS = ["https://workroomby4rest.netlify.app", "http://localhost:5173", "http://127.0.0.1:5173"];
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? DEFAULT_ALLOWED_ORIGINS.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !origin || ALLOWED_ORIGINS.includes(origin);
}

const fallbackCors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0] ?? "",
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200, headers = fallbackCors): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPaymentKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10 && value.length <= 300 && /^[A-Za-z0-9_-]+$/.test(value);
}

function isValidAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 10_000_000;
}

type PaymentLog = {
  reservation_id: string;
  profile_id?: string | null;
  action: "confirm";
  status: "succeeded" | "failed" | "skipped";
  amount?: number | null;
  provider_code?: string | null;
  message?: string | null;
};

async function recordPaymentLog(log: PaymentLog) {
  if (!SUPABASE_URL || !SERVICE_ROLE || !isUuid(log.reservation_id)) return;

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/reservation_payment_logs`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        reservation_id: log.reservation_id,
        profile_id: log.profile_id ?? null,
        actor_id: null,
        action: log.action,
        status: log.status,
        amount: log.amount ?? null,
        provider: "toss",
        provider_code: log.provider_code ?? null,
        message: log.message ?? null,
      }),
    });
  } catch (error) {
    console.error("[confirm-payment] payment log error", { message: errorMessage(error) });
  }
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") {
    return isAllowedOrigin(request) ? new Response("ok", { headers }) : new Response("forbidden", { status: 403, headers });
  }

  try {
    if (!isAllowedOrigin(request)) return json({ ok: false, message: "허용되지 않은 요청입니다." }, 403, headers);
    if (request.method !== "POST") return json({ ok: false, message: "허용되지 않은 요청 방식입니다." }, 405, headers);

    const { paymentKey, orderId, amount } = await request.json();
    if (!isPaymentKey(paymentKey) || !isUuid(orderId) || !isValidAmount(amount)) {
      return json({ ok: false, message: "잘못된 결제 요청입니다." }, 400, headers);
    }
    if (!TOSS_SECRET_KEY || !SUPABASE_URL || !SERVICE_ROLE) {
      return json({ ok: false, message: "결제 설정이 완료되지 않았습니다." }, 500, headers);
    }

    const authHeaders = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` };

    // 1) Look up the reservation (orderId == reservation id).
    const lookup = await fetch(
      `${SUPABASE_URL}/rest/v1/reservations?id=eq.${orderId}&select=id,profile_id,status,payment_status,price_at_booking`,
      { headers: authHeaders },
    );
    const rows = (await lookup.json()) as Array<{
      profile_id: string | null;
      status: string;
      payment_status: string | null;
      price_at_booking: number | null;
    }>;
    const reservation = Array.isArray(rows) ? rows[0] : null;

    if (!reservation) {
      await recordPaymentLog({
        reservation_id: orderId,
        action: "confirm",
        status: "failed",
        amount,
        provider_code: "RESERVATION_NOT_FOUND",
        message: "예약을 찾을 수 없습니다.",
      });
      return json({ ok: false, message: "예약을 찾을 수 없습니다." }, 404, headers);
    }
    if (reservation.payment_status === "paid") {
      await recordPaymentLog({
        reservation_id: orderId,
        profile_id: reservation.profile_id,
        action: "confirm",
        status: "skipped",
        amount,
        provider_code: "ALREADY_PAID",
        message: "이미 결제 완료된 예약입니다.",
      });
      return json({ ok: true, alreadyPaid: true }, 200, headers);
    }
    if (reservation.status !== "confirmed") {
      await recordPaymentLog({
        reservation_id: orderId,
        profile_id: reservation.profile_id,
        action: "confirm",
        status: "failed",
        amount,
        provider_code: "RESERVATION_NOT_CONFIRMED",
        message: "확정되지 않은 예약 결제 시도입니다.",
      });
      return json({ ok: false, message: "확정된 예약만 결제할 수 있습니다." }, 400, headers);
    }
    if (Number(reservation.price_at_booking) !== Number(amount)) {
      await recordPaymentLog({
        reservation_id: orderId,
        profile_id: reservation.profile_id,
        action: "confirm",
        status: "failed",
        amount,
        provider_code: "AMOUNT_MISMATCH",
        message: "결제 요청 금액이 예약 금액과 일치하지 않습니다.",
      });
      return json({ ok: false, message: "결제 금액이 예약 금액과 일치하지 않습니다." }, 400, headers);
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
    const result = (await confirm.json()) as { code?: string; message?: string };
    if (!confirm.ok) {
      console.error("[confirm-payment] toss error", { status: confirm.status, code: result?.code ?? "unknown" });
      await recordPaymentLog({
        reservation_id: orderId,
        profile_id: reservation.profile_id,
        action: "confirm",
        status: "failed",
        amount,
        provider_code: result?.code ?? "TOSS_CONFIRM_FAILED",
        message: result?.message ?? "결제 승인에 실패했습니다.",
      });
      return json({ ok: false, message: result?.message ?? "결제 승인에 실패했습니다." }, 400, headers);
    }

    // 3) Mark the reservation paid.
    const update = await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${orderId}`, {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ payment_status: "paid", payment_method: "카드", payment_key: paymentKey }),
    });
    if (!update.ok) {
      await recordPaymentLog({
        reservation_id: orderId,
        profile_id: reservation.profile_id,
        action: "confirm",
        status: "failed",
        amount,
        provider_code: "RESERVATION_UPDATE_FAILED",
        message: "Toss 결제 승인 후 예약 결제 상태 업데이트에 실패했습니다.",
      });
      return json({ ok: false, message: "결제는 승인되었지만 예약 반영에 실패했습니다. 관리자에게 문의해 주세요." }, 500, headers);
    }

    await recordPaymentLog({
      reservation_id: orderId,
      profile_id: reservation.profile_id,
      action: "confirm",
      status: "succeeded",
      amount,
      provider_code: "CONFIRMED",
      message: "Toss 결제 승인이 완료되었습니다.",
    });

    return json({ ok: true }, 200, headers);
  } catch (error) {
    console.error("[confirm-payment] handler error", { message: errorMessage(error) });
    return json({ ok: false, message: "결제 처리 중 오류가 발생했습니다." }, 500, corsHeaders(request));
  }
});
