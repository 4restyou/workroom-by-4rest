// Sends one end-of-use reminder for checked-in, confirmed reservations.
// Candidates are atomically claimed by the database RPC to prevent duplicates.

type ReminderRow = {
  reservation_id: string;
  member_name: string;
  phone: string;
  reservation_date: string;
  end_time: string;
  pass_name: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SOLAPI_API_KEY = Deno.env.get("SOLAPI_API_KEY") ?? "";
const SOLAPI_API_SECRET = Deno.env.get("SOLAPI_API_SECRET") ?? "";
const SMS_SENDER = (Deno.env.get("SMS_SENDER") ?? "").replace(/\D/g, "");

async function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function logSms(row: ReminderRow, status: "succeeded" | "failed" | "skipped", providerMessageId?: string, errorMessage?: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/reservation_sms_logs`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      reservation_id: row.reservation_id,
      recipient_kind: "member",
      phone: row.phone.replace(/\D/g, ""),
      event: "reservation_end_reminder",
      status,
      provider_message_id: providerMessageId ?? null,
      error_message: errorMessage ?? null,
    }),
  });
}

async function sendReminder(row: ReminderRow) {
  const phone = row.phone.replace(/\D/g, "");
  if (!phone || !SOLAPI_API_KEY || !SOLAPI_API_SECRET || !SMS_SENDER) {
    await logSms(row, "skipped", undefined, "문자 발송 설정이 완료되지 않았습니다.");
    return false;
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
    body: JSON.stringify({
      message: {
        to: phone,
        from: SMS_SENDER,
        text: `[WORKROOM] ${row.member_name}님, 예약 종료까지 약 20분 남았습니다.\n종료 ${row.end_time.slice(0, 5)} · 연장이 필요하면 운영자에게 문의해 주세요.\n010-4931-3298`,
      },
    }),
  });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  const groupId = typeof result.groupId === "string" ? result.groupId : undefined;
  if (!response.ok) {
    await logSms(row, "failed", groupId, typeof result.errorMessage === "string" ? result.errorMessage : `Solapi 응답 ${response.status}`);
    return false;
  }
  await logSms(row, "succeeded", groupId);
  return true;
}

function serviceHeaders() {
  return {
    apikey: SERVICE_ROLE,
    authorization: `Bearer ${SERVICE_ROLE}`,
    "Content-Type": "application/json",
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!SUPABASE_URL || !SERVICE_ROLE) return new Response("server configuration missing", { status: 500 });

  try {
    const claimResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_reservation_end_reminders`, {
      method: "POST",
      headers: serviceHeaders(),
      body: "{}",
    });
    if (!claimResponse.ok) {
      const detail = await claimResponse.text();
      console.error("[reservation-end-reminder] claim failed", { status: claimResponse.status, detail });
      return new Response("claim failed", { status: 500 });
    }

    const rows = await claimResponse.json() as ReminderRow[];
    let sent = 0;
    for (const row of rows) {
      if (await sendReminder(row)) {
        sent += 1;
        await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${row.reservation_id}`, {
          method: "PATCH",
          headers: serviceHeaders(),
          body: JSON.stringify({ end_reminder_sent_at: new Date().toISOString() }),
        });
      }
    }
    return Response.json({ ok: true, claimed: rows.length, sent });
  } catch (error) {
    console.error("[reservation-end-reminder] error", { message: error instanceof Error ? error.message : "unknown error" });
    return new Response("error", { status: 500 });
  }
});
