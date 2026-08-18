import { describe, expect, it } from "vitest";
import { couponRemindersForToday, type IssuedCoupon, type TodayVisitor } from "./couponReminders";

const coupon = (profile_id: string | null, label = "1시간 무료"): IssuedCoupon => ({
  id: `c-${Math.abs(profile_id?.length ?? 0)}-${label}`,
  profile_id,
  label,
});
const visitor = (profile_id: string | null, name: string): TodayVisitor => ({ profile_id, name });

describe("couponRemindersForToday", () => {
  it("stays quiet when no coupon holder is coming today", () => {
    // 늘 떠 있던 항목이 사라지는 지점 — 오늘 안 오는 사람의 쿠폰은 알리지 않는다.
    expect(couponRemindersForToday([coupon("a")], [visitor("b", "보람")])).toEqual([]);
  });

  it("names the coupon holder who is on today's schedule", () => {
    const reminders = couponRemindersForToday([coupon("a", "3시간권 1회")], [visitor("a", "보람")]);
    expect(reminders).toEqual([{ profileId: "a", name: "보람", count: 1, label: "3시간권 1회" }]);
  });

  it("counts several coupons as one line and drops the label", () => {
    // 두 장 이상이면 어떤 쿠폰인지는 고객 카드에서 봐야 한다.
    const reminders = couponRemindersForToday([coupon("a", "1시간"), coupon("a", "커피")], [visitor("a", "보람")]);
    expect(reminders).toEqual([{ profileId: "a", name: "보람", count: 2, label: null }]);
  });

  it("ignores walk-ins with no member record", () => {
    // 비회원 워크인은 쿠폰을 가질 수 없다(migration 0041).
    expect(couponRemindersForToday([coupon(null)], [visitor(null, "워크인")])).toEqual([]);
  });

  it("sorts by name so the list does not jump around between refreshes", () => {
    const reminders = couponRemindersForToday(
      [coupon("b"), coupon("a")],
      [visitor("b", "지훈"), visitor("a", "가영")],
    );
    expect(reminders.map((item) => item.name)).toEqual(["가영", "지훈"]);
  });

  it("uses the first name seen for a member with two reservations today", () => {
    const reminders = couponRemindersForToday([coupon("a")], [visitor("a", "보람"), visitor("a", "보람")]);
    expect(reminders).toHaveLength(1);
  });
});
