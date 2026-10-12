import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: null }));

import { describeAccount, duplicatePhoneGroups, providerLabel } from "./accountMerge";

describe("duplicatePhoneGroups", () => {
  it("하이픈 유무와 상관없이 같은 번호끼리 묶는다", () => {
    const groups = duplicatePhoneGroups([
      { id: "a", phone: "010-2663-8862" },
      { id: "b", phone: "01026638862" },
      { id: "c", phone: "010-1111-2222" },
      { id: "d", phone: null },
    ]);
    expect(groups).toEqual([{ phone: "01026638862", members: [{ id: "a", phone: "010-2663-8862" }, { id: "b", phone: "01026638862" }] }]);
  });
  it("너무 짧은 번호(빈 값·오타)는 묶지 않는다", () => {
    expect(duplicatePhoneGroups([{ id: "a", phone: "010" }, { id: "b", phone: "010" }])).toEqual([]);
  });
});

describe("표시", () => {
  it("로그인 방식 이름", () => {
    expect(providerLabel("google")).toBe("구글");
    expect(providerLabel("email")).toBe("이메일");
    expect(describeAccount({ provider: "email", email_masked: "rma***@naver.com" })).toBe("이메일 로그인 · rma***@naver.com");
  });
});
