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
      <Header isAdmin={isAdmin} />
      <div className="flex-1">
        <Outlet />
      </div>
      {!isAdmin ? <Footer /> : null}
      {showReserveButton ? <FixedReserveButton /> : null}
    </div>
  );
}
