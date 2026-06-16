import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { badge, buttonClass, card, tintCard } from "../lib/ui";
import type { Reservation } from "../lib/types";

function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

function formatResDate(date: string): string {
  // date is a plain YYYY-MM-DD; render in KST with weekday.
  const d = new Date(`${date}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(d);
}

function hhmm(time: string | null): string {
  return time ? time.slice(0, 5) : "";
}

const statusLabel: Record<string, string> = {
  pending: "확정 대기",
  confirmed: "확정",
};

type DashData = {
  name: string;
  nextRes: Reservation | null;
  stamps: number;
  goal: number;
  reward: string;
  coupons: number;
  checkedInToday: boolean;
};

export default function MemberDashboard() {
  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return;
      const today = kstToday();

      const [{ data: profile }, { data: resList }, { data: att }, { data: cps }, { data: sets }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        supabase
          .from("reservations")
          .select("id,pass_name_snapshot,pass_type,date,start_time,end_time,status,people")
          .eq("profile_id", user.id)
          .in("status", ["pending", "confirmed"])
          .is("deleted_at", null)
          .gte("date", today)
          .order("date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(1),
        supabase.from("attendance").select("id,check_in_at,check_out_at").eq("profile_id", user.id),
        supabase.from("coupons").select("id,status").eq("profile_id", user.id).eq("status", "issued"),
        supabase.from("space_settings").select("key,value").in("key", ["attendance_stamp_goal", "attendance_reward_label"]),
      ]);

      if (!active) return;
      const setMap = Object.fromEntries(((sets ?? []) as { key: string; value: string }[]).map((s) => [s.key, s.value]));
      const goal = Number(setMap.attendance_stamp_goal) || 10;
      const total = (att ?? []).length;
      const checkedInToday = (att ?? []).some(
        (r: { check_in_at: string; check_out_at: string | null }) =>
          new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(r.check_in_at)) === today,
      );

      setData({
        name: (profile?.full_name as string) || "회원",
        nextRes: ((resList ?? [])[0] as Reservation) ?? null,
        stamps: total,
        goal,
        reward: setMap.attendance_reward_label ?? "",
        coupons: (cps ?? []).length,
        checkedInToday,
      });
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  // While loading (or if the session/profile isn't ready), render a light
  // placeholder so the dashboard area doesn't jump.
  const filled = data ? (data.stamps === 0 ? 0 : data.stamps % data.goal === 0 ? data.goal : data.stamps % data.goal) : 0;

  return (
    <section className="mx-auto max-w-5xl px-4 pb-6 pt-8 sm:pb-10 sm:pt-12">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-workroom-muted">오늘도 좋은 작업</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {data ? `${data.name}님, 안녕하세요` : "안녕하세요"}
          </h1>
        </div>
        {data?.checkedInToday ? <span className={badge("mint")}>오늘 출근 완료 🐾</span> : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        {/* Next reservation */}
        <article className={`${card} flex flex-col justify-between gap-4 p-5`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-workroom-muted">다음 예약</p>
            {data?.nextRes ? (
              <div className="mt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xl font-bold">{data.nextRes.pass_name_snapshot || data.nextRes.pass_type}</p>
                  <span className={badge(data.nextRes.status === "confirmed" ? "mint" : "yellow")}>
                    {statusLabel[data.nextRes.status] ?? data.nextRes.status}
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold text-workroom-ink">
                  {formatResDate(data.nextRes.date)}
                  {data.nextRes.start_time ? (
                    <span className="font-medium text-workroom-muted">
                      {" · "}
                      {hhmm(data.nextRes.start_time)}
                      {data.nextRes.end_time ? `–${hhmm(data.nextRes.end_time)}` : ""}
                    </span>
                  ) : null}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
                {data ? "예정된 예약이 없어요. 필요한 시간만큼 자리를 잡아보세요." : "불러오는 중…"}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonClass("accent", "md")} to="/reserve">
              예약하기 →
            </Link>
            {data?.nextRes ? (
              <Link className={buttonClass("secondary", "md")} to="/account?tab=reservations">
                예약현황
              </Link>
            ) : null}
          </div>
        </article>

        {/* Attendance + coupons */}
        <Link to="/attendance" className={`${tintCard("yellow")} flex flex-col justify-between gap-3 p-5 transition-colors hover:border-workroom-ink`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-workroom-ink/70">출근 도장</p>
            <p className="mt-2 text-3xl font-black">
              {filled}
              <span className="text-lg font-bold text-workroom-ink/60">/{data?.goal ?? 10}칸</span>
            </p>
            {data?.reward ? <p className="mt-1 text-xs font-bold text-workroom-ink/70">다 채우면 · {data.reward}</p> : null}
          </div>
          <div className="flex items-center justify-between text-sm font-bold">
            <span>쿠폰 {data?.coupons ?? 0}장</span>
            <span aria-hidden>출근부 →</span>
          </div>
        </Link>
      </div>
    </section>
  );
}
