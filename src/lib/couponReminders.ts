// 쿠폰 안내는 '오늘 오는 사람'에게만 뜬다.
//
// 예전에는 안 쓴 쿠폰이 한 장이라도 있으면 처리할 일 목록에 계속 떠 있었다.
// 쿠폰은 몇 달 뒤에 쓸 수도 있는 것이라, 그동안 목록 맨 위에서 자리만 차지하고
// 눌러도 사라지지 않았다. 늘 떠 있는 항목은 읽지 않게 되고, 그 옆의 진짜 급한
// 항목까지 같이 안 읽히게 만든다.
//
// 쿠폰을 안내할 수 있는 순간은 그 사람이 실제로 오는 날이다. 그래서 오늘
// 일정에 이름이 있는 회원의 쿠폰만 남긴다.

export type IssuedCoupon = { id: string; profile_id: string | null; label: string | null };

/** 오늘 오는 사람 — 오늘 일정의 예약에서 뽑는다. */
export type TodayVisitor = { profile_id: string | null; name: string };

export type CouponReminder = {
  profileId: string;
  name: string;
  count: number;
  /** 한 장뿐일 때만 어떤 쿠폰인지 적는다. 여러 장이면 고객 카드에서 본다. */
  label: string | null;
};

export function couponRemindersForToday(coupons: IssuedCoupon[], visitors: TodayVisitor[]): CouponReminder[] {
  const names = new Map<string, string>();
  visitors.forEach((visitor) => {
    if (!visitor.profile_id) return;
    if (!names.has(visitor.profile_id)) names.set(visitor.profile_id, visitor.name);
  });

  const byProfile = new Map<string, CouponReminder>();
  coupons.forEach((coupon) => {
    if (!coupon.profile_id) return;
    const name = names.get(coupon.profile_id);
    if (!name) return;

    const found = byProfile.get(coupon.profile_id);
    if (found) {
      found.count += 1;
      found.label = null;
      return;
    }
    byProfile.set(coupon.profile_id, { profileId: coupon.profile_id, name, count: 1, label: coupon.label });
  });

  return [...byProfile.values()].sort((a, b) => a.name.localeCompare(b.name));
}
