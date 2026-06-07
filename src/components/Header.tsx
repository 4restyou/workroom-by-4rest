import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";
import logoSig from "../../assets/logo/logo_sig.png";

type HeaderProps = {
  isAdmin: boolean;
};

function adminNavClass({ isActive }: { isActive: boolean }) {
  return `rounded-full px-1 transition hover:text-workroom-text ${
    isActive ? "text-workroom-text underline decoration-workroom-yellow decoration-2 underline-offset-4" : ""
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
    <header className="sticky top-0 z-40 border-b border-workroom-line bg-workroom-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3.5">
        <Link className="flex min-w-0 items-center gap-2" to="/">
          <img className="h-8 w-auto max-w-[124px] object-contain" src={logoSig} alt="WORKROOM by 4REST" />
        </Link>

        <nav className="flex items-center gap-3 text-xs font-bold text-workroom-muted sm:gap-5 sm:text-sm">
          {isAdmin ? (
            <>
              <NavLink className={adminNavClass} to="/admin/reservations">예약관리</NavLink>
              <NavLink className={adminNavClass} to="/admin/stats">통계</NavLink>
              <NavLink className={adminNavClass} to="/admin/members">회원관리</NavLink>
              <NavLink className={adminNavClass} to="/admin/settings">운영설정</NavLink>
              <NavLink className="rounded-full px-1 transition hover:text-workroom-text" to="/">사이트</NavLink>
            </>
          ) : (
            <>
              <a className="transition hover:text-workroom-text" href="/#space">공간</a>
              <a className="transition hover:text-workroom-text" href="/#pricing">이용권</a>
              <Link className="transition hover:text-workroom-text" to="/reserve">예약</Link>
              {profile?.role === "admin" ? <Link className="transition hover:text-workroom-text" to="/admin/reservations">관리자</Link> : null}
              <Link className="transition hover:text-workroom-text" to={profile ? "/account" : "/login"}>{profile ? "내정보" : "로그인"}</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
