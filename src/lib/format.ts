import type { ReservationStatus } from "./types";

export const statusLabel: Record<ReservationStatus, string> = {
  pending: "대기",
  confirmed: "확정",
  canceled: "취소",
  completed: "이용완료",
  no_show: "노쇼",
};

export function formatPrice(price: number) {
  return `${new Intl.NumberFormat("ko-KR").format(price)}원`;
}

// Auto-insert hyphens as a Korean phone number is typed (e.g. 010-0000-0000).
export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length < 11) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
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

export function currentReservationWindow(durationHours = 3, now = new Date()) {
  const start = new Date(now);
  const isAlreadyOnTheHour = start.getMinutes() === 0 && start.getSeconds() === 0 && start.getMilliseconds() === 0;
  if (isAlreadyOnTheHour) {
    start.setMinutes(0, 0, 0);
  } else {
    start.setHours(start.getHours() + 1, 0, 0, 0);
  }

  // The default operating window is 09:00–22:00. If three continuous hours
  // no longer fit today, start from the next day's opening time instead of
  // creating an invalid range such as 22:30–22:00.
  if (start.getHours() < 9) start.setHours(9, 0, 0, 0);

  const end = new Date(start);
  end.setHours(end.getHours() + durationHours);
  if (end.getDate() !== start.getDate() || end.getHours() > 22) {
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    end.setTime(start.getTime());
    end.setHours(end.getHours() + durationHours);
  }

  return {
    date: formatDateInputValue(start),
    start_time: formatTimeInputValue(start),
    end_time: formatTimeInputValue(end),
  };
}

export function passDurationHours(passName: string) {
  if (passName.includes("추가 1시간")) return 1;
  if (passName.includes("시간")) return 3;
  return null;
}

export function shiftTime(value: string, hours: number) {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  const total = hour * 60 + minute + hours * 60;
  if (total < 0 || total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function reservationWindowForPass(passName: string) {
  if (passName.includes("종일권") || passName.includes("주간권") || passName.includes("월권")) {
    return {
      date: todayValue(),
      start_time: "09:00",
      end_time: "22:00",
    };
  }

  if (passName.includes("추가 1시간")) return currentReservationWindow(1);
  return currentReservationWindow(3);
}

function formatTimeInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
