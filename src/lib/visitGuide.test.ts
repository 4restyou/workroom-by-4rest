import { describe, expect, it } from "vitest";
import { guideCupsFor, visitGuideSections, visitGuideText } from "./visitGuide";

describe("guideCupsFor", () => {
  it("gives three cups only to the all-day passes", () => {
    expect(guideCupsFor("종일권")).toBe(3);
    expect(guideCupsFor("주간권")).toBe(3);
    expect(guideCupsFor("월권 지정석")).toBe(3);
  });

  it("gives one to everything else", () => {
    expect(guideCupsFor("3시간권")).toBe(1);
    expect(guideCupsFor("추가 1시간")).toBe(1);
    // 단체·모임은 3시간 대관이다.
    expect(guideCupsFor("단체 및 모임 이용권")).toBe(1);
    // 아직 없는 이용권도 1잔에서 시작한다 — 모르는 채로 3잔이 나가지 않게.
    expect(guideCupsFor("반나절권")).toBe(1);
  });
});

describe("visitGuideSections", () => {
  it("shows the code to someone allowed in today", () => {
    const location = visitGuideSections({ cups: 1, doorCode: "8825" })[0];
    expect(location.title).toBe("위치");
    expect(location.lines).toContain("출입구 비밀번호 8825");
  });

  it("promises it separately when there is none to show", () => {
    // 빈칸을 보여 주면 손님이 문 앞에서 못 들어온다.
    const location = visitGuideSections({ cups: 1, doorCode: null })[0];
    expect(location.lines.join(" ")).toContain("따로 안내드릴게요");
    expect(location.lines.join(" ")).not.toContain("출입구 비밀번호 ");
  });

  it("explains both cup counts when the pass is unknown", () => {
    const coffee = visitGuideSections({ cups: null }).find((section) => section.title.startsWith("커피"));
    expect(coffee?.lines.join(" ")).toContain("시간권 1잔, 종일권부터 하루 3잔");
  });

  it("runs from the door to the light switch", () => {
    const titles = visitGuideSections({ cups: 1 }).map((section) => section.title);
    expect(titles[0]).toBe("위치");
    expect(titles[1]).toBe("실내화");
    expect(titles[titles.length - 1]).toBe("나가실 때");
  });
});

describe("visitGuideText", () => {
  it("writes the same sections the screen shows", () => {
    const text = visitGuideText({ cups: 3, doorCode: "8825" });
    for (const section of visitGuideSections({ cups: 3, doorCode: "8825" })) {
      expect(text).toContain(`■ ${section.title}`);
      for (const line of section.lines) expect(text).toContain(line);
    }
  });
});
