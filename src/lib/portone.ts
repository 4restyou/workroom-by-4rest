import * as PortOne from "@portone/browser-sdk/v2";
import { supabase } from "./supabase";
import type { Reservation } from "./types";

// PortOne(V2) 결제. 환경 변수 두 개가 모두 설정된 경우에만 활성화되며,
// 없으면 결제 버튼이 숨겨지고 안내 문구만 표시된다.
const STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID as string | undefined;
const CHANNEL_KEY = import.meta.env.VITE_PORTONE_CHANNEL_KEY as string | undefined;

export const hasPortoneConfig = Boolean(STORE_ID && CHANNEL_KEY);

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
