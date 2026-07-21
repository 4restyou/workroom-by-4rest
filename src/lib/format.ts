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
  const startValue = (start ?? "").slice(0, 5);
  const endValue = (end ?? "").slice(0, 5);
  return `${startValue} - ${endValue}${startValue && endValue && endValue <= startValue ? " (다음 날)" : ""}`;
}

export function todayValue() {
  return formatDateInputValue(new Date());
}

// 예약 가능 기간: 오늘부터 최대 2개월 뒤 날짜(YYYY-MM-DD)까지.
export const MAX_BOOKING_MONTHS = 2;

export function maxBookingDateValue(from = new Date()) {
  const limit = new Date(from.getFullYear(), from.getMonth() + MAX_BOOKING_MONTHS, from.getDate());
  return formatDateInputValue(limit);
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

  // Fallback until the live 08:00-next-day 01:00 schedule is loaded.
  if (start.getHours() < 8) start.setHours(8, 0, 0, 0);

  const end = new Date(start);
  end.setHours(end.getHours() + durationHours);
  if (start.getHours() * 60 + durationHours * 60 > 25 * 60) {
    start.setDate(start.getDate() + 1);
    start.setHours(8, 0, 0, 0);
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
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

export function operatingTimeSlots(open: string, close: string, durationHours: number, earliestMinute?: number) {
  const openMinute = timeMinutes(open);
  let closeMinute = timeMinutes(close);
  if (closeMinute <= openMinute) closeMinute += 24 * 60;
  const firstWholeHour = Math.ceil(openMinute / 60) * 60;
  const minimum = Math.max(firstWholeHour, earliestMinute ?? firstWholeHour);
  const first = Math.ceil(minimum / 60) * 60;
  const duration = durationHours * 60;
  const slots: string[] = [];
  for (let minute = first; minute + duration <= closeMinute; minute += 60) {
    const wrapped = minute % (24 * 60);
    slots.push(`${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`);
  }
  return slots;
}

export function reservationWindowForPass(passName: string) {
  if (passName.includes("종일권") || passName.includes("주간권") || passName.includes("월권")) {
    return {
      date: todayValue(),
      start_time: "08:00",
      end_time: "01:00",
    };
  }

  if (passName.includes("추가 1시간")) return currentReservationWindow(1);
  return currentReservationWindow(3);
}

function formatTimeInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function timeMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}
