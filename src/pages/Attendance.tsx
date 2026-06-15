import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import Skeleton from "../components/Skeleton";
import StampCard from "../components/StampCard";
import { supabase } from "../lib/supabase";
import { badge, buttonClass, card, cardFlat, tintCard } from "../lib/ui";
import type { Attendance, Coupon } from "../lib/types";

function kstDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(value));
}

function formatStamp(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}시간 ${m}분` : `${m}분`;
}

export default function Attendance() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<Attendance[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [goal, setGoal] = useState(10);
  const [reward, setReward] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!supabase) {
      setError("Supabase 환경 변수가 아직 연결되지 않았습니다.");
      setIsLoading(false);
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    const [{ data: att }, { data: cps }, { data: sets }] = await Promise.all([
      supabase.from("attendance").select("*").eq("profile_id", user.id).order("check_in_at", { ascending: false }),
      supabase.from("coupons").select("*").eq("profile_id", user.id).order("issued_at", { ascending: false }),
      supabase.from("space_settings").select("key,value").in("key", ["attendance_stamp_goal", "attendance_reward_label"]),
    ]);
    setRecords((att ?? []) as Attendance[]);
    setCoupons((cps ?? []) as Coupon[]);
    const map = Object.fromEntries(((sets ?? []) as { key: string; value: string }[]).map((s) => [s.key, s.value]));
    setGoal(Number(map.attendance_stamp_goal) || 10);
    setReward(map.attendance_reward_label ?? "");
    setIsLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = records.length;
  const filled = total === 0 ? 0 : total % goal === 0 ? goal : total % goal;
  const today = kstDate(new Date());
  const openToday = records.find((r) => !r.check_out_at && kstDate(r.check_in_at) === today);
  const minutes = useMemo(
    () =>
      records.reduce((sum, r) => {
        if (!r.check_out_at) return sum;
        return sum + Math.max(0, Math.round((new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime()) / 60000));
      }, 0),
    [records],
  );

  async function checkOut() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("attendance_check_out");
    const result = data as { ok?: boolean; message?: string } | null;
    if (rpcError || !result?.ok) {
      setBusy(false);
      setError(result?.message ?? "퇴근 처리에 실패했습니다.");
      return;
    }
    await load();
    setBusy(false);
  }

  return (
    <main className="pb-16">
      <Section eyebrow="Attendance" title="출근부" accent="yellow">
        {error ? <p className={`mb-4 ${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}
        {isLoading ? (
          <div className="grid gap-5" aria-busy="true">
            <Skeleton className="h-44" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
            <Skeleton className="h-24" />
          </div>
        ) : (
          <div className="grid gap-5">
            <StampCard filled={filled} goal={goal} reward={reward} />

            <div className="grid gap-3 sm:grid-cols-3">
              <article className={`${cardFlat} p-4`}>
                <p className="text-xs font-bold text-workroom-muted">총 출근</p>
                <p className="mt-1 text-2xl font-black">{total}회</p>
              </article>
              <article className={`${cardFlat} p-4`}>
                <p className="text-xs font-bold text-workroom-muted">누적 머문 시간</p>
                <p className="mt-1 text-2xl font-black">{formatDuration(minutes)}</p>
              </article>
              <article className={`${cardFlat} p-4`}>
                <p className="text-xs font-bold text-workroom-muted">받은 쿠폰</p>
                <p className="mt-1 text-2xl font-black">{coupons.length}장</p>
              </article>
            </div>

            <div className={`${card} p-5`}>
              {openToday ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black">오늘 출근 중</p>
                    <p className="mt-1 text-sm font-medium text-workroom-muted">{formatStamp(openToday.check_in_at)} 출근</p>
                  </div>
                  <button className={buttonClass("accent", "md")} disabled={busy} onClick={() => void checkOut()} type="button">
                    {busy ? "처리 중…" : "퇴근하기"}
                  </button>
                </div>
              ) : (
                <p className="text-sm font-medium leading-6 text-workroom-muted">
                  매장의 QR을 찍으면 출근 도장이 찍혀요. (오늘 확정된 예약이 있어야 출근할 수 있어요.)
                </p>
              )}
            </div>

            {coupons.length ? (
              <div className={`${card} p-5`}>
                <p className="text-sm font-black">내 쿠폰</p>
                <div className="mt-3 grid gap-2">
                  {coupons.map((coupon) => (
                    <div className={`${tintCard(coupon.status === "used" ? "lilac" : "yellow")} flex items-center justify-between gap-3 p-3`} key={coupon.id}>
                      <div>
                        <p className="text-sm font-black">{coupon.label}</p>
                        <p className="mt-0.5 text-xs font-bold text-workroom-muted">코드 {coupon.code}</p>
                      </div>
                      <span className={badge(coupon.status === "used" ? "lilac" : "mint")}>
                        {coupon.status === "used" ? "사용완료" : "사용 가능"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs font-medium text-workroom-muted">쿠폰은 방문 시 카운터에서 코드를 보여주면 처리돼요.</p>
              </div>
            ) : null}

            <div className="grid gap-2">
              <p className="text-sm font-black">최근 기록</p>
              {records.length ? (
                records.slice(0, 12).map((r) => (
                  <div className={`${cardFlat} flex items-center justify-between gap-3 p-3 text-sm`} key={r.id}>
                    <span className="font-bold">{formatStamp(r.check_in_at)} 출근</span>
                    <span className="font-medium text-workroom-muted">
                      {r.check_out_at ? `${formatStamp(r.check_out_at).split(" ").slice(-1)[0]} 퇴근` : "근무 중"}
                    </span>
                  </div>
                ))
              ) : (
                <p className={`${cardFlat} p-4 text-sm font-medium text-workroom-muted`}>아직 출근 기록이 없어요.</p>
              )}
            </div>

            <Link className="text-sm font-bold text-workroom-muted underline underline-offset-4 hover:text-workroom-ink" to="/account?tab=reservations">
              예약현황으로
            </Link>
          </div>
        )}
      </Section>
    </main>
  );
}
