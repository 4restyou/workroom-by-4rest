import { useCallback, useEffect, useRef, useState } from "react";

// Cloudflare Turnstile — 광고·스팸 계정의 자동 가입을 막는다.
// 대부분은 아무것도 보이지 않고(interaction-only), 의심스러울 때만 체크 상자가 뜬다.
//
// 켜는 순서가 중요하다:
//   1) Netlify 환경 변수 VITE_TURNSTILE_SITE_KEY 를 넣고 다시 배포
//   2) 그 다음 Supabase > Authentication > Attack Protection 에서 CAPTCHA(Turnstile) 켜기
// 반대로 하면 토큰 없는 로그인이 전부 거절된다.
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() ?? "";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * 폼에서 쓰는 훅. token을 supabase.auth 호출의 options.captchaToken 으로 넘기고,
 * 호출이 끝나면(성공·실패 모두) reset()을 부른다 — 토큰은 한 번만 쓸 수 있다.
 */
export function useCaptcha() {
  const enabled = Boolean(TURNSTILE_SITE_KEY);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !containerRef.current) return;
        widgetRef.current = api.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: "interaction-only",
          language: "ko",
          callback: (value: string) => {
            setToken(value);
            setFailed(false);
          },
          "expired-callback": () => setToken(null),
          "error-callback": () => {
            setToken(null);
            setFailed(true);
          },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (widgetRef.current) window.turnstile?.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [enabled]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetRef.current) window.turnstile?.reset(widgetRef.current);
  }, []);

  const widget = enabled ? (
    <div>
      <div ref={containerRef} />
      {failed ? <p className="mt-1 text-xs font-semibold text-red-700">보안 확인을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.</p> : null}
    </div>
  ) : null;

  return {
    widget,
    /** supabase.auth 호출에 넘길 값. 꺼져 있으면 undefined. */
    captchaToken: enabled ? token ?? undefined : undefined,
    /** 제출해도 되는가. 꺼져 있으면 항상 true. */
    ready: !enabled || Boolean(token),
    reset,
  };
}
