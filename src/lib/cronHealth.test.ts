import { describe, expect, it } from "vitest";
import { cronProblems, type CronRun } from "./cronHealth";

const now = new Date("2026-10-03T05:00:00Z");
const ok = (job: string, minutesAgo: number): CronRun => ({
  job,
  last_run_at: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
  last_ok_at: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
  last_error_at: null,
  last_error: null,
});

describe("cronProblems", () => {
  it("모두 제때 돌면 문제 없음", () => {
    expect(cronProblems([ok("reservation-end-reminder", 4), ok("pass-expiry-reminder", 600), ok("portone-billing", 600)], now)).toEqual([]);
  });
  it("5분 작업이 30분 넘게 멈추면 알린다", () => {
    const problems = cronProblems([ok("reservation-end-reminder", 45), ok("pass-expiry-reminder", 60), ok("portone-billing", 60)], now);
    expect(problems.map((p) => p.job)).toEqual(["reservation-end-reminder"]);
    expect(problems[0].message).toContain("45분 전");
  });
  it("기록이 없으면 알린다", () => {
    expect(cronProblems([], now).map((p) => p.job)).toHaveLength(3);
  });
  it("필요 없는 작업(활성 구독 없음)은 건너뛴다", () => {
    const problems = cronProblems([ok("reservation-end-reminder", 1), ok("pass-expiry-reminder", 1)], now, (job) => job !== "portone-billing");
    expect(problems).toEqual([]);
  });
  it("성공 뒤에 실패가 이어지면 알린다", () => {
    const run = { ...ok("reservation-end-reminder", 3), last_error_at: new Date(now.getTime() - 60_000).toISOString(), last_error: "claim 500" };
    const problems = cronProblems([run, ok("pass-expiry-reminder", 1), ok("portone-billing", 1)], now);
    expect(problems[0].message).toContain("claim 500");
  });
});
