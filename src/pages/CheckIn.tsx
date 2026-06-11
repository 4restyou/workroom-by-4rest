import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import Section from "../components/Section";
import { signInWithGoogle } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import { buttonClass, card, tintCard } from "../lib/ui";
import type { CheckInResult } from "../lib/types";

type State = "checking" | "need-login" | "done";

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

export default function CheckIn() {
  const [params] = useSearchParams();
  const location = useLocation();
  const token = params.get("t") ?? "";
  const [state, setState] = useState<State>("checking");
  const [result, setResult] = useState<CheckInResult | null>(null);

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
      if (!sessionData.session?.user) {
        setState("need-login");
        return;
      }
      // 현재 위치는 출근 확인에만 사용하고 저장하지 않습니다. (매장 좌표 미설정 시 위치는 무시됨)
      const pos = await getPosition();
      const { data, error } = await supabase.rpc("attendance_check_in", {
        p_token: token,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
      });
      if (error) {
        setResult({ ok: false, message: "출근 처리 중 오류가 발생했습니다." });
      } else {
        setResult((data ?? { ok: false }) as CheckInResult);
      }
      setState("done");
    }
    void run();
  }, [token]);

  const success = result?.ok && !result.already;
  const title = state === "done" && success ? "출근 완료!" : "출근 체크인";

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
                <p className={`${tintCard("mint")} p-3 text-sm font-bold`}>{result.message ?? "오늘은 이미 출근했어요."}</p>
              ) : (
                <p className={`${tintCard("danger")} p-3 text-sm font-bold`}>{result.message ?? "출근에 실패했어요."}</p>
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
