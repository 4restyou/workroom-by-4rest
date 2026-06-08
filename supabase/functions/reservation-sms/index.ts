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
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://workroomby4rest.netlify.app";

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

async function toHex(buffer: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendSms(to: string, text: string): Promise<void> {
  const phone = to.replace(/\D/g, "");
  if (!phone) return;

  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !SMS_SENDER) {
    console.log("[reservation-sms] secrets missing — skipping send", { to: phone, text });
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

  if (!response.ok) {
    console.error("[reservation-sms] solapi error", response.status, await response.text());
  }
}

Deno.serve(async (request) => {
  try {
    const payload = (await request.json()) as WebhookPayload;
    if (payload.table !== "reservations") return new Response("ignored", { status: 200 });

    const row = payload.record;

    if (payload.type === "INSERT" && row) {
      if (ADMIN_PHONE) {
        await sendSms(ADMIN_PHONE, `[WORKROOM] 새 예약 신청\n${row.name} / ${reservationLine(row)}\n홈페이지에서 확인해 주세요.\n${SITE_URL}`);
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
        await sendSms(row.phone, `[WORKROOM] ${message}\n${reservationLine(row)}\n문의: 010-4931-3298\n${SITE_URL}`);
      }

      // Operator-facing: the member edited the date/time (re-request).
      if (ADMIN_PHONE && timeChanged) {
        await sendSms(ADMIN_PHONE, `[WORKROOM] 예약 변경 요청\n${row.name} / ${reservationLine(row)}\n홈페이지에서 확인해 주세요.\n${SITE_URL}`);
      }

      return new Response("ok", { status: 200 });
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("[reservation-sms] handler error", error);
    return new Response("error", { status: 200 }); // never fail the webhook
  }
});
