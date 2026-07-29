import * as PortOne from "@portone/browser-sdk/v2";
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

export function canPayOnline(reservation: Reservation): boolean {
  return (
    hasPortoneConfig &&
    (reservation.status === "pending" || reservation.status === "confirmed") &&
    reservation.payment_preference === "online" &&
    reservation.payment_status !== "paid" &&
    reservation.payment_status !== "refunded" &&
    reservation.payment_status !== "service" &&
    (reservation.price_at_booking ?? 0) > 0
  );
}

export type PayResult = { ok: boolean; message: string };

// 결제창을 열고, 완료되면 서버(portone-payment 함수)에서 금액·상태를 재검증해
// 예약을 결제완료·확정으로 반영한다. 모바일 리디렉션 흐름은 /payment/portone 페이지가 처리.
export async function payReservation(reservation: Reservation): Promise<PayResult> {
  if (!STORE_ID || !CHANNEL_KEY) return { ok: false, message: "온라인 결제가 아직 준비되지 않았습니다." };
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요." };

  const amount = reservation.price_at_booking ?? 0;
  const paymentId = `wr-${reservation.id.slice(0, 8)}-${Date.now()}`;

  const response = await PortOne.requestPayment({
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

  if (!response) return { ok: false, message: "결제창을 여는 데 실패했습니다." };
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
  if (error || !result?.ok) {
    return { ok: false, message: result?.message ?? "결제 확인에 실패했습니다. 잠시 후 예약현황에서 다시 확인해 주세요." };
  }
  return { ok: true, message: result.message ?? "결제가 완료되었습니다." };
}

// ── 월권 정기결제(빌링키) ─────────────────────────────────────────────
// 월권 예약에 한해 카드 빌링키를 발급받아 서버에 전달하면, 서버가 첫 주기를
// 즉시 청구하고 매 주기 자동 청구한다.
export function canSubscribe(reservation: Reservation): boolean {
  const name = reservation.pass_name_snapshot || reservation.pass_type;
  return (
    hasBillingConfig &&
    name.includes("월권") &&
    (reservation.status === "pending" || reservation.status === "confirmed") &&
    reservation.payment_status !== "paid" &&
    reservation.payment_status !== "refunded" &&
    reservation.payment_status !== "service" &&
    (reservation.price_at_booking ?? 0) > 0
  );
}

export async function subscribeMonthly(reservation: Reservation): Promise<PayResult> {
  if (!STORE_ID || !BILLING_CHANNEL_KEY) return { ok: false, message: "정기결제가 아직 준비되지 않았습니다." };
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요." };

  const passName = reservation.pass_name_snapshot || reservation.pass_type;
  const issueId = `wrbk-${reservation.id.slice(0, 8)}-${Date.now()}`;

  const response = await PortOne.requestIssueBillingKey({
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

  if (!response) return { ok: false, message: "정기결제 창을 여는 데 실패했습니다." };
  if (response.code !== undefined) return { ok: false, message: response.message ?? "정기결제 등록이 취소되었습니다." };
  if (!response.billingKey) return { ok: false, message: "카드 등록에 실패했습니다." };

  return confirmBillingIssue(reservation.id, response.billingKey);
}

// 빌링키를 서버로 보내 첫 결제·구독 등록. 모바일 리디렉션 복귀 페이지에서도 재사용.
export async function confirmBillingIssue(reservationId: string, billingKey: string): Promise<PayResult> {
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요." };
  const { data, error } = await supabase.functions.invoke("portone-billing", {
    body: { type: "issue", reservationId, billingKey },
  });
  const result = data as { ok?: boolean; message?: string } | null;
  if (error || !result?.ok) return { ok: false, message: result?.message ?? "정기결제 등록에 실패했습니다." };
  return { ok: true, message: result.message ?? "정기결제가 등록되었습니다." };
}

export async function cancelSubscription(subscriptionId: string): Promise<PayResult> {
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다." };
  const { data, error } = await supabase.rpc("cancel_subscription", { p_id: subscriptionId });
  const result = data as { ok?: boolean; message?: string } | null;
  if (error || !result?.ok) return { ok: false, message: result?.message ?? "해지에 실패했습니다." };
  return { ok: true, message: result.message ?? "정기결제를 해지했어요." };
}

// 관리자 환불.
export async function refundReservationPayment(reservationId: string, reason: string): Promise<PayResult> {
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다." };
  const { data, error } = await supabase.functions.invoke("portone-payment", {
    body: { type: "refund", reservationId, reason },
  });
  const result = data as { ok?: boolean; message?: string } | null;
  if (error || !result?.ok) return { ok: false, message: result?.message ?? "환불 처리에 실패했습니다." };
  return { ok: true, message: result.message ?? "환불이 완료되었습니다." };
}
