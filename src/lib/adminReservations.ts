// 관리자 예약 화면의 표현·계산 로직.
//
// AdminReservations.tsx가 1500줄을 넘기며 화면 조립과 문구·날짜·충돌 계산이
// 한 파일에 섞여 있었다. 여기 있는 함수는 전부 순수 함수라 화면과 무관하게
// 테스트할 수 있다 (src/lib/adminReservations.test.ts).

import { formatDate, formatPrice, formatTimeRange, statusLabel } from "./format";
import { tintCard } from "./ui";
import type {
  PaymentStatus,
  Reservation,
  ReservationAuditLog,
  ReservationPaymentLog,
  ReservationSmsLog,
  ReservationStatus,
} from "./types";

export const statusOptions: ReservationStatus[] = ["pending", "confirmed", "canceled", "completed", "no_show"];
export const statusTabs: ("all" | ReservationStatus)[] = [
  "pending",
  "confirmed",
  "all",
  "canceled",
  "completed",
  "no_show",
];
export const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: "미결제",
  paid: "결제완료",
  refunded: "환불",
  service: "서비스",
};
export const paymentStatusOptions: PaymentStatus[] = ["unpaid", "paid", "refunded", "service"];

export function isReservationStatus(value: string | null): value is ReservationStatus {
  return Boolean(value) && statusOptions.includes(value as ReservationStatus);
}

/** 관리자 예약 상세에서 한 번에 저장하는 편집 페이로드. */
export type ReservationEdit = {
  status: ReservationStatus;
  payment_method: string | null;
  payment_status: PaymentStatus;
  payment_preference: "online" | "onsite";
  admin_note: string;
  name: string;
  phone: string;
  email: string | null;
  pass_type: string;
  pass_id: string | null;
  pass_name_snapshot: string;
  price_at_booking: number | null;
  seat_type_id: string | null;
  access_start_date: string | null;
  access_end_date: string | null;
  access_weekdays: number[] | null;
  access_paused_from: string | null;
  access_paused_until: string | null;
  date: string;
  start_time: string;
  end_time: string;
  people: number;
};

// ── 날짜 계산 ─────────────────────────────────────────────────────────

/** "2026-08" 형식의 달을 delta만큼 이동한다. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function addDaysStr(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 이용권 이름에서 이용 주수를 읽는다(월권 4주, 주간권 1주). */
export function passPeriodWeeks(name: string): number {
  if (name.includes("월권")) return 4;
  if (name.includes("주간권")) return 1;
  return 0;
}

