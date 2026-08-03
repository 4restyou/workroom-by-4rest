import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import Section from "../components/Section";
import { signInWithGoogle } from "../lib/profiles";
import { getPosition } from "../lib/geo";
import { supabase } from "../lib/supabase";
import { kstDate as kstDateShared, kstLongDateTime, toKstInputValue, fromKstInputValue } from "../lib/datetime";
import { buttonClass, card, tintCard } from "../lib/ui";
import type { CheckInResult } from "../lib/types";

type State = "checking" | "need-login" | "prior-close" | "done";

type PriorSession = { id: string; check_in_at: string };

// 서버(RPC) 메시지는 운영 용어(입실/퇴실)를 쓰므로 회원 화면에서는 출근/퇴근으로 맞춘다.
function memberWording(message: string): string {
  return message.replace(/입실/g, "출근").replace(/퇴실/g, "퇴근");
}

const kstDate = kstDateShared;
const formatStamp = kstLongDateTime;
const toKstInput = toKstInputValue;
const fromKstInput = fromKstInputValue;

export default function CheckIn() {
  const [params] = useSearchParams();
  const location = useLocation();
  const token = params.get("t") ?? "";
  const [state, setState] = useState<State>("checking");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [prior, setPrior] = useState<PriorSession | null>(null);
  const [checkoutInput, setCheckoutInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function runCheckIn() {
    if (!supabase) return;
    setState("checking");
    // 현재 위치는 출근 확인에만 사용하고 저장하지 않습니다. (매장 좌표 미설정 시 위치는 무시됨)
    const geo = await getPosition();
    const { data, error } = await supabase.rpc("attendance_check_in", {
      p_token: token,
      p_lat: geo.pos?.lat ?? null,
      p_lng: geo.pos?.lng ?? null,
    });
    setResult(error ? { ok: false, message: "출근 처리 중 오류가 발생했습니다." } : ((data ?? { ok: false }) as CheckInResult));
    setState("done");
  }

  useEffect(() => {
    async function run() {
      if (!supabase) {
        setResult({ ok: false, message: "환경 설정이 완료되지 않았습니다." });
        setState("done");
        return;
      }
      if (!token) {
        setResult({ ok: false, message: "QR 정보가 올바르지 않습니다." });
        setState("done");
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        setState("need-login");
        return;
      }

      // 이전 방문에서 퇴실 기록이 없는 세션이 있으면, 먼저 그 퇴실 시각을 받는다.
      const today = kstDate(new Date());
      const { data: openRows } = await supabase
        .from("attendance")
        .select("id,check_in_at,check_out_at")
        .eq("profile_id", user.id)
        .is("check_out_at", null)
        .order("check_in_at", { ascending: false })
        .limit(10);
      const priorSession = (openRows ?? []).find((r) => kstDate(r.check_in_at as string) !== today) as PriorSession | undefined;
      if (priorSession) {
        setPrior(priorSession);
        // 기본값: 입실 당일 22:00 (입실 이후여야 하므로 필요 시 사용자가 조정)
        setCheckoutInput(`${kstDate(priorSession.check_in_at)}T22:00`);
        setState("prior-close");
        return;
      }

      await runCheckIn();
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function savePriorCheckout() {
    if (!supabase || !prior || !checkoutInput) return;
    setBusy(true);
    const iso = fromKstInput(checkoutInput);
    if (new Date(iso).getTime() <= new Date(prior.check_in_at).getTime()) {
      setBusy(false);
      setResult({ ok: false, message: "퇴근 시각은 출근 시각보다 늦어야 해요." });
      setState("done");
      return;
    }
    const { error } = await supabase.from("attendance").update({ check_out_at: iso }).eq("id", prior.id);
    setBusy(false);
    if (error) {
      setResult({ ok: false, message: "퇴근 시각 저장에 실패했어요. 잠시 후 다시 시도해 주세요." });
      setState("done");
      return;
    }
    setPrior(null);
    await runCheckIn();
  }

  async function skipPrior() {
    setPrior(null);
    await runCheckIn();
  }

  const success = result?.ok && !result.already;
  const title = state === "prior-close" ? "이전 퇴근 확인" : state === "done" && success ? "출근 완료!" : "출근 체크인";

  return (
    <main className="pb-16">
      <Section eyebrow="Check-in" title={title} accent={success ? "mint" : "yellow"}>
        <div className={`${card} grid gap-4 p-6`}>
          {state === "checking" ? (
            <div>
              <p className="font-bold">출근을 확인하고 있어요…</p>
              <p className="mt-2 text-xs font-medium leading-6 text-workroom-muted">
                출근 확인을 위해 현재 위치를 잠시 확인할 수 있어요. 위치는 저장하지 않아요.
              </p>
            </div>
          ) : null}

          {state === "need-login" ? (
            <>
              <p className="text-sm font-medium leading-6 text-workroom-muted">출근 도장을 받으려면 로그인이 필요해요.</p>
              <button
                className={buttonClass("primary", "lg", "w-full sm:w-auto")}
                onClick={() => void signInWithGoogle(`${location.pathname}${location.search}`)}
                type="button"
              >
                구글로 로그인하고 출근하기
              </button>
              {/* 이메일 회원이 문 앞에서 막히지 않도록 대체 경로. */}
              <p className="text-sm font-medium">
                <Link className="underline underline-offset-4" to={`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`}>
                  이메일로 로그인
                </Link>
              </p>
            </>
          ) : null}

          {state === "prior-close" && prior ? (
            <>
              <div>
                <p className="font-bold">지난 방문 퇴근 기록이 없어요.</p>
                <p className="mt-1 text-sm font-medium leading-6 text-workroom-muted">
                  <b className="text-workroom-ink">{formatStamp(prior.check_in_at)} 출근</b> 후 퇴근이 기록되지 않았어요. 그날 몇 시에 나가셨는지 입력하면 정리하고 오늘 출근 도장을 찍어드려요.
                </p>
              </div>
              <label className="grid gap-1 text-sm font-bold">
                그날 퇴근 시각
                <input
                  type="datetime-local"
                  value={checkoutInput}
                  min={toKstInput(prior.check_in_at)}
                  onChange={(e) => setCheckoutInput(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button className={buttonClass("primary", "md")} disabled={busy || !checkoutInput} onClick={() => void savePriorCheckout()} type="button">
                  {busy ? "처리 중…" : "입력하고 출근하기"}
                </button>
                <button className={buttonClass("secondary", "md")} disabled={busy} onClick={() => void skipPrior()} type="button">
                  모르겠어요, 건너뛰기
                </button>
              </div>
            </>
          ) : null}

          {state === "done" && result ? (
            <>
              {success ? (
                <div>
                  <p className="text-2xl font-black">출근 도장 찍었어요 🐾</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
                    지금까지 출근 {result.stamps ?? 0}회{result.goal ? ` · ${(result.stamps ?? 0) % result.goal || result.goal}/${result.goal}칸` : ""}
                  </p>
                  {result.coupon ? (
                    <p className={`mt-3 ${tintCard("yellow")} p-3 text-sm font-bold`}>🎉 카드를 다 채웠어요! 쿠폰이 발급됐어요.</p>
                  ) : null}
                </div>
              ) : result.already ? (
                <p className={`${tintCard("mint")} p-3 text-sm font-bold`}>{memberWording(result.message ?? "오늘은 이미 출근했어요.")}</p>
              ) : (
                <p className={`${tintCard("danger")} p-3 text-sm font-bold`}>{memberWording(result.message ?? "출근에 실패했어요.")}</p>
              )}

              <div className="flex flex-wrap gap-2">
                <Link className={buttonClass("accent", "md")} to="/attendance">
                  출근부 보기
                </Link>
                <Link className={buttonClass("secondary", "md")} to="/">
                  홈으로
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </Section>
    </main>
  );
}
