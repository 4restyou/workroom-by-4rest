// 자동 작업(크론)이 제때 돌고 있는지. cron_runs(0063)를 읽어 판단한다.

export type CronRun = {
  job: string;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
};

export type CronJob = { job: string; label: string; staleAfterMinutes: number; what: string };

export const CRON_JOBS: CronJob[] = [
  { job: "reservation-end-reminder", label: "종료 알림·자동 퇴실", staleAfterMinutes: 30, what: "5분마다" },
  { job: "pass-expiry-reminder", label: "이용권 만료 알림", staleAfterMinutes: 26 * 60, what: "하루 한 번" },
  { job: "portone-billing", label: "정기결제 자동청구", staleAfterMinutes: 26 * 60, what: "하루 한 번" },
];

export type CronProblem = { job: string; label: string; message: string };

function minutesSince(iso: string, now: Date) {
  return (now.getTime() - new Date(iso).getTime()) / 60_000;
}

function ago(minutes: number) {
  if (minutes < 90) return `${Math.round(minutes)}분 전`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)}시간 전`;
  return `${Math.round(minutes / 1440)}일 전`;
}

/**
 * 문제가 있는 작업만 돌려준다.
 * required: 이 작업이 꼭 돌아야 하는가(예: 정기결제는 활성 구독이 있을 때만).
 */
export function cronProblems(runs: CronRun[], now: Date, required: (job: string) => boolean = () => true): CronProblem[] {
  const byJob = new Map(runs.map((run) => [run.job, run]));
  const problems: CronProblem[] = [];
  for (const spec of CRON_JOBS) {
    if (!required(spec.job)) continue;
    const run = byJob.get(spec.job);
    if (!run?.last_ok_at) {
      problems.push({
        job: spec.job,
        label: spec.label,
        message: run?.last_error
          ? `한 번도 성공하지 못했어요: ${run.last_error}`
          : `실행 기록이 없어요. ${spec.what} 돌아야 하는 작업입니다. 스케줄과 CRON_SECRET을 확인해 주세요.`,
      });
      continue;
    }
    const idle = minutesSince(run.last_ok_at, now);
    if (idle > spec.staleAfterMinutes) {
      problems.push({ job: spec.job, label: spec.label, message: `마지막 성공이 ${ago(idle)}예요. ${spec.what} 돌아야 합니다.` });
      continue;
    }
    // 성공 뒤에 실패가 이어지고 있으면 알린다.
    if (run.last_error_at && run.last_error_at > run.last_ok_at) {
      problems.push({ job: spec.job, label: spec.label, message: `최근 실행이 실패했어요: ${run.last_error ?? "원인 미상"}` });
    }
  }
  return problems;
}