export function formatCompactDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}.${Number(day)}`;
}

export function formatCompactPeriod(start: string, end: string) {
  return `${formatCompactDate(start)}–${formatCompactDate(end)}`;
}

export function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

// ── 예약 충돌 ─────────────────────────────────────────────────────────

/**
 * 같은 날 시간이 겹치는 다른 예약 수.
 * 취소·완료·노쇼·보관된 예약은 자리를 차지하지 않으므로 양쪽 모두 제외한다.
 */
export function getConflictCount(target: Reservation, reservations: Reservation[]) {
  if (!target.start_time || !target.end_time) return 0;
  if (target.status === "canceled" || target.status === "completed" || target.status === "no_show" || target.deleted_at) {
    return 0;
  }
  const start = target.start_time;
  const end = target.end_time;

  return reservations.filter((reservation) => {
    if (reservation.id === target.id) return false;
    if (reservation.deleted_at) return false;
    if (reservation.date !== target.date) return false;
    if (!reservation.start_time || !reservation.end_time) return false;
    if (reservation.status === "canceled" || reservation.status === "completed" || reservation.status === "no_show") {
      return false;
    }

    return start < reservation.end_time && end > reservation.start_time;
  }).length;
}

// ── 고객 안내 문구 ────────────────────────────────────────────────────

export function buildConfirmedMessage(reservation: Reservation) {
  const passName = reservation.pass_name_snapshot || reservation.pass_type;
  return [
    "[WORKROOM by 4REST]",
    `${reservation.name}님, 예약이 확정되었습니다.`,
    "",
    `이용권: ${passName}`,
    `일시: ${formatDate(reservation.date)} ${formatTimeRange(reservation.start_time, reservation.end_time)}`,
    `인원: ${reservation.people}명`,
    reservation.price_at_booking ? `금액: ${formatPrice(reservation.price_at_booking)}` : null,
    "",
    "결제와 이용 안내는 방문 전 다시 안내드릴게요.",
    "Out of office, Into Workroom.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCanceledMessage(reservation: Reservation) {
  const passName = reservation.pass_name_snapshot || reservation.pass_type;
  return [
    "[WORKROOM by 4REST]",
    `${reservation.name}님, 요청하신 예약은 현재 확정이 어렵습니다.`,
    "",
    `이용권: ${passName}`,
    `신청 일시: ${formatDate(reservation.date)} ${formatTimeRange(reservation.start_time, reservation.end_time)}`,
    "",
    "가능한 시간대를 다시 확인해 주시면 조정 도와드릴게요.",
  ].join("\n");
}

// ── 로그 표현 ─────────────────────────────────────────────────────────

function labelStatus(status: ReservationStatus | null) {
  return status ? statusLabel[status] : "-";
}

function labelPayment(status: PaymentStatus | null) {
  return status ? paymentStatusLabels[status] : "-";
}

export function describeAuditLog(log: ReservationAuditLog) {
  const changes: string[] = [];
  if (log.before_status !== log.after_status) {
    changes.push(`상태 ${labelStatus(log.before_status)} → ${labelStatus(log.after_status)}`);
  }
  if (log.before_payment_status !== log.after_payment_status) {
    changes.push(`결제 ${labelPayment(log.before_payment_status)} → ${labelPayment(log.after_payment_status)}`);
  }
  if (log.before_admin_note !== log.after_admin_note) {
    changes.push("관리자 메모 변경");
  }
  if (!changes.length && log.action === "archived") return "보관 처리";
  if (!changes.length) return "예약 정보 변경";
  return changes.join(" · ");
}

export function describePaymentLog(log: ReservationPaymentLog) {
  const action = log.action === "confirm" ? "결제 승인" : "환불/취소";
  const status: Record<ReservationPaymentLog["status"], string> = {
    requested: "요청",
    succeeded: "성공",
    failed: "실패",
    skipped: "처리 제외",
  };
  const amount = log.amount ? ` · ${formatPrice(log.amount)}` : "";
  const code = log.provider_code ? ` · ${log.provider_code}` : "";
  return `${action} ${status[log.status]}${amount}${code}`;
}

export function paymentLogTint(status: ReservationPaymentLog["status"]) {
  if (status === "succeeded") return tintCard("mint");
  if (status === "failed") return tintCard("danger");
  if (status === "skipped") return tintCard("yellow");
  return tintCard("lilac");
}

export function smsEventLabel(event: string) {
  const labels: Record<string, string> = {
    reservation_received: "예약 접수 문자",
    admin_new_reservation: "관리자 새 예약 알림",
    reservation_confirmed: "예약 확정 문자",
    reservation_canceled: "예약 취소 문자",
    reservation_no_show: "노쇼 안내 문자",
    admin_cancellation: "관리자 취소 알림",
    admin_schedule_changed: "관리자 변경 알림",
    reservation_end_reminder: "종료 20분 전 안내",
    manual_confirmed: "확정 문자 재전송",
    manual_canceled: "취소 문자 재전송",
  };
  return labels[event] ?? event;
}

export function smsStatusLabel(status: ReservationSmsLog["status"]) {
  return status === "succeeded" ? "발송 성공" : status === "failed" ? "발송 실패" : "발송 안 됨";
}

export function smsLogTint(status: ReservationSmsLog["status"]) {
  if (status === "succeeded") return tintCard("mint");
  if (status === "failed") return tintCard("danger");
  return tintCard("yellow");
}

// ── 결제 워크플로 안내 ────────────────────────────────────────────────

export function paymentWorkflowLabel(reservation: Reservation) {
  if (reservation.payment_status === "service") return "서비스 이용";
  if (reservation.payment_status === "refunded") return "환불 완료";
  if (reservation.payment_status === "paid") return "결제 완료";
  if (reservation.status === "canceled") return "취소 · 환불 확인";
  if (reservation.payment_preference === "onsite") return "현장 결제 예정 (문의)";
  return "온라인 결제 대기";
}

export function paymentWorkflowDescription(reservation: Reservation) {
  if (reservation.payment_status === "service") {
    return "결제 없이 제공한 서비스 예약입니다. 매출과 미수금에 포함되지 않습니다.";
  }
  if (reservation.payment_status === "paid") return `${reservation.payment_method || "결제"}로 완료 처리되었습니다.`;
  if (reservation.payment_status === "refunded") return "환불 완료로 기록된 예약입니다.";
  if (reservation.status === "canceled") {
    return reservation.payment_status === "unpaid" ? "미결제 취소입니다." : "환불 처리가 필요한지 확인해 주세요.";
  }
  if (reservation.payment_preference === "onsite") {
    return "현장 결제(카드·현금) 예약입니다. 방문 전 문의로 협의해 주세요.";
  }
  return "회원이 카드로 결제하면 결제완료와 예약확정이 함께 자동 반영됩니다.";
}
