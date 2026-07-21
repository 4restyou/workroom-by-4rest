import { describe, expect, it } from "vitest";
import { isLongTermReservation, reservationCoversDate, reservationEndTime, reservationPassName, reservationStartTime } from "./reservations";
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

  it("includes long-term passes on dates inside their access period", () => {
    const monthly = reservation({
      pass_name_snapshot: "월권 자유석",
      access_start_date: "2026-07-01",
      access_end_date: "2026-07-28",
    });
    expect(reservationCoversDate(monthly, "2026-07-22")).toBe(true);
    expect(reservationCoversDate(monthly, "2026-07-29")).toBe(false);
    expect(reservationCoversDate(reservation(), "2026-07-22")).toBe(false);
  });

  it("excludes paused days and unavailable weekdays from long-term access", () => {
    const monthly = reservation({
      pass_name_snapshot: "월권 자유석",
      access_start_date: "2026-07-01",
      access_end_date: "2026-07-28",
      access_weekdays: [1, 2, 3, 4, 5],
      access_paused_from: "2026-07-20",
      access_paused_until: "2026-07-22",
    });
    expect(reservationCoversDate(monthly, "2026-07-19")).toBe(false);
    expect(reservationCoversDate(monthly, "2026-07-21")).toBe(false);
    expect(reservationCoversDate(monthly, "2026-07-23")).toBe(true);
  });

  it("builds reservation timestamps in Korea time", () => {
    const item = reservation();
    expect(new Date(reservationStartTime(item)).toISOString()).toBe("2026-07-19T00:00:00.000Z");
    expect(new Date(reservationEndTime(item)).toISOString()).toBe("2026-07-19T03:00:00.000Z");
  });

  it("moves an overnight end time to the next calendar day", () => {
    const item = reservation({ start_time: "22:00:00", end_time: "01:00:00" });
    expect(new Date(reservationEndTime(item)).toISOString()).toBe("2026-07-19T16:00:00.000Z");
  });
});
