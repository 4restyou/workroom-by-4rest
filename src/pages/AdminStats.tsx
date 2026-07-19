import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import { defaultPasses } from "../lib/defaultPasses";
import { formatPrice } from "../lib/format";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import { buttonClass, card, cardFlat, tintCard } from "../lib/ui";
import type { Pass, Reservation } from "../lib/types";

type Period = "day" | "week" | "month" | "year";

const periodLabels: Record<Period, string> = {
  day: "일별",
  week: "주별",
  month: "월별",
  year: "년도별",
};

export default function AdminStats() {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [passes, setPasses] = useState<Pass[]>(defaultPasses);
  const [period, setPeriod] = useState<Period>("day");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkAndLoad() {
      if (!supabase) {
        setError("Supabase 환경 변수가 아직 연결되지 않았습니다.");
        setIsLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/admin", { replace: true });
        return;
      }

      const profile = await getCurrentProfile();
      if (profile?.role !== "admin") {
        navigate("/account", { replace: true });
        return;
      }

      await loadStats();
    }

    void checkAndLoad();
  }, [navigate]);

  async function loadStats() {
    if (!supabase) return;
    setIsLoading(true);
    setError("");

    const [reservationResult, passResult] = await Promise.all([
      supabase.from("reservations").select("*").order("date", { ascending: false }),
      supabase.from("passes").select("id,name,description,price,is_active,sort_order").order("sort_order", { ascending: true }),
    ]);

    setIsLoading(false);

    if (reservationResult.error) {
      setError(reservationResult.error.message);
      return;
    }

    if (!passResult.error && passResult.data?.length) {
      setPasses(passResult.data);
    }

    setReservations((reservationResult.data ?? []) as Reservation[]);
  }

  const priceByPassName = useMemo(() => new Map(passes.map((pass) => [pass.name, pass.price])), [passes]);

  const visibleReservations = useMemo(
    () => reservations.filter((reservation) => (!startDate || reservation.date >= startDate) && (!endDate || reservation.date <= endDate)),
    [endDate, reservations, startDate],
  );

  const summary = useMemo(() => {
    const activeReservations = visibleReservations.filter((reservation) => reservation.status !== "canceled" && reservation.status !== "no_show");
    const actualRevenue = visibleReservations
      .filter((reservation) => reservation.payment_status === "paid")
      .reduce((total, reservation) => total + reservationRevenue(reservation, priceByPassName), 0);
    const receivable = activeReservations
      .filter((reservation) => reservation.payment_status === "unpaid")
      .reduce((total, reservation) => total + reservationRevenue(reservation, priceByPassName), 0);
    const refunded = visibleReservations
      .filter((reservation) => reservation.payment_status === "refunded")
      .reduce((total, reservation) => total + reservationRevenue(reservation, priceByPassName), 0);

    return {
      total: visibleReservations.length,
      pending: visibleReservations.filter((reservation) => reservation.status === "pending").length,
      confirmed: visibleReservations.filter((reservation) => reservation.status === "confirmed").length,
      completed: visibleReservations.filter((reservation) => reservation.status === "completed").length,
      noShow: visibleReservations.filter((reservation) => reservation.status === "no_show").length,
      active: activeReservations.length,
      actualRevenue,
      receivable,
      refunded,
    };
  }, [priceByPassName, visibleReservations]);

  const groupedStats = useMemo(() => {
    const groups = new Map<string, { key: string; count: number; confirmed: number; completed: number; canceled: number; noShow: number; revenue: number }>();

    visibleReservations.forEach((reservation) => {
      const key = periodKey(reservation.date, period);
      const current = groups.get(key) ?? { key, count: 0, confirmed: 0, completed: 0, canceled: 0, noShow: 0, revenue: 0 };
      current.count += 1;
      if (reservation.status === "confirmed") current.confirmed += 1;
      if (reservation.status === "completed") current.completed += 1;
      if (reservation.status === "canceled") current.canceled += 1;
      if (reservation.status === "no_show") current.noShow += 1;
      if (reservation.payment_status === "paid") {
        current.revenue += reservationRevenue(reservation, priceByPassName);
      }
      groups.set(key, current);
    });

    return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 14);
  }, [period, priceByPassName, visibleReservations]);

  const passStats = useMemo(() => {
    const groups = new Map<string, { name: string; count: number; revenue: number }>();
    visibleReservations.forEach((reservation) => {
      const name = reservation.pass_name_snapshot || reservation.pass_type;
      const current = groups.get(name) ?? { name, count: 0, revenue: 0 };
      current.count += 1;
      if (reservation.payment_status === "paid") {
        current.revenue += reservationRevenue(reservation, priceByPassName);
      }
      groups.set(name, current);
    });
    return Array.from(groups.values()).sort((a, b) => b.revenue - a.revenue || b.count - a.count);
  }, [priceByPassName, visibleReservations]);

  function setThisMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    setStartDate(`${year}-${month}-01`);
    setEndDate(`${year}-${month}-${String(lastDay).padStart(2, "0")}`);
  }

  return (
    <main className="pb-12">
      <Section eyebrow="Admin" title="운영 통계" accent="ink">
        <div className={`mb-5 grid gap-3 ${card} p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto_auto] lg:items-end`}>
          <label className="grid gap-2 text-sm font-bold">
            집계 기준
            <select value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
              {Object.entries(periodLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold">
            시작일
            <input max={endDate || undefined} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            종료일
            <input min={startDate || undefined} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <button className={buttonClass("accent", "md")} onClick={loadStats} type="button">
            새로고침
          </button>
          <Link className={buttonClass("secondary", "md")} to="/admin/reservations">
            예약관리
          </Link>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
            <button className={buttonClass("secondary", "sm")} onClick={setThisMonth} type="button">이번 달</button>
            <button className={buttonClass("secondary", "sm")} onClick={() => { setStartDate(""); setEndDate(""); }} type="button">전체 기간</button>
            <span className="self-center text-xs font-bold text-workroom-muted">선택 기간 {visibleReservations.length}건</span>
          </div>
        </div>

        {isLoading ? <p className={`${tintCard("yellow")} p-4 font-bold`}>통계를 불러오는 중입니다.</p> : null}
        {error ? <p className={`mb-4 ${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="전체 예약" value={`${summary.total}건`} />
          <StatCard label="대기" value={`${summary.pending}건`} />
          <StatCard label="확정/이용완료" value={`${summary.confirmed + summary.completed}건`} />
          <StatCard label="노쇼" value={`${summary.noShow}건`} />
          <StatCard label="노쇼율" value={`${summary.total ? Math.round((summary.noShow / summary.total) * 100) : 0}%`} />
          <StatCard label="실결제 매출" value={formatPrice(summary.actualRevenue)} />
          <StatCard label="미수금" value={formatPrice(summary.receivable)} />
          <StatCard label="환불 처리 금액" value={formatPrice(summary.refunded)} />
        </div>

        <section className={`mt-5 ${card} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">{periodLabels[period]} 예약 흐름</h2>
            <p className="text-sm font-medium text-workroom-muted">최근 {groupedStats.length}개 구간</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-left text-sm">
              <thead className="text-workroom-muted font-bold">
                <tr>
                  <th className="px-3 py-2">기간</th>
                  <th className="px-3 py-2">예약</th>
                  <th className="px-3 py-2">확정</th>
                  <th className="px-3 py-2">이용완료</th>
                  <th className="px-3 py-2">취소</th>
                  <th className="px-3 py-2">노쇼</th>
                  <th className="px-3 py-2">실결제 매출</th>
                </tr>
              </thead>
              <tbody>
                {groupedStats.map((group) => (
                  <tr className="bg-workroom-surface font-bold" key={group.key}>
                    <td className="rounded-l-card px-3 py-3">{group.key}</td>
                    <td className="px-3 py-3">{group.count}</td>
                    <td className="px-3 py-3">{group.confirmed}</td>
                    <td className="px-3 py-3">{group.completed}</td>
                    <td className="px-3 py-3">{group.canceled}</td>
                    <td className="px-3 py-3">{group.noShow}</td>
                    <td className="rounded-r-card px-3 py-3">{formatPrice(group.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`mt-5 ${card} p-5`}>
          <h2 className="mb-4 text-xl font-bold">이용권별 예약/매출</h2>
          <div className="grid gap-2">
            {passStats.map((stat) => (
              <div className={`grid gap-2 ${cardFlat} p-4 text-sm font-bold sm:grid-cols-[1fr_100px_160px]`} key={stat.name}>
                <p>{stat.name}</p>
                <p>{stat.count}건</p>
                <p>{formatPrice(stat.revenue)}</p>
              </div>
            ))}
            {!passStats.length ? <p className={`${cardFlat} p-4 text-sm font-medium text-workroom-muted`}>집계할 예약이 없습니다.</p> : null}
          </div>
        </section>
      </Section>
    </main>
  );
}

function reservationRevenue(reservation: Reservation, priceByPassName: Map<string, number>) {
  return reservation.price_at_booking ?? priceByPassName.get(reservation.pass_name_snapshot || reservation.pass_type) ?? 0;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className={`${card} p-5`}>
      <p className="text-sm font-bold text-workroom-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </article>
  );
}

function periodKey(dateValue: string, period: Period) {
  const date = new Date(`${dateValue}T00:00:00`);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  if (period === "year") return `${year}`;
  if (period === "month") return `${year}-${month}`;
  if (period === "week") return `${year}-W${String(getWeekNumber(date)).padStart(2, "0")}`;
  return dateValue;
}

function getWeekNumber(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
