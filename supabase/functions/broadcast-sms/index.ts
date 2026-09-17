// Supabase Edge Function: 회원 단체 문자 (운영 공지 · 광고).
//
// 요청 (POST JSON, 관리자 액세스 토큰):
//   { kind: "notice" | "ad", audience: "...", body: "...", optOut: "..." }
//
// 대상 번호는 이 함수가 DB에서 만든다. 화면이 번호 목록을 보내는 구조라면
// 화면 코드를 고치는 것만으로 누구에게나 광고를 보낼 수 있게 된다.
//
// 광고는 정보통신망법 제50조를 따른다 — (광고) 표기, 무료 수신거부 방법,
// 21시~익일 8시 발송 금지, 동의(또는 6개월 거래 예외) 대상에게만. 화면에서
// 한 번 막지만 여기서 다시 확인한다.
//
// Deploy with Verify JWT ON (호출자의 토큰으로 관리자 여부를 확인한다).

import { checkBroadcast, composeBroadcast, type BroadcastAudience, type BroadcastKind } from "../_shared/broadcast.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SOLAPI_API_KEY = Deno.env.get("SOLAPI_API_KEY") ?? "";
const SOLAPI_API_SECRET = Deno.env.get("SOLAPI_API_SECRET") ?? "";
const SMS_SENDER = Deno.env.get("SMS_SENDER") ?? "";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://work-room.kr",
  "https://www.work-room.kr",
  "https://workroomby4rest.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? DEFAULT_ALLOWED_ORIGINS.join(","))
  .split(",").map((o) => o.trim()).filter(Boolean);

const serviceHeaders = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` };

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? "",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 서울 기준 지금 시각(0~23). 광고 발송 금지 시간대 판단에 쓴다. */
function seoulHour(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((part) => part.type === "hour")?.value ?? "0");
}

async function sendOne(to: string, text: string): Promise<boolean> {
  const phone = to.replace(/\D/g, "");
  if (!phone) return false;

  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SOLAPI_API_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(date + salt)));

  const response = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({ message: { to: phone, from: SMS_SENDER, text } }),
  });
  if (!response.ok) {
    console.error("[broadcast-sms] solapi error", { status: response.status });
    return false;
  }
  return true;
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });

  try {
    if (request.method !== "POST") return json({ ok: false, message: "허용되지 않은 요청 방식입니다." }, 405, headers);
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, message: "서버 설정이 완료되지 않았습니다." }, 500, headers);
    if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET || !SMS_SENDER) {
      return json({ ok: false, message: "문자 발송 설정이 완료되지 않았습니다." }, 500, headers);
    }

    const authHeader = request.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "로그인이 필요합니다." }, 401, headers);
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: ANON } });
    const user = (await userResp.json()) as { id?: string };
    if (!userResp.ok || !user?.id) return json({ ok: false, message: "인증에 실패했습니다." }, 401, headers);

    // 역할은 토큰이 아니라 DB에서 확인한다.
    const roleResp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: serviceHeaders });
    const roleRows = (await roleResp.json().catch(() => [])) as Array<{ role?: string }>;
    if (roleRows[0]?.role !== "admin") return json({ ok: false, message: "관리자만 보낼 수 있습니다." }, 403, headers);

    const payload = (await request.json().catch(() => ({}))) as {
      kind?: BroadcastKind;
      audience?: BroadcastAudience;
      body?: string;
      optOut?: string;
    };
    const kind: BroadcastKind = payload.kind === "ad" ? "ad" : "notice";
    const audience = (payload.audience ?? "active") as BroadcastAudience;
    const text = typeof payload.body === "string" ? payload.body : "";
    const optOut = typeof payload.optOut === "string" ? payload.optOut : "";

    // 대상을 서버에서 만든다.
    const audienceResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/broadcast_audience`, {
      method: "POST",
      headers: { ...serviceHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ p_audience: audience }),
    });
    if (!audienceResp.ok) return json({ ok: false, message: "대상을 불러오지 못했습니다." }, 500, headers);
    const recipients = (await audienceResp.json()) as Array<{ id: string; phone: string | null }>;

    const check = checkBroadcast({ kind, audience, body: text, recipients: recipients.length, hour: seoulHour() });
    if (!check.ok) return json({ ok: false, message: check.problems.join(" ") }, 400, headers);

    const message = composeBroadcast({ kind, body: text, optOut });

    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      const ok = recipient.phone ? await sendOne(recipient.phone, message) : false;
      if (ok) sent += 1;
      else failed += 1;
    }

    await fetch(`${SUPABASE_URL}/rest/v1/sms_campaigns`, {
      method: "POST",
      headers: { ...serviceHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        kind,
        audience,
        body: message,
        recipient_count: recipients.length,
        sent_count: sent,
        failed_count: failed,
        created_by: user.id,
      }),
    });

    return json({ ok: true, sent, failed, total: recipients.length }, 200, headers);
  } catch (error) {
    console.error("[broadcast-sms] handler error", { message: errorMessage(error) });
    return json({ ok: false, message: "발송 중 오류가 발생했습니다." }, 500, headers);
  }
});
