// Supabase Edge Function: cancel a member's reservation and, if it was paid,
// refund it through Toss. Called by 예약현황 when a member cancels.
//
// Policy: cancellation (and refund) is only allowed BEFORE the reservation
// start time. After the start time the request is rejected.
//
// Required secrets:
//   TOSS_SECRET_KEY                - Toss Payments secret key
//   SUPABASE_URL                   - (auto-provided)
//   SUPABASE_SERVICE_ROLE_KEY      - (auto-provided)
//   SUPABASE_ANON_KEY              - (auto-provided)
//   ALLOWED_ORIGINS                - optional comma-separated browser origins
//
// Deploy with Verify JWT ON; the caller's access token identifies the member
// and ownership is re-checked server-side before any refund.

const TOSS_SECRET_KEY = Deno.env.get("TOSS_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
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

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") {
    return isAllowedOrigin(request) ? new Response("ok", { headers }) : new Response("forbidden", { status: 403, headers });
  }

  try {
    if (!isAllowedOrigin(request)) return json({ ok: false, message: "허용되지 않은 요청입니다." }, 403, headers);
    if (request.method !== "POST") return json({ ok: false, message: "허용되지 않은 요청 방식입니다." }, 405, headers);
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, message: "결제 설정이 완료되지 않았습니다." }, 500, headers);

    // 1) Identify the caller from their access token.
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!authHeader || !authHeader.startsWith("Bearer ")) return json({ ok: false, message: "로그인이 필요합니다." }, 401, headers);
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: ANON } });
    const user = (await userResp.json()) as { id?: string };
    if (!userResp.ok || !user?.id) return json({ ok: false, message: "인증에 실패했습니다." }, 401, headers);

    const { reservationId } = await request.json();
    if (!isUuid(reservationId)) return json({ ok: false, message: "잘못된 요청입니다." }, 400, headers);

    const serviceHeaders = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` };

    // 2) Look up the reservation with the service role.
    const lookup = await fetch(
      `${SUPABASE_URL}/rest/v1/reservations?id=eq.${reservationId}&select=id,profile_id,status,payment_status,payment_key,date,start_time`,
      { headers: serviceHeaders },
    );
    const rows = (await lookup.json()) as Array<{
      profile_id: string | null;
      status: string;
      payment_status: string | null;
      payment_key: string | null;
      date: string;
      start_time: string | null;
    }>;
    const reservation = Array.isArray(rows) ? rows[0] : null;
    if (!reservation) return json({ ok: false, message: "예약을 찾을 수 없습니다." }, 404, headers);
    if (reservation.profile_id !== user.id) return json({ ok: false, message: "본인 예약만 취소할 수 있습니다." }, 403, headers);
    if (reservation.status === "canceled") return json({ ok: true, alreadyCanceled: true }, 200, headers);

    // 3) Policy: only before the reservation start time (KST).
    const start = new Date(`${reservation.date}T${(reservation.start_time ?? "00:00").slice(0, 5)}:00+09:00`);
    if (Number.isFinite(start.getTime()) && Date.now() >= start.getTime()) {
      return json({ ok: false, message: "예약 시간이 지나 취소·환불이 불가합니다." }, 400, headers);
    }

    const wasPaid = reservation.payment_status === "paid" && Boolean(reservation.payment_key);

    // 4) If paid, refund through Toss before updating the reservation.
    if (wasPaid) {
      if (!TOSS_SECRET_KEY) return json({ ok: false, message: "결제 설정이 완료되지 않았습니다." }, 500, headers);
      const cancel = await fetch(`https://api.tosspayments.com/v1/payments/${reservation.payment_key}/cancel`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${TOSS_SECRET_KEY}:`)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cancelReason: "고객 예약 취소" }),
      });
      const result = (await cancel.json()) as { code?: string; message?: string };
      if (!cancel.ok) {
        console.error("[refund-reservation] toss error", { status: cancel.status, code: result?.code ?? "unknown" });
        return json({ ok: false, message: result?.message ?? "환불 처리에 실패했습니다." }, 400, headers);
      }
    }

    // 5) Mark the reservation canceled (and refunded if it was paid).
    const patch = wasPaid ? { status: "canceled", payment_status: "refunded" } : { status: "canceled" };
    await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${reservationId}`, {
      method: "PATCH",
      headers: { ...serviceHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });

    return json({ ok: true, refunded: wasPaid }, 200, headers);
  } catch (error) {
    console.error("[refund-reservation] handler error", { message: errorMessage(error) });
    return json({ ok: false, message: "취소 처리 중 오류가 발생했습니다." }, 500, corsHeaders(request));
  }
});
