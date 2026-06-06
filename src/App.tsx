import { Outlet, useLocation } from "react-router-dom";
import FixedReserveButton from "./components/FixedReserveButton";
import Header from "./components/Header";

export default function App() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  const showReserveButton = !isAdmin && location.pathname !== "/reserve";

  return (
    <div className="min-h-screen bg-workroom-background text-workroom-text">
      <Header isAdmin={isAdmin} />
      <Outlet />
      {showReserveButton ? <FixedReserveButton /> : null}
    </div>
  );
}
