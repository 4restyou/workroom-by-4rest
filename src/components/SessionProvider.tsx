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

    return () => {
      activeRef.current = false;
      subscription?.unsubscribe();
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
