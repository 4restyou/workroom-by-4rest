import { Outlet, useLocation } from "react-router-dom";
import FixedReserveButton from "./components/FixedReserveButton";
import Footer from "./components/Footer";
import Header from "./components/Header";

export default function App() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  const showReserveButton = !isAdmin && location.pathname !== "/reserve";

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
        <Outlet />
      </div>
      {!isAdmin ? <Footer /> : null}
      {showReserveButton ? <FixedReserveButton /> : null}
    </div>
  );
}
