import { createContext, useContext } from "react";
import type { Profile } from "./types";

// 로그인 세션과 프로필을 앱 전체에서 한 번만 읽어 공유한다.
//
// 이전에는 App, Header, BottomTabBar, NotificationBell, RequireAdmin, 그리고 각
// 페이지가 저마다 getCurrentProfile()을 불렀다. 홈 한 번 여는 데 같은 쿼리가
// 예닐곱 번 나갔고, 하단 탭바는 응답이 오기 전까지 게스트 탭을 그리다가 회원
// 탭으로 바뀌며 눈에 띄게 깜빡였다.

export type SessionStatus = "loading" | "ready";

export type SessionValue = {
  status: SessionStatus;
  /** 로그인 여부. status가 loading인 동안에는 아직 알 수 없다. */
  isSignedIn: boolean;
  userId: string | null;
  profile: Profile | null;
  isAdmin: boolean;
  /** 프로필을 수정한 뒤 등, 명시적으로 다시 읽어야 할 때 호출한다. */
  refresh: () => Promise<void>;
};

export const SESSION_FALLBACK: SessionValue = {
  status: "loading",
  isSignedIn: false,
  userId: null,
  profile: null,
  isAdmin: false,
  refresh: async () => {},
};

export const SessionContext = createContext<SessionValue>(SESSION_FALLBACK);

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
