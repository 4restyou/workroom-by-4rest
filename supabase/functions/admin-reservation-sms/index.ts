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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SOLAPI_API_KEY = Deno.env.get("SOLAPI_API_KEY") ?? "";
const SOLAPI_API_SECRET = Deno.env.get("SOLAPI_API_SECRET") ?? "";
const SMS_SENDER = (Deno.env.get("SMS_SENDER") ?? "").replace(/\D/g, "");
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://work-room.kr";
const DEFAULT_ALLOWED_ORIGINS = ["https://work-room.kr", "https://www.work-room.kr", "https://workroomby4rest.netlify.app"];
const REFUND_NOTICE = Deno.env.get("REFUND_NOTICE") ?? "예약 시간 전까지 취소 가능, 예약 시간 이후 환불 불가 (자세한 사항은 홈페이지)";

function cors(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const allowed = DEFAULT_ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://127.0.0.1:") || origin.startsWith("http://localhost:");
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://work-room.kr",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(request), "Content-Type": "application/json" } });
}

function hhmm(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

function reservationLine(row: ReservationRow) {
  const time = row.start_time && row.end_time ? ` ${hhmm(row.start_time)}-${hhmm(row.end_time)}` : "";
  return `${row.pass_name_snapshot || row.pass_type} / ${row.date}${time}`;
}

async function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function logSms(row: ReservationRow, event: string, status: "succeeded" | "failed" | "skipped", providerId?: string, error?: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/reservation_sms_logs`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE, authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      reservation_id: row.id,
      recipient_kind: "member",
      phone: row.phone.replace(/\D/g, ""),
      event,
      status,
      provider_message_id: providerId ?? null,
      error_message: error ?? null,
    }),
  });
}

async function isAdmin(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization) return false;
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, authorization },
  });
  if (!userResponse.ok) return false;
  const user = await userResponse.json() as { id?: string };
  if (!user.id) return false;
  const profileResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`, {
    headers: { apikey: SERVICE_ROLE, authorization: `Bearer ${SERVICE_ROLE}` },
  });
  const profiles = await profileResponse.json() as Array<{ role?: string }>;
  return profiles[0]?.role === "admin";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(request) });
  if (request.method !== "POST") return json(request, { ok: false }, 405);
  if (!(await isAdmin(request))) return json(request, { ok: false, message: "관리자 권한이 필요합니다." }, 403);

  const body = await request.json().catch(() => ({})) as { reservationId?: string; kind?: "confirmed" | "canceled" };
  if (!body.reservationId || !body.kind) return json(request, { ok: false, message: "요청 정보가 올바르지 않습니다." }, 400);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${body.reservationId}&select=id,name,phone,status,date,start_time,end_time,pass_type,pass_name_snapshot`, {
    headers: { apikey: SERVICE_ROLE, authorization: `Bearer ${SERVICE_ROLE}` },
  });
  const rows = await response.json() as ReservationRow[];
  const row = rows[0];
  if (!row) return json(request, { ok: false, message: "예약을 찾을 수 없습니다." }, 404);
  if (body.kind === "confirmed" && row.status !== "confirmed") return json(request, { ok: false, message: "확정 상태의 예약만 확정 문자를 보낼 수 있습니다." }, 400);
  if (body.kind === "canceled" && row.status !== "canceled") return json(request, { ok: false, message: "취소 상태의 예약만 취소 문자를 보낼 수 있습니다." }, 400);

  const event = body.kind === "confirmed" ? "manual_confirmed" : "manual_canceled";
  if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !SMS_SENDER) {
    await logSms(row, event, "skipped", undefined, "문자 발송 설정이 완료되지 않았습니다.");
    return json(request, { ok: false, message: "문자 발송 설정이 완료되지 않았습니다." }, 500);
  }

  const text = body.kind === "confirmed"
    ? `[WORKROOM] 예약이 확정되었습니다.\n${reservationLine(row)}\n${REFUND_NOTICE}\n문의: 010-4931-3298\n${SITE_URL}`
    : `[WORKROOM] 예약이 취소되었습니다.\n${reservationLine(row)}\n문의: 010-4931-3298\n${SITE_URL}`;
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SOLAPI_API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(date + salt)));
  const sendResponse = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({ message: { to: row.phone.replace(/\D/g, ""), from: SMS_SENDER, text } }),
  });
  const result = await sendResponse.json().catch(() => ({})) as Record<string, unknown>;
  const providerId = typeof result.groupId === "string" ? result.groupId : undefined;
  if (!sendResponse.ok) {
    const error = typeof result.errorMessage === "string" ? result.errorMessage : `Solapi 응답 ${sendResponse.status}`;
    await logSms(row, event, "failed", providerId, error);
    return json(request, { ok: false, message: "문자 발송에 실패했습니다." }, 502);
  }
  await logSms(row, event, "succeeded", providerId);
  return json(request, { ok: true });
});
