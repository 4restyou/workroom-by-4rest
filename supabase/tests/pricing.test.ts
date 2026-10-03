import { beforeAll, describe, expect, it } from "vitest";
import { actAs, createDb, createUser, type Db } from "./harness";

// 예약 금액은 화면이 아니라 DB 트리거(apply_reservation_pass_pricing)가 정한다.
// 이 트리거는 6번 넘게 다시 쓰였으므로, 규칙을 실제 Postgres에서 고정해 둔다.
// 규칙 설명: docs/pricing-rules.md

let db: Db;
let member: string;

const PAST = "2000-01-01";

async function setPass(name: string, fields: { price: number; discount_percent?: number; discount_until?: string | null; min_people?: number }) {
  await actAs(db, { role: "service_role" });
  await db.query("delete from public.passes where name = $1", [name]);
  await db.query(
    `insert into public.passes (name, price, is_active, sort_order, min_people, discount_percent, discount_until)
     values ($1, $2, true, 1, $3, $4, $5)`,
    [name, fields.price, fields.min_people ?? 1, fields.discount_percent ?? 0, fields.discount_until ?? null],
  );
}

async function issueCoupon(opts: { percent: number; scope: string; stackable?: boolean }) {
  await actAs(db, { role: "service_role" });
  const { rows } = await db.query<{ id: string }>(
    "insert into public.coupons (profile_id, label, discount_percent, applies_to, stackable) values ($1, '테스트', $2, $3, $4) returning id",
    [member, opts.percent, opts.scope, opts.stackable ?? false],
  );
  return rows[0].id;
}

type Priced = {
  id: string;
  price_at_booking: number | null;
  list_price_at_booking: number | null;
  price_before_coupon: number | null;
  discount_percent_at_booking: number;
  coupon_percent_at_booking: number;
  coupon_stacked: boolean;
};

async function book(passName: string, opts: { people?: number; couponId?: string; claimedPrice?: number; date?: string; start?: string; end?: string } = {}) {
  await actAs(db, { sub: member, role: "authenticated" });
  const { rows } = await db.query<Priced>(
    `insert into public.reservations (profile_id, name, phone, pass_type, date, start_time, end_time, people, coupon_id, price_at_booking)
     values ($1, '테스트', '01000000000', $2, $3, $4, $5, $6, $7, $8)
     returning id, price_at_booking, list_price_at_booking, price_before_coupon, discount_percent_at_booking, coupon_percent_at_booking, coupon_stacked`,
    [member, passName, opts.date ?? nextDate(), opts.start ?? "10:00", opts.end ?? "13:00", opts.people ?? 1, opts.couponId ?? null, opts.claimedPrice ?? null],
  );
  return rows[0];
}

// 예약은 오늘부터 2개월 안만 받고, 같은 회원의 겹치는 예약은 막히므로(0059)
// 오늘 이후 평일(일요일 휴무 제외)을 하루씩 넘기며 쓴다.
let offset = 2;
function nextDate() {
  for (;;) {
    offset += 1;
    const date = new Date(Date.now() + 9 * 3600_000 + offset * 86400_000);
    if (date.getUTCDay() !== 0) return date.toISOString().slice(0, 10);
  }
}

beforeAll(async () => {
  db = await createDb();
  member = await createUser(db);
}, 60_000);

describe("discounted_price", () => {
  it("10원 단위로 내림한다", async () => {
    const { rows } = await db.query<{ a: number; b: number; c: number }>(
      "select public.discounted_price(14000, 20) as a, public.discounted_price(11200, 10) as b, public.discounted_price(9990, 15) as c",
    );
    expect(rows[0]).toEqual({ a: 11200, b: 10080, c: 8490 });
  });
});

