import { Navigate, Outlet } from "react-router-dom";
import PageLoading from "./PageLoading";
import { useSession } from "../lib/sessionContext";

// Route-level gate for /admin/* pages. The individual pages keep their own
// checks as backup, but this wrapper stops non-admins from ever mounting the
// admin markup (no flash of the admin shell while an async check runs).
// Actual data safety is still enforced by RLS — this is UX + defense in depth.
export default function RequireAdmin() {
  const { status, isSignedIn, isAdmin } = useSession();

  if (status === "loading") return <PageLoading />;
  if (!isSignedIn) return <Navigate to="/admin" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
