import { Link, NavLink, useNavigate } from "react-router-dom";
import { useSession } from "../lib/sessionContext";
import { supabase } from "../lib/supabase";
import NotificationBell from "./NotificationBell";
import logoSig from "../../assets/logo/logo_sig.png";

type HeaderProps = {
  adminMode: boolean;
};

function adminNavClass({ isActive }: { isActive: boolean }) {
  return `rounded-[4px] border px-2 py-1 transition-colors sm:px-3 sm:py-1.5 ${
    isActive
      ? "border-workroom-ink bg-workroom-ink text-white"
      : "border-transparent text-workroom-muted hover:border-workroom-ink hover:text-workroom-ink"
  }`;
}

export default function Header({ adminMode }: HeaderProps) {
  const navigate = useNavigate();
  const { profile } = useSession();

  async function signOut() {
    // 로그아웃하면 onAuthStateChange가 SessionProvider를 깨우므로 여기서
    // 프로필 상태를 따로 비울 필요가 없다.
    if (supabase) await supabase.auth.signOut();
    navigate("/", { replace: true });
  }

  const authButtonClass =
    "shrink-0 rounded-[4px] border border-workroom-ink bg-workroom-surface px-2.5 py-1.5 text-xs font-bold text-workroom-ink transition-colors hover:bg-workroom-ink hover:text-white sm:px-3 sm:text-sm";

  return (
    // 반투명 + backdrop-blur 는 쓰지 않는다. 스크롤과 겹치는 고정 요소에 블러가
    // 걸리면 안드로이드 크롬이 스크롤을 GPU에 맡기지 못하고 매 프레임 메인
    // 스레드에서 다시 그린다(첫 터치가 늦게 먹는 원인). 95% 불투명 뒤의 블러는
    // 어차피 보이지도 않았다.
    <header className="sticky top-0 z-40 border-b border-workroom-ink bg-workroom-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <Link
          className="flex min-w-0 shrink-0 items-center gap-2 bg-workroom-background"
          to={adminMode ? "/admin/dashboard" : "/"}
          title={adminMode ? "관리자 홈으로" : "WORKROOM 사이트로"}
        >
          <img className="h-5 w-auto max-w-[78px] bg-transparent object-contain sm:h-6 sm:max-w-[98px]" src={logoSig} alt="WORKROOM by 4REST" />
        </Link>

        {adminMode ? (
          <nav className="flex items-center gap-2 text-xs font-bold sm:text-sm">
            <div className="hidden items-center gap-1 sm:flex sm:gap-2">
              <NavLink className={adminNavClass} to="/admin/dashboard">오늘</NavLink>
              <NavLink className={adminNavClass} to="/admin/reservations">예약</NavLink>
              <NavLink className={adminNavClass} to="/admin/attendance">입퇴실</NavLink>
              <NavLink className={adminNavClass} to="/admin/members">회원</NavLink>
              <NavLink className={adminNavClass} to="/admin/stats">매출</NavLink>
              <NavLink className={adminNavClass} to="/admin/settings">설정</NavLink>
            </div>
            {/* 공개 사이트(홈·명함첩·메모판)로 나가는 문 — 모바일에서도 노출 */}
            <Link className={authButtonClass} to="/?site=1">사이트</Link>
            <NotificationBell />
            <button className={authButtonClass} onClick={() => void signOut()} type="button">나가기</button>
          </nav>
        ) : (
          <nav className="flex items-center gap-3 text-xs font-bold text-workroom-muted sm:gap-6 sm:text-sm">
            {/* 로그인한 회원의 홈은 대시보드라 소개·요금표 섹션이 없다.
                그대로 두면 '공간'·'이용권'이 아무 데도 가지 않는 링크가 된다. */}
            {profile && profile.role !== "admin" ? (
              <Link className="hidden transition-colors hover:text-workroom-ink sm:inline" to="/reserve">예약</Link>
            ) : (
              <>
                <a className="hidden transition-colors hover:text-workroom-ink sm:inline" href="/#space">공간</a>
                <a className="hidden transition-colors hover:text-workroom-ink sm:inline" href="/#pricing">이용권</a>
              </>
            )}
            <Link className="hidden transition-colors hover:text-workroom-ink sm:inline" to="/directory">명함첩</Link>
            <Link className="hidden transition-colors hover:text-workroom-ink sm:inline" to="/board">메모판</Link>
            <Link className="hidden transition-colors hover:text-workroom-ink sm:inline" to="/faq">이용안내</Link>
            {profile ? (
              <>
                <Link className="transition-colors hover:text-workroom-ink" to={profile.role === "admin" ? "/admin/dashboard" : "/account"}>
                  {profile.role === "admin" ? "관리자" : "내정보"}
                </Link>
                <button className={authButtonClass} onClick={() => void signOut()} type="button">로그아웃</button>
              </>
            ) : (
              <Link className={authButtonClass} to="/login">로그인</Link>
            )}
            {profile ? <NotificationBell /> : null}
          </nav>
        )}
      </div>
    </header>
  );
}
