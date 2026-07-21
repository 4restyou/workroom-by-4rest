// Supabase Edge Function: member self-service account deletion (회원 탈퇴).
//
// Anonymizes the member's past reservations (strips name/phone/email so business
// records survive without personal data), then deletes the auth user — which
// cascades the profile and inquiries. Irreversible.
//
// Required secrets:
//   SUPABASE_URL                   - (auto-provided)
//   SUPABASE_SERVICE_ROLE_KEY      - (auto-provided)
//   SUPABASE_ANON_KEY              - (auto-provided)
//   ALLOWED_ORIGINS                - optional comma-separated browser origins
//
// Deploy with Verify JWT ON; the caller's access token identifies the member.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const DEFAULT_ALLOWED_ORIGINS = ["https://work-room.kr", "https://www.work-room.kr", "https://workroomby4rest.netlify.app", "http://localhost:5173", "http://127.0.0.1:5173"];
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

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") {
    return isAllowedOrigin(request) ? new Response("ok", { headers }) : new Response("forbidden", { status: 403, headers });
  }

  try {
    if (!isAllowedOrigin(request)) return json({ ok: false, message: "허용되지 않은 요청입니다." }, 403, headers);
    if (request.method !== "POST") return json({ ok: false, message: "허용되지 않은 요청 방식입니다." }, 405, headers);
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, message: "서버 설정이 완료되지 않았습니다." }, 500, headers);

    // 1) Identify the caller from their access token.
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!authHeader || !authHeader.startsWith("Bearer ")) return json({ ok: false, message: "로그인이 필요합니다." }, 401, headers);
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: ANON } });
    const user = (await userResp.json()) as { id?: string };
    if (!userResp.ok || !user?.id) return json({ ok: false, message: "인증에 실패했습니다." }, 401, headers);

    const serviceHeaders = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` };

    // 2) Anonymize the member's reservations (keep the rows, drop personal data).
    await fetch(`${SUPABASE_URL}/rest/v1/reservations?profile_id=eq.${user.id}`, {
      method: "PATCH",
      headers: { ...serviceHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ name: "탈퇴한 회원", phone: "-", email: null }),
    });

    // 3) Delete the auth user. Cascades the profile (and inquiries) via FKs;
    //    reservation.profile_id is set null by the cascade.
    const del = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: serviceHeaders,
    });
    if (!del.ok) {
      console.error("[delete-account] auth delete failed", { status: del.status });
      return json({ ok: false, message: "탈퇴 처리에 실패했습니다." }, 500, headers);
    }

    return json({ ok: true }, 200, headers);
  } catch (error) {
    console.error("[delete-account] handler error", { message: errorMessage(error) });
    return json({ ok: false, message: "탈퇴 처리 중 오류가 발생했습니다." }, 500, headers);
  }
});
