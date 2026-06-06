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
  return formatDateInputValue(new Date());
}

export function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentReservationWindow() {
  const start = new Date();
  start.setMinutes(start.getMinutes() <= 30 ? 30 : 60, 0, 0);

  const end = new Date(start);
  end.setHours(end.getHours() + 2);
  if (end.getDate() !== start.getDate()) {
    end.setTime(start.getTime());
    end.setHours(23, 59, 0, 0);
  }

  return {
    date: formatDateInputValue(start),
    start_time: formatTimeInputValue(start),
    end_time: formatTimeInputValue(end),
  };
}

function formatTimeInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
