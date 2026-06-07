import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import { formatDate } from "../lib/format";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import { badge, buttonClass, card, cardFlat, tintCard } from "../lib/ui";
import type { Profile } from "../lib/types";

export default function AdminMembers() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Profile[]>([]);
  const [query, setQuery] = useState("");
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

  const visibleMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    if (!q) return members;
    return members.filter((member) => {
      const haystack = `${member.full_name ?? ""} ${member.email}`.toLowerCase();
      const phoneMatch = qDigits.length > 0 && (member.phone ?? "").replace(/\D/g, "").includes(qDigits);
      return haystack.includes(q) || phoneMatch;
    });
  }, [members, query]);

  return (
    <main className="pb-12">
      <Section eyebrow="Admin" title="회원 관리" accent="ink">
        <div className={`mb-5 grid gap-3 ${card} p-4`}>
          <label className="grid gap-2 text-sm font-bold">
            이름 · 이메일 · 전화 검색
            <input placeholder="이름, 이메일 또는 전화번호로 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-[auto_auto] sm:justify-start">
            <button className={buttonClass("accent", "md")} onClick={loadMembers} type="button">
              새로고침
            </button>
            <Link className={buttonClass("secondary", "md")} to="/admin/reservations">
              예약관리
            </Link>
          </div>
        </div>

        <p className={`mb-4 ${tintCard("yellow")} p-4 text-sm font-bold`}>전체 회원 {members.length}명</p>
        {isLoading ? <p className={`${tintCard("yellow")} p-4 font-bold`}>회원 목록을 불러오는 중입니다.</p> : null}
        {error ? <p className={`mb-4 ${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}
        {!isLoading && !visibleMembers.length ? (
          <p className={`${card} p-6 text-center font-bold`}>조건에 맞는 회원이 없습니다.</p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {visibleMembers.map((member) => (
            <article className={`${card} p-5`} key={member.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-2xl font-black">{member.full_name || "이름 미입력"}</h2>
                  <a
                    href={`mailto:${member.email}`}
                    className="mt-1 block truncate text-sm font-medium text-workroom-muted underline underline-offset-2"
                  >
                    {member.email}
                  </a>
                  {member.phone ? (
                    <a href={`tel:${member.phone}`} className="text-sm font-bold text-workroom-ink underline underline-offset-2">
                      {member.phone}
                    </a>
                  ) : (
                    <p className="text-sm font-medium text-workroom-muted">연락처 미입력</p>
                  )}
                </div>
                <span className={badge(member.role === "admin" ? "ink" : "mint")}>
                  {member.role === "admin" ? "관리자" : "회원"}
                </span>
              </div>
              {member.address ? <p className={`mt-4 ${cardFlat} p-3 text-sm font-medium`}>{member.address}</p> : null}
              {member.created_at ? (
                <p className="mt-3 text-xs font-medium text-workroom-muted">가입일 · {formatDate(member.created_at.slice(0, 10))}</p>
              ) : null}
            </article>
          ))}
        </div>
      </Section>
    </main>
  );
}
