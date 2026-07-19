import { describe, expect, it } from "vitest";
import { isLongTermReservation, reservationEndTime, reservationPassName, reservationStartTime } from "./reservations";
import type { Reservation } from "./types";

function reservation(overrides: Partial<Reservation> = {}) {
  return {
    id: "r1",
    pass_type: "3시간권",
    pass_name_snapshot: null,
    date: "2026-07-19",
    start_time: "09:00:00",
    end_time: "12:00:00",
    access_start_date: null,
    access_end_date: null,
    ...overrides,
  } as Reservation;
}

describe("reservation helpers", () => {
  it("uses the booking snapshot name", () => {
    expect(reservationPassName(reservation({ pass_name_snapshot: "월권 자유석" }))).toBe("월권 자유석");
  });

  it("detects weekly and monthly access reservations", () => {
    expect(isLongTermReservation(reservation({ pass_type: "주간권" }))).toBe(true);
    expect(isLongTermReservation(reservation({ access_start_date: "2026-07-19", access_end_date: "2026-08-15" }))).toBe(true);
    expect(isLongTermReservation(reservation())).toBe(false);
  });

  it("builds reservation timestamps in Korea time", () => {
    const item = reservation();
    expect(new Date(reservationStartTime(item)).toISOString()).toBe("2026-07-19T00:00:00.000Z");
    expect(new Date(reservationEndTime(item)).toISOString()).toBe("2026-07-19T03:00:00.000Z");
  });
});
