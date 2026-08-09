// Supabase Edge Function: PortOne(V2) 월권 정기결제(빌링키).
//
// 요청 형태 (POST JSON):
//   { type: "issue", reservationId, billingKey }  - 회원 JWT. 빌링키로 첫 주기 즉시 청구 후
//                                                   월권 예약 활성화 + 구독 생성.
//   { type: "charge" }  (헤더 x-cron-secret)       - 크론 전용. 청구일이 지난 구독을 자동 청구·연장.
//
// 원칙: 빌링키/청구 금액은 서버에서만 다루고, 청구 후 PortOne 결제를 다시 조회해
// 금액·상태(PAID)를 예약 금액과 대조한 뒤에만 반영한다.
//
// Required secrets:
//   PORTONE_API_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
//   CRON_SECRET                    - charge 요청 인증용 공유 비밀
//   ALLOWED_ORIGINS                - optional
//
// Deploy: supabase functions deploy portone-billing --no-verify-jwt

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://work-room.kr",
  "https://www.work-room.kr",
  "https://workroomby4rest.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? DEFAULT_ALLOWED_ORIGINS.join(","))
  .split(",").map((o) => o.trim()).filter(Boolean);

const serviceHeaders = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  "Content-Type": "application/json",
};

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
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
function isBillingKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 200 && /^[A-Za-z0-9_.:-]+$/.test(value);
}
function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type ReservationRow = {
  id: string;
  profile_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  payment_status: string | null;
  price_at_booking: number | null;
  pass_id: string | null;
  pass_type: string;
  pass_name_snapshot: string | null;
  access_end_date: string | null;
};

async function getReservation(id: string): Promise<ReservationRow | null> {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/reservations?id=eq.${id}&select=id,profile_id,name,phone,email,status,payment_status,price_at_booking,pass_id,pass_type,pass_name_snapshot,access_end_date`,
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
  action: "subscribe" | "recurring";
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
      body: JSON.stringify({ ...log, provider: "portone" }),
    });
  } catch (error) {
    console.error("[portone-billing] log error", { message: errorMessage(error) });
  }
}

async function openWeekdays(): Promise<number[]> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/business_hours?select=weekday,is_closed`, { headers: serviceHeaders });
    const rows = (await resp.json()) as Array<{ weekday: number; is_closed: boolean }>;
    const closed = new Set(rows.filter((r) => r.is_closed).map((r) => r.weekday));
    const open = [0, 1, 2, 3, 4, 5, 6].filter((d) => !closed.has(d));
    return open.length ? open : [0, 1, 2, 3, 4, 5, 6];
  } catch {
    return [0, 1, 2, 3, 4, 5, 6];
  }
}

type PortonePayment = { status?: string; amount?: { total?: number }; currency?: string };

// 빌링키로 즉시 청구 → 결제를 다시 조회해 PAID·금액 대조.
async function chargeBillingKey(
  paymentId: string, billingKey: string, orderName: string, amount: number,
  customer: { fullName: string; phoneNumber: string; email?: string },
): Promise<{ ok: boolean; code: string; message: string }> {
  const resp = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}/billing-key`, {
    method: "POST",
    headers: { Authorization: `PortOne ${PORTONE_API_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ billingKey, orderName, customer, amount: { total: amount }, currency: "KRW" }),
  });
  if (!resp.ok) {
    const detail = (await resp.json().catch(() => null)) as { type?: string; message?: string } | null;
    return { ok: false, code: detail?.type ?? String(resp.status), message: detail?.message ?? "청구 요청 실패" };
  }
  const verify = await fetch(`https://api.portone.io/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` },
  });
  // 청구 요청은 이미 나갔다. 여기서 확인만 실패한 것을 "미결제"로 처리하면
  // 다음 실행에서 같은 카드를 또 긁게 되므로, 구분 가능한 코드로 돌려준다.
  if (!verify.ok) return { ok: false, code: "VERIFY_PENDING", message: "결제 확인이 지연되고 있습니다. 중복 청구를 막기 위해 자동 재시도하지 않습니다." };
  const payment = (await verify.json()) as PortonePayment;
  if (payment.status !== "PAID") return { ok: false, code: payment.status ?? "UNKNOWN", message: "결제가 완료되지 않았습니다." };
  if (payment.currency !== "KRW" || Number(payment.amount?.total ?? 0) !== amount) {
    return { ok: false, code: "AMOUNT_MISMATCH", message: "결제 금액이 일치하지 않습니다." };
  }
  return { ok: true, code: "PAID", message: "결제 완료" };
}

