import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminPage, { AdminEmpty } from "./AdminPage";
import TodayTimeline from "./admin/TodayTimeline";
import { formatDate, formatTimeRange, todayValue, formatPrice } from "../lib/format";
import { currentOccupancy, peopleByReservationId } from "../lib/occupancy";
import { isLongTermReservation, reservationCoversDate } from "../lib/reservations";
import { supabase } from "../lib/supabase";
import { kstDate as kstDateShared } from "../lib/datetime";
import { badge, buttonClass } from "../lib/ui";
import type { Reservation } from "../lib/types";

type AttendanceRow = {
  reservation_id: string | null;
  check_in_at: string;
  check_out_at: string | null;
};

type AdminDashData = {
  reservations: Reservation[];
  attendance: AttendanceRow[];
  inquiries: Array<{ id: string; reservation_id: string | null; created_at: string }>;
  failedSms: Array<{ id: string; reservation_id: string; event: string; created_at: string }>;
  capacity: number;
  hours: { open_time: string | null; close_time: string | null } | null;
  unusedCoupons: number;
  dormant: Array<{ id: string; name: string; days: number }>;
};

type ActionItem = {
  key: string;
  title: string;
  detail: string;
  to: string;
  urgent?: boolean;
};

// 오늘의 운영 시간. 특정일 예외가 있으면 그쪽이 이긴다(요일 설정보다 우선).
function todayHours(
  today: string,
  hours: Array<{ weekday: number; open_time: string | null; close_time: string | null; is_closed: boolean }>,
  exception: { open_time: string | null; close_time: string | null; is_closed: boolean } | null,
) {
  if (exception) return exception.is_closed ? null : { open_time: exception.open_time, close_time: exception.close_time };
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const row = hours.find((item) => item.weekday === weekday);
  if (!row || row.is_closed) return null;
  return { open_time: row.open_time, close_time: row.close_time };
}

