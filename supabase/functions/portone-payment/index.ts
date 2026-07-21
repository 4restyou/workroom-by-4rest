// Supabase Edge Function: PortOne(V2) 결제 검증·환불·웹훅.
//
// 요청 형태 (POST JSON):
//   { type: "confirm", paymentId }            - 결제창 완료 후 서버 검증 → 결제완료 반영
//   { type: "refund", reservationId, reason } - 관리자 전용, PG 환불 실행
//   { type: "Transaction.*", data: {...} }    - PortOne 웹훅 (콘솔에 URL 등록)
//
// 검증 원칙: 클라이언트/웹훅이 보낸 값은 힌트일 뿐, 금액·상태는 반드시
// PortOne API(시크릿 키)로 다시 조회해 예약(price_at_booking)과 대조한다.
//
// Required secrets:
//   PORTONE_API_SECRET             - 포트원 V2 API Secret
//   SUPABASE_URL                   - (auto-provided)
//   SUPABASE_SERVICE_ROLE_KEY      - (auto-provided)
//   SUPABASE_ANON_KEY              - (auto-provided)
//   ALLOWED_ORIGINS                - optional comma-separated browser origins
//
// Deploy: supabase functions deploy portone-payment --no-verify-jwt
//   (웹훅은 인증 헤더 없이 오므로 --no-verify-jwt 필수. confirm은 Origin 검사,
//    refund는 사용자 JWT로 관리자 여부를 직접 검증한다.)

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://work-room.kr",
  "https://www.work-room.kr",
  "https://workroomby4rest.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
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

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPaymentId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 120 && /^[A-Za-z0-9_-]+$/.test(value);
}

const serviceHeaders = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

type ReservationRow = {
  id: string;
  profile_id: string | null;
  status: string;
  payment_status: string | null;
  price_at_booking: number | null;
  payment_key: string | null;
};

async function getReservation(id: string): Promise<ReservationRow | null> {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/reservations?id=eq.${id}&select=id,profile_id,status,payment_status,price_at_booking,payment_key`,
    { headers: serviceHeaders },
  );
  const rows = (await resp.json()) as ReservationRow[];
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function updateReservation(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...serviceHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  return resp.ok;
}

async function recordPaymentLog(log: {
  reservation_id: string;
  profile_id?: string | null;
  actor_id?: string | null;
  action: "confirm" | "refund";
  status: "requested" | "succeeded" | "failed" | "skipped";
  amount?: number | null;
  provider_code?: string | null;
  message?: string | null;
}) {
  if (!isUuid(log.reservation_id)) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/reservation_payment_logs`, {
      method: "POST",
      headers: { ...serviceHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        reservation_id: log.reservation_id,
        profile_id: log.profile_id ?? null,
        actor_id: log.actor_id ?? null,
        action: log.action,
        status: log.status,
        amount: log.amount ?? null,
        provider: "portone",
        provider_code: log.provider_code ?? null,
        message: log.message ?? null,
      }),
    });
  } catch (error) {
    console.error("[portone-payment] log error", { message: errorMessage(error) });
  }
}

type PortonePayment = {
  status?: string;
  amount?: { total?: number };
  currency?: string;
  customData?: string | null;
};

