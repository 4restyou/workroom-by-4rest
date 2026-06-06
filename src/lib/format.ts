import type { ReservationStatus } from "./types";

export const statusLabel: Record<ReservationStatus, string> = {
  pending: "대기",
  confirmed: "확정",
  canceled: "취소",
  completed: "이용완료",
};

export function formatPrice(price: number) {
  return `${new Intl.NumberFormat("ko-KR").format(price)}원`;
}

export function formatDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00`));
}

export function formatTimeRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "시간 협의";
  return `${(start ?? "").slice(0, 5)} - ${(end ?? "").slice(0, 5)}`;
}

export function todayValue() {
  return new Date().toISOString().slice(0, 10);
}
