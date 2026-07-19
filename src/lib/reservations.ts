import type { Reservation } from "./types";

export function reservationPassName(reservation: Reservation) {
  return reservation.pass_name_snapshot || reservation.pass_type;
}

export function isLongTermReservation(reservation: Reservation) {
  const name = reservationPassName(reservation);
  return Boolean(reservation.access_start_date && reservation.access_end_date) || name.includes("주간권") || name.includes("월권");
}

export function reservationStartTime(reservation: Reservation, date = reservation.date) {
  return new Date(`${date}T${(reservation.start_time ?? "00:00").slice(0, 5)}:00+09:00`).getTime();
}

export function reservationEndTime(reservation: Reservation, date = reservation.date) {
  return new Date(`${date}T${(reservation.end_time ?? "23:59").slice(0, 5)}:00+09:00`).getTime();
}
