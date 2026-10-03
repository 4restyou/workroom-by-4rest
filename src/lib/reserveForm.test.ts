import { describe, expect, it } from "vitest";
import { getPassGroup, groupPasses, isWithinOperatingHours, startOfMonth } from "./reserveForm";
import type { Pass } from "./types";

const pass = (name: string) => ({ id: name, name, price: 1000 }) as Pass;

describe("getPassGroup / groupPasses", () => {
  it("이름으로 묶는다", () => {
    expect(getPassGroup("3시간권")).toBe("시간권");
    expect(getPassGroup("종일권")).toBe("종일권");
    expect(getPassGroup("4주 월권")).toBe("주간 / 월권");
    expect(getPassGroup("단체 대관")).toBe("단체·기타");
  });
  it("빈 묶음은 빼고 정해진 순서로", () => {
    const groups = groupPasses([pass("4주 월권"), pass("3시간권"), pass("6시간권")]);
    expect(groups.map((g) => g.name)).toEqual(["시간권", "주간 / 월권"]);
    expect(groups[0].items.map((p) => p.name)).toEqual(["3시간권", "6시간권"]);
  });
});

describe("isWithinOperatingHours", () => {
  it("운영시간 안쪽만 허용", () => {
    expect(isWithinOperatingHours("10:00", "13:00", "08:00", "22:00")).toBe(true);
    expect(isWithinOperatingHours("20:00", "23:00", "08:00", "22:00")).toBe(false);
  });
  it("자정을 넘기는 운영시간", () => {
    expect(isWithinOperatingHours("22:00", "01:00", "10:00", "02:00")).toBe(true);
    expect(isWithinOperatingHours("23:00", "03:00", "10:00", "02:00")).toBe(false);
  });
});

describe("startOfMonth", () => {
  it("그 달 1일", () => {
    expect(startOfMonth(new Date(2026, 9, 17)).getDate()).toBe(1);
  });
});
