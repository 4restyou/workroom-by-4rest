import * as PortOne from "@portone/browser-sdk/v2";
import {
  canPayOnline as canPayOnlineRule,
  canSubscribe as canSubscribeRule,
  type PaymentAvailability,
} from "./paymentPolicy";
import { SITE } from "./site";
import { supabase } from "./supabase";
import type { Reservation } from "./types";

// PortOne(V2) 결제. 일반(단건) 결제와 정기결제(빌링)는 PortOne에서 서로 다른
// 채널이라 채널 키를 각각 둔다. 해당 키가 있는 결제 수단만 버튼이 노출된다.
//   VITE_PORTONE_CHANNEL_KEY          - 일반(단건) 카드결제 채널 (예: KCP 일반결제)
//   VITE_PORTONE_BILLING_CHANNEL_KEY  - 정기결제(빌링) 채널 (예: KCP 정기과금)
const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID as string | undefined;
const CHANNEL_KEY = import.meta.env.VITE_PORTONE_CHANNEL_KEY as string | undefined;
const BILLING_CHANNEL_KEY = import.meta.env.VITE_PORTONE_BILLING_CHANNEL_KEY as string | undefined;

export const hasPortoneConfig = Boolean(STORE_ID && CHANNEL_KEY);
export const hasBillingConfig = Boolean(STORE_ID && BILLING_CHANNEL_KEY);

// 카드사 심사에서 결제창 호출을 확인해야 하므로 정식 오픈 전에도 노출한다.
function availability(): PaymentAvailability {
  return {
    paymentEnabled: SITE.booking.paymentEnabled,
    hasOneOffChannel: hasPortoneConfig,
    hasBillingChannel: hasBillingConfig,
  };
}

export function canPayOnline(reservation: Reservation): boolean {
  return canPayOnlineRule(reservation, availability());
}

export type PayResult = { ok: boolean; message: string };

// 결제창을 열고, 완료되면 서버(portone-payment 함수)에서 금액·상태를 재검증해
// 예약을 결제완료·확정으로 반영한다. 모바일 리디렉션 흐름은 /payment/portone 페이지가 처리.
export async function payReservation(reservation: Reservation): Promise<PayResult> {
  if (!STORE_ID || !CHANNEL_KEY) return { ok: false, message: "온라인 결제가 아직 준비되지 않았습니다." };
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요." };

  const amount = reservation.price_at_booking ?? 0;
  const paymentId = `wr-${reservation.id.slice(0, 8)}-${Date.now()}`;

  let response: Awaited<ReturnType<typeof PortOne.requestPayment>>;
  try {
    response = await PortOne.requestPayment({
      storeId: STORE_ID,
      channelKey: CHANNEL_KEY,
      paymentId,
      orderName: `WORKROOM ${reservation.pass_name_snapshot || reservation.pass_type}`,
      totalAmount: amount,
      currency: "CURRENCY_KRW",
      payMethod: "CARD",
      customData: { reservationId: reservation.id },
      redirectUrl: `${window.location.origin}/payment/portone`,
      customer: {
        fullName: reservation.name,
        phoneNumber: reservation.phone,
        ...(reservation.email ? { email: reservation.email } : {}),
      },
    });
  } catch (error) {
    return { ok: false, message: `결제창 오류: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (!response) return { ok: false, message: "결제창을 여는 데 실패했습니다. (응답 없음 — 채널 키/상점 ID를 확인해 주세요)" };
  if (response.code !== undefined) {
    // 사용자가 창을 닫은 경우 등: PortOne이 코드·메시지를 돌려준다.
    return { ok: false, message: response.message ?? "결제가 취소되었습니다." };
  }

  return confirmPayment(response.paymentId ?? paymentId);
}

// 서버 검증 호출. 리디렉션 복귀 페이지에서도 재사용한다.
export async function confirmPayment(paymentId: string): Promise<PayResult> {
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요." };
  const { data, error } = await supabase.functions.invoke("portone-payment", {
    body: { type: "confirm", paymentId },
  });
  const result = data as { ok?: boolean; message?: string } | null;
  if (error) return { ok: false, message: await invokeErrorMessage(error, "결제 확인에 실패했습니다. 잠시 후 예약현황에서 다시 확인해 주세요.") };
  if (!result?.ok) return { ok: false, message: result?.message ?? "결제 확인에 실패했습니다. 잠시 후 예약현황에서 다시 확인해 주세요." };
  return { ok: true, message: result.message ?? "결제가 완료되었습니다." };
}

// ── 월권 정기결제(빌링키) ─────────────────────────────────────────────
// 월권 예약에 한해 카드 빌링키를 발급받아 서버에 전달하면, 서버가 첫 주기를
// 즉시 청구하고 매 주기 자동 청구한다.
export function canSubscribe(reservation: Reservation): boolean {
  return canSubscribeRule(reservation, availability());
}

export async function subscribeMonthly(reservation: Reservation): Promise<PayResult> {
  if (!STORE_ID || !BILLING_CHANNEL_KEY) return { ok: false, message: "정기결제가 아직 준비되지 않았습니다." };
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요." };

  const passName = reservation.pass_name_snapshot || reservation.pass_type;
  const issueId = `wrbk-${reservation.id.slice(0, 8)}-${Date.now()}`;

  let response: Awaited<ReturnType<typeof PortOne.requestIssueBillingKey>>;
  try {
    response = await PortOne.requestIssueBillingKey({
      storeId: STORE_ID,
      channelKey: BILLING_CHANNEL_KEY,
      billingKeyMethod: "CARD",
      issueId,
      issueName: `WORKROOM ${passName} 정기결제`,
      // 모바일 리디렉션 복귀 시 예약 id를 알 수 있도록 쿼리에 실어 보낸다.
      redirectUrl: `${window.location.origin}/payment/portone?res=${reservation.id}`,
      customer: {
        fullName: reservation.name,
        phoneNumber: reservation.phone,
        ...(reservation.email ? { email: reservation.email } : {}),
      },
    });
  } catch (error) {
    return { ok: false, message: `정기결제 창 오류: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (!response) return { ok: false, message: "정기결제 창을 여는 데 실패했습니다. (응답 없음 — 채널 키/상점 ID를 확인해 주세요)" };
  // BC카드는 카드사가 정기결제 심사를 거부해 빌링키 발급 자체가 막혀 있다.
  // PG가 주는 원문만 보여주면 회원이 무엇을 해야 할지 알 수 없으므로 대안을 붙인다.
  const fallbackHint = `\n${SITE.booking.recurringUnsupportedCards}는 정기결제 등록이 불가합니다. 다른 카드로 등록하시거나 ‘카드로 결제하기’로 이번 회차를 결제해 주세요.`;
  if (response.code !== undefined) return { ok: false, message: `${response.message ?? "정기결제 등록이 취소되었습니다."}${fallbackHint}` };
  if (!response.billingKey) return { ok: false, message: `카드 등록에 실패했습니다.${fallbackHint}` };

  return confirmBillingIssue(reservation.id, response.billingKey);
}

// supabase functions.invoke는 비-200 응답을 error로 처리하며 본문(JSON) 메시지를
// error.context(Response)에 담는다. 서버가 보낸 실제 사유를 꺼내 온다.
async function invokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { message?: string } | null;
      if (body?.message) return body.message;
    } catch {
      /* 본문이 JSON이 아니면 fallback */
    }
  }
  return error instanceof Error ? `${fallback} (${error.message})` : fallback;
}

