import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import type { MemberStatus, Profile } from "../lib/types";

const memberStatuses: MemberStatus[] = ["pending", "approved", "rejected"];
const statusLabels: Record<MemberStatus, string> = {
  pending: "확인 필요",
  approved: "이용 가능",
  rejected: "보류",
};

export default function AdminMembers() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Profile[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | MemberStatus>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkAndLoad() {
      if (!supabase) {
        setError("Supabase 환경 변수가 아직 연결되지 않았습니다.");
        setIsLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/admin", { replace: true });
        return;
      }

      try {
        const profile = await getCurrentProfile();
        if (profile?.role !== "admin") {
          navigate("/account", { replace: true });
          return;
        }
        await loadMembers();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "회원 목록을 불러오지 못했습니다.");
        setIsLoading(false);
      }
    }

    void checkAndLoad();
  }, [navigate]);

  async function loadMembers() {
    if (!supabase) return;
    setIsLoading(true);
    setError("");
    const { data, error: loadError } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setIsLoading(false);

    if (loadError) {
      setError(loadError.message);
      return;
    }
    setMembers((data ?? []) as Profile[]);
  }

  const visibleMembers = useMemo(
    () => members.filter((member) => (statusFilter === "all" ? true : member.membership_status === statusFilter)),
    [members, statusFilter],
  );

  const pendingCount = members.filter((member) => member.membership_status === "pending" && member.role !== "admin").length;

  async function updateMember(id: string, membership_status: MemberStatus) {
    if (!supabase) return;
    const { error: updateError } = await supabase.from("profiles").update({ membership_status }).eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMembers((current) => current.map((member) => (member.id === id ? { ...member, membership_status } : member)));
  }

  return (
    <main className="pb-12">
      <Section eyebrow="Admin" title="회원 관리">
        <div className="mb-5 grid gap-3 rounded-card border border-workroom-line bg-workroom-surface p-4 shadow-soft sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="grid gap-2 text-sm font-black">
            상태별 필터
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | MemberStatus)}>
              <option value="all">전체</option>
              {memberStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-full border border-workroom-line bg-workroom-yellow px-5 py-3 font-black" onClick={loadMembers} type="button">
            새로고침
          </button>
          <Link className="rounded-full border border-workroom-line bg-white px-5 py-3 text-center font-black" to="/admin/reservations">
            예약관리
          </Link>
        </div>

        <p className="mb-4 rounded-card border border-workroom-line bg-workroom-yellow p-4 text-sm font-black">
          전체 회원 {members.length}명 · 상태 확인 필요 {pendingCount}명
        </p>
        {isLoading ? <p className="rounded-card border border-workroom-line bg-workroom-yellow p-4 font-black">회원 목록을 불러오는 중입니다.</p> : null}
        {error ? <p className="mb-4 rounded-card border border-workroom-line bg-red-100 p-4 text-sm font-black">{error}</p> : null}
        {!isLoading && !visibleMembers.length ? (
          <p className="rounded-card border border-workroom-line bg-workroom-surface p-6 text-center font-black shadow-sketch">조건에 맞는 회원이 없습니다.</p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {visibleMembers.map((member) => (
            <article className="rounded-card border border-workroom-line bg-workroom-surface p-5 shadow-sketch" key={member.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">{member.full_name || "이름 미입력"}</h2>
                  <p className="mt-1 text-sm font-bold text-workroom-muted">{member.email}</p>
                  <p className="text-sm font-bold text-workroom-muted">{member.phone || "연락처 미입력"}</p>
                </div>
                <span className="rounded-full border border-workroom-line bg-workroom-yellow px-3 py-1 text-xs font-black">
                  {member.role === "admin" ? "관리자" : statusLabels[member.membership_status]}
                </span>
              </div>
              {member.address ? <p className="mt-4 rounded-card border border-workroom-line bg-white p-3 text-sm font-black">{member.address}</p> : null}
              <div className="mt-5 grid grid-cols-3 gap-2">
                {memberStatuses.map((status) => (
                  <button
                    className={`rounded-full border border-workroom-line px-3 py-2 text-sm font-black ${
                      member.membership_status === status ? "bg-workroom-text text-white" : "bg-white"
                    }`}
                    key={status}
                    onClick={() => void updateMember(member.id, status)}
                    type="button"
                  >
                    {statusLabels[status]}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Section>
    </main>
  );
}
