import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: null }));

import { describeError, shouldReport } from "./errorReporting";

describe("describeError", () => {
  it("Error는 이름과 메시지를 합친다", () => {
    const { message, stack } = describeError(new TypeError("x is undefined"));
    expect(message).toBe("TypeError: x is undefined");
    expect(stack).toContain("x is undefined");
  });
  it("문자열·객체도 받는다", () => {
    expect(describeError("boom").message).toBe("boom");
    expect(describeError({ code: 1 }).message).toBe('{"code":1}');
  });
});

describe("shouldReport", () => {
  const check = (error: unknown) => {
    const { message, stack } = describeError(error);
    return shouldReport(error, message, stack);
  };
  it("진짜 오류는 보낸다", () => {
    expect(check(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(true);
  });
  it("잡음은 거른다", () => {
    expect(check("Script error.")).toBe(false);
    expect(check(new Error("ResizeObserver loop completed with undelivered notifications."))).toBe(false);
    expect(check(new TypeError("Failed to fetch"))).toBe(false);
    expect(check(new TypeError("Load failed"))).toBe(false);
    expect(check(new TypeError("Script https://work-room.kr/sw.js load failed"))).toBe(false);
  });
  it("배포 직후 낡은 조각 오류는 스스로 새로고침하므로 보내지 않는다", () => {
    expect(check(new TypeError("Failed to fetch dynamically imported module: https://work-room.kr/assets/Reserve-abc.js"))).toBe(false);
  });
});

import { groupClientErrors, type ClientErrorRow } from "./errorReporting";

describe("groupClientErrors", () => {
  const row = (id: number, message: string, at: string, profile: string | null, path = "/reserve"): ClientErrorRow => ({
    id, created_at: at, kind: "error", message, stack: null, path, app_version: null, user_agent: "ua", profile_id: profile,
  });
  it("같은 메시지끼리 묶고 많이 난 순서로", () => {
    const groups = groupClientErrors([
      row(1, "A", "2026-10-01T01:00:00Z", "u1"),
      row(2, "B", "2026-10-02T01:00:00Z", "u1"),
      row(3, "A", "2026-10-03T01:00:00Z", "u2", "/account"),
    ]);
    expect(groups.map((g) => g.message)).toEqual(["A", "B"]);
    expect(groups[0]).toMatchObject({ count: 2, people: 2, lastAt: "2026-10-03T01:00:00Z", paths: ["/reserve", "/account"] });
  });
});
