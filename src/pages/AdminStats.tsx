import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminPage, { AdminEmpty, AdminFeedback } from "../components/AdminPage";
import { defaultPasses } from "../lib/defaultPasses";
import { formatPrice, statusLabel } from "../lib/format";
import { groupLogsByReservation, reservationMoney, sumRevenue, type RevenueLog } from "../lib/revenue";
import { kstDate, kstHour, kstWeekdayIndex } from "../lib/datetime";
import { RESERVATION_LIST_COLUMNS } from "../lib/columns";
import { supabase } from "../lib/supabase";
import { useFeedbackToast } from "../lib/useFeedbackToast";
import { buttonClass } from "../lib/ui";
import type { Pass, PaymentStatus, Reservation, ReservationStatus } from "../lib/types";
import { useSession } from "../lib/sessionContext";

type Period = "day" | "week" | "month" | "quarter" | "year";
const periodLabels: Record<Period, string> = { day: "일별", week: "주별", month: "월별", quarter: "분기별", year: "연도별" };

type AttendanceLite = { check_in_at: string; check_out_at: string | null };
type MetricKey = "revenue" | "total" | "receivable" | "refunded" | "confirmed" | "noShow" | "service";
const metricLabels: Record<MetricKey, string> = {
  revenue: "실결제 매출",
  total: "예약",
  receivable: "미수금",
  refunded: "환불",
  confirmed: "확정·완료",
  noShow: "노쇼",
  service: "서비스",
};
const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

// 특정 날짜가 속한 달(±offset)의 전체 범위와 라벨.
function monthOf(dateStr: string, offset = 0) {
  const base = new Date(`${dateStr || new Date().toISOString().slice(0, 10)}T00:00:00`);
  const first = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const last = new Date(base.getFullYear(), base.getMonth() + offset + 1, 0);
  const value = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { start: value(first), end: value(last), label: `${first.getFullYear()}년 ${first.getMonth() + 1}월` };
}

function monthRange(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const value = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { start: value(first), end: value(last) };
}

