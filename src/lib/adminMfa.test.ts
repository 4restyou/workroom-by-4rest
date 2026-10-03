import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: null }));

import { cleanOtp, mfaStateFrom } from "./adminMfa";

describe("mfaStateFrom", () => {
  it("코드까지 확인한 세션은 verified", () => {
    expect(mfaStateFrom("aal2", "aal2")).toBe("verified");
  });
  it("등록은 했지만 이번 세션에서 코드를 안 넣었으면 needed", () => {
    expect(mfaStateFrom("aal1", "aal2")).toBe("needed");
  });
  it("등록하지 않았으면 none — 잠기지 않는다", () => {
    expect(mfaStateFrom("aal1", "aal1")).toBe("none");
    expect(mfaStateFrom(null, null)).toBe("none");
  });
});

describe("cleanOtp", () => {
  it("숫자 6자리만 남긴다", () => {
    expect(cleanOtp("123 456")).toBe("123456");
    expect(cleanOtp("12a3-4567")).toBe("123456");
  });
});
