import { useEffect, Suspense } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import BackToTop from "./components/BackToTop";
import BottomTabBar from "./components/BottomTabBar";
import ConfirmDialog from "./components/ConfirmDialog";
import Footer from "./components/Footer";
import Header from "./components/Header";
import PageLoading from "./components/PageLoading";
import Toaster from "./components/Toaster";
import { useSession } from "./lib/sessionContext";

// Pages a not-yet-onboarded member may visit (to finish the profile or read
// the policies). Everything else redirects to profile completion.
const ONBOARDING_ALLOWED = ["/account", "/privacy", "/terms", "/login", "/reset-password"];

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { status, isSignedIn, profile, isAdmin } = useSession();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const isAdminLogin = location.pathname === "/admin";
  const adminMode = Boolean(isAdminRoute && isAdmin && !isAdminLogin);
  // Focused task flows hide the bottom tab bar so their own sticky actions own
  // the bottom edge.
  const isFocusedFlow = location.pathname === "/reserve" || location.pathname.startsWith("/checkin");
  const showTabBar = !isFocusedFlow && (!isAdminRoute || adminMode);

  // First login onboarding: if a signed-in member hasn't completed their
  // profile (name, phone, privacy consent), send them to 회원정보 first.
  useEffect(() => {
    if (status !== "ready" || !isSignedIn || !profile || isAdmin) return;

    const onAllowed =
      location.pathname.startsWith("/admin") || ONBOARDING_ALLOWED.some((path) => location.pathname.startsWith(path));
    if (onAllowed) return;

    const incomplete = !profile.full_name || !profile.phone || !profile.consented_at;
    if (!incomplete) return;

    // 하려던 일(예: 예약)을 기억해 두고, 회원정보 저장 후 그 자리로 돌려보낸다.
    const next = `${location.pathname}${location.search}`;
    const query = next && next !== "/" ? `&next=${encodeURIComponent(next)}` : "";
    navigate(`/account?tab=profile${query}`, { replace: true });
  }, [status, isSignedIn, profile, isAdmin, location.pathname, location.search, navigate]);

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
      <Toaster />
      <ConfirmDialog />
      {showTabBar ? <BottomTabBar /> : null}
      <BackToTop />
    </div>
  );
}
