import { describe, expect, it } from "vitest";
import { axisRange, axisTicks, packLanes, percentOf, timeToMinutes, toSpan } from "./timeline";

const AXIS = axisRange("08:00:00", "01:00:00");

describe("axisRange", () => {
  it("unfolds an overnight closing time onto one axis", () => {
    expect(AXIS).toEqual({ open: 480, close: 1500 });
  });

  it("keeps a same-day range as is", () => {
    expect(axisRange("09:00:00", "22:00:00")).toEqual({ open: 540, close: 1320 });
  });

  it("falls back to 08:00-01:00 when hours are missing", () => {
    expect(axisRange(null, null)).toEqual({ open: 480, close: 1500 });
  });
});

describe("toSpan", () => {
  it("places an afternoon booking", () => {
    expect(toSpan("14:00:00", "17:00:00", AXIS)).toEqual({ startMin: 840, endMin: 1020 });
  });

  it("unfolds a booking that ends after midnight", () => {
    expect(toSpan("23:00:00", "01:00:00", AXIS)).toEqual({ startMin: 1380, endMin: 1500 });
  });

  it("places a booking that lives entirely after midnight", () => {
    // 00:00~01:00 은 축의 끝자락이지 새벽 0시의 시작이 아니다.
    expect(toSpan("00:00:00", "01:00:00", AXIS)).toEqual({ startMin: 1440, endMin: 1500 });
  });

  it("clamps a booking that runs past closing", () => {
    expect(toSpan("22:00:00", "03:00:00", AXIS)).toEqual({ startMin: 1320, endMin: 1500 });
  });

  it("returns null when there is no usable time", () => {
    expect(toSpan(null, "17:00:00", AXIS)).toBeNull();
    expect(toSpan("14:00:00", null, AXIS)).toBeNull();
  });
});

describe("packLanes", () => {
  const span = (id: string, startMin: number, endMin: number) => ({ item: id, startMin, endMin });

  it("puts non-overlapping bookings on one lane", () => {
    const lanes = packLanes([span("a", 480, 660), span("b", 660, 840)]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].map((entry) => entry.item)).toEqual(["a", "b"]);
  });

  it("opens a second lane when two bookings overlap", () => {
    const lanes = packLanes([span("a", 480, 720), span("b", 600, 840)]);
    expect(lanes).toHaveLength(2);
  });

  it("reuses the earliest free lane", () => {
    // a와 b가 겹쳐 두 줄이 되고, c는 a가 끝난 뒤라 첫 줄로 돌아간다.
    const lanes = packLanes([span("a", 480, 600), span("b", 540, 900), span("c", 600, 700)]);
    expect(lanes).toHaveLength(2);
    expect(lanes[0].map((entry) => entry.item)).toEqual(["a", "c"]);
    expect(lanes[1].map((entry) => entry.item)).toEqual(["b"]);
  });

  it("has no lanes for an empty day", () => {
    expect(packLanes([])).toEqual([]);
  });
});

describe("percentOf", () => {
  it("maps the axis ends to 0 and 100", () => {
    expect(percentOf(480, AXIS)).toBe(0);
    expect(percentOf(1500, AXIS)).toBe(100);
  });

  it("maps the middle to roughly half", () => {
    expect(Math.round(percentOf(990, AXIS))).toBe(50);
  });
});

describe("axisTicks", () => {
  it("labels every second hour and wraps past midnight", () => {
    const labels = axisTicks(AXIS).map((tick) => tick.label);
    expect(labels[0]).toBe("08시");
    expect(labels).toContain("00시");
  });
});

describe("timeToMinutes", () => {
  it("reads HH:MM(:SS)", () => {
    expect(timeToMinutes("14:30:00")).toBe(870);
    expect(timeToMinutes("00:00")).toBe(0);
  });

  it("returns null for missing or malformed values", () => {
    expect(timeToMinutes(null)).toBeNull();
    expect(timeToMinutes("보통")).toBeNull();
  });
});
