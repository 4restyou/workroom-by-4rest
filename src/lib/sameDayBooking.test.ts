import { describe, expect, it } from "vitest";
import { bookingLabel, checkSameDay, type ExistingBooking } from "./sameDayBooking";

const booking = (overrides: Partial<ExistingBooking> = {}): ExistingBooking => ({
  id: "r1",
  date: "2026-10-05",
  start_time: "13:00:00",
  end_time: "16:00:00",
  status: "confirmed",
  pass_type: "3시간권",
  pass_name_snapshot: "3시간권",
  ...overrides,
});

const slot = (start: string, end: string, date = "2026-10-05") => ({ date, start_time: start, end_time: end });

describe("checkSameDay", () => {
  it("catches a booking that runs into an existing one", () => {
    // 실제로 자주 일어난 경우: 13-16을 잡아 두고 15-18을 또 잡는다.
    const result = checkSameDay([booking()], slot("15:00", "18:00"));
    expect(result.overlapping).toHaveLength(1);
    expect(result.sameDay).toHaveLength(0);
  });

  it("does not call a back-to-back extension an overlap", () => {
    // 16시에 끝나고 16시에 시작하는 '추가 1시간'은 겹치는 게 아니다.
    const result = checkSameDay([booking()], slot("16:00", "17:00"));
    expect(result.overlapping).toHaveLength(0);
    expect(result.sameDay).toHaveLength(1);
  });

  it("reports another booking the same day without blocking it", () => {
    const result = checkSameDay([booking()], slot("19:00", "22:00"));
    expect(result.overlapping).toHaveLength(0);
    expect(result.sameDay).toHaveLength(1);
  });

  it("leaves other days alone", () => {
    expect(checkSameDay([booking()], slot("13:00", "16:00", "2026-10-06")).sameDay).toHaveLength(0);
  });

  it("handles a booking that runs past midnight", () => {
    // 22시~01시 예약이 있는 날에 23시를 잡으면 겹친다.
    const night = booking({ start_time: "22:00:00", end_time: "01:00:00" });
    expect(checkSameDay([night], slot("23:00", "23:59")).overlapping).toHaveLength(1);
  });

  it("ignores cancelled bookings", () => {
    // 취소한 시간에 다시 잡는 것은 정상이다.
    expect(checkSameDay([booking({ status: "canceled" })], slot("13:00", "16:00")).overlapping).toHaveLength(0);
  });

  it("says when a long pass already covers the day", () => {
    const monthly = booking({
      pass_type: "월권 자유석",
      pass_name_snapshot: "월권 자유석",
      access_start_date: "2026-10-01",
      access_end_date: "2026-10-28",
    });
    const result = checkSameDay([monthly], slot("13:00", "16:00"));
    expect(result.covering).toHaveLength(1);
    expect(result.overlapping).toHaveLength(0);
  });

  it("does not treat a long pass from another month as covering", () => {
    const monthly = booking({
      access_start_date: "2026-08-01",
      access_end_date: "2026-08-28",
    });
    expect(checkSameDay([monthly], slot("13:00", "16:00")).covering).toHaveLength(0);
  });

  it("counts a booking with no times as same-day only", () => {
    // 문의 상품은 시간이 없어 겹침을 판단할 수 없다.
    const inquiry = booking({ start_time: null, end_time: null, pass_type: "단체 및 모임 문의" });
    const result = checkSameDay([inquiry], slot("13:00", "16:00"));
    expect(result.sameDay).toHaveLength(1);
    expect(result.overlapping).toHaveLength(0);
  });
});

describe("bookingLabel", () => {
  it("reads as the member would recognise it", () => {
    expect(bookingLabel(booking())).toBe("3시간권 13:00-16:00");
    expect(bookingLabel(booking({ start_time: null, end_time: null }))).toBe("3시간권");
  });
});
