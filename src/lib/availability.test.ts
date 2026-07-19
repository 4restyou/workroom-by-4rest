import { describe, expect, it } from "vitest";
import { computeFullDates, peakConcurrent, toMinutes, type IntervalInput } from "./availability";

describe("toMinutes", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("22:00:00")).toBe(1320);
  });
});

describe("peakConcurrent", () => {
  it("returns 0 for no intervals", () => {
    expect(peakConcurrent([])).toBe(0);
  });

  it("counts overlapping people at the busiest moment", () => {
    expect(
      peakConcurrent([
        { start: 540, end: 720, people: 1 }, // 09-12
        { start: 600, end: 660, people: 2 }, // 10-11 (overlaps)
      ]),
    ).toBe(3);
  });

  it("does not double-count back-to-back bookings (end == start)", () => {
    expect(
      peakConcurrent([
        { start: 540, end: 660, people: 1 }, // 09-11
        { start: 660, end: 780, people: 1 }, // 11-13
      ]),
    ).toBe(1);
  });

  it("sums people for fully overlapping bookings", () => {
    expect(
      peakConcurrent([
        { start: 540, end: 1320, people: 2 },
        { start: 540, end: 1320, people: 3 },
      ]),
    ).toBe(5);
  });
});

describe("computeFullDates", () => {
  const day = "2026-06-10";

  it("is empty when capacity is not reached", () => {
    const rows: IntervalInput[] = [{ date: day, start_time: "09:00", end_time: "12:00", people: 1, status: "confirmed" }];
    expect(computeFullDates(rows, 5).size).toBe(0);
  });

  it("marks a date full when peak occupancy meets capacity", () => {
    const rows: IntervalInput[] = [
      { date: day, start_time: "09:00", end_time: "12:00", people: 3, status: "pending" },
      { date: day, start_time: "10:00", end_time: "11:00", people: 2, status: "confirmed" },
    ];
    expect(computeFullDates(rows, 5).has(day)).toBe(true);
  });

  it("ignores canceled / no_show / completed reservations", () => {
    const rows: IntervalInput[] = [
      { date: day, start_time: "09:00", end_time: "22:00", people: 5, status: "canceled" },
      { date: day, start_time: "09:00", end_time: "22:00", people: 5, status: "no_show" },
    ];
    expect(computeFullDates(rows, 5).size).toBe(0);
  });

  it("skips rows without a time window", () => {
    const rows: IntervalInput[] = [{ date: day, start_time: null, end_time: null, people: 5, status: "confirmed" }];
    expect(computeFullDates(rows, 1).size).toBe(0);
  });

  it("keeps separate days independent", () => {
    const rows: IntervalInput[] = [
      { date: "2026-06-10", start_time: "09:00", end_time: "22:00", people: 2, status: "confirmed" },
      { date: "2026-06-11", start_time: "09:00", end_time: "22:00", people: 1, status: "confirmed" },
    ];
    const full = computeFullDates(rows, 2);
    expect(full.has("2026-06-10")).toBe(true);
    expect(full.has("2026-06-11")).toBe(false);
  });

  it("treats missing people as 1", () => {
    const rows: IntervalInput[] = [
      { date: day, start_time: "09:00", end_time: "12:00", people: null, status: "confirmed" },
      { date: day, start_time: "09:00", end_time: "12:00", people: null, status: "confirmed" },
    ];
    expect(computeFullDates(rows, 2).has(day)).toBe(true);
  });

  it("counts a reservation that ends after midnight on its starting date", () => {
    const rows: IntervalInput[] = [
      { date: day, start_time: "22:00", end_time: "01:00", people: 2, status: "confirmed" },
    ];
    expect(computeFullDates(rows, 2).has(day)).toBe(true);
  });
});
