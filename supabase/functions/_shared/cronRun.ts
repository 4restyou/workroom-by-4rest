// 크론 함수가 끝날 때 cron_runs에 한 줄 남긴다(0063). 기록이 실패해도 본 작업은 멈추지 않는다.
export async function recordCronRun(
  supabaseUrl: string,
  serviceRole: string,
  job: string,
  ok: boolean,
  detail: Record<string, unknown> | null = null,
  error: string | null = null,
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/rpc/record_cron_run`, {
      method: "POST",
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_job: job, p_ok: ok, p_detail: detail, p_error: error }),
    });
  } catch (cause) {
    console.error("[cron-run] record failed", { job, message: cause instanceof Error ? cause.message : String(cause) });
  }
}
