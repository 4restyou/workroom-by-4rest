import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY as string | undefined;

export const hasTossConfig = Boolean(TOSS_CLIENT_KEY);

type PaymentRequest = {
  customerKey: string;
  orderId: string;
  orderName: string;
  amount: number;
  customerName?: string;
  customerEmail?: string;
};

// Opens the Toss payment window. On success Toss redirects to /payment/success
// (with paymentKey/orderId/amount); on failure to /payment/fail.
export async function requestReservationPayment(request: PaymentRequest): Promise<void> {
  if (!TOSS_CLIENT_KEY) throw new Error("결제가 아직 설정되지 않았습니다.");
  const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
  const payment = tossPayments.payment({ customerKey: request.customerKey });
  await payment.requestPayment({
    method: "CARD",
    amount: { currency: "KRW", value: request.amount },
    orderId: request.orderId,
    orderName: request.orderName,
    successUrl: `${window.location.origin}/payment/success`,
    failUrl: `${window.location.origin}/payment/fail`,
    customerName: request.customerName,
    customerEmail: request.customerEmail,
    card: { useEscrow: false, flowMode: "DEFAULT", useInternationalCardOnly: false, useCardPoint: false, useAppCardOnly: false },
  });
}
