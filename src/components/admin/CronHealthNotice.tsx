import { useEffect, useState } from "react";
import { cronProblems, type CronProblem, type CronRun } from "../../lib/cronHealth";
import { supabase } from "../../lib/supabase";

// 자동 작업이 멈췄을 때만 오늘 운영 맨 위에 뜬다.
export default function CronHealthNotice() {
  const [problems, setProblems] = useState<CronProblem[]>([]);

  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const [runs, subs] = await Promise.all([
        supabase!.from("cron_runs").select("*"),
        supabase!.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
      ]);
      // 표가 아직 없으면(0063 적용 전) 아무것도 띄우지 않는다.
      if (runs.error) return;
      const hasSubscriptions = (subs.count ?? 0) > 0;
      setProblems(cronProblems((runs.data ?? []) as CronRun[], new Date(), (job) => job !== "portone-billing" || hasSubscriptions));
    })();
  }, []);

  if (!problems.length) return null;
  return (
    <div className="mb-4 border border-red-400 bg-workroom-danger/30 px-4 py-3 text-sm">
      <p className="font-bold">자동 작업이 멈춘 것 같아요</p>
      <ul className="mt-1 grid gap-1 font-medium">
        {problems.map((problem) => (
          <li key={problem.job}>
            <span className="font-bold">{problem.label}</span> · {problem.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
