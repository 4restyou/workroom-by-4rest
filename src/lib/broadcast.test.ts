import { describe, expect, it } from "vitest";
import { canSendAdTo, checkBroadcast, composeBroadcast, isAdQuietHours, smsByteLength, smsType } from "./broadcast";

const OPT_OUT = "무료수신거부 내정보 > 광고 수신 끄기";

describe("composeBroadcast", () => {
  it("leaves an operational notice exactly as written", () => {
    // 거래 안내는 (광고) 표기를 붙이면 안 된다 — 붙이면 광고가 된다.
    expect(composeBroadcast({ kind: "notice", body: "9월 20일은 휴무입니다.", optOut: OPT_OUT }))
      .toBe("9월 20일은 휴무입니다.");
  });

  it("stamps an ad and attaches the opt-out", () => {
    // 표기를 사람이 손으로 붙이게 두면 언젠가 빠진다. 빠지면 과태료 대상이다.
    const text = composeBroadcast({ kind: "ad", body: "9월 한 달 전 이용권 20% 할인", optOut: OPT_OUT });
    expect(text.startsWith("(광고) ")).toBe(true);
    expect(text).toContain(OPT_OUT);
  });
});

describe("smsByteLength", () => {
  it("counts Korean as two bytes", () => {
    // 통신사 과금은 글자 수가 아니라 바이트다.
    expect(smsByteLength("가나다")).toBe(6);
    expect(smsByteLength("abc")).toBe(3);
  });

  it("switches to LMS past 90 bytes", () => {
    expect(smsType("가".repeat(45))).toBe("SMS");
    expect(smsType("가".repeat(46))).toBe("LMS");
  });
});

describe("canSendAdTo", () => {
  it("allows the two groups the law allows", () => {
    // 6개월 예외(제50조 1항 단서)와 명시적 동의.
    expect(canSendAdTo("recent6m")).toBe(true);
    expect(canSendAdTo("consented")).toBe(true);
  });

  it("refuses everyone else", () => {
    // 가입만 하고 온 적 없는 사람에게 할인 문자를 보내면 위반이다.
    expect(canSendAdTo("all")).toBe(false);
    expect(canSendAdTo("active")).toBe(false);
    expect(canSendAdTo("upcoming")).toBe(false);
  });
});

describe("isAdQuietHours", () => {
  it("covers 21시부터 다음 날 8시까지", () => {
    expect(isAdQuietHours(21)).toBe(true);
    expect(isAdQuietHours(23)).toBe(true);
    expect(isAdQuietHours(0)).toBe(true);
    expect(isAdQuietHours(7)).toBe(true);
    expect(isAdQuietHours(8)).toBe(false);
    expect(isAdQuietHours(20)).toBe(false);
  });
});

describe("checkBroadcast", () => {
  const base = { kind: "ad" as const, audience: "recent6m" as const, body: "20% 할인", recipients: 40, hour: 14 };

  it("lets a legal ad through", () => {
    expect(checkBroadcast(base)).toEqual({ ok: true, problems: [] });
  });

  it("stops an ad to the wrong group", () => {
    const result = checkBroadcast({ ...base, audience: "all" });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain("광고를 보낼 수 없습니다");
  });

  it("stops an ad at night", () => {
    expect(checkBroadcast({ ...base, hour: 22 }).ok).toBe(false);
  });

  it("lets an operational notice go to everyone, at any hour", () => {
    // 휴무 공지는 내일 아침 일이면 밤에도 보내야 한다.
    expect(checkBroadcast({ ...base, kind: "notice", audience: "all", hour: 23 }).ok).toBe(true);
  });

  it("stops an empty message and an empty audience", () => {
    expect(checkBroadcast({ ...base, body: "   " }).ok).toBe(false);
    expect(checkBroadcast({ ...base, recipients: 0 }).ok).toBe(false);
  });
});
