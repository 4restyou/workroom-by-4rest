import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import PageLoading from "./PageLoading";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";

// Route-level gate for /admin/* pages. The individual pages keep their own
// checks as backup, but this wrapper stops non-admins from ever mounting the
// admin markup (no flash of the admin shell while an async check runs).
// Actual data safety is still enforced by RLS — this is UX + defense in depth.
export default function RequireAdmin() {
  const [state, setState] = useState<"checking" | "admin" | "guest" | "member">("checking");

  useEffect(() => {
    let active = true;
    async function check() {
      if (!supabase) {
        if (active) setState("guest");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        setState("guest");
        return;
      }
      const profile = await getCurrentProfile();
      if (!active) return;
      setState(profile?.role === "admin" ? "admin" : "member");
    }
    void check();
    return () => {
      active = false;
    };
  }, []);

  if (state === "checking") return <PageLoading />;
  if (state === "guest") return <Navigate to="/admin" replace />;
  if (state === "member") return <Navigate to="/" replace />;
  return <Outlet />;
}
