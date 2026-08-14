// Supabase Edge Function: send an SMS via Solapi (CoolSMS) when a reservation
// is created or its status changes.
//
// Triggered by a Supabase Database Webhook on the `reservations` table
// (INSERT + UPDATE). See supabase/README.md for deployment + setup.
//
// Required function secrets:
//   SOLAPI_API_KEY     - Solapi API key
//   SOLAPI_API_SECRET  - Solapi API secret
//   SMS_SENDER         - registered sender number (e.g. 01049313298)
//   ADMIN_PHONE        - operator phone for new-reservation alerts (optional)
//   WEBHOOK_SECRET     - optional shared secret checked against
//                        x-workroom-webhook-secret
//
// If the Solapi secrets are missing the function logs and no-ops, so it is
// safe to wire up the webhook before finishing provider setup.

type ReservationRow = {
  id: string;
  name: string;
  phone: string;
  status: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  pass_type: string;
  pass_name_snapshot: string | null;
  payment_preference: "online" | "onsite" | null;
  payment_status: string | null;
  payment_method: string | null;
  price_at_booking: number | null;
  people: number | null;
};

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: ReservationRow | null;
  old_record: ReservationRow | null;
};

const SOLAPI_API_KEY = Deno.env.get("SOLAPI_API_KEY") ?? "";
const SOLAPI_API_SECRET = Deno.env.get("SOLAPI_API_SECRET") ?? "";
const SMS_SENDER = (Deno.env.get("SMS_SENDER") ?? "").replace(/\D/g, "");
const ADMIN_PHONE = (Deno.env.get("ADMIN_PHONE") ?? "").replace(/\D/g, "");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://work-room.kr";
const DOOR_PASSWORD = Deno.env.get("DOOR_PASSWORD") ?? "";
// 확정 문자는 손님이 손에 쥐는 안내문이다. 사이트 약관(주간권은 남은 일수,
// 월권은 남은 주 단위 정산)과 다르게 "환불 불가"라고 적혀 있으면 중도 해지 때
// 분쟁의 빌미가 된다. src/lib/site.ts 의 cancellationSummary와 같은 내용을 쓴다.
const REFUND_NOTICE = Deno.env.get("REFUND_NOTICE") ?? "이용 시작 전 취소는 전액 환불됩니다. 시작 후에는 시간권·종일권은 환불이 어렵고, 주간권은 남은 일수·월권은 남은 주 단위로 정산해 환불합니다. (자세한 규정은 홈페이지 이용약관)";
// 온라인 결제(PG) 정식 오픈 여부. src/lib/site.ts 의 onlinePaymentLive와 함께 맞춰준다.
const ONLINE_PAYMENT_LIVE = true;
const ONLINE_PAYMENT_NOTICE = ONLINE_PAYMENT_LIVE
  ? "예약현황에서 카드 결제를 완료하면 예약이 바로 확정됩니다."
  : "온라인 결제는 준비 중입니다. 예약 후 관리자가 보내드리는 결제 링크 또는 현장 결제(카드·현금)로 진행됩니다. 확정되면 다시 안내드려요.";
const ONSITE_PAYMENT_NOTICE = "현장 결제 예약은 운영자가 확인한 뒤 확정해 드립니다.";

const STATUS_MESSAGE: Record<string, string> = {
  confirmed: "예약이 확정되었습니다.",
  canceled: "예약이 취소되었습니다.",
  no_show: "예약이 노쇼 처리되었습니다.",
};

function hhmm(value: string | null): string {
  return value ? value.slice(0, 5) : "";
}

function reservationLine(row: ReservationRow): string {
  const pass = row.pass_name_snapshot || row.pass_type;
  const time = row.start_time && row.end_time ? ` ${hhmm(row.start_time)}-${hhmm(row.end_time)}` : "";
  return `${pass} / ${row.date}${time}`;
}

function paymentNotice(row: ReservationRow): string {
  return row.payment_preference === "onsite" ? ONSITE_PAYMENT_NOTICE : ONLINE_PAYMENT_NOTICE;
}

