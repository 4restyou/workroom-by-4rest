import AdminDashboard from "../components/AdminDashboard";
import PageLoading from "../components/PageLoading";
import { useSession } from "../lib/sessionContext";

// 라우트 자체가 <RequireAdmin>으로 감싸여 있어 여기까지 오면 이미 관리자다.
// 세션은 SessionProvider가 한 번만 읽으므로 별도 조회 없이 상태만 본다.
export default function AdminHome() {
  const { status, isAdmin } = useSession();
  return status === "ready" && isAdmin ? <AdminDashboard /> : <PageLoading />;
}