async function fetchPortonePayment(paymentId: string): Promise<PortonePayment | null> {
  const resp = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` },
  });
  if (!resp.ok) return null;
  return (await resp.json()) as PortonePayment;
}

function reservationIdFromCustomData(payment: PortonePayment): string | null {
  try {
    const parsed = JSON.parse(payment.customData ?? "");
    return isUuid(parsed?.reservationId) ? parsed.reservationId : null;
  } catch {
    return null;
  }
}

// 결제 검증: PortOne에서 결제를 조회해 예약과 대조 후 결제완료 반영.
async function confirmPayment(paymentId: string): Promise<{ ok: boolean; status: number; message: string }> {
  const payment = await fetchPortonePayment(paymentId);
  if (!payment) return { ok: false, status: 404, message: "결제 정보를 찾을 수 없습니다." };

  const reservationId = reservationIdFromCustomData(payment);
  if (!reservationId) return { ok: false, status: 400, message: "결제에 연결된 예약 정보가 없습니다." };

  const reservation = await getReservation(reservationId);
  if (!reservation) return { ok: false, status: 404, message: "예약을 찾을 수 없습니다." };

  if (reservation.payment_status === "paid") {
    await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, action: "confirm", status: "skipped", provider_code: "ALREADY_PAID", message: "이미 결제 완료된 예약입니다." });
    return { ok: true, status: 200, message: "이미 결제 완료된 예약입니다." };
  }
  if (reservation.status !== "confirmed") {
    await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, action: "confirm", status: "failed", provider_code: "RESERVATION_NOT_CONFIRMED", message: "확정되지 않은 예약 결제 시도입니다." });
    return { ok: false, status: 400, message: "확정된 예약만 결제할 수 있습니다." };
  }
  if (payment.status !== "PAID") {
    await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, action: "confirm", status: "failed", provider_code: payment.status ?? "UNKNOWN", message: "결제가 완료 상태가 아닙니다." });
    return { ok: false, status: 400, message: "결제가 완료되지 않았습니다." };
  }
  const paidAmount = Number(payment.amount?.total ?? 0);
  if (payment.currency !== "KRW" || paidAmount !== Number(reservation.price_at_booking)) {
    await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, action: "confirm", status: "failed", amount: paidAmount, provider_code: "AMOUNT_MISMATCH", message: `결제 금액(${paidAmount})이 예약 금액(${reservation.price_at_booking})과 다릅니다.` });
    return { ok: false, status: 400, message: "결제 금액이 예약 금액과 일치하지 않습니다." };
  }

  const updated = await updateReservation(reservationId, {
    payment_status: "paid",
    payment_method: "포트원 결제",
    payment_key: paymentId,
  });
  if (!updated) {
    await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, action: "confirm", status: "failed", amount: paidAmount, provider_code: "DB_UPDATE_FAILED", message: "예약 결제 상태 반영에 실패했습니다." });
    return { ok: false, status: 500, message: "결제는 완료되었지만 반영에 실패했습니다. 운영자에게 문의해 주세요." };
  }

  await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, action: "confirm", status: "succeeded", amount: paidAmount, message: "포트원 결제 확인 완료" });
  return { ok: true, status: 200, message: "결제가 완료되었습니다." };
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });

  try {
    if (request.method !== "POST") return json({ ok: false, message: "허용되지 않은 요청 방식입니다." }, 405, headers);
    if (!PORTONE_API_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
      return json({ ok: false, message: "결제 설정이 완료되지 않았습니다." }, 500, headers);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const type = typeof body.type === "string" ? body.type : "";

    // ---- PortOne 웹훅 (Transaction.Paid 등): paymentId만 힌트로 받아 재검증 ----
    if (type.startsWith("Transaction.")) {
      const data = (body.data ?? {}) as Record<string, unknown>;
      const paymentId = data.paymentId;
      if (!isPaymentId(paymentId)) return json({ ok: false }, 400, headers);
      if (type === "Transaction.Paid") await confirmPayment(paymentId);
      // 그 외 이벤트는 조용히 수신 확인만 (환불 웹훅 등은 운영자 확인 흐름 유지)
      return json({ ok: true }, 200, headers);
    }

    // ---- 결제창 완료 후 클라이언트 검증 요청 ----
    if (type === "confirm") {
      const origin = request.headers.get("Origin");
      if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, message: "허용되지 않은 요청입니다." }, 403, headers);
      const paymentId = body.paymentId;
      if (!isPaymentId(paymentId)) return json({ ok: false, message: "잘못된 결제 요청입니다." }, 400, headers);
      const result = await confirmPayment(paymentId);
      return json({ ok: result.ok, message: result.message }, result.status, headers);
    }

    // ---- 관리자 환불 ----
    if (type === "refund") {
      const authHeader = request.headers.get("Authorization") ?? "";
      const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: ANON } });
      if (!userResp.ok) return json({ ok: false, message: "로그인이 필요합니다." }, 401, headers);
      const user = (await userResp.json()) as { id?: string };
      if (!isUuid(user.id)) return json({ ok: false, message: "로그인이 필요합니다." }, 401, headers);

      const profileResp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: serviceHeaders });
      const profiles = (await profileResp.json()) as Array<{ role?: string }>;
      if (profiles?.[0]?.role !== "admin") return json({ ok: false, message: "관리자만 환불할 수 있습니다." }, 403, headers);

      const reservationId = body.reservationId;
      if (!isUuid(reservationId)) return json({ ok: false, message: "잘못된 요청입니다." }, 400, headers);
      const reservation = await getReservation(reservationId);
      if (!reservation) return json({ ok: false, message: "예약을 찾을 수 없습니다." }, 404, headers);
      if (reservation.payment_status !== "paid" || !isPaymentId(reservation.payment_key)) {
        return json({ ok: false, message: "포트원으로 결제된 예약이 아닙니다." }, 400, headers);
      }

      const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : "운영자 환불 처리";
      await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, actor_id: user.id, action: "refund", status: "requested", amount: reservation.price_at_booking, message: reason });

      const cancel = await fetch(`https://api.portone.io/payments/${encodeURIComponent(reservation.payment_key)}/cancel`, {
        method: "POST",
        headers: { Authorization: `PortOne ${PORTONE_API_SECRET}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!cancel.ok) {
        const detail = (await cancel.json().catch(() => null)) as { type?: string; message?: string } | null;
        await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, actor_id: user.id, action: "refund", status: "failed", amount: reservation.price_at_booking, provider_code: detail?.type ?? String(cancel.status), message: detail?.message ?? "포트원 환불 실패" });
        return json({ ok: false, message: "환불 처리에 실패했습니다. 포트원 콘솔에서 상태를 확인해 주세요." }, 502, headers);
      }

      await updateReservation(reservationId, { payment_status: "refunded" });
      await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, actor_id: user.id, action: "refund", status: "succeeded", amount: reservation.price_at_booking, message: reason });
      return json({ ok: true, message: "환불이 완료되었습니다." }, 200, headers);
    }

    return json({ ok: false, message: "알 수 없는 요청입니다." }, 400, headers);
  } catch (error) {
    console.error("[portone-payment] error", { message: errorMessage(error) });
    return json({ ok: false, message: "처리 중 오류가 발생했습니다." }, 500, headers);
  }
});
