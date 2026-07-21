import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";

type Tab = {
  to: string;
  label: string;
  icon: ReactNode;
  match: (pathname: string) => boolean;
};

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const homeIcon = (
  <svg {...iconProps}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
  </svg>
);
const reserveIcon = (
  <svg {...iconProps}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 9h18M8 3v4M16 3v4M9 14h6M9 17.5h4" />
  </svg>
);
// 출근부: 체크리스트가 달린 클립보드. 다른 아이콘과 동일하게 24px 박스를
// 꽉 채우도록 그렸다.
const attendanceIcon = (
  <svg {...iconProps}>
    <rect x="8" y="2.5" width="8" height="4" rx="1.2" />
    <path d="M16 4.5h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h2" />
    <path d="M8.5 13l2.2 2.2L15 11" />
  </svg>
);
const userIcon = (
  <svg {...iconProps}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </svg>
);
const infoIcon = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.5h.01" />
  </svg>
);
const moreIcon = (
  <svg {...iconProps}>
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const loginIcon = (
  <svg {...iconProps}>
    <path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <path d="M10 17l5-5-5-5M15 12H3" />
  </svg>
);

const memberTabs: Tab[] = [
  { to: "/", label: "홈", icon: homeIcon, match: (p) => p === "/" },
  { to: "/reserve", label: "예약", icon: reserveIcon, match: (p) => p.startsWith("/reserve") },
  { to: "/attendance", label: "출근부", icon: attendanceIcon, match: (p) => p.startsWith("/attendance") || p.startsWith("/checkin") },
  { to: "/account", label: "내정보", icon: userIcon, match: (p) => p.startsWith("/account") },
];

const guestTabs: Tab[] = [
  { to: "/", label: "홈", icon: homeIcon, match: (p) => p === "/" },
  { to: "/reserve", label: "예약", icon: reserveIcon, match: (p) => p.startsWith("/reserve") },
  { to: "/faq", label: "이용안내", icon: infoIcon, match: (p) => p.startsWith("/faq") },
  { to: "/login", label: "로그인", icon: loginIcon, match: (p) => p.startsWith("/login") },
];

const adminTabs: Tab[] = [
  { to: "/admin/dashboard", label: "오늘", icon: homeIcon, match: (p) => p === "/admin/dashboard" },
  { to: "/admin/reservations", label: "예약", icon: reserveIcon, match: (p) => p.startsWith("/admin/reservations") },
  { to: "/admin/attendance", label: "입퇴실", icon: attendanceIcon, match: (p) => p.startsWith("/admin/attendance") },
  { to: "/admin/members", label: "회원", icon: userIcon, match: (p) => p.startsWith("/admin/members") },
  { to: "/admin/settings", label: "더보기", icon: moreIcon, match: (p) => p.startsWith("/admin/settings") || p.startsWith("/admin/stats") },
];

export default function BottomTabBar() {
  const location = useLocation();
  const [role, setRole] = useState<"guest" | "user" | "admin" | null>(null);

  useEffect(() => {
    let active = true;
    async function loadRole() {
      if (!supabase) {
        setRole("guest");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        setRole("guest");
        return;
      }
      const profile = await getCurrentProfile();
      if (!active) return;
      setRole(profile?.role === "admin" ? "admin" : "user");
    }

    void loadRole();
    if (!supabase) {
      return () => {
        active = false;
      };
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadRole();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Until we know, assume guest tabs (they overlap on 홈/예약 so there's no flicker
  // on the most common landing paths).
  const tabs = role === "admin" ? adminTabs : role === "user" ? memberTabs : guestTabs;

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-workroom-ink bg-workroom-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className={`mx-auto grid max-w-md ${tabs.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
        {tabs.map((tab) => {
          const active = tab.match(location.pathname);
          return (
            <li key={tab.to}>
              <Link
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={`flex select-none flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-workroom-ink ${
                  active ? "text-workroom-ink" : "text-workroom-muted"
                }`}
              >
                <span
                  className={`grid h-9 w-12 place-items-center rounded-[5px] border transition-[transform,background-color,border-color] duration-100 active:scale-90 ${
                    active ? "border-workroom-ink bg-workroom-yellow" : "border-transparent"
                  }`}
                >
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
