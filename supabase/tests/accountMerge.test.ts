import { beforeAll, describe, expect, it } from "vitest";
import { actAs, asRole, createDb, createUser, type Db } from "./harness";

let db: Db;

async function setPhone(id: string, phone: string) {
  await actAs(db, null);
  await db.query("update public.profiles set phone = $2 where id = $1", [id, phone]);
}

async function addMonthPass(profileId: string) {
  await actAs(db, { role: "service_role" });
  await db.query("delete from public.passes where name = '월권 지정석'");
  await db.query("insert into public.passes (name, price, is_active, sort_order) values ('월권 지정석', 200000, true, 1)");
  const { rows } = await db.query<{ id: string }>(
    `insert into public.reservations (profile_id, name, phone, pass_type, date, start_time, end_time, people, status)
     values ($1, '채송하', '01026638862', '월권 지정석', current_date, '08:00', '01:00', 1, 'confirmed') returning id`,
    [profileId],
  );
  return rows[0].id;
}

async function rpc<T>(sub: string, sql: string, params: unknown[] = []) {
  return asRole(db, { sub, role: "authenticated" }, async () => (await db.query<{ r: T }>(sql, params)).rows[0].r);
}

beforeAll(async () => {
  db = await createDb();
}, 60_000);

describe("계정 합치기 (0065)", () => {
  it("연락처가 같은 다른 계정을 찾아 주고, 이메일은 가린다", async () => {
    const google = await createUser(db, { name: "채송하" });
    const email = await createUser(db, { name: "채송하" });
    await setPhone(google, "010-2663-8862");
    await setPhone(email, "01026638862");
    const rows = await asRole(db, { sub: google, role: "authenticated" }, async () =>
      (await db.query<{ id: string; email_masked: string }>("select * from public.my_duplicate_accounts()")).rows,
    );
    expect(rows.map((r) => r.id)).toEqual([email]);
    expect(rows[0].email_masked).toMatch(/^.{1,3}\*\*\*@test\.local$/);
  });

  it("두 계정 모두 로그인해야 합쳐지고, 예약이 남길 계정으로 옮겨진다", async () => {
    const keep = await createUser(db, { name: "A" });
    const absorb = await createUser(db, { name: "A" });
    await setPhone(keep, "010-1111-2222");
    await setPhone(absorb, "01011112222");
    const reservationId = await addMonthPass(absorb);

    const start = await rpc<{ ok: boolean; code: string }>(keep, "select public.start_account_merge($1) as r", [absorb]);
    expect(start.ok).toBe(true);

    // 남길 계정으로 확인하면 거절(합칠 계정에 로그인해야 한다).
    const same = await rpc<{ ok: boolean; code: string }>(keep, "select public.confirm_account_merge($1) as r", [start.code]);
    expect(same).toMatchObject({ ok: false, code: "SAME_ACCOUNT" });

    const done = await rpc<{ ok: boolean }>(absorb, "select public.confirm_account_merge($1) as r", [start.code]);
    expect(done.ok).toBe(true);

    await actAs(db, null);
    const moved = await db.query<{ profile_id: string }>("select profile_id from public.reservations where id = $1", [reservationId]);
    expect(moved.rows[0].profile_id).toBe(keep);
    const old = await db.query<{ merged_into: string; blocked_at: string | null }>("select merged_into, blocked_at from public.profiles where id = $1", [absorb]);
    expect(old.rows[0].merged_into).toBe(keep);
    expect(old.rows[0].blocked_at).not.toBeNull();

    // 같은 코드는 두 번 쓸 수 없다.
    const again = await rpc<{ ok: boolean; code: string }>(absorb, "select public.confirm_account_merge($1) as r", [start.code]);
    expect(again.ok).toBe(false);
  });

  it("연락처가 다르면 시작조차 할 수 없다(남의 번호를 적어도 가져갈 수 없다)", async () => {
    const me = await createUser(db);
    const victim = await createUser(db);
    await setPhone(me, "010-3333-4444");
    await setPhone(victim, "010-5555-6666");
    const start = await rpc<{ ok: boolean }>(me, "select public.start_account_merge($1) as r", [victim]);
    expect(start.ok).toBe(false);
  });

  it("코드만 알아서는 제3자가 확인할 수 없다", async () => {
    const keep = await createUser(db);
    const absorb = await createUser(db);
    const stranger = await createUser(db);
    await setPhone(keep, "010-7777-8888");
    await setPhone(absorb, "010-7777-8888");
    const start = await rpc<{ code: string }>(keep, "select public.start_account_merge($1) as r", [absorb]);
    const wrong = await rpc<{ ok: boolean; code: string }>(stranger, "select public.confirm_account_merge($1) as r", [start.code]);
    expect(wrong).toMatchObject({ ok: false, code: "WRONG_ACCOUNT" });
  });

  it("관리자는 바로 합칠 수 있고, 일반 회원은 관리자 함수를 쓸 수 없다", async () => {
    const admin = await createUser(db, { role: "admin" });
    const a = await createUser(db);
    const b = await createUser(db);
    const reservationId = await addMonthPass(b);
    const denied = await rpc<{ ok: boolean }>(a, "select public.admin_merge_profiles($1, $2) as r", [b, a]);
    expect(denied.ok).toBe(false);
    const ok = await asRole(db, { sub: admin, role: "authenticated", aal: "aal1" }, async () =>
      (await db.query<{ r: { ok: boolean } }>("select public.admin_merge_profiles($1, $2) as r", [b, a])).rows[0].r,
    );
    expect(ok).toMatchObject({ ok: true });
    await actAs(db, null);
    const moved = await db.query<{ profile_id: string }>("select profile_id from public.reservations where id = $1", [reservationId]);
    expect(moved.rows[0].profile_id).toBe(a);
  });

  it("내부 합치기 함수는 회원이 직접 부를 수 없다", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    await expect(rpc(a, "select public.merge_profile_data($1, $2) as r", [b, a])).rejects.toThrow(/permission denied/);
  });
});
