import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPosition } from "../lib/geo";
import { supabase } from "../lib/supabase";
import { badge, buttonClass, card, pressable, tintCard } from "../lib/ui";
import { CheckIcon } from "./icons";
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
  // 오늘 출근했고 아직 퇴근하지 않은 상태(=현재 이용 중).
  openNow: boolean;
};

type GeoCheckInState =
  | { phase: "idle" }
  | { phase: "busy" }
  | { phase: "done"; message: string }
  | { phase: "failed"; message: string };

export default function MemberDashboard() {
  const [data, setData] = useState<DashData | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [geoState, setGeoState] = useState<GeoCheckInState>({ phase: "idle" });

  // 위치 기반 출근. silent=true(자동 시도)일 때는 실패해도 조용히 넘어간다 —
  // 예약이 없거나 매장 밖이면 배너만 남고 아무 일도 일어나지 않는다.
  async function geoCheckIn(silent: boolean) {
    if (!supabase) return;
    setGeoState({ phase: "busy" });
    const geo = await getPosition();
    if (!geo.pos) {
      setGeoState(
        silent
          ? { phase: "idle" }
          : {
              phase: "failed",
              message: geo.denied
                ? "위치 권한이 꺼져 있어요. 아이폰은 설정 > 개인정보 보호 > 위치 서비스 > Safari 웹사이트를 '사용하는 동안'으로 켠 뒤 다시 시도해 주세요."
                : "위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
            },
      );
      return;
    }
    const { data: rpcData, error } = await supabase.rpc("attendance_check_in_geo", { p_lat: geo.pos.lat, p_lng: geo.pos.lng });
    const result = rpcData as { ok?: boolean; already?: boolean; message?: string; coupon?: boolean } | null;
    if (error || !result?.ok) {
      setGeoState(silent ? { phase: "idle" } : { phase: "failed", message: result?.message ?? "지금은 출근 처리를 할 수 없어요." });
      return;
    }
    setGeoState({
      phase: "done",
      message: result.already ? "이미 출근 도장이 찍혀 있어요." : result.coupon ? "출근 도장 완료! 스탬프를 다 채워 쿠폰이 발급됐어요 🎉" : "출근 도장이 찍혔어요! 이용 즐겁게 하세요.",
    });
    setData((current) =>
      current ? { ...current, checkedInToday: true, openNow: true, stamps: result.already ? current.stamps : current.stamps + 1 } : current,
    );
  }

  // 퇴근하기 — 현재 열려 있는 출근 세션을 닫는다.
  async function checkOut() {
    if (!supabase) return;
    setGeoState({ phase: "busy" });
    const { data: rpcData, error } = await supabase.rpc("attendance_check_out");
    const result = rpcData as { ok?: boolean; message?: string } | null;
    if (error || !result?.ok) {
      setGeoState({ phase: "failed", message: result?.message ?? "퇴근 처리에 실패했어요." });
      return;
    }
    setGeoState({ phase: "done", message: "퇴근 도장을 찍었어요. 오늘도 수고하셨어요!" });
    setData((current) => (current ? { ...current, openNow: false } : current));
  }

  // 위치 권한을 이미 허용해 둔 회원은 대시보드를 여는 것만으로 자동 출근을
  // 시도한다 (권한 미허용 상태에서는 팝업을 띄우지 않도록 버튼으로만).
  useEffect(() => {
    if (!data || data.checkedInToday || geoState.phase !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let active = true;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (active && status.state === "granted") void geoCheckIn(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.checkedInToday, data === null]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) return;
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) return;
      const today = kstToday();

      try {
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
        const kst = (v: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(v));
        const total = new Set((att ?? []).map((r: { check_in_at: string }) => kst(r.check_in_at))).size;
        const todayRows = (att ?? []).filter(
          (r: { check_in_at: string; check_out_at: string | null }) =>
            new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(r.check_in_at)) === today,
        );
        const checkedInToday = todayRows.length > 0;
        const openNow = todayRows.some((r: { check_out_at: string | null }) => r.check_out_at === null);

        setFailed(false);
        setData({
          name: (profile?.full_name as string) || "회원",
          nextRes: ((resList ?? [])[0] as Reservation) ?? null,
          stamps: total,
          goal,
          reward: setMap.attendance_reward_label ?? "",
          coupons: (cps ?? []).length,
          checkedInToday,
          openNow,
        });
      } catch {
        if (active) setFailed(true);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  // While loading (or if the session/profile isn't ready), render a light
  // placeholder so the dashboard area doesn't jump.
  const filled = data ? (data.stamps === 0 ? 0 : data.stamps % data.goal === 0 ? data.goal : data.stamps % data.goal) : 0;
  // 출근 상태: 미출근 → 출근하기, 이용 중 → 퇴근하기, 퇴근 완료 → 오늘 이용 완료.
  const attState = data ? (!data.checkedInToday ? "out" : data.openNow ? "in" : "done") : null;
  const busy = geoState.phase === "busy";

  return (
    <section className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pb-12 sm:pt-16">
      <div className="border-b border-workroom-ink pb-5">
        <p className="text-sm font-bold text-workroom-muted">오늘도 좋은 작업</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {data ? `${data.name}님, 안녕하세요` : "안녕하세요"}
        </h1>
      </div>

      {/* 출근/퇴근 — 로그인한 회원에게 가장 먼저 보이는 한 번 탭 액션. */}
      {attState === "out" ? (
        <div className={`${tintCard("sky")} mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-4`}>
          <div className="min-w-0">
            <p className="text-base font-bold">아직 출근 전이에요</p>
            <p className="mt-0.5 text-xs font-medium leading-5 text-workroom-muted">
              워크룸에 도착했다면 출근 도장을 찍어주세요. 위치는 확인에만 쓰고 저장하지 않아요.
            </p>
          </div>
          <button className={buttonClass("primary", "lg")} disabled={busy} onClick={() => void geoCheckIn(false)} type="button">
            {busy ? "확인 중…" : "출근하기"}
          </button>
        </div>
      ) : attState === "in" ? (
        <div className={`${tintCard("mint")} mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-4`}>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-base font-bold">
              <CheckIcon className="h-4 w-4" /> 지금 이용 중이에요
            </p>
            <p className="mt-0.5 text-xs font-medium leading-5 text-workroom-muted">자리를 비우거나 나가실 때 퇴근 도장을 찍어주세요.</p>
          </div>
          <button className={buttonClass("primary", "lg")} disabled={busy} onClick={() => void checkOut()} type="button">
            {busy ? "처리 중…" : "퇴근하기"}
          </button>
        </div>
      ) : attState === "done" ? (
        <div className={`${tintCard("yellow")} mt-4 flex items-center gap-2 px-4 py-3`}>
          <CheckIcon className="h-4 w-4" />
          <p className="text-sm font-bold">오늘 이용을 완료했어요. 수고하셨어요!</p>
        </div>
      ) : null}

      {geoState.phase === "done" ? (
        <p className={`${tintCard("mint")} mt-3 px-4 py-3 text-sm font-bold`}>{geoState.message}</p>
      ) : null}
      {geoState.phase === "failed" ? (
        <p className={`${tintCard("danger")} mt-3 px-4 py-3 text-sm font-bold`}>{geoState.message}</p>
      ) : null}

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
            ) : failed ? (
              <div className="mt-2">
                <p className="text-sm font-medium leading-6 text-workroom-muted">정보를 불러오지 못했어요.</p>
                <button
                  className="mt-1 text-sm font-bold underline underline-offset-4 hover:text-workroom-ink"
                  onClick={() => setReloadKey((k) => k + 1)}
                  type="button"
                >
                  다시 시도
                </button>
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
        <Link to="/attendance" className={`${tintCard("yellow")} ${pressable} flex flex-col justify-between gap-3 p-5 hover:border-workroom-ink`}>
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
