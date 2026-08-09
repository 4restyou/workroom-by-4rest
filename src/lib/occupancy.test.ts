import { describe, expect, it } from "vitest";
import { currentOccupancy, peopleByReservationId } from "./occupancy";

describe("currentOccupancy", () => {
  const people = peopleByReservationId([
    { id: "solo", people: 1 },
    { id: "group", people: 4 },
  ]);

  it("counts a group booking by its people count, not by one row", () => {
    expect(currentOccupancy([{ reservation_id: "group" }], people)).toBe(4);
  });

  it("counts a walk-in stamp with no reservation as one person", () => {
    expect(currentOccupancy([{ reservation_id: null }], people)).toBe(1);
  });

  it("adds reservations and walk-ins together", () => {
    expect(
      currentOccupancy([{ reservation_id: "group" }, { reservation_id: "solo" }, { reservation_id: null }], people),
    ).toBe(6);
  });

  it("falls back to one person when the reservation is not loaded", () => {
    expect(currentOccupancy([{ reservation_id: "deleted" }], people)).toBe(1);
  });

  it("is zero when nobody is checked in", () => {
    expect(currentOccupancy([], people)).toBe(0);
  });
});
