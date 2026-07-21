import type { Reservation } from "./types";

export function reservationPassName(reservation: Reservation) {
  return reservation.pass_name_snapshot || reservation.pass_type;
}

export function isLongTermReservation(reservation: Reservation) {
  const name = reservationPassName(reservation);
  return Boolean(reservation.access_start_date && reservation.access_end_date) || name.includes("주간권") || name.includes("월권");
}

export function reservationCoversDate(reservation: Reservation, date: string) {
  if (!isLongTermReservation(reservation)) return reservation.date === date;

  const start = reservation.access_start_date ?? reservation.date;
  const end = reservation.access_end_date ?? reservation.date;
  if (date < start || date > end) return false;

  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (reservation.access_weekdays?.length && !reservation.access_weekdays.includes(weekday)) return false;

  const paused = reservation.access_paused_from && reservation.access_paused_until
    && date >= reservation.access_paused_from
    && date <= reservation.access_paused_until;
  return !paused;
}

export function reservationStartTime(reservation: Reservation, date = reservation.date) {
  return new Date(`${date}T${(reservation.start_time ?? "00:00").slice(0, 5)}:00+09:00`).getTime();
}

export function reservationEndTime(reservation: Reservation, date = reservation.date) {
  const start = (reservation.start_time ?? "00:00").slice(0, 5);
  const end = (reservation.end_time ?? "23:59").slice(0, 5);
  const timestamp = new Date(`${date}T${end}:00+09:00`);
  if (end <= start) timestamp.setDate(timestamp.getDate() + 1);
  return timestamp.getTime();
}
