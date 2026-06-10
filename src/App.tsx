import { useEffect, Suspense } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import FixedReserveButton from "./components/FixedReserveButton";
import Footer from "./components/Footer";
import Header from "./components/Header";
import { getCurrentProfile } from "./lib/profiles";
import { supabase } from "./lib/supabase";

// Pages a not-yet-onboarded member may visit (to finish the profile or read
// the policies). Everything else redirects to profile completion.
const ONBOARDING_ALLOWED = ["/account", "/privacy", "/terms", "/login"];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = location.pathname.startsWith("/admin");
  const showReserveButton = !isAdmin && location.pathname !== "/reserve";

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
      <Header isAdmin={isAdmin} />
      <div id="main" className="flex-1">
        <Suspense fallback={<p className="mx-auto max-w-5xl px-4 py-24 text-center text-sm font-bold text-workroom-muted">불러오는 중…</p>}>
          <Outlet />
        </Suspense>
      </div>
      {!isAdmin ? <Footer /> : null}
      {showReserveButton ? <FixedReserveButton /> : null}
    </div>
  );
}
