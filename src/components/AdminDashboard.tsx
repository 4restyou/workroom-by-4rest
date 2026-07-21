import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate, formatTimeRange, statusLabel, todayValue } from "../lib/format";
import { supabase } from "../lib/supabase";
import { badge, buttonClass, card, pressable, tintCard } from "../lib/ui";
import type { Reservation } from "../lib/types";

type AdminDashData = {
  reservations: Reservation[];
  attendance: Array<{ reservation_id: string | null; check_in_at: string; check_out_at: string | null }>;
};

function isActiveReservation(reservation: Reservation) {
  return !reservation.deleted_at && reservation.status !== "canceled" && reservation.status !== "completed" && reservation.status !== "no_show";
}

export default function AdminDashboard() {
  const [data, setData] = useState<AdminDashData | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) return;
      const today = todayValue();
      const [{ data: reservations }, { data: attendance }] = await Promise.all([
        supabase
          .from("reservations")
          .select("*")
          .is("deleted_at", null)
          .or(`date.gte.${today},status.eq.pending`)
          .order("date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(120),
        supabase.from("attendance").select("reservation_id,check_in_at,check_out_at").order("check_in_at", { ascending: false }).limit(100),
      ]);

      if (!active) return;
      setData({
        reservations: (reservations ?? []) as Reservation[],
        attendance: (attendance ?? []) as Array<{ reservation_id: string | null; check_in_at: string; check_out_at: string | null }>,
      });
    }

    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const summary = useMemo(() => {
    const reservations = data?.reservations ?? [];
    const today = todayValue();
    const pending = reservations.filter((reservation) => reservation.status === "pending");
    const overduePending = pending.filter((reservation) => reservation.date < today);
    const todayConfirmed = reservations.filter((reservation) => reservation.date === today && reservation.status === "confirmed");
    const todaySchedule = reservations.filter(
      (reservation) => reservation.date === today && (reservation.status === "pending" || reservation.status === "confirmed"),
    );
    const upcoming = reservations.filter((reservation) => reservation.date >= today && isActiveReservation(reservation)).slice(0, 4);

    return {
      pending,
      overduePending,
      todayConfirmed,
      todaySchedule,
      upcoming,
      confirmed: reservations.filter((reservation) => reservation.status === "confirmed").length,
    };
  }, [data]);

  return (
    <section className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pb-12 sm:pt-16">
      <div className="flex items-start justify-between gap-4 border-b border-workroom-ink pb-5">
        <div>
          <p className="text-sm font-bold text-workroom-muted">관리자 홈</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">오늘 운영을 확인하세요</h1>
        </div>
        <Link className={buttonClass("accent", "md")} to="/admin/reservations">
          예약관리 →
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Link to="/admin/reservations?status=pending" className={`${tintCard("yellow")} ${pressable} p-5 hover:border-workroom-ink`}>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-workroom-ink/70">확인 대기</p>
          <p className="mt-2 text-4xl font-black">{data ? summary.pending.length : "…"}</p>
          <p className="mt-1 text-sm font-bold">처리가 필요한 예약</p>
        </Link>
        <Link to={`/admin/reservations?status=confirmed&date=${todayValue()}`} className={`${card} ${pressable} p-5 hover:border-workroom-ink`}>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-workroom-muted">오늘 방문</p>
          <p className="mt-2 text-4xl font-black">{data ? summary.todayConfirmed.length : "…"}</p>
          <p className="mt-1 text-sm font-bold text-workroom-muted">확정 예약</p>
        </Link>
        <Link to="/admin/reservations?status=confirmed" className={`${tintCard("sky")} ${pressable} p-5 hover:border-workroom-ink`}>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-workroom-ink/70">확정 예약</p>
          <p className="mt-2 text-4xl font-black">{data ? summary.confirmed : "…"}</p>
          <p className="mt-1 text-sm font-bold">앞으로 방문 예정</p>
        </Link>
      </div>

      {data && summary.overduePending.length ? (
        <Link className={`${tintCard("danger")} ${pressable} mt-3 block p-4 text-sm font-bold`} to="/admin/reservations?status=pending">
          날짜가 지난 미처리 예약이 {summary.overduePending.length}건 있습니다. 지금 확인해 주세요. →
        </Link>
      ) : null}

      <article className={`${card} mt-3 p-5`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold">오늘 시간표</p>
            <p className="mt-1 text-xs font-medium text-workroom-muted">예약·결제·입실 상태를 함께 확인합니다.</p>
          </div>
          <Link className="text-sm font-bold underline underline-offset-2" to={`/admin/reservations?date=${todayValue()}&status=all`}>오늘 전체</Link>
        </div>
        <div className="mt-3 grid gap-2">
          {data && summary.todaySchedule.length ? summary.todaySchedule.map((reservation) => {
            const attendance = data.attendance.find((item) => item.reservation_id === reservation.id);
            const visitLabel = reservation.status === "pending" ? "확인 필요" : attendance?.check_out_at ? "퇴실" : attendance ? "이용 중" : "입실 전";
            const visitTone = reservation.status === "pending" ? "yellow" : attendance && !attendance.check_out_at ? "mint" : "sky";
            return (
              <Link
                className="grid gap-2 rounded-[8px] border border-workroom-line bg-workroom-background px-4 py-3 hover:border-workroom-ink sm:grid-cols-[110px_1fr_auto] sm:items-center"
                key={reservation.id}
                to={`/admin/reservations?reservation=${reservation.id}`}
              >
                <p className="font-black">{formatTimeRange(reservation.start_time, reservation.end_time)}</p>
                <div>
                  <p className="font-bold">{reservation.name} · {reservation.people}명</p>
                  <p className="mt-0.5 text-xs font-medium text-workroom-muted">{reservation.pass_name_snapshot || reservation.pass_type} · {reservation.payment_status === "paid" ? "결제완료" : reservation.payment_status === "service" ? "서비스" : reservation.payment_preference === "onsite" ? "방문결제" : "미결제"}</p>
                </div>
                <span className={badge(visitTone)}>{visitLabel}</span>
              </Link>
            );
          }) : (
            <p className="rounded-[8px] border border-workroom-line bg-workroom-background px-4 py-3 text-sm font-medium text-workroom-muted">오늘 예정된 예약이 없습니다.</p>
          )}
        </div>
      </article>

      <article className={`${card} mt-3 p-5`}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-bold">가까운 예약</p>
          <Link className="text-sm font-bold underline underline-offset-2" to="/admin/reservations">
            전체 보기
          </Link>
        </div>
        <div className="mt-3 grid gap-2">
          {data && summary.upcoming.length ? (
            summary.upcoming.map((reservation) => (
              <Link
                className="rounded-[8px] border border-workroom-line bg-workroom-background px-4 py-3 transition-colors hover:border-workroom-ink"
                key={reservation.id}
                to={`/admin/reservations?reservation=${reservation.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{reservation.name}</p>
                    <p className="mt-1 text-xs font-medium text-workroom-muted">
                      {formatDate(reservation.date)} · {formatTimeRange(reservation.start_time, reservation.end_time)}
                    </p>
                  </div>
                  <span className={badge(reservation.status === "pending" ? "yellow" : "sky")}>{statusLabel[reservation.status]}</span>
                </div>
              </Link>
            ))
          ) : (
            <p className="rounded-[8px] border border-workroom-line bg-workroom-background px-4 py-3 text-sm font-medium text-workroom-muted">
              {data ? "예정된 진행 예약이 없습니다." : "예약을 불러오는 중입니다."}
            </p>
          )}
        </div>
      </article>
    </section>
  );
}
