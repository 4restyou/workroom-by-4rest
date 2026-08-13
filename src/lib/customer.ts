// 고객 한 명의 상태를 한 줄로 요약한다.
//
// 지금까지 이 정보는 세 화면에 흩어져 있었다. 회원 탭에는 방문·쿠폰이,
// 예약 탭에는 결제·환불·문자 이력이, 입퇴실 탭에는 오늘 입실 여부가 있었다.
// 손님 응대 중에 탭을 오가야 해서 실제로는 잘 보지 않게 된다.
//
// 여기 있는 함수는 전부 순수 함수라 화면 없이 테스트할 수 있다
// (src/lib/customer.test.ts).

import { isLongTermReservation } from "./reservations";
import { reservationMoney, type RevenueLog } from "./revenue";
import type { Attendance, Reservation } from "./types";

export type CustomerSummary = {
  /** 오늘 기준 이용 중인 장기 이용권(월권·주간권). */
  activePass: Reservation | null;
  /** 이용권이 끝나기까지 남은 일수. 장기 이용권이 없으면 null. */
  passDaysLeft: number | null;
  /** 오늘 이후 가장 가까운 단건 예약. */
  nextReservation: Reservation | null;
  /** 아직 받지 못한 금액(취소·노쇼 제외). */
  unpaidAmount: number;
  /** 마지막 방문일(YYYY-MM-DD). 방문 기록이 없으면 null. */
  lastVisit: string | null;
  /** 마지막 방문 이후 지난 날수. 방문이 없으면 null. */
  daysSinceLastVisit: number | null;
  /** 방문 일수(같은 날 여러 번 찍혀도 1회). */
  visitCount: number;
  /** 실제로 받은 금액에서 환불을 뺀 값. */
  netPaid: number;
  totalRefunded: number;
};

function dayOf(iso: string, kstDate: (value: string) => string) {
  return kstDate(iso);
}

export function diffDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function summarizeCustomer(
  reservations: readonly Reservation[],
  attendance: readonly Attendance[],
  paymentLogs: readonly RevenueLog[],
  today: string,
  kstDate: (value: string) => string,
): CustomerSummary {
  const live = reservations.filter((item) => !item.deleted_at);

  const activePass =
    live.find((item) => {
      if (item.status !== "confirmed" || !isLongTermReservation(item)) return false;
      const start = item.access_start_date ?? item.date;
      const end = item.access_end_date ?? item.date;
      return today >= start && today <= end;
    }) ?? null;

  const passDaysLeft = activePass ? diffDays(today, activePass.access_end_date ?? activePass.date) : null;

  const nextReservation =
    live
      .filter((item) => !isLongTermReservation(item) && item.date >= today && (item.status === "pending" || item.status === "confirmed"))
      .sort((a, b) => `${a.date}${a.start_time ?? ""}`.localeCompare(`${b.date}${b.start_time ?? ""}`))[0] ?? null;

  // 취소·노쇼는 받을 돈이 아니다. 서비스(무료)도 제외.
  const unpaidAmount = live
    .filter((item) => item.status !== "canceled" && item.status !== "no_show" && (item.payment_status ?? "unpaid") === "unpaid")
    .reduce((sum, item) => sum + (item.price_at_booking ?? 0), 0);

  const visitDays = new Set(attendance.map((item) => dayOf(item.check_in_at, kstDate)));
  const sortedVisits = [...visitDays].sort();
  const lastVisit = sortedVisits.length ? sortedVisits[sortedVisits.length - 1] : null;

  const logsByReservation = new Map<string, RevenueLog[]>();
  for (const log of paymentLogs) {
    const list = logsByReservation.get(log.reservation_id);
    if (list) list.push(log);
    else logsByReservation.set(log.reservation_id, [log]);
  }

  let netPaid = 0;
  let totalRefunded = 0;
  for (const reservation of live) {
    if ((reservation.payment_status ?? "unpaid") === "service") continue;
    const money = reservationMoney(reservation, logsByReservation.get(reservation.id));
    netPaid += money.net;
    totalRefunded += money.refunded;
  }

  return {
    activePass,
    passDaysLeft,
    nextReservation,
    unpaidAmount,
    lastVisit,
    daysSinceLastVisit: lastVisit ? diffDays(lastVisit, today) : null,
    visitCount: visitDays.size,
    netPaid,
    totalRefunded,
  };
}

/**
 * 검색어가 이름·연락처·이메일 중 하나에 걸리는지.
 * 연락처는 하이픈을 무시하고 숫자만 비교한다("1234"로 010-1234-5678을 찾을 수 있게).
 */
export function matchesQuery(query: string, fields: { name?: string | null; phone?: string | null; email?: string | null }) {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const digits = q.replace(/\D/g, "");
  if ((fields.name ?? "").toLowerCase().includes(q)) return true;
  if ((fields.email ?? "").toLowerCase().includes(q)) return true;
  if (digits && (fields.phone ?? "").replace(/\D/g, "").includes(digits)) return true;
  return false;
}
