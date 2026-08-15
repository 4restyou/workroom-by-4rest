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
//   PORTONE_WEBHOOK_SECRET         - 포트원 콘솔 > 웹훅의 시크릿 (whsec_...)
//   SUPABASE_URL                   - (auto-provided)
//   SUPABASE_SERVICE_ROLE_KEY      - (auto-provided)
//   SUPABASE_ANON_KEY              - (auto-provided)
//   ALLOWED_ORIGINS                - optional comma-separated browser origins
//
// Deploy: main에 올라가면 .github/workflows/supabase-functions.yml 이 자동 배포한다.
//         수동: supabase functions deploy portone-payment --no-verify-jwt
//   (웹훅은 Supabase 인증 헤더 없이 오므로 --no-verify-jwt 필수. 대신 웹훅은
//    Standard Webhooks 서명으로, refund는 사용자 JWT로 관리자 여부를 검증한다.
//    confirm은 결제 정보를 포트원 API로 재조회해 금액을 대조하므로 호출 자체는
//    막지 않는다 — Origin 헤더는 인증 수단이 아니라 CORS 응답 계산에만 쓴다.)

import { decidePaymentConfirmation, isPaymentId, isUuid } from "../_shared/paymentRules.ts";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_WEBHOOK_SECRET = Deno.env.get("PORTONE_WEBHOOK_SECRET") ?? "";
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

const serviceHeaders = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

// ── 웹훅 서명 검증 (Standard Webhooks, 포트원 V2가 따르는 규격) ──────────
// 서명 대상은 `{webhook-id}.{webhook-timestamp}.{raw body}` 이고, 시크릿은
// `whsec_` 접두사를 뗀 base64를 그대로 HMAC 키로 쓴다.
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyWebhookSignature(request: Request, rawBody: string): Promise<boolean> {
  if (!PORTONE_WEBHOOK_SECRET) return false;

  const webhookId = request.headers.get("webhook-id") ?? "";
  const timestamp = request.headers.get("webhook-timestamp") ?? "";
  const signatureHeader = request.headers.get("webhook-signature") ?? "";
  if (!webhookId || !timestamp || !signatureHeader) return false;

  // 재전송(replay) 방지: 허용 오차를 벗어난 타임스탬프는 거절한다.
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;
  if (Math.abs(Date.now() / 1000 - sentAt) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const rawSecret = PORTONE_WEBHOOK_SECRET.startsWith("whsec_")
    ? PORTONE_WEBHOOK_SECRET.slice("whsec_".length)
    : PORTONE_WEBHOOK_SECRET;

  let keyBytes: Uint8Array;
  try {
    keyBytes = Uint8Array.from(atob(rawSecret), (char) => char.charCodeAt(0));
  } catch {
    console.error("[portone-payment] webhook secret is not valid base64");
    return false;
  }

  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${webhookId}.${timestamp}.${rawBody}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(signed)));

  // 헤더에는 `v1,<sig>` 형태가 공백으로 여러 개 올 수 있다 (키 회전 중).
  return signatureHeader
    .split(" ")
    .map((entry) => entry.split(",")[1] ?? "")
    .filter(Boolean)
    .some((candidate) => timingSafeEqual(candidate, expected));
}

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

