import { describe, expect, it } from "vitest";
import { diffDays, matchesQuery, summarizeCustomer } from "./customer";
import type { Attendance, Reservation } from "./types";

const TODAY = "2026-08-14";
// 테스트에서는 UTC 타임스탬프를 그대로 날짜로 본다(KST 변환은 lib/datetime의 몫).
const kstDate = (value: string) => value.slice(0, 10);

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    date: TODAY,
    start_time: "14:00:00",
    end_time: "17:00:00",
    people: 1,
    status: "confirmed",
    payment_status: "paid",
    payment_preference: "online",
    price_at_booking: 14000,
    pass_type: "3시간권",
    pass_name_snapshot: "3시간권",
    access_start_date: null,
    access_end_date: null,
    deleted_at: null,
    ...overrides,
  } as Reservation;
}

function attendance(checkIn: string): Attendance {
  return { id: checkIn, profile_id: "p1", reservation_id: null, check_in_at: checkIn, check_out_at: null, created_at: checkIn } as Attendance;
}

describe("summarizeCustomer", () => {
  it("finds the long-term pass that covers today and how long is left", () => {
    const pass = reservation({
      id: "m1",
      pass_type: "월권 자유석",
      pass_name_snapshot: "월권 자유석",
      date: "2026-08-01",
      access_start_date: "2026-08-01",
      access_end_date: "2026-08-28",
    });
    const summary = summarizeCustomer([pass], [], [], TODAY, kstDate);
    expect(summary.activePass?.id).toBe("m1");
    expect(summary.passDaysLeft).toBe(14);
  });

  it("ignores a long-term pass whose period already ended", () => {
    const expired = reservation({
      pass_type: "월권 자유석",
      pass_name_snapshot: "월권 자유석",
      access_start_date: "2026-07-01",
      access_end_date: "2026-07-28",
    });
    expect(summarizeCustomer([expired], [], [], TODAY, kstDate).activePass).toBeNull();
  });

  it("picks the nearest upcoming single booking", () => {
    const later = reservation({ id: "b", date: "2026-08-20" });
    const sooner = reservation({ id: "a", date: "2026-08-16" });
    const past = reservation({ id: "old", date: "2026-08-01" });
    expect(summarizeCustomer([later, sooner, past], [], [], TODAY, kstDate).nextReservation?.id).toBe("a");
  });

  it("counts only money that is genuinely outstanding", () => {
    const summary = summarizeCustomer(
      [
        reservation({ id: "unpaid", payment_status: "unpaid", price_at_booking: 14000 }),
        reservation({ id: "canceled", payment_status: "unpaid", status: "canceled", price_at_booking: 40000 }),
        reservation({ id: "noshow", payment_status: "unpaid", status: "no_show", price_at_booking: 40000 }),
      ],
      [],
      [],
      TODAY,
      kstDate,
    );
    expect(summary.unpaidAmount).toBe(14000);
  });

  it("counts a day with several stamps as one visit", () => {
    const summary = summarizeCustomer(
      [],
      [attendance("2026-08-10T09:00:00Z"), attendance("2026-08-10T15:00:00Z"), attendance("2026-08-12T09:00:00Z")],
      [],
      TODAY,
      kstDate,
    );
    expect(summary.visitCount).toBe(2);
    expect(summary.lastVisit).toBe("2026-08-12");
    expect(summary.daysSinceLastVisit).toBe(2);
  });

  it("reports net revenue after a partial refund", () => {
    const summary = summarizeCustomer(
      [reservation({ id: "m1", price_at_booking: 229000 })],
      [],
      [
        { reservation_id: "m1", action: "confirm", amount: 229000 },
        { reservation_id: "m1", action: "refund", amount: 150000 },
      ],
      TODAY,
      kstDate,
    );
    expect(summary.netPaid).toBe(79000);
    expect(summary.totalRefunded).toBe(150000);
  });

  it("leaves deleted reservations out of every number", () => {
    const summary = summarizeCustomer(
      [reservation({ id: "gone", deleted_at: "2026-08-01T00:00:00Z", payment_status: "unpaid" })],
      [],
      [],
      TODAY,
      kstDate,
    );
    expect(summary.unpaidAmount).toBe(0);
    expect(summary.nextReservation).toBeNull();
  });

  it("has no visit history when nobody checked in", () => {
    const summary = summarizeCustomer([], [], [], TODAY, kstDate);
    expect(summary.lastVisit).toBeNull();
    expect(summary.daysSinceLastVisit).toBeNull();
  });
});

describe("matchesQuery", () => {
  const person = { name: "김워크", phone: "010-1234-5678", email: "work@example.com" };

  it("matches part of a name", () => {
    expect(matchesQuery("워크", person)).toBe(true);
  });

  it("matches a phone number typed without hyphens", () => {
    expect(matchesQuery("1234", person)).toBe(true);
    expect(matchesQuery("010-1234", person)).toBe(true);
  });

  it("matches an email fragment", () => {
    expect(matchesQuery("example", person)).toBe(true);
  });

  it("does not match unrelated text or an empty query", () => {
    expect(matchesQuery("박포레", person)).toBe(false);
    expect(matchesQuery("   ", person)).toBe(false);
  });
});

describe("diffDays", () => {
  it("counts calendar days between two dates", () => {
    expect(diffDays("2026-08-01", "2026-08-14")).toBe(13);
    expect(diffDays("2026-08-14", "2026-08-14")).toBe(0);
    expect(diffDays("2026-08-20", "2026-08-14")).toBe(-6);
  });
});
