import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminPage, { AdminEmpty } from "./AdminPage";
import { formatDate, formatTimeRange, todayValue } from "../lib/format";
import { isLongTermReservation, reservationCoversDate } from "../lib/reservations";
import { supabase } from "../lib/supabase";
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
};

type ActionItem = {
  key: string;
  title: string;
  detail: string;
  to: string;
  urgent?: boolean;
};

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

function kstDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(value));
}

function visitState(reservation: Reservation, attendance?: AttendanceRow) {
  if (reservation.status === "pending") return { label: "확인 대기", tone: "yellow" as const };
  if (attendance?.check_out_at) return { label: "퇴실", tone: "sky" as const };
  if (attendance) return { label: "이용 중", tone: "ink" as const };
  return { label: "입실 전", tone: "sky" as const };
}

export default function AdminDashboard() {
  const [data, setData] = useState<AdminDashData | null>(null);
  const [loadError, setLoadError] = useState("");

  async function load() {
    if (!supabase) return;
    const today = todayValue();
    const [reservationResult, attendanceResult, inquiryResult, smsResult, seatResult] = await Promise.all([
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
    const active = todaySchedule.filter((reservation) => {
      const row = attendanceByReservation.get(reservation.id);
      return row && !row.check_out_at;
    });
    const activePeople = active.reduce((sum, reservation) => sum + reservation.people, 0);
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

    return { actions, activePeople, attendanceByReservation, longTerm, next, todaySchedule, upcoming };
  }, [data]);

  return (
    <AdminPage
      actions={<Link className={buttonClass("accent", "md")} to="/admin/reservations">예약 등록·관리</Link>}
      description={`${formatDate(todayValue())} 예약과 입퇴실 상태를 기준으로 표시합니다.`}
      title="오늘 운영"
    >
      <div className="admin-compact">
        {loadError ? <p className="mb-4 border border-red-400 bg-workroom-danger/30 px-4 py-3 text-sm font-semibold">{loadError}</p> : null}

        <section className="grid border-y border-workroom-line bg-white sm:grid-cols-4">
          <SummaryCell label="현재 이용 / 정원" value={data ? `${summary.activePeople} / ${data.capacity || "-"}명` : "-"} />
          <SummaryCell label="오늘 예약" value={data ? `${summary.todaySchedule.length}건` : "-"} />
          <SummaryCell label="장기 이용" value={data ? `${summary.longTerm.length}명` : "-"} />
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
            </div>
          ) : data ? <AdminEmpty>지금 바로 처리할 항목이 없습니다.</AdminEmpty> : <AdminEmpty>운영 현황을 불러오는 중입니다.</AdminEmpty>}
        </section>

        <section className="mt-7">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">오늘 이용</h2>
              <p className="mt-0.5 text-xs font-medium text-workroom-muted">시간권과 장기 이용권을 함께 표시합니다.</p>
            </div>
            <Link className="text-sm font-semibold underline underline-offset-4" to={`/admin/reservations?date=${todayValue()}&status=all`}>전체 보기</Link>
          </div>
          {data && summary.todaySchedule.length ? (
            <div className="border-y border-workroom-line bg-white">
              {summary.todaySchedule.map((reservation) => {
                const attendance = summary.attendanceByReservation.get(reservation.id);
                const state = visitState(reservation, attendance);
                return (
                  <Link className="admin-row grid gap-2 px-4 py-3.5 hover:bg-workroom-background sm:grid-cols-[110px_1fr_auto] sm:items-center" key={reservation.id} to={`/admin/reservations?reservation=${reservation.id}`}>
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
    <div className="border-b border-workroom-line px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs font-semibold text-workroom-muted">{label}</p>
      <p className="mt-1 truncate text-xl font-bold tabular-nums">{value}</p>
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