async function handleIssue(request: Request, headers: Record<string, string>): Promise<Response> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: ANON } });
  if (!userResp.ok) return json({ ok: false, message: "로그인이 필요합니다." }, 401, headers);
  const user = (await userResp.json()) as { id?: string };
  if (!isUuid(user.id)) return json({ ok: false, message: "로그인이 필요합니다." }, 401, headers);

  const body = (await request.json()) as Record<string, unknown>;
  const reservationId = body.reservationId;
  const billingKey = body.billingKey;
  if (!isUuid(reservationId) || !isBillingKey(billingKey)) return json({ ok: false, message: "잘못된 요청입니다." }, 400, headers);

  const reservation = await getReservation(reservationId);
  if (!reservation) return json({ ok: false, message: "예약을 찾을 수 없습니다." }, 404, headers);
  if (reservation.profile_id !== user.id) return json({ ok: false, message: "본인 예약만 결제할 수 있습니다." }, 403, headers);
  const passName = reservation.pass_name_snapshot || reservation.pass_type;
  if (!passName.includes("월권")) return json({ ok: false, message: "정기결제는 월권만 가능합니다." }, 400, headers);
  const amount = Number(reservation.price_at_booking ?? 0);
  if (amount <= 0) return json({ ok: false, message: "결제 금액이 올바르지 않습니다." }, 400, headers);
  if (reservation.payment_status === "paid") return json({ ok: false, message: "이미 결제된 예약입니다." }, 400, headers);

  const paymentId = `wr-sub-${reservationId.slice(0, 8)}-${Date.now()}`;
  await recordPaymentLog({ reservation_id: reservationId, profile_id: user.id, action: "subscribe", status: "requested", amount });
  const charge = await chargeBillingKey(paymentId, billingKey, `WORKROOM ${passName} (정기결제)`, amount, {
    fullName: reservation.name, phoneNumber: reservation.phone, ...(reservation.email ? { email: reservation.email } : {}),
  });
  if (!charge.ok) {
    await recordPaymentLog({ reservation_id: reservationId, profile_id: user.id, action: "subscribe", status: "failed", amount, provider_code: charge.code, message: charge.message });
    return json({ ok: false, message: `첫 결제에 실패했습니다: ${charge.message}` }, 402, headers);
  }

  const cycleDays = 28;
  const today = kstToday();
  const weekdays = await openWeekdays();
  // 회원이 예약할 때 확인한 이용 기간을 그대로 지킨다. 여기서 today 기준으로
  // 다시 쓰면, 다음 주 시작으로 예약하고 오늘 카드를 등록한 회원의 기간이
  // 통보 없이 당겨진다. 기간이 아직 없을 때만 예약일 기준으로 채운다.
  const periodStart = reservation.access_start_date ?? reservation.date ?? today;
  const periodEnd = reservation.access_end_date ?? addDays(periodStart, cycleDays - 1);
  const updated = await updateReservation(reservationId, {
    status: "confirmed",
    payment_status: "paid",
    payment_method: "포트원 정기결제",
    payment_key: paymentId,
    access_start_date: periodStart,
    access_end_date: periodEnd,
    ...(reservation.access_weekdays?.length ? {} : { access_weekdays: weekdays }),
  });
  if (!updated) {
    await recordPaymentLog({ reservation_id: reservationId, profile_id: user.id, action: "subscribe", status: "failed", amount, provider_code: "DB_UPDATE_FAILED", message: "결제 후 예약 반영 실패" });
    return json({ ok: false, message: "결제는 됐지만 예약 반영에 실패했습니다. 운영자에게 문의해 주세요." }, 500, headers);
  }
  await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: "POST",
    headers: { ...serviceHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({
      profile_id: user.id, reservation_id: reservationId, billing_key: billingKey,
      pass_id: reservation.pass_id, pass_name: passName, amount, cycle_days: cycleDays,
      status: "active", next_charge_at: addDays(periodEnd, 1), last_paid_at: new Date().toISOString(),
    }),
  });
  await recordPaymentLog({ reservation_id: reservationId, profile_id: user.id, action: "subscribe", status: "succeeded", amount, message: "정기결제 등록 및 첫 결제 완료" });
  return json({ ok: true, message: "정기결제가 등록되고 첫 결제가 완료되었습니다." }, 200, headers);
}

type SubscriptionRow = {
  id: string; profile_id: string; reservation_id: string | null; billing_key: string;
  pass_name: string; amount: number; cycle_days: number; next_charge_at: string | null; fail_count: number;
};