export default function AdminStats() {
  const { status: sessionStatus, isSignedIn, isAdmin } = useSession();
  const navigate = useNavigate();
  const currentMonth = monthRange();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLite[]>([]);
  const [passes, setPasses] = useState<Pass[]>(defaultPasses);
  const [period, setPeriod] = useState<Period>("day");
  const [startDate, setStartDate] = useState(currentMonth.start);
  const [endDate, setEndDate] = useState(currentMonth.end);
  const [passFilter, setPassFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentStatus>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ReservationStatus>("all");
  const [paymentLogs, setPaymentLogs] = useState<RevenueLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  useFeedbackToast(undefined, error);

  useEffect(() => {
    // 세션·권한은 SessionProvider가 이미 읽어 뒀다(RequireAdmin도 같은 값을 본다).
    // 여기서는 상태만 확인하고 데이터만 불러온다.
    if (sessionStatus !== "ready") return;
    async function checkAndLoad() {
      if (!supabase) { setError("Supabase 환경 변수가 연결되지 않았습니다."); setIsLoading(false); return; }
      if (!isSignedIn) { navigate("/admin", { replace: true }); return; }
      if (!isAdmin) { navigate("/account", { replace: true }); return; }
      await loadStats();
    }
    void checkAndLoad();
  }, [sessionStatus, isSignedIn, isAdmin, navigate]);

  async function loadStats() {
    if (!supabase) return;
    setIsLoading(true); setError("");
    const [reservationResult, passResult, attendanceResult, logResult] = await Promise.all([
      supabase.from("reservations").select(RESERVATION_LIST_COLUMNS).is("deleted_at", null).order("date", { ascending: false }).limit(3000),
      supabase.from("passes").select("id,name,description,price,is_active,sort_order").order("sort_order", { ascending: true }),
      supabase.from("attendance").select("check_in_at,check_out_at").order("check_in_at", { ascending: false }).limit(6000),
      // 금액은 결제 원장에서 읽는다(부분 환불은 payment_status로 알 수 없다).
      supabase.from("reservation_payment_logs").select("reservation_id,action,amount").eq("status", "succeeded").order("created_at", { ascending: false }).limit(6000),
    ]);
    setIsLoading(false);
    if (reservationResult.error) { setError(reservationResult.error.message); return; }
    if (!passResult.error && passResult.data?.length) setPasses(passResult.data);
    setReservations((reservationResult.data ?? []) as Reservation[]);
    if (!attendanceResult.error) setAttendance((attendanceResult.data ?? []) as AttendanceLite[]);
    if (!logResult.error) setPaymentLogs((logResult.data ?? []) as RevenueLog[]);
  }

  const priceByPassName = useMemo(() => new Map(passes.map((pass) => [pass.name, pass.price])), [passes]);
  const logsByReservation = useMemo(() => groupLogsByReservation(paymentLogs), [paymentLogs]);
  const visible = useMemo(() => reservations.filter((item) => (!startDate || item.date >= startDate) && (!endDate || item.date <= endDate) && (passFilter === "all" || (item.pass_name_snapshot || item.pass_type) === passFilter) && (paymentFilter === "all" || (item.payment_status ?? "unpaid") === paymentFilter) && (statusFilter === "all" || item.status === statusFilter)), [endDate, passFilter, paymentFilter, reservations, startDate, statusFilter]);

  const previousRange = useMemo(() => {
    if (startDate === currentMonth.start && endDate === currentMonth.end) return monthRange(-1);
    const start = new Date(`${startDate}T00:00:00`); const end = new Date(`${endDate}T00:00:00`); const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1); const prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1); const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days + 1); const value = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; return { start: value(prevStart), end: value(prevEnd) };
  }, [currentMonth.end, currentMonth.start, endDate, startDate]);
  const previous = useMemo(() => reservations.filter((item) => item.date >= previousRange.start && item.date <= previousRange.end && (passFilter === "all" || (item.pass_name_snapshot || item.pass_type) === passFilter)), [passFilter, previousRange.end, previousRange.start, reservations]);

  // 숫자만 보면 "어떤 예약인지" 확인하러 예약 화면을 뒤져야 한다.
  // 카드를 누르면 그 숫자를 구성하는 예약을 바로 펼쳐 준다.
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);

  const metricRows = useMemo(() => {
    if (!openMetric) return [];
    const active = (item: Reservation) => item.status !== "canceled" && item.status !== "no_show";
    const filters: Record<MetricKey, (item: Reservation) => boolean> = {
      // 부분 환불된 예약은 payment_status가 paid로 남고 환불액도 따로 잡혀야 하므로
      // 두 목록 모두 원장 금액으로 판정한다.
      revenue: (item) => periodRevenue(item, logsByReservation, priceByPassName) > 0,
      total: () => true,
      receivable: (item) => active(item) && (item.payment_status ?? "unpaid") === "unpaid",
      refunded: (item) => reservationMoney(item, logsByReservation.get(item.id), priceByPassName).refunded > 0,
      confirmed: (item) => item.status === "confirmed" || item.status === "completed",
      noShow: (item) => item.status === "no_show",
      service: (item) => item.payment_status === "service",
    };
    return visible
      .filter(filters[openMetric])
      .sort((a, b) => `${b.date}${b.start_time ?? ""}`.localeCompare(`${a.date}${a.start_time ?? ""}`));
  }, [logsByReservation, openMetric, priceByPassName, visible]);

  // 펼친 목록의 합계는 그 카드가 보여 준 숫자와 같아야 한다.
  const metricTotal = useMemo(() => {
    if (openMetric === "revenue") return metricRows.reduce((sum, item) => sum + periodRevenue(item, logsByReservation, priceByPassName), 0);
    if (openMetric === "refunded") return metricRows.reduce((sum, item) => sum + reservationMoney(item, logsByReservation.get(item.id), priceByPassName).refunded, 0);
    return metricRows.reduce((sum, item) => sum + reservationRevenue(item, priceByPassName), 0);
  }, [logsByReservation, metricRows, openMetric, priceByPassName]);

  const summary = useMemo(() => summarize(visible, priceByPassName, logsByReservation), [logsByReservation, priceByPassName, visible]);
  const previousSummary = useMemo(() => summarize(previous, priceByPassName, logsByReservation), [logsByReservation, previous, priceByPassName]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { key: string; count: number; completed: number; canceled: number; noShow: number; revenue: number }>();
    visible.forEach((item) => {
      const key = periodKey(item.date, period); const row = groups.get(key) ?? { key, count: 0, completed: 0, canceled: 0, noShow: 0, revenue: 0 };
      row.count += 1; if (item.status === "completed") row.completed += 1; if (item.status === "canceled") row.canceled += 1; if (item.status === "no_show") row.noShow += 1; row.revenue += periodRevenue(item, logsByReservation, priceByPassName); groups.set(key, row);
    });
    return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key)).slice(-16);
  }, [logsByReservation, period, priceByPassName, visible]);

  const passStats = useMemo(() => {
    const groups = new Map<string, { name: string; count: number; revenue: number }>();
    visible.forEach((item) => { const name = item.pass_name_snapshot || item.pass_type; const row = groups.get(name) ?? { name, count: 0, revenue: 0 }; row.count += 1; row.revenue += periodRevenue(item, logsByReservation, priceByPassName); groups.set(name, row); });
    return Array.from(groups.values()).sort((a, b) => b.revenue - a.revenue || b.count - a.count);
  }, [logsByReservation, priceByPassName, visible]);

  // 실제 입퇴실(attendance) 기준 이용 패턴 — 선택한 기간의 날짜 범위만 반영한다.
  const usage = useMemo(() => {
    const inRange = attendance.filter((row) => {
      const d = kstDateStr(row.check_in_at);
      return (!startDate || d >= startDate) && (!endDate || d <= endDate);
    });
    const hours = new Array(24).fill(0) as number[];
    const weekdays = new Array(7).fill(0) as number[];
    const days = new Set<string>();
    let durSum = 0;
    let durCount = 0;
    inRange.forEach((row) => {
      hours[kstHour(row.check_in_at)] += 1;
      const wd = kstWeekdayIndex(row.check_in_at);
      if (wd >= 0) weekdays[wd] += 1;
      days.add(kstDateStr(row.check_in_at));
      if (row.check_out_at) {
        const min = (new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime()) / 60000;
        if (min > 5 && min < 20 * 60) { durSum += min; durCount += 1; }
      }
    });
    const totalVisits = inRange.length;
    const activeDays = days.size;
    const peakHour = hours.reduce((best, count, i) => (count > hours[best] ? i : best), 0);
    const peakWd = weekdays.reduce((best, count, i) => (count > weekdays[best] ? i : best), 0);
    let firstHour = hours.findIndex((c) => c > 0);
    let lastHour = 23 - [...hours].reverse().findIndex((c) => c > 0);
    if (firstHour < 0) { firstHour = 9; lastHour = 22; }
    return {
      hours, weekdays, totalVisits, activeDays,
      peakHour, peakHourCount: hours[peakHour], peakWd, peakWdCount: weekdays[peakWd],
      avgMin: durCount ? durSum / durCount : 0, durCount,
      avgVisitsPerDay: activeDays ? totalVisits / activeDays : 0,
      firstHour, lastHour, hasData: totalVisits > 0,
    };
  }, [attendance, startDate, endDate]);

  // 전체 통계를 여러 시트로 나눠 엑셀(.xlsx)로 저장. xlsx는 클릭 시 지연 로드.
  async function exportExcel() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rangeLabel = startDate || endDate ? `${startDate || "처음"} ~ ${endDate || "끝"}` : "전체 기간";
      const wb = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.aoa_to_sheet([
        ["WORKROOM 통계"],
        ["기간", rangeLabel],
        ["집계 단위", periodLabels[period]],
        [],
        ["매출·예약", ""],
        ["실결제 매출(환불 차감)", summary.revenue],
        ["결제 합계(환불 전)", summary.charged],
        ["예약 건수", summary.total],
        ["확정·완료", summary.confirmed + summary.completed],
        ["노쇼", summary.noShow],
        ["노쇼율(%)", summary.total ? Math.round((summary.noShow / summary.total) * 100) : 0],
        ["미수금", summary.receivable],
        ["환불", summary.refunded],
        ["서비스 예약", summary.service],
        [],
        ["이용 패턴(실제 입퇴실)", ""],
        ["총 입실(회)", usage.totalVisits],
        ["평균 이용 시간(분)", usage.durCount ? Math.round(usage.avgMin) : ""],
        ["이용일 수", usage.activeDays],
        ["하루 평균 입실(회)", Number(usage.avgVisitsPerDay.toFixed(1))],
        ["붐비는 시간대", usage.peakHourCount ? `${usage.peakHour}시` : ""],
        ["붐비는 요일", usage.peakWdCount ? `${weekdayLabels[usage.peakWd]}요일` : ""],
      ]);
      XLSX.utils.book_append_sheet(wb, summarySheet, "요약");

      const periodSheet = XLSX.utils.aoa_to_sheet([
        ["기간", "예약", "이용완료", "취소", "노쇼", "실결제매출"],
        ...grouped.map((item) => [item.key, item.count, item.completed, item.canceled, item.noShow, item.revenue]),
      ]);
      XLSX.utils.book_append_sheet(wb, periodSheet, `기간별(${periodLabels[period]})`);

      const passSheet = XLSX.utils.aoa_to_sheet([
        ["이용권", "건수", "실결제매출"],
        ...passStats.map((item) => [item.name, item.count, item.revenue]),
      ]);
      XLSX.utils.book_append_sheet(wb, passSheet, "이용권별");

      // 미수금·실결제 매출은 "어떤 예약인지"까지 있어야 대사가 된다.
      // 금액 열은 결제·환불·잔여를 나눠 적는다. 부분 환불이면 세 값이 모두 다르다.
      const detailSheets: [string, (item: Reservation) => boolean][] = [
        ["실결제매출", (item) => periodRevenue(item, logsByReservation, priceByPassName) > 0],
        ["미수금", (item) => item.status !== "canceled" && item.status !== "no_show" && (item.payment_status ?? "unpaid") === "unpaid"],
        ["환불", (item) => reservationMoney(item, logsByReservation.get(item.id), priceByPassName).refunded > 0],
      ];
      detailSheets.forEach(([title, filter]) => {
        const rows = visible.filter(filter);
        const sheet = XLSX.utils.aoa_to_sheet([
          ["이용일", "이름", "연락처", "이용권", "예약상태", "결제상태", "결제액", "환불액", "잔여매출"],
          ...rows.map((item) => {
            const money = reservationMoney(item, logsByReservation.get(item.id), priceByPassName);
            const unpaid = (item.payment_status ?? "unpaid") === "unpaid";
            return [
              item.date,
              item.name,
              item.phone ?? "",
              item.pass_name_snapshot || item.pass_type,
              statusLabel[item.status] ?? item.status,
              item.payment_status ?? "unpaid",
              unpaid ? reservationRevenue(item, priceByPassName) : money.charged,
              money.refunded,
              unpaid ? 0 : money.net,
            ];
          }),
        ]);
        XLSX.utils.book_append_sheet(wb, sheet, title);
      });

      const hourSheet = XLSX.utils.aoa_to_sheet([["시간대", "입실수"], ...usage.hours.map((count, h) => [`${h}시`, count])]);
      XLSX.utils.book_append_sheet(wb, hourSheet, "시간대별");

      const wdSheet = XLSX.utils.aoa_to_sheet([["요일", "입실수"], ...usage.weekdays.map((count, wd) => [weekdayLabels[wd], count])]);
      XLSX.utils.book_append_sheet(wb, wdSheet, "요일별");

      XLSX.writeFile(wb, `workroom-통계_${startDate || "all"}_${endDate || "all"}.xlsx`);
    } catch {
      setError("엑셀 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setExporting(false);
    }
  }

  const maxRevenue = Math.max(...grouped.map((item) => item.revenue), 1);

  return (
    <AdminPage actions={<><button className={buttonClass("secondary", "md")} onClick={() => void loadStats()} type="button">새로고침</button><button className={buttonClass("primary", "md")} disabled={exporting || !grouped.length} onClick={() => void exportExcel()} type="button">{exporting ? "저장 중…" : "엑셀 저장"}</button></>} description="실결제 매출은 환불(부분 환불 포함)을 뺀 금액입니다. 서비스 예약은 매출과 미수금에서 제외되며, 금액은 예약 이용일을 기준으로 집계합니다." title="매출·통계">
      <div className="admin-compact">
        <AdminFeedback error={error} />
        <div className="mb-5 grid gap-3 border-y border-workroom-line bg-white p-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="grid gap-1 text-xs font-semibold text-workroom-muted">시작일<input max={endDate || undefined} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="grid gap-1 text-xs font-semibold text-workroom-muted">종료일<input min={startDate || undefined} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          <label className="grid gap-1 text-xs font-semibold text-workroom-muted">이용권<select value={passFilter} onChange={(event) => setPassFilter(event.target.value)}><option value="all">전체</option>{passes.map((pass) => <option key={pass.id} value={pass.name}>{pass.name}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-semibold text-workroom-muted">예약 상태<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">전체</option><option value="pending">확인 대기</option><option value="confirmed">확정</option><option value="completed">이용완료</option><option value="canceled">취소</option><option value="no_show">노쇼</option></select></label>
          <label className="grid gap-1 text-xs font-semibold text-workroom-muted">결제 상태<select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as typeof paymentFilter)}><option value="all">전체</option><option value="paid">결제완료</option><option value="unpaid">미결제</option><option value="refunded">환불</option><option value="service">서비스</option></select></label>
          <div className="flex items-end gap-1.5 sm:col-span-2">
            <button aria-label="이전 달" className={buttonClass("secondary", "sm", "h-[42px] px-3")} onClick={() => { const m = monthOf(startDate, -1); setStartDate(m.start); setEndDate(m.end); }} type="button">‹</button>
            <div className="grid flex-1 h-[42px] place-items-center rounded-[6px] border border-workroom-ink bg-white text-sm font-bold tabular-nums">{monthOf(startDate).label}</div>
            <button aria-label="다음 달" className={buttonClass("secondary", "sm", "h-[42px] px-3")} onClick={() => { const m = monthOf(startDate, 1); setStartDate(m.start); setEndDate(m.end); }} type="button">›</button>
            <button className={buttonClass("accent", "sm", "h-[42px] shrink-0 px-3")} onClick={() => { const range = monthRange(); setStartDate(range.start); setEndDate(range.end); }} type="button">이번 달</button>
          </div>
          <div className="flex items-end gap-1.5 sm:col-span-2 lg:col-span-6">
            <span className="hidden self-center text-xs font-semibold text-workroom-muted sm:inline">빠른 기간</span>
            <button className={buttonClass("secondary", "sm", "h-[38px] px-3")} onClick={() => { const y = new Date().getFullYear(); setStartDate(`${y}-01-01`); setEndDate(`${y}-12-31`); setPeriod("month"); }} type="button">올해</button>
            <button className={buttonClass("secondary", "sm", "h-[38px] px-3")} onClick={() => { const y = new Date().getFullYear(); setStartDate(`${y - 1}-01-01`); setEndDate(`${y - 1}-12-31`); setPeriod("month"); }} type="button">작년</button>
            <button className={buttonClass("secondary", "sm", "h-[38px] px-3")} onClick={() => { setStartDate(""); setEndDate(""); setPeriod("year"); }} type="button">전체 기간</button>
          </div>
        </div>

        {isLoading ? <AdminEmpty>통계를 불러오는 중입니다.</AdminEmpty> : null}
        {!isLoading ? <>
          <section className="grid border-y border-workroom-line bg-white lg:grid-cols-4">
            <PrimaryStat label="실결제 매출" value={formatPrice(summary.revenue)} change={changeRate(summary.revenue, previousSummary.revenue)} metric="revenue" openMetric={openMetric} onToggle={setOpenMetric} />
            <PrimaryStat label="예약" value={`${summary.total}건`} change={changeRate(summary.total, previousSummary.total)} metric="total" openMetric={openMetric} onToggle={setOpenMetric} />
            <PrimaryStat label="미수금" value={formatPrice(summary.receivable)} metric="receivable" openMetric={openMetric} onToggle={setOpenMetric} />
            <PrimaryStat label="환불" value={formatPrice(summary.refunded)} metric="refunded" openMetric={openMetric} onToggle={setOpenMetric} />
          </section>
          <section className="mt-4 grid grid-cols-2 border-y border-workroom-line bg-white sm:grid-cols-4">
            <SecondaryStat label="확정·완료" value={`${summary.confirmed + summary.completed}건`} metric="confirmed" openMetric={openMetric} onToggle={setOpenMetric} />
            <SecondaryStat label="노쇼" value={`${summary.noShow}건`} metric="noShow" openMetric={openMetric} onToggle={setOpenMetric} />
            <SecondaryStat label="노쇼율" value={`${summary.total ? Math.round((summary.noShow / summary.total) * 100) : 0}%`} />
            <SecondaryStat label="서비스" value={`${summary.service}건`} metric="service" openMetric={openMetric} onToggle={setOpenMetric} />
          </section>

          {/* 선택한 지표를 구성하는 예약 목록 — 행을 누르면 해당 예약 상세로 간다. */}
          {openMetric ? (
            <section className="mt-3 border border-workroom-ink bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-workroom-line px-4 py-3">
                <p className="text-sm font-bold">
                  {metricLabels[openMetric]} 내역 <span className="tabular-nums text-workroom-muted">{metricRows.length}건</span>
                  {openMetric !== "total" && openMetric !== "noShow" && openMetric !== "confirmed" ? (
                    <span className="ml-2 tabular-nums">{formatPrice(metricTotal)}</span>
                  ) : null}
                </p>
                <button className={buttonClass("secondary", "sm")} onClick={() => setOpenMetric(null)} type="button">닫기</button>
              </div>
              {metricRows.length ? (
                <div className="max-h-[420px] overflow-y-auto">
                  {metricRows.map((item) => (
                    <Link
                      className="admin-row grid grid-cols-[86px_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-workroom-background"
                      key={item.id}
                      to={`/admin/reservations?reservation=${item.id}`}
                    >
                      <span className="text-xs font-semibold tabular-nums text-workroom-muted">{item.date}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{item.name}</span>
                        <span className="block truncate text-xs font-medium text-workroom-muted">
                          {item.pass_name_snapshot || item.pass_type} · {statusLabel[item.status] ?? item.status}
                        </span>
                      </span>
                      <span className="text-right text-sm font-bold tabular-nums">{formatPrice(reservationRevenue(item, priceByPassName))}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <AdminEmpty>해당하는 예약이 없습니다.</AdminEmpty>
              )}
            </section>
          ) : null}

          <section className="mt-7 border border-workroom-line bg-white p-4 sm:p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">기간별 흐름</h2><p className="mt-0.5 text-xs text-workroom-muted">막대는 환불을 뺀 실결제 매출 기준입니다.</p></div><select className="!min-h-[38px] !w-auto" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>{Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="grid gap-3">{grouped.map((item) => <div className="grid grid-cols-[82px_1fr_auto] items-center gap-3 text-sm" key={item.key}><span className="text-xs font-semibold tabular-nums text-workroom-muted">{item.key}</span><div className="h-7 bg-workroom-background"><div className="h-full min-w-[2px] bg-workroom-yellow" style={{ width: `${Math.max(2, (item.revenue / maxRevenue) * 100)}%` }} /></div><span className="w-24 text-right text-xs font-semibold tabular-nums">{formatPrice(item.revenue)}</span></div>)}{!grouped.length ? <AdminEmpty>집계할 예약이 없습니다.</AdminEmpty> : null}</div>
          </section>

          <section className="mt-7 border border-workroom-line bg-white p-4 sm:p-5">
            <div className="mb-4"><h2 className="text-lg font-bold">이용 패턴</h2><p className="mt-0.5 text-xs text-workroom-muted">선택한 기간의 실제 입퇴실 기록 기준입니다. 평균 이용 시간은 퇴실이 기록된 방문만 포함해요.</p></div>
            {usage.hasData ? (
              <>
                <div className="grid grid-cols-2 border-y border-workroom-line sm:grid-cols-4">
                  <SecondaryStat label="총 입실" value={`${usage.totalVisits}회`} />
                  <SecondaryStat label="평균 이용 시간" value={usage.durCount ? formatMinutes(usage.avgMin) : "—"} />
                  <SecondaryStat label="붐비는 시간대" value={usage.peakHourCount ? `${usage.peakHour}시` : "—"} />
                  <SecondaryStat label="붐비는 요일" value={usage.peakWdCount ? `${weekdayLabels[usage.peakWd]}요일` : "—"} />
                </div>
                <p className="mt-2 text-xs text-workroom-muted">
                  이용일 {usage.activeDays}일 · 하루 평균 {usage.avgVisitsPerDay.toFixed(1)}회 입실
                  {usage.durCount ? ` · 이용 시간 표본 ${usage.durCount}건` : " · 퇴실 기록이 없어 평균 이용 시간은 집계 불가"}
                </p>

                <div className="mt-5">
                  <p className="mb-2 text-sm font-bold">시간대별 입실</p>
                  <div className="grid gap-1.5">
                    {Array.from({ length: usage.lastHour - usage.firstHour + 1 }, (_, i) => usage.firstHour + i).map((h) => {
                      const count = usage.hours[h];
                      const max = Math.max(...usage.hours, 1);
                      return (
                        <div className="grid grid-cols-[42px_1fr_36px] items-center gap-3 text-sm" key={h}>
                          <span className="text-xs font-semibold tabular-nums text-workroom-muted">{h}시</span>
                          <div className="h-6 bg-workroom-background"><div className={`h-full min-w-[2px] ${h === usage.peakHour && count ? "bg-workroom-ink" : "bg-workroom-yellow"}`} style={{ width: `${Math.max(2, (count / max) * 100)}%` }} /></div>
                          <span className="text-right text-xs font-semibold tabular-nums">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5">
                  <p className="mb-2 text-sm font-bold">요일별 입실</p>
                  <div className="grid gap-1.5">
                    {usage.weekdays.map((count, wd) => {
                      const max = Math.max(...usage.weekdays, 1);
                      return (
                        <div className="grid grid-cols-[42px_1fr_36px] items-center gap-3 text-sm" key={wd}>
                          <span className="text-xs font-semibold tabular-nums text-workroom-muted">{weekdayLabels[wd]}</span>
                          <div className="h-6 bg-workroom-background"><div className={`h-full min-w-[2px] ${wd === usage.peakWd && count ? "bg-workroom-ink" : "bg-workroom-yellow"}`} style={{ width: `${Math.max(2, (count / max) * 100)}%` }} /></div>
                          <span className="text-right text-xs font-semibold tabular-nums">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : <AdminEmpty>선택한 기간에 입퇴실 기록이 없습니다.</AdminEmpty>}
          </section>

          <section className="mt-7"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">이용권별</h2><Link className="text-sm font-semibold underline underline-offset-4" to="/admin/reservations">예약 보기</Link></div><div className="border-y border-workroom-line bg-white">{passStats.map((item) => <div className="admin-row grid grid-cols-[1fr_auto] gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_90px_150px]" key={item.name}><p className="font-semibold">{item.name}</p><p className="text-right tabular-nums text-workroom-muted">{item.count}건</p><p className="col-span-2 text-right font-semibold tabular-nums sm:col-span-1">{formatPrice(item.revenue)}</p></div>)}{!passStats.length ? <AdminEmpty>집계할 예약이 없습니다.</AdminEmpty> : null}</div></section>
        </> : null}
      </div>
    </AdminPage>
  );
}

function summarize(items: Reservation[], prices: Map<string, number>, logs: Map<string, RevenueLog[]>) {
  const active = items.filter((item) => item.status !== "canceled" && item.status !== "no_show");
  // 매출·환불은 결제 원장 기준(부분 환불 반영), 미수금은 아직 원장이 없으므로 예약 금액 기준.
  const money = sumRevenue(items, logs, prices);
  return {
    total: items.length,
    confirmed: items.filter((item) => item.status === "confirmed").length,
    completed: items.filter((item) => item.status === "completed").length,
    noShow: items.filter((item) => item.status === "no_show").length,
    revenue: money.revenue,
    charged: money.charged,
    receivable: active.filter((item) => (item.payment_status ?? "unpaid") === "unpaid").reduce((sum, item) => sum + reservationRevenue(item, prices), 0),
    refunded: money.refunded,
    service: items.filter((item) => item.payment_status === "service").length,
  };
}
// 기간·이용권별 매출도 환불을 뺀 금액으로 센다. 서비스(무료) 예약은 제외.
function periodRevenue(item: Reservation, logs: Map<string, RevenueLog[]>, prices: Map<string, number>) {
  if ((item.payment_status ?? "unpaid") === "service") return 0;
  return reservationMoney(item, logs.get(item.id), prices).net;
}
function reservationRevenue(item: Reservation, prices: Map<string, number>) { return item.price_at_booking ?? prices.get(item.pass_name_snapshot || item.pass_type) ?? 0; }
function changeRate(current: number, previous: number) { if (!previous) return current ? "이전 기간보다 증가" : "변화 없음"; const rate = Math.round(((current - previous) / previous) * 100); return rate === 0 ? "이전 기간과 같음" : `이전 기간보다 ${Math.abs(rate)}% ${rate > 0 ? "증가" : "감소"}`; }
// metric이 주어지면 눌러서 구성 예약을 펼칠 수 있는 카드가 된다.
function PrimaryStat({ change, label, value, metric, openMetric, onToggle }: { change?: string; label: string; value: string; metric?: MetricKey; openMetric?: MetricKey | null; onToggle?: (next: MetricKey | null) => void }) {
  const isOpen = Boolean(metric && openMetric === metric);
  const body = (
    <>
      <p className="text-xs font-semibold text-workroom-muted">{label}{metric ? <span className="ml-1 text-workroom-ink">{isOpen ? "▾" : "›"}</span> : null}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {change ? <p className="mt-1 text-xs font-medium text-workroom-muted">{change}</p> : null}
    </>
  );
  const shell = `border-b border-workroom-line px-4 py-4 text-left last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0 ${isOpen ? "bg-workroom-yellow" : ""}`;
  if (!metric || !onToggle) return <div className={shell}>{body}</div>;
  return (
    <button aria-expanded={isOpen} className={`${shell} w-full hover:bg-workroom-background`} onClick={() => onToggle(isOpen ? null : metric)} type="button">
      {body}
    </button>
  );
}
function SecondaryStat({ label, value, metric, openMetric, onToggle }: { label: string; value: string; metric?: MetricKey; openMetric?: MetricKey | null; onToggle?: (next: MetricKey | null) => void }) {
  const isOpen = Boolean(metric && openMetric === metric);
  const body = (
    <>
      <p className="text-xs font-semibold text-workroom-muted">{label}{metric ? <span className="ml-1 text-workroom-ink">{isOpen ? "▾" : "›"}</span> : null}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </>
  );
  const shell = `border-b border-r border-workroom-line px-4 py-3 text-left even:border-r-0 sm:border-b-0 sm:even:border-r sm:last:border-r-0 ${isOpen ? "bg-workroom-yellow" : ""}`;
  if (!metric || !onToggle) return <div className={shell}>{body}</div>;
  return (
    <button aria-expanded={isOpen} className={`${shell} w-full hover:bg-workroom-background`} onClick={() => onToggle(isOpen ? null : metric)} type="button">
      {body}
    </button>
  );
}
function periodKey(dateValue: string, period: Period) {
  if (period === "year") return dateValue.slice(0, 4);
  if (period === "quarter") return `${dateValue.slice(0, 4)} Q${Math.ceil(Number(dateValue.slice(5, 7)) / 3)}`;
  if (period === "month") return dateValue.slice(0, 7);
  if (period === "week") { const date = new Date(`${dateValue}T00:00:00`); return `${date.getFullYear()} W${String(getWeekNumber(date)).padStart(2, "0")}`; }
  return dateValue.slice(5);
}
function getWeekNumber(date: Date) { const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); const day = target.getUTCDay() || 7; target.setUTCDate(target.getUTCDate() + 4 - day); const start = new Date(Date.UTC(target.getUTCFullYear(), 0, 1)); return Math.ceil(((target.getTime() - start.getTime()) / 86400000 + 1) / 7); }
const kstDateStr = kstDate;


function formatMinutes(min: number) { const h = Math.floor(min / 60); const m = Math.round(min % 60); return h ? `${h}시간${m ? ` ${m}분` : ""}` : `${m}분`; }