// 성공한 환불 금액의 합계. 부분 환불 한도 계산에 쓴다.
async function sumSucceededRefunds(reservationId: string): Promise<number> {
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/reservation_payment_logs?reservation_id=eq.${reservationId}&action=eq.refund&status=eq.succeeded&select=amount`,
      { headers: serviceHeaders },
    );
    if (!resp.ok) return Number.NaN;
    const rows = (await resp.json()) as Array<{ amount: number | null }>;
    return rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  } catch {
    // 합계를 못 구하면 한도를 알 수 없다 — 호출부가 환불을 막도록 NaN을 돌려준다.
    return Number.NaN;
  }
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

// 카드사 앱으로 넘어갔다 오는 결제(앱 전환)는 결제창이 닫힌 뒤에도 승인 반영이
// 1~2초 늦다. 그 순간 조회하면 아직 READY/PENDING이라 "결제가 완료되지 않았습니다"로
// 실패 처리되는데, 실제로는 곧 승인된다. 손님은 실패한 줄 알고 다시 결제하려 한다.
const PENDING_STATUSES = new Set(["READY", "PENDING", "PAY_PENDING"]);

function isPendingStatus(status: string | undefined) {
  return PENDING_STATUSES.has(status ?? "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// 결제 검증: PortOne에서 결제를 조회해 예약과 대조 후 결제완료·예약확정 반영.
async function confirmPayment(paymentId: string): Promise<{ ok: boolean; status: number; message: string; pending?: boolean }> {
  let payment = await fetchPortonePayment(paymentId);
  if (!payment) return { ok: false, status: 404, message: "결제 정보를 찾을 수 없습니다." };

  // 아직 승인 반영 전이면 잠깐 기다렸다 다시 본다. 조회만 반복하므로 중복 청구
  // 위험은 없다.
  for (let attempt = 0; attempt < 3 && isPendingStatus(payment.status); attempt += 1) {
    await sleep(1200);
    payment = (await fetchPortonePayment(paymentId)) ?? payment;
  }

  const reservationId = reservationIdFromCustomData(payment);
  if (!reservationId) return { ok: false, status: 400, message: "결제에 연결된 예약 정보가 없습니다." };

  const reservation = await getReservation(reservationId);
  if (!reservation) return { ok: false, status: 404, message: "예약을 찾을 수 없습니다." };

  const paidAmount = Number(payment.amount?.total ?? 0);
  // 판정은 순수 규칙 모듈에 맡긴다(테스트 대상: src/lib/paymentRules.test.ts).
  const decision = decidePaymentConfirmation({
    reservationStatus: reservation.status,
    reservationPaymentStatus: reservation.payment_status,
    priceAtBooking: reservation.price_at_booking,
    providerStatus: payment.status,
    providerCurrency: payment.currency,
    providerAmount: paidAmount,
  });

  if (decision.kind === "confirm_only") {
    const updated = await updateReservation(reservationId, { status: "confirmed" });
    if (!updated) {
      await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, action: "confirm", status: "failed", provider_code: "DB_UPDATE_FAILED", message: "결제 완료 예약의 자동 확정에 실패했습니다." });
      return { ok: false, status: 500, message: "결제는 완료되었지만 예약 확정에 실패했습니다. 운영자에게 문의해 주세요." };
    }
    await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, action: "confirm", status: "skipped", provider_code: decision.code, message: "결제 완료 예약을 자동 확정했습니다." });
    return { ok: true, status: 200, message: "결제가 확인되어 예약이 확정되었습니다." };
  }

  if (decision.kind === "noop") {
    await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, action: "confirm", status: "skipped", provider_code: decision.code, message: "이미 결제 완료된 예약입니다." });
    return { ok: true, status: 200, message: "이미 결제 완료된 예약입니다." };
  }

  if (decision.kind === "reject") {
    // 재시도 후에도 승인 대기면 실패가 아니라 '지연'이다. 웹훅(Transaction.Paid)이
    // 뒤늦게 도착하면 이 함수가 다시 호출돼 예약이 확정되므로, 손님에게 실패라고
    // 말하면 안 된다(다시 결제하려다 이중 결제가 난다).
    if (isPendingStatus(payment.status)) {
      await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, action: "confirm", status: "skipped", amount: paidAmount, provider_code: payment.status ?? "PENDING", message: "승인 확인 대기 — 웹훅으로 반영 예정" });
      return {
        ok: false,
        pending: true,
        status: 200,
        message: "결제 승인 확인이 조금 늦어지고 있습니다. 결제가 완료되었다면 잠시 뒤 예약현황에 자동으로 반영됩니다. 다시 결제하지 말아 주세요.",
      };
    }
    await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, action: "confirm", status: "failed", amount: paidAmount, provider_code: decision.code, message: decision.message });
    return {
      ok: false,
      status: 400,
      message: decision.code === "AMOUNT_MISMATCH" ? "결제 금액이 예약 금액과 일치하지 않습니다." : "결제가 완료되지 않았습니다.",
    };
  }

  const canAutoConfirm = decision.autoConfirm;
  const updated = await updateReservation(reservationId, {
    payment_status: "paid",
    payment_method: "포트원 결제",
    payment_key: paymentId,
    ...(canAutoConfirm ? { status: "confirmed" } : {}),
  });
  if (!updated) {
    await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, action: "confirm", status: "failed", amount: paidAmount, provider_code: "DB_UPDATE_FAILED", message: "예약 결제 상태 반영에 실패했습니다." });
    return { ok: false, status: 500, message: "결제는 완료되었지만 반영에 실패했습니다. 운영자에게 문의해 주세요." };
  }

  await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, action: "confirm", status: "succeeded", amount: paidAmount, message: canAutoConfirm ? "포트원 결제 확인 및 예약 자동확정 완료" : `결제 확인 완료 · 예약 상태 ${reservation.status}` });
  return {
    ok: true,
    status: 200,
    message: canAutoConfirm ? "결제가 완료되어 예약이 확정되었습니다." : "결제는 완료되었으며 예약 상태는 운영자가 확인합니다.",
  };
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });

  try {
    if (request.method !== "POST") return json({ ok: false, message: "허용되지 않은 요청 방식입니다." }, 405, headers);
    if (!PORTONE_API_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
      return json({ ok: false, message: "결제 설정이 완료되지 않았습니다." }, 500, headers);
    }

    // 서명 검증은 원문(raw body)에 대해 이뤄지므로 텍스트로 한 번만 읽는다.
    const rawBody = await request.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return json({ ok: false, message: "잘못된 요청입니다." }, 400, headers);
    }
    const type = typeof body.type === "string" ? body.type : "";

    // ---- PortOne 웹훅 (Transaction.Paid 등): paymentId만 힌트로 받아 재검증 ----
    if (type.startsWith("Transaction.")) {
      // Fail closed. 시크릿이 없거나 서명이 맞지 않으면 처리하지 않는다.
      // 결제 자체는 사용자 브라우저의 confirm 경로로도 반영되므로, 서명 미설정
      // 상태에서 웹훅을 통과시키는 것보다 거절하는 편이 안전하다.
      if (!(await verifyWebhookSignature(request, rawBody))) {
        console.error("[portone-payment] webhook signature rejected");
        return json({ ok: false, message: "서명 검증에 실패했습니다." }, 401, headers);
      }
      const data = (body.data ?? {}) as Record<string, unknown>;
      const paymentId = data.paymentId;
      if (!isPaymentId(paymentId)) return json({ ok: false }, 400, headers);
      if (type === "Transaction.Paid") await confirmPayment(paymentId);
      // 그 외 이벤트는 조용히 수신 확인만 (환불 웹훅 등은 운영자 확인 흐름 유지)
      return json({ ok: true }, 200, headers);
    }

    // ---- 결제창 완료 후 클라이언트 검증 요청 ----
    if (type === "confirm") {
      // Origin 검사는 브라우저발 오·남용을 줄이는 보조 장치일 뿐 인증이 아니다.
      // (Origin 헤더는 비브라우저 클라이언트에서 얼마든지 생략·위조된다.)
      // 실제 안전장치는 아래 confirmPayment의 포트원 API 재조회 + 금액 대조다.
      const origin = request.headers.get("Origin");
      if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, message: "허용되지 않은 요청입니다." }, 403, headers);
      const paymentId = body.paymentId;
      if (!isPaymentId(paymentId)) return json({ ok: false, message: "잘못된 결제 요청입니다." }, 400, headers);
      const result = await confirmPayment(paymentId);
      return json({ ok: result.ok, pending: result.pending ?? false, message: result.message }, result.status, headers);
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

      // 부분 환불(장기 이용권 중도 해지 일할 계산 등). 금액을 주지 않으면 전액 취소.
      // 결제 금액을 넘는 요청은 거부한다 — 초과 환불은 되돌릴 수 없다.
      const paidAmount = Number(reservation.price_at_booking ?? 0);

      // 이미 환불한 금액을 합산해 남은 한도를 구한다. 부분 환불은 payment_status를
      // paid로 두기 때문에, 누적을 보지 않으면 같은 예약을 결제액만큼 반복해서
      // 환불할 수 있다(PG가 막아 주기 전까지 애플리케이션은 알지 못한다).
      const refundedSoFar = await sumSucceededRefunds(reservationId);
      if (!Number.isFinite(refundedSoFar)) {
        return json({ ok: false, message: "환불 이력을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503, headers);
      }
      const refundable = Math.max(0, paidAmount - refundedSoFar);
      if (refundable <= 0) {
        return json({ ok: false, message: "이미 전액 환불된 예약입니다." }, 400, headers);
      }

      const requestedAmount = typeof body.amount === "number" && Number.isFinite(body.amount) ? Math.floor(body.amount) : null;
      if (requestedAmount !== null && (requestedAmount <= 0 || requestedAmount > refundable)) {
        return json({ ok: false, message: `환불 금액은 1원 이상 남은 환불 가능액(${refundable}원) 이하여야 합니다.` }, 400, headers);
      }
      const refundAmount = requestedAmount ?? refundable;
      // 누적 환불이 결제액에 도달하면 전액 환불로 취급한다.
      const isPartial = refundedSoFar + refundAmount < paidAmount;

      await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, actor_id: user.id, action: "refund", status: "requested", amount: refundAmount, message: reason });

      const cancel = await fetch(`https://api.portone.io/payments/${encodeURIComponent(reservation.payment_key)}/cancel`, {
        method: "POST",
        headers: { Authorization: `PortOne ${PORTONE_API_SECRET}`, "Content-Type": "application/json" },
        body: JSON.stringify(isPartial ? { reason, amount: refundAmount } : { reason }),
      });
      if (!cancel.ok) {
        const detail = (await cancel.json().catch(() => null)) as { type?: string; message?: string } | null;
        await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, actor_id: user.id, action: "refund", status: "failed", amount: refundAmount, provider_code: detail?.type ?? String(cancel.status), message: detail?.message ?? "포트원 환불 실패" });
        return json({ ok: false, message: "환불 처리에 실패했습니다. 포트원 콘솔에서 상태를 확인해 주세요." }, 502, headers);
      }

      // 부분 환불은 결제가 남아 있으므로 paid를 유지한다(전액일 때만 refunded).
      if (!isPartial) await updateReservation(reservationId, { payment_status: "refunded" });
      await recordPaymentLog({ reservation_id: reservationId, profile_id: reservation.profile_id, actor_id: user.id, action: "refund", status: "succeeded", amount: refundAmount, message: isPartial ? `부분 환불 ${refundAmount}원 · ${reason}` : reason });
      return json({ ok: true, message: isPartial ? `${refundAmount.toLocaleString("ko-KR")}원을 환불했습니다.` : "환불이 완료되었습니다." }, 200, headers);
    }

    return json({ ok: false, message: "알 수 없는 요청입니다." }, 400, headers);
  } catch (error) {
    console.error("[portone-payment] error", { message: errorMessage(error) });
    return json({ ok: false, message: "처리 중 오류가 발생했습니다." }, 500, headers);
  }
});