async function handleCharge(headers: Record<string, string>): Promise<Response> {
  const today = kstToday();
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?status=eq.active&next_charge_at=lte.${today}&select=id,profile_id,reservation_id,billing_key,pass_name,amount,cycle_days,next_charge_at,fail_count`,
    { headers: serviceHeaders },
  );
  const subs = (await resp.json()) as SubscriptionRow[];
  let charged = 0;
  let failed = 0;
  for (const sub of Array.isArray(subs) ? subs : []) {
    const reservation = sub.reservation_id ? await getReservation(sub.reservation_id) : null;
    // 결제 식별자를 주기(청구일)에 고정한다. 크론이 겹쳐 실행되거나 재시도돼도
    // 같은 주기에 대해서는 같은 paymentId가 되어 PortOne이 중복 결제를 거부한다.
    // (Date.now()를 쓰면 매번 다른 결제로 취급되어 이중 청구가 가능했다.)
    const cycleKey = (sub.next_charge_at ?? today).replace(/-/g, "");
    const paymentId = `wr-rec-${sub.id.slice(0, 8)}-${cycleKey}`;
    const customer = reservation
      ? { fullName: reservation.name, phoneNumber: reservation.phone, ...(reservation.email ? { email: reservation.email } : {}) }
      : { fullName: "회원", phoneNumber: "" };
    const charge = await chargeBillingKey(paymentId, sub.billing_key, `WORKROOM ${sub.pass_name} (정기결제)`, sub.amount, customer);
    if (charge.ok) {
      charged += 1;
      const base = sub.next_charge_at && sub.next_charge_at > today ? sub.next_charge_at : today;
      if (reservation) {
        const currentEnd = reservation.access_end_date && reservation.access_end_date >= today ? reservation.access_end_date : today;
        await updateReservation(reservation.id, {
          access_end_date: addDays(currentEnd, sub.cycle_days),
          payment_key: paymentId,
        });
      }
      await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?id=eq.${sub.id}`, {
        method: "PATCH",
        headers: { ...serviceHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ next_charge_at: addDays(base, sub.cycle_days), last_paid_at: new Date().toISOString(), fail_count: 0 }),
      });
      if (sub.reservation_id) await recordPaymentLog({ reservation_id: sub.reservation_id, profile_id: sub.profile_id, action: "recurring", status: "succeeded", amount: sub.amount, message: "정기결제 자동청구 완료" });
    } else {
      failed += 1;
      const nextFail = sub.fail_count + 1;
      // 확인 지연은 이미 청구가 나갔을 수 있으므로 자동 재시도하지 않고 멈춘다.
      const needsReview = charge.code === "VERIFY_PENDING";
      await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?id=eq.${sub.id}`, {
        method: "PATCH",
        headers: { ...serviceHeaders, Prefer: "return=minimal" },
        body: JSON.stringify(
          needsReview
            ? { status: "paused", fail_count: nextFail }
            : { fail_count: nextFail, ...(nextFail >= 3 ? { status: "paused" } : {}) },
        ),
      });
      if (sub.reservation_id) await recordPaymentLog({ reservation_id: sub.reservation_id, profile_id: sub.profile_id, action: "recurring", status: "failed", amount: sub.amount, provider_code: charge.code, message: `${charge.message}${nextFail >= 3 ? " · 3회 실패로 일시정지" : ""}` });
    }
  }
  return json({ ok: true, charged, failed, total: Array.isArray(subs) ? subs.length : 0 }, 200, headers);
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  try {
    if (request.method !== "POST") return json({ ok: false, message: "허용되지 않은 요청 방식입니다." }, 405, headers);
    if (!PORTONE_API_SECRET || !SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, message: "결제 설정이 완료되지 않았습니다." }, 500, headers);

    // 크론 자동청구: 본문 파싱 전에 헤더 비밀로 인증.
    const cronHeader = request.headers.get("x-cron-secret");
    if (cronHeader) {
      if (!CRON_SECRET || cronHeader !== CRON_SECRET) return json({ ok: false, message: "인증 실패" }, 403, headers);
      return await handleCharge(headers);
    }

    const clone = request.clone();
    const body = (await clone.json()) as Record<string, unknown>;
    const type = typeof body.type === "string" ? body.type : "";
    if (type === "issue") {
      const origin = request.headers.get("Origin");
      if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, message: "허용되지 않은 요청입니다." }, 403, headers);
      return await handleIssue(request, headers);
    }
    if (type === "charge") {
      // 본문 방식 크론(대체 경로): CRON_SECRET 필수.
      if (!CRON_SECRET || body.secret !== CRON_SECRET) return json({ ok: false, message: "인증 실패" }, 403, headers);
      return await handleCharge(headers);
    }
    return json({ ok: false, message: "알 수 없는 요청입니다." }, 400, headers);
  } catch (error) {
    console.error("[portone-billing] error", { message: errorMessage(error) });
    return json({ ok: false, message: "처리 중 오류가 발생했습니다." }, 500, headers);
  }
});
