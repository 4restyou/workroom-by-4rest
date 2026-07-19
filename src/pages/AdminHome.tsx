import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminDashboard from "../components/AdminDashboard";
import PageLoading from "../components/PageLoading";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";

export default function AdminHome() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    async function check() {
      if (!supabase) {
        navigate("/admin", { replace: true });
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        navigate("/admin", { replace: true });
        return;
      }
      const profile = await getCurrentProfile();
      if (!active) return;
      if (profile?.role !== "admin") {
        navigate("/account", { replace: true });
        return;
      }
      setAllowed(true);
    }
    void check();
    return () => {
      active = false;
    };
  }, [navigate]);

  return allowed ? <AdminDashboard /> : <PageLoading />;
}
