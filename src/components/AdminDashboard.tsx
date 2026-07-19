import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDate, formatTimeRange, statusLabel, todayValue } from "../lib/format";
import { supabase } from "../lib/supabase";
import { badge, buttonClass, card, pressable, tintCard } from "../lib/ui";
import type { Reservation } from "../lib/types";

type AdminDashData = {
  reservations: Reservation[];
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
      const { data: reservations } = await supabase
        .from("reservations")
        .select("*")
        .is("deleted_at", null)
        .gte("date", today)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(80);

      if (!active) return;
      setData({ reservations: (reservations ?? []) as Reservation[] });
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    const reservations = data?.reservations ?? [];
    const today = todayValue();
    const pending = reservations.filter((reservation) => reservation.status === "pending");
    const todayReservations = reservations.filter((reservation) => reservation.date === today && isActiveReservation(reservation));
    const upcoming = reservations.filter(isActiveReservation).slice(0, 4);

    return {
      pending,
      todayReservations,
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
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-workroom-ink/70">새 예약</p>
          <p className="mt-2 text-4xl font-black">{data ? summary.pending.length : "…"}</p>
          <p className="mt-1 text-sm font-bold">확인 대기</p>
        </Link>
        <Link to="/admin/reservations" className={`${card} ${pressable} p-5 hover:border-workroom-ink`}>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-workroom-muted">오늘 예약</p>
          <p className="mt-2 text-4xl font-black">{data ? summary.todayReservations.length : "…"}</p>
          <p className="mt-1 text-sm font-bold text-workroom-muted">진행 예정</p>
        </Link>
        <Link to="/admin/reservations?status=confirmed" className={`${tintCard("sky")} ${pressable} p-5 hover:border-workroom-ink`}>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-workroom-ink/70">확정 예약</p>
          <p className="mt-2 text-4xl font-black">{data ? summary.confirmed : "…"}</p>
          <p className="mt-1 text-sm font-bold">앞으로 방문 예정</p>
        </Link>
      </div>

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
