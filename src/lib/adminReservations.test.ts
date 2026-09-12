import { describe, expect, it } from "vitest";
import {
  addDaysStr,
  buildPaymentRequestMessage,
  buildUsageGuideMessage,
  formatCompactPeriod,
  getConflictCount,
  isReservationStatus,
  passPeriodWeeks,
  paymentWorkflowLabel,
  shiftMonth,
} from "./adminReservations";
import type { Reservation } from "./types";

function reservation(overrides: Partial<Reservation> = {}) {
  return {
    id: "r1",
    date: "2026-08-10",
    start_time: "09:00:00",
    end_time: "12:00:00",
    status: "confirmed",
    payment_status: "unpaid",
    payment_preference: "online",
    deleted_at: null,
    ...overrides,
  } as Reservation;
}

describe("shiftMonth", () => {
  it("달을 앞뒤로 옮긴다", () => {
    expect(shiftMonth("2026-08", 1)).toBe("2026-09");
    expect(shiftMonth("2026-08", -1)).toBe("2026-07");
  });

  it("연도 경계를 넘는다", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("addDaysStr", () => {
  it("날짜를 더한다", () => {
    expect(addDaysStr("2026-08-10", 5)).toBe("2026-08-15");
  });

  it("월·연 경계를 넘는다", () => {
    expect(addDaysStr("2026-08-30", 3)).toBe("2026-09-02");
    expect(addDaysStr("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("윤년 2월을 올바르게 넘는다", () => {
    expect(addDaysStr("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("passPeriodWeeks", () => {
  it("이용권 이름에서 주수를 읽는다", () => {
    expect(passPeriodWeeks("월권 자유석")).toBe(4);
    expect(passPeriodWeeks("주간권")).toBe(1);
    expect(passPeriodWeeks("3시간권")).toBe(0);
  });
});

describe("formatCompactPeriod", () => {
  it("앞의 0을 떼고 기간을 짧게 쓴다", () => {
    expect(formatCompactPeriod("2026-08-01", "2026-09-05")).toBe("8.1–9.5");
  });
});

describe("isReservationStatus", () => {
  it("알려진 상태만 통과시킨다", () => {
    expect(isReservationStatus("confirmed")).toBe(true);
    expect(isReservationStatus("bogus")).toBe(false);
    expect(isReservationStatus(null)).toBe(false);
  });
});

describe("getConflictCount", () => {
  const target = reservation({ id: "target" });

  it("같은 날 시간이 겹치는 예약을 센다", () => {
    const others = [
      reservation({ id: "a", start_time: "11:00:00", end_time: "14:00:00" }),
      reservation({ id: "b", start_time: "08:00:00", end_time: "10:00:00" }),
    ];
    expect(getConflictCount(target, [target, ...others])).toBe(2);
  });

  it("자기 자신은 세지 않는다", () => {
    expect(getConflictCount(target, [target])).toBe(0);
  });

  it("맞닿기만 한 예약은 겹침이 아니다", () => {
    const back = reservation({ id: "a", start_time: "12:00:00", end_time: "15:00:00" });
    expect(getConflictCount(target, [target, back])).toBe(0);
  });

  it("다른 날짜는 세지 않는다", () => {
    const other = reservation({ id: "a", date: "2026-08-11" });
    expect(getConflictCount(target, [target, other])).toBe(0);
  });

  it("취소·완료·노쇼·보관된 예약은 자리를 차지하지 않는다", () => {
    const ignored = [
      reservation({ id: "a", status: "canceled" }),
      reservation({ id: "b", status: "completed" }),
      reservation({ id: "c", status: "no_show" }),
      reservation({ id: "d", deleted_at: "2026-08-01T00:00:00Z" }),
    ];
    expect(getConflictCount(target, [target, ...ignored])).toBe(0);
  });

  it("대상 예약이 이미 취소·보관 상태면 0을 돌려준다", () => {
    const overlapping = reservation({ id: "a" });
    expect(getConflictCount(reservation({ id: "target", status: "canceled" }), [overlapping])).toBe(0);
    expect(getConflictCount(reservation({ id: "target", deleted_at: "2026-08-01T00:00:00Z" }), [overlapping])).toBe(0);
  });

  it("시간이 없는 예약(장기권 등)은 겹침 판정에서 뺀다", () => {
    const noTime = reservation({ id: "a", start_time: null, end_time: null });
    expect(getConflictCount(target, [target, noTime])).toBe(0);
    expect(getConflictCount(noTime, [target])).toBe(0);
  });
});

describe("paymentWorkflowLabel", () => {
  it("결제 상태를 운영자 관점 문구로 바꾼다", () => {
    expect(paymentWorkflowLabel(reservation({ payment_status: "service" }))).toBe("서비스 이용");
    expect(paymentWorkflowLabel(reservation({ payment_status: "refunded" }))).toBe("환불 완료");
    expect(paymentWorkflowLabel(reservation({ payment_status: "paid" }))).toBe("결제 완료");
    expect(paymentWorkflowLabel(reservation({ status: "canceled" }))).toBe("취소 · 환불 확인");
    expect(paymentWorkflowLabel(reservation({ payment_preference: "onsite" }))).toBe("현장 결제 예정 (문의)");
    expect(paymentWorkflowLabel(reservation())).toBe("온라인 결제 대기");
  });

  it("결제 상태가 취소 상태보다 우선한다", () => {
    // 취소됐어도 환불이 끝났으면 '환불 완료'로 보여야 한다.
    expect(paymentWorkflowLabel(reservation({ status: "canceled", payment_status: "refunded" }))).toBe("환불 완료");
  });
});

describe("buildPaymentRequestMessage", () => {
  it("tells a 시간권 booking to pay before the start time", () => {
    const text = buildPaymentRequestMessage(reservation({ pass_type: "3시간권", pass_name_snapshot: "3시간권", people: 1, price_at_booking: 14000 }));
    expect(text).toContain("아직 결제 전입니다");
    expect(text).toContain("이용 시작 시간 전까지 결제해 주세요.");
    expect(text).toContain("14,000원");
  });

  it("gives a 종일권 booking the 3pm same-day deadline and the late-arrival tip", () => {
    const text = buildPaymentRequestMessage(reservation({ pass_type: "종일권", pass_name_snapshot: "종일권" }));
    expect(text).toContain("이용 당일 오후 3시까지 결제해 주세요.");
    // 35,000원 종일권은 8시간(=17시 입장)이 3시간권+연장과 손익분기다.
    expect(text).toContain("17시 이후 입장하실 예정이면 3시간권이 더 저렴하니 말씀해 주세요.");
  });

  it("does not show the 종일권 tip on other passes", () => {
    const text = buildPaymentRequestMessage(reservation({ pass_type: "3시간권", pass_name_snapshot: "3시간권" }));
    expect(text).not.toContain("17시 이후 입장");
  });

  it("gives a long-term pass the start-date deadline and shows the period start", () => {
    const text = buildPaymentRequestMessage(
      reservation({ pass_type: "월권 자유석", pass_name_snapshot: "월권 자유석", access_start_date: "2026-09-01" }),
    );
    expect(text).toContain("이용 시작일 전까지 결제해 주세요.");
    expect(text).toContain("이용 시작:");
  });

  it("always states that on-site payment needs advance notice", () => {
    const text = buildPaymentRequestMessage(reservation({ pass_type: "3시간권", pass_name_snapshot: "3시간권" }));
    expect(text).toContain("현장 결제(카드·현금)는 미리 말씀해 주신 경우에만 가능합니다.");
  });

  it("says the amount will be confirmed later when no price is set", () => {
    const text = buildPaymentRequestMessage(reservation({ pass_type: "단체 및 모임 이용권", price_at_booking: null }));
    expect(text).toContain("금액: 확인 후 안내드립니다");
  });
});

describe("buildUsageGuideMessage", () => {
  it("gives one cup to anything short of a full day", () => {
    // 단체·모임은 3시간 대관이라 1잔이다.
    expect(buildUsageGuideMessage(reservation({ pass_type: "단체 및 모임 이용권", pass_name_snapshot: "단체 및 모임 이용권" }), "1234")).toContain("커피는 1잔 드립니다.");
  });

  it("gives three cups only to the all-day passes", () => {
    expect(buildUsageGuideMessage(reservation({ pass_type: "주간권", pass_name_snapshot: "주간권" }), "1234")).toContain("커피는 하루 3잔까지 드립니다.");
  });

  it("gives the time pass one cup and the day pass three", () => {
    expect(buildUsageGuideMessage(reservation({ pass_type: "3시간권", pass_name_snapshot: "3시간권" }), "1234")).toContain("커피는 1잔 드립니다.");
    expect(buildUsageGuideMessage(reservation({ pass_type: "추가 1시간", pass_name_snapshot: "추가 1시간" }), "1234")).toContain("커피는 1잔 드립니다.");
    expect(buildUsageGuideMessage(reservation({ pass_type: "종일권", pass_name_snapshot: "종일권" }), "1234")).toContain("커피는 하루 3잔까지 드립니다.");
    expect(buildUsageGuideMessage(reservation({ pass_type: "월권 자유석", pass_name_snapshot: "월권 자유석" }), "1234")).toContain("커피는 하루 3잔까지 드립니다.");
  });

  it("puts the door code in when there is one", () => {
    expect(buildUsageGuideMessage(reservation({ pass_type: "3시간권", pass_name_snapshot: "3시간권" }), "8825*")).toContain("출입구 비밀번호 8825*");
  });

  it("promises to send the code separately when it is not set", () => {
    // 설정에 비밀번호가 없는데 빈칸을 보내면 손님이 문 앞에서 못 들어온다.
    const text = buildUsageGuideMessage(reservation({ pass_type: "3시간권", pass_name_snapshot: "3시간권" }), "");
    expect(text).toContain("방문 전에 따로 안내드릴게요");
    expect(text).not.toContain("출입구 비밀번호 ");
  });

  it("reads in the order a first visit happens", () => {
    const text = buildUsageGuideMessage(reservation({ pass_type: "3시간권", pass_name_snapshot: "3시간권" }), "1234");
    const order = ["■ 위치", "■ 실내화", "■ 자리", "■ 커피", "■ 컵", "■ 음악", "■ 에어컨", "■ 음식 · 소리", "■ 나가실 때"];
    const positions = order.map((heading) => text.indexOf(heading));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions.every((position) => position >= 0)).toBe(true);
  });

  it("gives the mobile number, not the landline", () => {
    // 유선번호는 카드사 표시용이다. 손님이 걸 곳은 휴대폰.
    const text = buildUsageGuideMessage(reservation({ pass_type: "3시간권", pass_name_snapshot: "3시간권" }), "1234");
    expect(text).toContain("문의 010-4931-3298");
    expect(text).not.toContain("070-8211-1734");
  });
});
