import { describe, expect, it } from "vitest";
import {
  formatDateInputValue,
  formatPhone,
  formatPrice,
  formatTimeRange,
  currentReservationWindow,
  passDurationHours,
  reservationWindowForPass,
  shiftTime,
} from "./format";

describe("formatPhone", () => {
  it("formats a full mobile number", () => {
    expect(formatPhone("01049313298")).toBe("010-4931-3298");
  });

  it("formats progressively as digits are typed", () => {
    expect(formatPhone("010")).toBe("010");
    expect(formatPhone("0104")).toBe("010-4");
    expect(formatPhone("010493")).toBe("010-493");
    expect(formatPhone("0104931")).toBe("010-493-1");
  });

  it("strips non-digits and caps length", () => {
    expect(formatPhone("010-4931-3298")).toBe("010-4931-3298");
    expect(formatPhone("010 4931 3298 999")).toBe("010-4931-3298");
  });
});

describe("formatPrice", () => {
  it("adds thousands separators and 원", () => {
    expect(formatPrice(12000)).toBe("12,000원");
    expect(formatPrice(0)).toBe("0원");
  });
});

describe("formatDateInputValue", () => {
  it("formats a date as YYYY-MM-DD with zero padding", () => {
    expect(formatDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatDateInputValue(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("formatTimeRange", () => {
  it("trims seconds and joins with a dash", () => {
    expect(formatTimeRange("09:00:00", "12:00:00")).toBe("09:00 - 12:00");
  });
  it("falls back when no times are given", () => {
    expect(formatTimeRange(null, null)).toBe("시간 협의");
  });
});

describe("reservationWindowForPass", () => {
  it("uses the full operating window for day/week/month passes", () => {
    expect(reservationWindowForPass("종일권")).toMatchObject({ start_time: "09:00", end_time: "22:00" });
    expect(reservationWindowForPass("월권 지정석")).toMatchObject({ start_time: "09:00", end_time: "22:00" });
  });

  it("starts a time pass at the next whole hour for three hours", () => {
    expect(currentReservationWindow(3, new Date(2026, 6, 19, 13, 24))).toEqual({
      date: "2026-07-19",
      start_time: "14:00",
      end_time: "17:00",
    });
  });

  it("keeps the current hour when it is exactly on the hour", () => {
    expect(currentReservationWindow(3, new Date(2026, 6, 19, 13, 0))).toMatchObject({
      start_time: "13:00",
      end_time: "16:00",
    });
  });

  it("moves to the next opening time when three hours no longer fit", () => {
    expect(currentReservationWindow(3, new Date(2026, 6, 19, 19, 1))).toEqual({
      date: "2026-07-20",
      start_time: "09:00",
      end_time: "12:00",
    });
  });
});

describe("time pass helpers", () => {
  it("recognizes the configured duration", () => {
    expect(passDurationHours("3시간권")).toBe(3);
    expect(passDurationHours("추가 1시간")).toBe(1);
    expect(passDurationHours("종일권")).toBeNull();
  });

  it("moves an input time without crossing midnight", () => {
    expect(shiftTime("14:00", 3)).toBe("17:00");
    expect(shiftTime("22:00", 3)).toBeNull();
  });
});
