import { useEffect, useState } from "react";
import { groupClientErrors, type ClientErrorGroup, type ClientErrorRow } from "../../lib/errorReporting";
import { supabase } from "../../lib/supabase";

function when(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// 최근 7일 동안 손님 화면에서 난 오류. 없으면 아무것도 그리지 않는다.
export default function ClientErrorsPanel() {
  const [groups, setGroups] = useState<ClientErrorGroup[] | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    void supabase
      .from("client_error_logs")
      .select("id, created_at, kind, message, stack, path, app_version, user_agent, profile_id")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        // 표가 아직 없거나(마이그레이션 전) 권한이 없으면 조용히 숨긴다.
        if (!error) setGroups(groupClientErrors((data ?? []) as ClientErrorRow[]));
      });
  }, []);

  if (!groups?.length) return null;
  const total = groups.reduce((sum, group) => sum + group.count, 0);

  return (
    <section className="mt-7">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">화면 오류</h2>
          <p className="mt-0.5 text-xs font-medium text-workroom-muted">최근 7일 동안 손님 화면에서 난 오류입니다. 같은 오류는 묶어서 보여 줍니다.</p>
        </div>
        <span className="text-sm font-semibold tabular-nums">{total}건</span>
      </div>
      <div className="border-y border-workroom-line bg-white">
        {groups.slice(0, 8).map((group) => (
          <details className="admin-row px-4 py-3" key={group.message}>
            <summary className="cursor-pointer list-none">
              <p className="break-words text-sm font-semibold">{group.message}</p>
              <p className="mt-0.5 text-xs font-medium text-workroom-muted">
                {group.count}회 · {group.people}명 · 마지막 {when(group.lastAt)} · {group.paths.join(", ") || "경로 없음"}
              </p>
            </summary>
            <div className="mt-2 grid gap-1 text-xs font-medium text-workroom-muted">
              <p>배포 {group.sample.app_version ?? "-"} · {group.sample.user_agent ?? "-"}</p>
              {group.sample.stack ? (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-[6px] border border-workroom-line bg-workroom-background p-2 text-[11px] leading-4">{group.sample.stack}</pre>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
