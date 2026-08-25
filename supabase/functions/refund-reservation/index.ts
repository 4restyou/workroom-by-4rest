// Supabase Edge Function: cancel a member's own reservation and, if it was
// paid, refund it through PortOne(V2). Called by 예약현황 when a member cancels.
//
// 요청 형태 (POST JSON):
//   { reservationId, reason? }   - 회원 JWT 필수. 본인 예약만.
//
// Policy: cancellation (and refund) is only allowed BEFORE the reservation
// start time (KST). After the start time the request is rejected — this mirrors
// the DB trigger `guard_reservation_member_update`, which is the real gate.
//
// 월권 정기결제가 걸린 예약을 취소하면 연결된 구독도 함께 해지한다. 그러지
// 않으면 취소된 예약에 대해 카드가 계속 청구된다.
//
// Required secrets:
//   PORTONE_API_SECRET             - 포트원 V2 API Secret
//   SUPABASE_URL                   - (auto-provided)
//   SUPABASE_SERVICE_ROLE_KEY      - (auto-provided)
//   SUPABASE_ANON_KEY              - (auto-provided)
//   ALLOWED_ORIGINS                - optional comma-separated browser origins
//
// Deploy: main에 올라가면 .github/workflows/supabase-functions.yml 이 자동 배포한다.
//         수동: supabase functions deploy refund-reservation
//   (Verify JWT ON. Origin은 CORS 응답 헤더 계산에만 쓰고 인증으로 쓰지 않는다.)

import { decideCancellation, isUuid } from "../_shared/paymentRules.ts";

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

const serviceHeaders = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

type PaymentLog = {
  reservation_id: string;
  profile_id?: string | null;
  actor_id?: string | null;
  action: "refund";
  status: "requested" | "succeeded" | "failed" | "skipped";
  amount?: number | null;
  provider_code?: string | null;
  message?: string | null;
};

async function recordPaymentLog(log: PaymentLog) {
  if (!SUPABASE_URL || !SERVICE_ROLE || !isUuid(log.reservation_id)) return;

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
    console.error("[refund-reservation] payment log error", { message: errorMessage(error) });
  }
}

