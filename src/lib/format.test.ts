import { describe, expect, it } from "vitest";
import {
  formatDateInputValue,
  formatPhone,
  formatPrice,
  formatTimeRange,
  reservationWindowForPass,
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
});
