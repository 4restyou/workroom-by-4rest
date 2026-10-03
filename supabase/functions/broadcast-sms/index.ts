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

import {
  checkBroadcast,
  checkDailyLimit,
  composeBroadcast,
  DAILY_RECIPIENT_LIMIT,
  seoulDayStartIso,
  type BroadcastAudience,
  type BroadcastKind,
  type SentToday,
} from "../_shared/broadcast.ts";
import { callerIsAdmin } from "../_shared/adminAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SOLAPI_API_KEY = Deno.env.get("SOLAPI_API_KEY") ?? "";
const SOLAPI_API_SECRET = Deno.env.get("SOLAPI_API_SECRET") ?? "";
const SMS_SENDER = Deno.env.get("SMS_SENDER") ?? "";
// 필요하면 Supabase 함수 환경 변수로 하루 상한을 바꾼다.
const DAILY_LIMIT = Number(Deno.env.get("BROADCAST_DAILY_LIMIT") ?? "") || DAILY_RECIPIENT_LIMIT;
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

    // 역할은 DB의 is_admin()으로 확인한다(2단계 인증 규칙 포함).
    if (!(await callerIsAdmin(SUPABASE_URL, ANON, authHeader))) return json({ ok: false, message: "관리자만 보낼 수 있습니다." }, 403, headers);

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

    // 하루 상한·광고 1회·연속 발송을 서버에서 확인한다.
    const now = new Date();
    const todayResp = await fetch(
      `${SUPABASE_URL}/rest/v1/sms_campaigns?created_at=gte.${encodeURIComponent(seoulDayStartIso(now))}&select=kind,body,recipient_count,created_at`,
      { headers: serviceHeaders },
    );
    if (!todayResp.ok) return json({ ok: false, message: "오늘 발송 이력을 확인하지 못했습니다." }, 500, headers);
    const today = (await todayResp.json()) as SentToday[];
    const limit = checkDailyLimit({ kind, message, recipients: recipients.length, today, now, limit: DAILY_LIMIT });
    if (!limit.ok) return json({ ok: false, message: limit.problems.join(" ") }, 429, headers);

    // 보내기 전에 먼저 기록한다. 버튼을 두 번 눌러 동시에 들어온 두 번째 요청이
    // 위 확인에서 이 기록을 보고 멈추게 하려는 것이다. 결과 숫자는 끝나고 채운다.
    const createResp = await fetch(`${SUPABASE_URL}/rest/v1/sms_campaigns`, {
      method: "POST",
      headers: { ...serviceHeaders, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        kind,
        audience,
        body: message,
        recipient_count: recipients.length,
        sent_count: 0,
        failed_count: 0,
        created_by: user.id,
      }),
    });
    if (!createResp.ok) return json({ ok: false, message: "발송 기록을 만들지 못해 보내지 않았습니다." }, 500, headers);
    const campaignId = ((await createResp.json()) as Array<{ id: string }>)[0]?.id;

    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      const ok = recipient.phone ? await sendOne(recipient.phone, message) : false;
      if (ok) sent += 1;
      else failed += 1;
    }

    if (campaignId) {
      await fetch(`${SUPABASE_URL}/rest/v1/sms_campaigns?id=eq.${campaignId}`, {
        method: "PATCH",
        headers: { ...serviceHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ sent_count: sent, failed_count: failed }),
      });
    }

    return json({ ok: true, sent, failed, total: recipients.length }, 200, headers);
  } catch (error) {
    console.error("[broadcast-sms] handler error", { message: errorMessage(error) });
    return json({ ok: false, message: "발송 중 오류가 발생했습니다." }, 500, headers);
  }
});