// 빌링키를 서버로 보내 첫 결제·구독 등록. 모바일 리디렉션 복귀 페이지에서도 재사용.
export async function confirmBillingIssue(reservationId: string, billingKey: string): Promise<PayResult> {
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요." };
  const { data, error } = await supabase.functions.invoke("portone-billing", {
    body: { type: "issue", reservationId, billingKey },
  });
  const result = data as { ok?: boolean; message?: string } | null;
  if (error) return { ok: false, message: await invokeErrorMessage(error, "정기결제 등록에 실패했습니다.") };
  if (!result?.ok) return { ok: false, message: result?.message ?? "정기결제 등록에 실패했습니다." };
  return { ok: true, message: result.message ?? "정기결제가 등록되었습니다." };
}

export async function cancelSubscription(subscriptionId: string): Promise<PayResult> {
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다." };
  const { data, error } = await supabase.rpc("cancel_subscription", { p_id: subscriptionId });
  const result = data as { ok?: boolean; message?: string } | null;
  if (error || !result?.ok) return { ok: false, message: result?.message ?? "해지에 실패했습니다." };
  return { ok: true, message: result.message ?? "정기결제를 해지했어요." };
}

// 회원 본인 예약 취소. 결제건이면 서버가 PortOne 환불까지 실행하고, 월권
// 정기결제가 걸려 있으면 함께 해지한다. 소유권·시작시간 정책은 전부 서버에서
// 재검증하므로 클라이언트 판단은 버튼 노출용일 뿐이다.
export type CancelResult = PayResult & { refunded: boolean };

export async function cancelOwnReservation(reservationId: string, reason = "회원 예약 취소"): Promise<CancelResult> {
  if (!supabase) return { ok: false, refunded: false, message: "서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요." };
  const { data, error } = await supabase.functions.invoke("refund-reservation", {
    body: { reservationId, reason },
  });
  const result = data as { ok?: boolean; refunded?: boolean; message?: string } | null;
  if (error) {
    return { ok: false, refunded: false, message: await invokeErrorMessage(error, "예약 취소에 실패했습니다.") };
  }
  if (!result?.ok) {
    return { ok: false, refunded: false, message: result?.message ?? "예약 취소에 실패했습니다." };
  }
  return {
    ok: true,
    refunded: Boolean(result.refunded),
    message: result.message ?? (result.refunded ? "예약이 취소되고 환불되었습니다." : "예약이 취소되었습니다."),
  };
}

// 관리자 환불.
// amount를 주면 부분 환불(장기 이용권 중도 해지 일할 계산 등), 없으면 전액 취소.
export async function refundReservationPayment(reservationId: string, reason: string, amount?: number): Promise<PayResult> {
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다." };
  const { data, error } = await supabase.functions.invoke("portone-payment", {
    body: { type: "refund", reservationId, reason, ...(typeof amount === "number" ? { amount } : {}) },
  });
  const result = data as { ok?: boolean; message?: string } | null;
  if (error || !result?.ok) return { ok: false, message: result?.message ?? "환불 처리에 실패했습니다." };
  return { ok: true, message: result.message ?? "환불이 완료되었습니다." };
}
