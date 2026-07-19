import { useEffect, Suspense, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import BackToTop from "./components/BackToTop";
import BottomTabBar from "./components/BottomTabBar";
import Footer from "./components/Footer";
import Header from "./components/Header";
import PageLoading from "./components/PageLoading";
import { getCurrentProfile } from "./lib/profiles";
import { supabase } from "./lib/supabase";
import type { Profile } from "./lib/types";

// Pages a not-yet-onboarded member may visit (to finish the profile or read
// the policies). Everything else redirects to profile completion.
const ONBOARDING_ALLOWED = ["/account", "/privacy", "/terms", "/login"];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const isAdminRoute = location.pathname.startsWith("/admin");
  const isAdminLogin = location.pathname === "/admin";
  const isAdminUser = profile?.role === "admin";
  const adminMode = Boolean(isAdminRoute && isAdminUser && !isAdminLogin);
  // Focused task flows hide the bottom tab bar so their own sticky actions own
  // the bottom edge.
  const isFocusedFlow = location.pathname === "/reserve" || location.pathname.startsWith("/checkin");
  const showTabBar = !isFocusedFlow && (!isAdminRoute || adminMode);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      if (!supabase) return;
      const loadedProfile = await getCurrentProfile();
      if (active) setProfile(loadedProfile);
    }

    void loadProfile();
    const {
      data: { subscription },
    } =
      supabase?.auth.onAuthStateChange(() => {
        void loadProfile();
      }) ?? { data: { subscription: null } };

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  // First login onboarding: if a signed-in member hasn't completed their
  // profile (name, phone, privacy consent), send them to 회원정보 first.
  useEffect(() => {
    let active = true;
    async function checkOnboarding() {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (!active || !data.session) return;

      const onAllowed =
        location.pathname.startsWith("/admin") || ONBOARDING_ALLOWED.some((path) => location.pathname.startsWith(path));
      if (onAllowed) return;

      const profile = await getCurrentProfile();
      if (!active || !profile || profile.role === "admin") return;

      const incomplete = !profile.full_name || !profile.phone || !profile.consented_at;
      if (incomplete) navigate("/account?tab=profile", { replace: true });
    }
    void checkOnboarding();
    return () => {
      active = false;
    };
  }, [location.pathname, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-workroom-background text-workroom-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-pill focus:border-2 focus:border-workroom-ink focus:bg-workroom-yellow focus:px-4 focus:py-2 focus:text-sm focus:font-bold"
      >
        본문 바로가기
      </a>
      <Header adminMode={adminMode} />
      {/* On mobile, the bottom tab bar overlays the bottom edge, so non-admin
          pages get extra bottom padding to keep content clear of it. */}
      <div id="main" className={`flex-1 ${showTabBar ? "pb-[calc(env(safe-area-inset-bottom)+4.5rem)] sm:pb-0" : ""}`}>
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </div>
      {!isAdminRoute ? <Footer /> : null}
      {showTabBar ? <BottomTabBar /> : null}
      <BackToTop />
    </div>
  );
}
