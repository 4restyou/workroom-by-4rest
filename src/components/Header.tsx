import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import AccountMenu from "./AccountMenu";
import NotificationBell from "./NotificationBell";
import type { Profile } from "../lib/types";
import logoSig from "../../assets/logo/logo_sig.png";

type HeaderProps = {
  isAdmin: boolean;
};

function adminNavClass({ isActive }: { isActive: boolean }) {
  return `rounded-pill border px-2 py-1 transition-colors sm:px-3 sm:py-1.5 ${
    isActive
      ? "border-workroom-ink bg-workroom-ink text-white"
      : "border-transparent text-workroom-muted hover:border-workroom-ink hover:text-workroom-ink"
  }`;
}

export default function Header({ isAdmin }: HeaderProps) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    async function loadProfile() {
      if (!supabase) return;
      const loadedProfile = await getCurrentProfile();
      setProfile(loadedProfile);
    }

    void loadProfile();
    const {
      data: { subscription },
    } =
      supabase?.auth.onAuthStateChange(() => {
        void loadProfile();
      }) ?? { data: { subscription: null } };

    return () => subscription?.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-workroom-ink bg-workroom-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <Link className="flex min-w-0 shrink-0 items-center gap-2" to="/" title="WORKROOM 사이트로">
          <img className="h-5 w-auto max-w-[78px] object-contain sm:h-6 sm:max-w-[98px]" src={logoSig} alt="WORKROOM by 4REST" />
        </Link>

        {isAdmin ? (
          <nav className="no-scrollbar flex max-w-[calc(100vw-112px)] items-center gap-1 overflow-x-auto text-xs font-bold sm:max-w-none sm:gap-2 sm:text-sm">
            <NavLink className={adminNavClass} to="/admin/reservations">예약</NavLink>
            <NavLink className={adminNavClass} to="/admin/attendance">출근</NavLink>
            <NavLink className={adminNavClass} to="/admin/stats">통계</NavLink>
            <NavLink className={adminNavClass} to="/admin/members">회원</NavLink>
            <NavLink className={adminNavClass} to="/admin/settings">설정</NavLink>
            <NotificationBell />
          </nav>
        ) : (
          <nav className="flex items-center gap-3 text-xs font-bold text-workroom-muted sm:gap-6 sm:text-sm">
            <a className="hidden transition-colors hover:text-workroom-ink sm:inline" href="/#space">공간</a>
            <a className="hidden transition-colors hover:text-workroom-ink sm:inline" href="/#pricing">이용권</a>
            <Link className="hidden transition-colors hover:text-workroom-ink sm:inline" to="/directory">명함첩</Link>
            <Link className="hidden transition-colors hover:text-workroom-ink sm:inline" to="/board">메모판</Link>
            <Link className="hidden transition-colors hover:text-workroom-ink sm:inline" to="/faq">이용안내</Link>
            {profile ? (
              <AccountMenu isAdmin={profile.role === "admin"} />
            ) : (
              <Link className="transition-colors hover:text-workroom-ink" to="/login">로그인</Link>
            )}
            {profile ? <NotificationBell /> : null}
          </nav>
        )}
      </div>
    </header>
  );
}