// 마지막 방문이 30일을 넘긴 회원. 한 번도 오지 않은 회원은 "휴면"이 아니라
// 아직 시작하지 않은 것이므로 제외한다.
function dormantMembers(
  today: string,
  members: Array<{ id: string; full_name: string | null }>,
  visits: Array<{ profile_id: string | null; check_in_at: string }>,
) {
  const lastVisit = new Map<string, string>();
  for (const visit of visits) {
    if (!visit.profile_id) continue;
    const day = kstDateShared(visit.check_in_at);
    const seen = lastVisit.get(visit.profile_id);
    if (!seen || day > seen) lastVisit.set(visit.profile_id, day);
  }
  return members
    .map((member) => {
      const last = lastVisit.get(member.id);
      return last ? { id: member.id, name: member.full_name || "이름 미입력", days: daysBetween(last, today) } : null;
    })
    .filter((item): item is { id: string; name: string; days: number } => Boolean(item) && (item as { days: number }).days >= 30)
    .sort((a, b) => b.days - a.days);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function timeMinutes(value?: string | null) {
  if (!value) return null;
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

function nowMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

const kstDate = kstDateShared;

function visitState(reservation: Reservation, attendance?: AttendanceRow, nowMinute?: number) {
  if (reservation.status === "pending") return { label: "확인 대기", tone: "yellow" as const };
  if (attendance?.check_out_at) return { label: "퇴실", tone: "sky" as const };
  if (attendance) return { label: "이용 중", tone: "ink" as const };
  // 시작하고 15분이 지나도 입실이 없으면 확인이 필요하다.
  const start = timeMinutes(reservation.start_time);
  if (nowMinute !== undefined && start !== null && !isLongTermReservation(reservation) && nowMinute > start + 15) {
    return { label: "미입실", tone: "danger" as const };
  }
  return { label: "입실 전", tone: "sky" as const };
}

export default function AdminDashboard() {
  const [data, setData] = useState<AdminDashData | null>(null);
  const [loadError, setLoadError] = useState("");

  async function load() {
    if (!supabase) return;
    const today = todayValue();
    const [reservationResult, attendanceResult, inquiryResult, smsResult, seatResult, hourResult, exceptionResult, couponResult, memberResult, visitResult] = await Promise.all([
      supabase
        .from("reservations")
        .select("*")
        .is("deleted_at", null)
        .or(`date.gte.${today},status.eq.pending,access_end_date.gte.${today}`)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(300),
      supabase.from("attendance").select("reservation_id,check_in_at,check_out_at").order("check_in_at", { ascending: false }).limit(300),
      supabase.from("reservation_inquiries").select("id,reservation_id,created_at").is("admin_reply", null).order("created_at", { ascending: true }).limit(50),
      supabase.from("reservation_sms_logs").select("id,reservation_id,event,status,created_at").order("created_at", { ascending: false }).limit(100),
      supabase.from("seat_types").select("capacity,is_active").eq("is_active", true),
      // 타임라인 축은 오늘 운영 시간을 따른다(특정일 단축영업이 있으면 그것을 우선).
      supabase.from("business_hours").select("weekday,open_time,close_time,is_closed"),
      supabase.from("business_date_exceptions").select("date,open_time,close_time,is_closed").eq("date", today).maybeSingle(),
      supabase.from("coupons").select("id").eq("status", "issued").limit(200),
      // 휴면 판정을 위해 회원과 최근 출석을 가져온다.
      supabase.from("profiles").select("id,full_name").eq("role", "user").limit(500),
      supabase.from("attendance").select("profile_id,check_in_at").order("check_in_at", { ascending: false }).limit(2000),
    ]);

    if (reservationResult.error || attendanceResult.error) {
      setLoadError(reservationResult.error?.message ?? attendanceResult.error?.message ?? "운영 현황을 불러오지 못했습니다.");
      return;
    }

    setLoadError("");
    setData({
      reservations: (reservationResult.data ?? []) as Reservation[],
      attendance: (attendanceResult.data ?? []) as AttendanceRow[],
      inquiries: inquiryResult.error ? [] : (inquiryResult.data ?? []),
      failedSms: smsResult.error ? [] : latestFailedSms((smsResult.data ?? []) as Array<{ id: string; reservation_id: string; event: string; status: string; created_at: string }>),
      capacity: seatResult.error ? 0 : (seatResult.data ?? []).reduce((sum, item) => sum + Number(item.capacity || 0), 0),
      hours: todayHours(today, hourResult.error ? [] : hourResult.data ?? [], exceptionResult.error ? null : exceptionResult.data),
      unusedCoupons: couponResult.error ? 0 : (couponResult.data ?? []).length,
      dormant: dormantMembers(
        today,
        memberResult.error ? [] : memberResult.data ?? [],
        visitResult.error ? [] : visitResult.data ?? [],
      ),
    });
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const summary = useMemo(() => {
    const today = todayValue();
    const minute = nowMinutes();
    const reservations = data?.reservations ?? [];
    const attendance = data?.attendance ?? [];
    const attendanceByReservation = new Map(attendance.filter((item) => item.reservation_id && kstDate(item.check_in_at) === today).map((item) => [item.reservation_id as string, item]));
    const todaySchedule = reservations
      .filter((reservation) => reservationCoversDate(reservation, today) && (reservation.status === "pending" || reservation.status === "confirmed"))
      .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
    // 워크인(예약 없는 도장)까지 포함해 입퇴실 화면과 같은 기준으로 센다.
    const openToday = attendance.filter((item) => !item.check_out_at && kstDate(item.check_in_at) === today);
    const activePeople = currentOccupancy(openToday, peopleByReservationId(reservations));
    const next = todaySchedule.find((reservation) => reservation.status === "confirmed" && !isLongTermReservation(reservation) && !attendanceByReservation.has(reservation.id) && (timeMinutes(reservation.start_time) ?? 0) >= minute);
    const longTerm = todaySchedule.filter((reservation) => isLongTermReservation(reservation));

    const actions: ActionItem[] = [];
    reservations.filter((reservation) => reservation.status === "pending").slice(0, 8).forEach((reservation) => {
      const expired = Boolean(reservation.payment_due_at && new Date(reservation.payment_due_at).getTime() < Date.now());
      actions.push({
        key: `pending-${reservation.id}`,
        title: expired ? `${reservation.name} · 결제 기한 지남` : `${reservation.name} · 예약 확인 대기`,
        detail: `${formatDate(reservation.date)} · ${reservation.pass_name_snapshot || reservation.pass_type}`,
        to: `/admin/reservations?reservation=${reservation.id}`,
        urgent: expired,
      });
    });
    todaySchedule.forEach((reservation) => {
      if (reservation.status !== "confirmed" || isLongTermReservation(reservation)) return;
      const row = attendanceByReservation.get(reservation.id);
      const start = timeMinutes(reservation.start_time);
      let end = timeMinutes(reservation.end_time);
      if (start !== null && end !== null && end <= start) end += 24 * 60;
      const adjustedMinute = minute < 8 ? minute + 24 * 60 : minute;
      if (!row && start !== null && adjustedMinute > start + 15) {
        actions.push({ key: `late-${reservation.id}`, title: `${reservation.name} · 아직 입실하지 않음`, detail: `${formatTimeRange(reservation.start_time, reservation.end_time)} 예약`, to: "/admin/attendance", urgent: true });
      }
      if (row && !row.check_out_at && end !== null && adjustedMinute > end + 10) {
        actions.push({ key: `over-${reservation.id}`, title: `${reservation.name} · 퇴실 확인 필요`, detail: `${formatTimeRange(reservation.start_time, reservation.end_time)} 이용`, to: "/admin/attendance", urgent: true });
      }
    });
    (data?.failedSms ?? []).slice(0, 4).forEach((item) => actions.push({ key: `sms-${item.id}`, title: "문자 발송 실패", detail: "예약 상세에서 발송 상태를 확인해 주세요.", to: `/admin/reservations?reservation=${item.reservation_id}`, urgent: true }));
    (data?.inquiries ?? []).slice(0, 4).forEach((item) => actions.push({ key: `inquiry-${item.id}`, title: "답변하지 않은 문의", detail: "회원 문의 내용을 확인해 주세요.", to: item.reservation_id ? `/admin/reservations?reservation=${item.reservation_id}` : "/admin/reservations" }));

    const upcoming = reservations
      .filter((reservation) => reservation.date > today && reservation.status === "confirmed")
      .sort((a, b) => `${a.date}${a.start_time ?? ""}`.localeCompare(`${b.date}${b.start_time ?? ""}`))
      .slice(0, 5);

    // 온라인 결제 오픈 전에는 '받아야 할 돈'을 놓치기 쉬우므로 오늘치를 모아 보여준다.
    const unpaidToday = todaySchedule.filter((reservation) => (reservation.payment_status ?? "unpaid") === "unpaid" && (reservation.price_at_booking ?? 0) > 0);
    const unpaidTodayAmount = unpaidToday.reduce((sum, reservation) => sum + (reservation.price_at_booking ?? 0), 0);
    // 이용 시간이 끝났는데 아직 미수인 건은 바로 처리해야 한다.
    unpaidToday.forEach((reservation) => {
      let end = timeMinutes(reservation.end_time);
      const start = timeMinutes(reservation.start_time);
      if (start !== null && end !== null && end <= start) end += 24 * 60;
      const adjustedMinute = minute < 8 ? minute + 24 * 60 : minute;
      if (end !== null && adjustedMinute > end) {
        actions.push({
          key: `unpaid-${reservation.id}`,
          title: `${reservation.name} · 결제 미확인`,
          detail: `${formatTimeRange(reservation.start_time, reservation.end_time)} 이용 · ${formatPrice(reservation.price_at_booking ?? 0)}`,
          to: `/admin/reservations?reservation=${reservation.id}`,
          urgent: true,
        });
      }
    });

    // 곧 끝나는 장기 이용권. 만료 뒤에야 알면 재구매를 권할 시점을 놓치고,
    // 회원은 어느 날 갑자기 이용권이 없어진 것처럼 느낀다.
    reservations
      .filter((reservation) => reservation.status === "confirmed" && reservation.access_end_date && (reservation.payment_status ?? "unpaid") !== "refunded")
      .map((reservation) => ({ reservation, daysLeft: daysBetween(today, reservation.access_end_date as string) }))
      .filter((item) => item.daysLeft >= 0 && item.daysLeft <= 3)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 6)
      .forEach(({ daysLeft, reservation }) => {
        actions.push({
          key: `expiring-${reservation.id}`,
          title: `${reservation.name} · 이용권 ${daysLeft === 0 ? "오늘 만료" : `${daysLeft}일 뒤 만료`}`,
          detail: `${reservation.pass_name_snapshot || reservation.pass_type} · 마지막 이용일 ${formatDate(reservation.access_end_date as string)}`,
          to: `/admin/reservations?reservation=${reservation.id}`,
          urgent: daysLeft === 0,
        });
      });

    // ── 관계 항목 ────────────────────────────────────────────────
    // 위 항목들이 "오늘 당장 할 일"이라면, 아래는 놓치면 조용히 손님이 떠나는 일이다.
    // 급하지 않으므로 urgent를 붙이지 않고 목록 뒤쪽에 둔다.

    // 쿠폰을 받고 아직 안 쓴 회원 — 다시 올 이유를 이미 손에 쥔 사람들이다.
    if ((data?.unusedCoupons ?? 0) > 0) {
      actions.push({
        key: "coupons-unused",
        title: `사용하지 않은 쿠폰 ${data?.unusedCoupons}장`,
        detail: "방문하시면 먼저 안내해 주세요.",
        to: "/admin/attendance",
      });
    }

    // 한동안 오지 않은 회원. 이용권이 끝난 뒤 그대로 멀어지는 경우가 많다.
    (data?.dormant ?? []).slice(0, 5).forEach((member) => {
      actions.push({
        key: `dormant-${member.id}`,
        title: `${member.name} · ${member.days}일째 방문 없음`,
        detail: "마지막 방문 이후 연락이 없었습니다.",
        to: `/admin/customer/${member.id}`,
      });
    });

    // 급한 항목이 조용한 대기 항목에 묻히지 않도록 정렬한다.
    actions.sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)));

    return { actions, activePeople, attendanceByReservation, longTerm, minute, next, todaySchedule, upcoming, unpaidToday, unpaidTodayAmount };
  }, [data]);

  return (
    <AdminPage
      actions={<Link className={buttonClass("accent", "md")} to="/admin/reservations">예약 등록·관리</Link>}
      description={`${formatDate(todayValue())} 예약과 입퇴실 상태를 기준으로 표시합니다.`}
      title="오늘 운영"
    >
      <div className="admin-compact">
        {loadError ? <p className="mb-4 border border-red-400 bg-workroom-danger/30 px-4 py-3 text-sm font-semibold">{loadError}</p> : null}

        {/* 휴대폰에서는 1열이라 지표 5개가 화면 한 판을 다 차지했다. 2열로 접는다. */}
        <section className="grid grid-cols-2 border-y border-workroom-line bg-white sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCell label="현재 이용 / 정원" value={data ? `${summary.activePeople} / ${data.capacity || "-"}명` : "-"} />
          <SummaryCell label="오늘 예약" value={data ? `${summary.todaySchedule.length}건` : "-"} />
          <SummaryCell label="장기 이용" value={data ? `${summary.longTerm.length}명` : "-"} />
          <SummaryCell label="오늘 받을 돈" value={data ? (summary.unpaidToday.length ? `${formatPrice(summary.unpaidTodayAmount)} · ${summary.unpaidToday.length}건` : "없음") : "-"} />
          <SummaryCell label="다음 방문" value={data ? (summary.next ? `${summary.next.start_time?.slice(0, 5)} ${summary.next.name}` : "예정 없음") : "-"} />
        </section>

        <section className="mt-7">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">처리할 일</h2>
              <p className="mt-0.5 text-xs font-medium text-workroom-muted">결제·입퇴실·문자·문의 중 확인이 필요한 항목입니다.</p>
            </div>
            <span className="text-sm font-semibold tabular-nums">{summary.actions.length}건</span>
          </div>
          {data && summary.actions.length ? (
            <div className="border-y border-workroom-line bg-white">
              {summary.actions.slice(0, 12).map((item) => (
                <Link className={`admin-row flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-workroom-background ${item.urgent ? "border-l-[3px] border-l-red-500" : "border-l-[3px] border-l-workroom-yellow"}`} key={item.key} to={item.to}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <p className="mt-0.5 truncate text-xs font-medium text-workroom-muted">{item.detail}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold">확인</span>
                </Link>
              ))}
              {/* 잘라낸 항목이 있으면 숨겼다는 사실을 알린다(개수만 맞고 목록은 짧던 문제). */}
              {summary.actions.length > 12 ? (
                <Link className="admin-row flex items-center justify-between gap-4 px-4 py-3 text-sm font-semibold hover:bg-workroom-background" to="/admin/reservations?status=pending">
                  <span>외 {summary.actions.length - 12}건 더 있습니다</span>
                  <span className="shrink-0">전체 보기</span>
                </Link>
              ) : null}
            </div>
          ) : data ? <AdminEmpty>지금 바로 처리할 항목이 없습니다.</AdminEmpty> : <AdminEmpty>운영 현황을 불러오는 중입니다.</AdminEmpty>}
        </section>

        <section className="mt-7">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">오늘 일정</h2>
              <p className="mt-0.5 text-xs font-medium text-workroom-muted">
                시간축에서 빈 시간과 겹치는 시간을 함께 봅니다. 블록을 누르면 그 손님의 카드가 열립니다.
              </p>
            </div>
            <Link className="text-sm font-semibold underline underline-offset-4" to={`/admin/reservations?date=${todayValue()}&status=all`}>목록으로 보기</Link>
          </div>
          {data && summary.todaySchedule.length ? (
            <>
              <TodayTimeline
                closeTime={data.hours?.close_time ?? null}
                nowMinute={summary.minute}
                openTime={data.hours?.open_time ?? null}
                reservations={summary.todaySchedule}
                stateOf={(reservation) => visitState(reservation, summary.attendanceByReservation.get(reservation.id), summary.minute)}
              />
              <div className="mt-3 border-y border-workroom-line bg-white">
                {summary.todaySchedule.map((reservation) => {
                  const attendance = summary.attendanceByReservation.get(reservation.id);
                  const state = visitState(reservation, attendance, summary.minute);
                  return (
                    <Link className="admin-row grid gap-2 px-4 py-3 hover:bg-workroom-background sm:grid-cols-[110px_1fr_auto] sm:items-center" key={reservation.id} to={reservation.profile_id ? `/admin/customer/${reservation.profile_id}` : `/admin/reservations?reservation=${reservation.id}`}>
                      <p className="text-sm font-bold tabular-nums">{isLongTermReservation(reservation) ? "장기 이용" : formatTimeRange(reservation.start_time, reservation.end_time)}</p>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{reservation.name} · {reservation.people}명</p>
                        <p className="mt-0.5 truncate text-xs font-medium text-workroom-muted">{reservation.pass_name_snapshot || reservation.pass_type} · {paymentLabel(reservation)}</p>
                      </div>
                      <span className={badge(state.tone)}>{state.label}</span>
                    </Link>
                  );
                })}
              </div>
            </>
          ) : data ? <AdminEmpty>오늘 예정된 이용이 없습니다.</AdminEmpty> : <AdminEmpty>예약을 불러오는 중입니다.</AdminEmpty>}
        </section>

        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">다가오는 예약</h2>
            <Link className="text-sm font-semibold underline underline-offset-4" to="/admin/reservations?status=confirmed">예약 관리</Link>
          </div>
          {data && summary.upcoming.length ? (
            <div className="border-y border-workroom-line bg-white">
              {summary.upcoming.map((reservation) => (
                <Link className="admin-row flex items-center justify-between gap-4 px-4 py-3 hover:bg-workroom-background" key={reservation.id} to={`/admin/reservations?reservation=${reservation.id}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{reservation.name} · {reservation.people}명</p>
                    <p className="mt-0.5 text-xs font-medium text-workroom-muted">{formatDate(reservation.date)} · {formatTimeRange(reservation.start_time, reservation.end_time)}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-workroom-muted">{reservation.pass_name_snapshot || reservation.pass_type}</span>
                </Link>
              ))}
            </div>
          ) : <AdminEmpty>다가오는 확정 예약이 없습니다.</AdminEmpty>}
        </section>
      </div>
    </AdminPage>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-workroom-line px-4 py-3.5 last:border-r-0 even:border-r-0 sm:border-b-0 sm:border-r sm:even:border-r sm:last:border-r-0">
      <p className="text-xs font-semibold text-workroom-muted">{label}</p>
      <p className="mt-1 truncate text-lg font-bold tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}

function paymentLabel(reservation: Reservation) {
  if (reservation.payment_status === "paid") return "결제완료";
  if (reservation.payment_status === "service") return "서비스";
  if (reservation.payment_status === "refunded") return "환불";
  return reservation.payment_preference === "onsite" ? "방문결제" : "미결제";
}

function latestFailedSms(rows: Array<{ id: string; reservation_id: string; event: string; status: string; created_at: string }>) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.reservation_id}:${row.event}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return row.status === "failed";
  }).map(({ id, reservation_id, event, created_at }) => ({ id, reservation_id, event, created_at }));
}
