import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import { buttonClass } from "../lib/ui";
import type { Profile } from "../lib/types";
import logoSig from "../../assets/logo/logo_sig.png";

type HeaderProps = {
  isAdmin: boolean;
};

function adminNavClass({ isActive }: { isActive: boolean }) {
  return `rounded-pill border-2 px-3 py-1.5 transition-colors ${
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
    <header className="sticky top-0 z-40 border-b-2 border-workroom-ink bg-workroom-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link className="flex min-w-0 items-center gap-2" to="/">
          <img className="h-8 w-auto max-w-[124px] object-contain" src={logoSig} alt="WORKROOM by 4REST" />
        </Link>

        {isAdmin ? (
          <nav className="flex items-center gap-1.5 text-xs font-bold sm:gap-2 sm:text-sm">
            <NavLink className={adminNavClass} to="/admin/reservations">예약</NavLink>
            <NavLink className={adminNavClass} to="/admin/stats">통계</NavLink>
            <NavLink className={adminNavClass} to="/admin/members">회원</NavLink>
            <NavLink className={adminNavClass} to="/admin/settings">설정</NavLink>
            <Link className="ml-1 rounded-pill border-2 border-workroom-ink px-3 py-1.5 transition-colors hover:bg-workroom-yellow" to="/">사이트</Link>
          </nav>
        ) : (
          <nav className="flex items-center gap-3 text-xs font-bold text-workroom-muted sm:gap-4 sm:text-sm">
            <a className="hidden transition-colors hover:text-workroom-ink sm:inline" href="/#space">공간</a>
            <a className="hidden transition-colors hover:text-workroom-ink sm:inline" href="/#pricing">이용권</a>
            {profile?.role === "admin" ? (
              <Link className="transition-colors hover:text-workroom-ink" to="/admin/reservations">관리자</Link>
            ) : null}
            <Link className="transition-colors hover:text-workroom-ink" to={profile ? "/account" : "/login"}>
              {profile ? "내정보" : "로그인"}
            </Link>
            <Link className={buttonClass("accent", "sm")} to="/reserve">예약</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