// 예약에 걸린 활성 구독을 함께 해지한다. 실패해도 취소·환불 자체는 진행하고
// 로그만 남긴다 (돈이 이미 돌아간 뒤 되돌릴 수 없으므로).
async function cancelLinkedSubscriptions(reservationId: string): Promise<number> {
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?reservation_id=eq.${reservationId}&status=eq.active`,
      {
        method: "PATCH",
        headers: { ...serviceHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ status: "canceled", canceled_at: new Date().toISOString(), next_charge_at: null }),
      },
    );
    if (!resp.ok) return 0;
    const rows = (await resp.json()) as unknown[];
    return Array.isArray(rows) ? rows.length : 0;
  } catch (error) {
    console.error("[refund-reservation] subscription cancel error", { message: errorMessage(error) });
    return 0;
  }
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });

  try {
    if (request.method !== "POST") return json({ ok: false, message: "허용되지 않은 요청 방식입니다." }, 405, headers);
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, message: "서버 설정이 완료되지 않았습니다." }, 500, headers);

    // 1) 호출자를 액세스 토큰으로 식별한다. Origin은 인증 수단이 아니다.
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "로그인이 필요합니다." }, 401, headers);
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: ANON } });
    const user = (await userResp.json()) as { id?: string };
    if (!userResp.ok || !isUuid(user?.id)) return json({ ok: false, message: "인증에 실패했습니다." }, 401, headers);

    const body = (await request.json()) as Record<string, unknown>;
    const reservationId = body.reservationId;
    if (!isUuid(reservationId)) return json({ ok: false, message: "잘못된 요청입니다." }, 400, headers);
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 200) : "회원 예약 취소";

    // 2) 서비스 롤로 예약을 조회한다.
    const lookup = await fetch(
      `${SUPABASE_URL}/rest/v1/reservations?id=eq.${reservationId}&select=id,profile_id,status,payment_status,payment_key,price_at_booking,date,start_time`,
      { headers: serviceHeaders },
    );
    const rows = (await lookup.json()) as Array<{
      profile_id: string | null;
      status: string;
      payment_status: string | null;
      payment_key: string | null;
      price_at_booking: number | null;
      date: string;
      start_time: string | null;
    }>;
    const reservation = Array.isArray(rows) ? rows[0] : null;
    if (!reservation) {
      await recordPaymentLog({
        reservation_id: reservationId,
        actor_id: user.id,
        action: "refund",
        status: "failed",
        provider_code: "RESERVATION_NOT_FOUND",
        message: "예약을 찾을 수 없습니다.",
      });
      return json({ ok: false, message: "예약을 찾을 수 없습니다." }, 404, headers);
    }
    // 3) 소유권·시점·환불 여부 판정은 순수 규칙 모듈에 맡긴다
    //    (테스트 대상: src/lib/paymentRules.test.ts).
    const decision = decideCancellation({
      ownerId: reservation.profile_id,
      callerId: user.id,
      status: reservation.status,
      paymentStatus: reservation.payment_status,
      paymentKey: reservation.payment_key,
      date: reservation.date,
      startTime: reservation.start_time,
      nowMs: Date.now(),
    });

    if (decision.kind === "already_canceled") {
      return json({ ok: true, alreadyCanceled: true, message: "이미 취소된 예약입니다." }, 200, headers);
    }
    if (decision.kind === "reject") {
      await recordPaymentLog({
        reservation_id: reservationId,
        profile_id: reservation.profile_id,
        actor_id: user.id,
        action: "refund",
        status: "failed",
        amount: reservation.price_at_booking,
        provider_code: decision.code,
        message: decision.message,
      });
      return json({ ok: false, message: decision.message }, decision.status, headers);
    }

    const wasPaid = decision.refund;

    // 4) 결제건이면 예약을 건드리기 전에 PortOne 환불을 먼저 실행한다.
    //    (먼저 취소로 바꿨다가 환불이 실패하면 돈만 남는 상태가 된다.)
    if (wasPaid) {
      if (!PORTONE_API_SECRET) {
        await recordPaymentLog({
          reservation_id: reservationId,
          profile_id: reservation.profile_id,
          actor_id: user.id,
          action: "refund",
          status: "failed",
          amount: reservation.price_at_booking,
          provider_code: "MISSING_PORTONE_SECRET",
          message: "PortOne API secret이 설정되지 않았습니다.",
        });
        return json({ ok: false, message: "결제 설정이 완료되지 않았습니다. 운영자에게 문의해 주세요." }, 500, headers);
      }

      await recordPaymentLog({
        reservation_id: reservationId,
        profile_id: reservation.profile_id,
        actor_id: user.id,
        action: "refund",
        status: "requested",
        amount: reservation.price_at_booking,
        message: reason,
      });

      const cancel = await fetch(
        `https://api.portone.io/payments/${encodeURIComponent(reservation.payment_key!)}/cancel`,
        {
          method: "POST",
          headers: { Authorization: `PortOne ${PORTONE_API_SECRET}`, "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      if (!cancel.ok) {
        const detail = (await cancel.json().catch(() => null)) as { type?: string; message?: string } | null;
        console.error("[refund-reservation] portone error", { status: cancel.status, type: detail?.type ?? "unknown" });
        await recordPaymentLog({
          reservation_id: reservationId,
          profile_id: reservation.profile_id,
          actor_id: user.id,
          action: "refund",
          status: "failed",
          amount: reservation.price_at_booking,
          provider_code: detail?.type ?? String(cancel.status),
          message: detail?.message ?? "포트원 환불 실패",
        });
        return json(
          { ok: false, message: "환불 처리에 실패해 예약을 취소하지 않았습니다. 잠시 후 다시 시도하거나 운영자에게 문의해 주세요." },
          502,
          headers,
        );
      }
    }

    // 5) 예약을 취소(결제건은 환불) 상태로 반영한다.
    const patch = wasPaid ? { status: "canceled", payment_status: "refunded" } : { status: "canceled" };
    const update = await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${reservationId}`, {
      method: "PATCH",
      headers: { ...serviceHeaders, Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    // 환불했으면 그때 쓴 쿠폰도 돌려준다. 할인을 쓰지 않은 셈이 되어야 한다.
    if (wasPaid) {
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/restore_reservation_coupon`, {
        method: "POST",
        headers: { ...serviceHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ p_reservation_id: reservationId }),
      }).catch((error) => console.error("[refund-reservation] restore coupon failed", { message: String(error) }));
    }

    if (!update.ok) {
      await recordPaymentLog({
        reservation_id: reservationId,
        profile_id: reservation.profile_id,
        actor_id: user.id,
        action: "refund",
        status: "failed",
        amount: reservation.price_at_booking,
        provider_code: "RESERVATION_UPDATE_FAILED",
        message: wasPaid
          ? "포트원 환불 후 예약 취소 상태 업데이트에 실패했습니다."
          : "예약 취소 상태 업데이트에 실패했습니다.",
      });
      return json(
        {
          ok: false,
          message: wasPaid
            ? "환불은 완료되었지만 예약 상태 반영에 실패했습니다. 운영자에게 문의해 주세요."
            : "취소 처리를 예약에 반영하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        },
        500,
        headers,
      );
    }

    // 6) 월권 정기결제가 걸려 있으면 함께 해지한다.
    const canceledSubscriptions = await cancelLinkedSubscriptions(reservationId);

    await recordPaymentLog({
      reservation_id: reservationId,
      profile_id: reservation.profile_id,
      actor_id: user.id,
      action: "refund",
      status: wasPaid ? "succeeded" : "skipped",
      amount: reservation.price_at_booking,
      provider_code: wasPaid ? "REFUNDED" : "UNPAID_CANCELED",
      message: [
        wasPaid ? "포트원 환불이 완료되었습니다." : "미결제 예약이라 결제 환불 없이 취소되었습니다.",
        canceledSubscriptions > 0 ? `연결된 정기결제 ${canceledSubscriptions}건을 함께 해지했습니다.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    });

    return json(
      {
        ok: true,
        refunded: wasPaid,
        canceledSubscriptions,
        message: wasPaid ? "예약이 취소되고 결제 금액이 환불되었습니다." : "예약이 취소되었습니다.",
      },
      200,
      headers,
    );
  } catch (error) {
    console.error("[refund-reservation] handler error", { message: errorMessage(error) });
    return json({ ok: false, message: "취소 처리 중 오류가 발생했습니다." }, 500, headers);
  }
});