async function toHex(buffer: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

type SmsLogContext = {
  reservationId: string;
  recipientKind: "member" | "admin";
  event: string;
};

async function writeSmsLog(
  context: SmsLogContext,
  phone: string,
  status: "succeeded" | "failed" | "skipped",
  providerMessageId?: string,
  error?: string,
) {
  if (!SUPABASE_URL || !SERVICE_ROLE) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/reservation_sms_logs`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reservation_id: context.reservationId,
        recipient_kind: context.recipientKind,
        phone,
        event: context.event,
        status,
        provider_message_id: providerMessageId ?? null,
        error_message: error ?? null,
      }),
    });
  } catch (error) {
    console.error("[reservation-sms] log write error", { message: errorMessage(error) });
  }
}

async function sendSms(to: string, text: string, context: SmsLogContext): Promise<void> {
  const phone = to.replace(/\D/g, "");
  if (!phone) return;

  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !SMS_SENDER) {
    console.log("[reservation-sms] solapi secrets missing — skipping send");
    await writeSmsLog(context, phone, "skipped", undefined, "문자 발송 설정이 완료되지 않았습니다.");
    return;
  }

  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SOLAPI_API_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(date + salt)));

  const response = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({ message: { to: phone, from: SMS_SENDER, text } }),
  });

  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  const providerMessageId = typeof result.groupId === "string" ? result.groupId : undefined;

  if (!response.ok) {
    console.error("[reservation-sms] solapi error", { status: response.status });
    const providerError = typeof result.errorMessage === "string" ? result.errorMessage : `Solapi 응답 ${response.status}`;
    await writeSmsLog(context, phone, "failed", providerMessageId, providerError);
    return;
  }
  await writeSmsLog(context, phone, "succeeded", providerMessageId);
}

Deno.serve(async (request) => {
  try {
    // Fail closed: the webhook must present the shared secret. If WEBHOOK_SECRET
    // is unset the function refuses all calls, so a leaked URL can't be abused
    // to send SMS to arbitrary numbers.
    const receivedSecret = request.headers.get("x-workroom-webhook-secret") ?? "";
    if (!WEBHOOK_SECRET || receivedSecret !== WEBHOOK_SECRET) {
      console.warn("[reservation-sms] rejected unauthenticated webhook request");
      return new Response("unauthorized", { status: 401 });
    }

    const payload = (await request.json()) as WebhookPayload;
    if (payload.table !== "reservations") return new Response("ignored", { status: 200 });

    const row = payload.record;

    if (payload.type === "INSERT" && row) {
      // 운영자가 만든 예약(전화 예약·워크인 접수)은 처음부터 confirmed로 들어온다.
      // 이때 '접수되었습니다'는 사실과 다르고(이미 확정), '새 예약 신청 · 확인 필요'
      // 알림은 방금 그 예약을 만든 운영자 자신에게 가는 소음이다.
      // 회원에게는 확정 문자(출입문 비밀번호 포함)를 대신 보낸다.
      if (row.status === "confirmed") {
        if (row.phone) {
          const accessLine = DOOR_PASSWORD ? `\n출입문 비밀번호: ${DOOR_PASSWORD}` : "";
          await sendSms(
            row.phone,
            `[WORKROOM] ${STATUS_MESSAGE.confirmed}\n${reservationLine(row)}${accessLine}\n${REFUND_NOTICE}\n문의: 010-4931-3298\n${SITE_URL}`,
            { reservationId: row.id, recipientKind: "member", event: "reservation_confirmed" },
          );
        }
        return new Response("ok", { status: 200 });
      }

      // 온라인 즉시결제(정식 오픈)면 곧바로 '확정' 문자가 가므로 '접수' 문자는 생략한다.
      // 현장결제·테스트(결제링크 안내) 상황에서는 접수 문자를 그대로 보낸다.
      const skipReceivedSms = ONLINE_PAYMENT_LIVE && row.payment_preference !== "onsite";
      // Member-facing: booking received + how payment works.
      if (row.phone && !skipReceivedSms) {
        await sendSms(
          row.phone,
          `[WORKROOM] 예약 신청이 접수되었습니다.\n${reservationLine(row)}\n${paymentNotice(row)}\n문의: 010-4931-3298\n${SITE_URL}`,
          { reservationId: row.id, recipientKind: "member", event: "reservation_received" },
        );
      }
      // Operator-facing: new reservation alert.
      if (ADMIN_PHONE) {
        await sendSms(
          ADMIN_PHONE,
          `[WORKROOM] 새 예약 신청\n${row.name} / ${reservationLine(row)}\n${row.payment_preference === "onsite" ? "현장 결제 · 확인 필요" : "온라인 결제 대기"}\n${SITE_URL}`,
          { reservationId: row.id, recipientKind: "admin", event: "admin_new_reservation" },
        );
      }
      return new Response("ok", { status: 200 });
    }

    if (payload.type === "UPDATE" && row && payload.old_record) {
      const previous = payload.old_record;
      const statusChanged = row.status !== previous.status;
      const timeChanged =
        row.date !== previous.date || row.start_time !== previous.start_time || row.end_time !== previous.end_time;

      // Member-facing: status moved to confirmed / canceled / no_show.
      const message = STATUS_MESSAGE[row.status];
      if (statusChanged && message && row.phone) {
        const policyLine = row.status === "confirmed" ? `\n${REFUND_NOTICE}` : "";
        const accessLine = row.status === "confirmed" && DOOR_PASSWORD
          ? `\n출입문 비밀번호: ${DOOR_PASSWORD}`
          : "";
        await sendSms(
          row.phone,
          `[WORKROOM] ${message}\n${reservationLine(row)}${accessLine}${policyLine}\n문의: 010-4931-3298\n${SITE_URL}`,
          {
            reservationId: row.id,
            recipientKind: "member",
            event: row.status === "confirmed" ? "reservation_confirmed" : row.status === "canceled" ? "reservation_canceled" : "reservation_no_show",
          },
        );
      }

      // Operator-facing: 회원이 온라인으로 결제하면 예약이 자동 확정된다. 운영자가
      // 누른 게 아니라 손님이 스스로 끝낸 흐름이라, 알리지 않으면 돈이 들어온 사실을
      // 모른 채 지나간다. 운영자가 직접 확정한 경우(현장결제·서비스)는 본인이 방금
      // 한 일이므로 보내지 않는다 — 결제 수단으로 구분한다.
      const paidNow = (previous.payment_status ?? "unpaid") !== "paid" && row.payment_status === "paid";
      const paidOnline = (row.payment_method ?? "").startsWith("포트원");
      if (ADMIN_PHONE && paidNow && paidOnline) {
        const amount = row.price_at_booking ? `${row.price_at_booking.toLocaleString("ko-KR")}원 ` : "";
        await sendSms(
          ADMIN_PHONE,
          `[WORKROOM] 온라인 결제 완료 · 예약 확정\n${row.name} / ${reservationLine(row)}${row.people ? ` / ${row.people}명` : ""}\n${amount}${row.payment_method ?? ""}\n${SITE_URL}`,
          { reservationId: row.id, recipientKind: "admin", event: "admin_payment_received" },
        );
      }

      // Operator-facing: every cancellation should be visible even when the
      // member cancels from their own reservation page.
      if (ADMIN_PHONE && statusChanged && row.status === "canceled") {
        await sendSms(
          ADMIN_PHONE,
          `[WORKROOM] 예약 취소\n${row.name} / ${reservationLine(row)}\n예약관리에서 확인해 주세요.\n${SITE_URL}`,
          { reservationId: row.id, recipientKind: "admin", event: "admin_cancellation" },
        );
      }

      // Operator-facing: the member edited the date/time (re-request).
      if (ADMIN_PHONE && timeChanged) {
        await sendSms(
          ADMIN_PHONE,
          `[WORKROOM] 예약 변경 요청\n${row.name} / ${reservationLine(row)}\n홈페이지에서 확인해 주세요.\n${SITE_URL}`,
          { reservationId: row.id, recipientKind: "admin", event: "admin_schedule_changed" },
        );
      }

      return new Response("ok", { status: 200 });
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("[reservation-sms] handler error", { message: errorMessage(error) });
    return new Response("error", { status: 200 }); // never fail the webhook
  }
});
