import { describe, expect, it } from "vitest";
import { dismissalMap, isDismissed, visibleActions } from "./dismissals";

const NOW = new Date("2026-08-26T10:00:00+09:00").getTime();
const hoursAgo = (hours: number) => new Date(NOW - hours * 60 * 60 * 1000).toISOString();

describe("isDismissed", () => {
  it("hides an item for as long as its snooze lasts", () => {
    const map = dismissalMap([{ key: "coupon-a", dismissed_at: hoursAgo(3) }]);
    expect(isDismissed({ key: "coupon-a", snoozeDays: 1 }, map, NOW)).toBe(true);
  });

  it("brings it back once the snooze runs out", () => {
    // 연락은 했는데 상황이 그대로면 다시 떠야 한다.
    const map = dismissalMap([{ key: "dormant-a", dismissed_at: hoursAgo(24 * 8) }]);
    expect(isDismissed({ key: "dormant-a", snoozeDays: 7 }, map, NOW)).toBe(false);
  });

  it("never hides an item that cannot be snoozed", () => {
    // 결제 미확인은 숨길 수 없다. 숨기면 돈이 새는 걸 못 본다.
    const map = dismissalMap([{ key: "unpaid-a", dismissed_at: hoursAgo(1) }]);
    expect(isDismissed({ key: "unpaid-a" }, map, NOW)).toBe(false);
  });

  it("shows an item nobody dismissed", () => {
    expect(isDismissed({ key: "coupon-a", snoozeDays: 1 }, new Map(), NOW)).toBe(false);
  });

  it("shows the item if the stored time makes no sense", () => {
    // 값이 깨졌다고 조용히 숨기면 안 된다. 모르면 보여 준다.
    const map = dismissalMap([{ key: "coupon-a", dismissed_at: "어제" }]);
    expect(isDismissed({ key: "coupon-a", snoozeDays: 1 }, map, NOW)).toBe(false);
  });
});

describe("visibleActions", () => {
  it("keeps the urgent row and folds away the one just handled", () => {
    const map = dismissalMap([{ key: "dormant-b", dismissed_at: hoursAgo(2) }]);
    const actions = [
      { key: "unpaid-a" },
      { key: "dormant-b", snoozeDays: 7 },
      { key: "coupon-c", snoozeDays: 1 },
    ];
    expect(visibleActions(actions, map, NOW).map((item) => item.key)).toEqual(["unpaid-a", "coupon-c"]);
  });
});