describe("예약 금액 트리거", () => {
  it("정가 × 인원", async () => {
    await setPass("3시간권", { price: 14000 });
    const r = await book("3시간권", { people: 2, date: nextDate() });
    expect(r).toMatchObject({ price_at_booking: 28000, list_price_at_booking: 28000, price_before_coupon: 28000, discount_percent_at_booking: 0 });
  });

  it("손님이 보낸 금액은 무시하고 DB가 다시 계산한다", async () => {
    await setPass("3시간권", { price: 14000 });
    const r = await book("3시간권", { claimedPrice: 100, date: nextDate() });
    expect(r.price_at_booking).toBe(14000);
  });

  it("할인 기간 중이면 이용권 할인을 1인 금액에 적용한 뒤 인원을 곱한다", async () => {
    await setPass("3시간권", { price: 14000, discount_percent: 20, discount_until: "2099-12-31" });
    const r = await book("3시간권", { people: 3, date: nextDate() });
    expect(r).toMatchObject({ price_at_booking: 33600, list_price_at_booking: 42000, discount_percent_at_booking: 20 });
  });

  it("할인 마감일이 지났으면 정가 (기준은 이용일이 아니라 예약한 날)", async () => {
    await setPass("3시간권", { price: 14000, discount_percent: 20, discount_until: PAST });
    const r = await book("3시간권", { date: nextDate() });
    expect(r).toMatchObject({ price_at_booking: 14000, discount_percent_at_booking: 0 });
  });

  it("최소 인원보다 적으면 거절한다", async () => {
    await setPass("단체권", { price: 10000, min_people: 4 });
    await expect(book("단체권", { people: 2, date: nextDate() })).rejects.toThrow(/4명 이상/);
  });

  it("판매하지 않는 이용권 이름이면 거절한다", async () => {
    await expect(book("없는권", { date: nextDate() })).rejects.toThrow(/판매 중인 이용권이 아닙니다/);
  });

  it("예약 후 할인이 끝나도, 예약을 고칠 때 예약 당시 할인율을 유지한다", async () => {
    await setPass("3시간권", { price: 14000, discount_percent: 20, discount_until: "2099-12-31" });
    const r = await book("3시간권", { date: nextDate() });
    await setPass("3시간권", { price: 14000 });
    await actAs(db, { role: "service_role" });
    const { rows } = await db.query<Priced>("update public.reservations set people = 2 where id = $1 returning price_at_booking, discount_percent_at_booking", [r.id]);
    expect(rows[0]).toMatchObject({ price_at_booking: 22400, discount_percent_at_booking: 20 });
  });
});

describe("쿠폰", () => {
  it("겹치지 않는 쿠폰: 이용권 할인과 쿠폰 중 더 큰 쪽 하나만", async () => {
    await setPass("4주 월권", { price: 200000, discount_percent: 20, discount_until: "2099-12-31" });
    const coupon = await issueCoupon({ percent: 10, scope: "month" });
    const r = await book("4주 월권", { couponId: coupon, date: nextDate() });
    expect(r).toMatchObject({ price_at_booking: 160000, coupon_percent_at_booking: 10, coupon_stacked: false });
  });

  it("쿠폰이 더 크면 쿠폰을 쓴다", async () => {
    await setPass("4주 월권", { price: 200000, discount_percent: 5, discount_until: "2099-12-31" });
    const coupon = await issueCoupon({ percent: 10, scope: "month" });
    const r = await book("4주 월권", { couponId: coupon, date: nextDate() });
    expect(r.price_at_booking).toBe(180000);
  });

  it("중복 가능 쿠폰: 이용권 할인 뒤에 순차로 깎는다 (14,000 → 11,200 → 10,080)", async () => {
    await setPass("3시간권", { price: 14000, discount_percent: 20, discount_until: "2099-12-31" });
    const coupon = await issueCoupon({ percent: 10, scope: "time", stackable: true });
    const r = await book("3시간권", { couponId: coupon, date: nextDate() });
    expect(r).toMatchObject({ price_at_booking: 10080, price_before_coupon: 11200, coupon_stacked: true });
  });

  it("범위가 다른 이용권에는 쓸 수 없다", async () => {
    await setPass("3시간권", { price: 14000 });
    const coupon = await issueCoupon({ percent: 10, scope: "month" });
    await expect(book("3시간권", { couponId: coupon, date: nextDate() })).rejects.toThrow(/사용할 수 없습니다/);
  });

  it("다른 사람의 쿠폰은 쓸 수 없다", async () => {
    await setPass("3시간권", { price: 14000 });
    const other = await createUser(db);
    await actAs(db, { role: "service_role" });
    const { rows } = await db.query<{ id: string }>(
      "insert into public.coupons (profile_id, label, discount_percent, applies_to) values ($1, '남의 쿠폰', 50, 'any') returning id",
      [other],
    );
    await expect(book("3시간권", { couponId: rows[0].id, date: nextDate() })).rejects.toThrow(/사용할 수 없는 쿠폰/);
  });
});
