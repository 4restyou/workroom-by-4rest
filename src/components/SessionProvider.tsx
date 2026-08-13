import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCurrentProfile } from "../lib/profiles";
import { SessionContext, type SessionValue } from "../lib/sessionContext";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";

// 세션·프로필을 한 곳에서 읽어 Context로 흘려보낸다.
// 인증 상태 구독(onAuthStateChange)도 여기 하나만 둔다.
export default function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: "loading" | "ready"; userId: string | null; profile: Profile | null }>({
    status: "loading",
    userId: null,
    profile: null,
  });
  // 언마운트 후 늦게 도착한 응답이 상태를 되살리지 않게 한다.
  const activeRef = useRef(true);
  // 화면이 다시 보일 때 "지금 알고 있는 로그인 상태"와 비교하기 위한 참조.
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = state.userId;

  const load = useCallback(async () => {
    if (!supabase) {
      if (activeRef.current) setState({ status: "ready", userId: null, profile: null });
      return;
    }

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id ?? null;
    if (!userId) {
      if (activeRef.current) setState({ status: "ready", userId: null, profile: null });
      return;
    }

    let profile: Profile | null = null;
    try {
      profile = await getCurrentProfile();
    } catch {
      // 프로필 조회가 실패해도 로그인 자체는 유효하다. 화면은 "로그인했지만
      // 프로필 미상" 상태로 두고, 각 페이지가 자기 오류를 표시하게 한다.
      profile = null;
    }
    if (activeRef.current) setState({ status: "ready", userId, profile });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void load();

    const {
      data: { subscription },
    } = supabase?.auth.onAuthStateChange(() => {
      void load();
    }) ?? { data: { subscription: null } };

    // 홈 화면 앱(PWA)에서 구글 로그인을 하면 iOS가 앱을 잠시 얼려 두고 브라우저를
    // 띄운다. 돌아올 때 앱은 "얼기 직전 상태"(=로그인 전)로 복원되는데, 그 화면에서는
    // 로그인 이벤트가 일어난 적이 없어 onAuthStateChange가 터지지 않는다. 저장소에는
    // 토큰이 있는데 화면만 로그아웃으로 보이던 이유다. 다시 보일 때 직접 확인한다.
    async function recheck() {
      if (!supabase || document.visibilityState !== "visible") return;
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id ?? null;
      if (userId !== userIdRef.current) void load();
    }

    document.addEventListener("visibilitychange", recheck);
    // bfcache에서 복원될 때는 visibilitychange가 오지 않는 기기가 있다.
    window.addEventListener("pageshow", recheck);

    return () => {
      activeRef.current = false;
      subscription?.unsubscribe();
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("pageshow", recheck);
    };
  }, [load]);

  const value = useMemo<SessionValue>(
    () => ({
      status: state.status,
      isSignedIn: Boolean(state.userId),
      userId: state.userId,
      profile: state.profile,
      isAdmin: state.profile?.role === "admin",
      refresh: load,
    }),
    [state, load],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
