import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import PageLoading from "./PageLoading";
import { AdminMfaChallenge } from "./admin/AdminMfa";
import { readAdminMfaState, type AdminMfaState } from "../lib/adminMfa";
import { useSession } from "../lib/sessionContext";

// Route-level gate for /admin/* pages. The individual pages keep their own
// checks as backup, but this wrapper stops non-admins from ever mounting the
// admin markup (no flash of the admin shell while an async check runs).
// Actual data safety is still enforced by RLS — this is UX + defense in depth.
//
// 인증 앱을 등록한 관리자는 이번 세션에서 코드를 확인(aal2)해야 들어온다.
// DB의 is_admin()도 같은 규칙이라, 여기를 건너뛰어도 데이터는 열리지 않는다.
export default function RequireAdmin() {
  const { status, isSignedIn, isAdmin, userId } = useSession();
  const [mfa, setMfa] = useState<AdminMfaState | null>(null);

  const check = useCallback(() => {
    void readAdminMfaState().then(setMfa);
  }, []);

  useEffect(() => {
    setMfa(null);
    if (isAdmin) check();
  }, [isAdmin, userId, check]);

  if (status === "loading") return <PageLoading />;
  if (!isSignedIn) return <Navigate to="/admin" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  if (mfa === null) return <PageLoading />;
  if (mfa === "needed") return <AdminMfaChallenge onVerified={check} />;
  return <Outlet />;
}
