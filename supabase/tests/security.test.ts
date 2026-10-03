import { beforeAll, describe, expect, it } from "vitest";
import { actAs, asRole, createDb, createUser, type Db } from "./harness";

let db: Db;
let admin: string;
let member: string;
let other: string;

async function isAdmin(claims: { sub: string; aal?: string }) {
  return asRole(db, { ...claims, role: "authenticated" }, async () => {
    const { rows } = await db.query<{ ok: boolean }>("select public.is_admin() as ok");
    return rows[0].ok;
  });
}

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, { role: "admin" });
  member = await createUser(db);
  other = await createUser(db);
}, 60_000);

describe("관리자 2단계 인증 (0061)", () => {
  it("인증 앱을 등록하지 않은 관리자는 비밀번호만으로 관리자다 (잠기지 않음)", async () => {
    expect(await isAdmin({ sub: admin, aal: "aal1" })).toBe(true);
  });

  it("등록한 뒤에는 코드까지 확인한 세션(aal2)만 관리자다", async () => {
    await actAs(db, null);
    await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'verified')", [admin]);
    expect(await isAdmin({ sub: admin, aal: "aal1" })).toBe(false);
    expect(await isAdmin({ sub: admin, aal: "aal2" })).toBe(true);
    await db.query("delete from auth.mfa_factors where user_id = $1", [admin]);
  });

  it("미완료(unverified) 등록은 영향을 주지 않는다", async () => {
    await actAs(db, null);
    await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'unverified')", [admin]);
    expect(await isAdmin({ sub: admin, aal: "aal1" })).toBe(true);
    await db.query("delete from auth.mfa_factors where user_id = $1", [admin]);
  });

  it("일반 회원은 aal2여도 관리자가 아니다", async () => {
    expect(await isAdmin({ sub: member, aal: "aal2" })).toBe(false);
  });
});

describe("RLS", () => {
  it("회원은 다른 회원의 예약을 볼 수 없다", async () => {
    await actAs(db, { role: "service_role" });
    await db.query(
      "insert into public.reservations (profile_id, name, phone, pass_type, date, people, status) values ($1, '남', '01011112222', '이용 문의', current_date + 3, 1, 'pending')",
      [other],
    );
    const rows = await asRole(db, { sub: member, role: "authenticated" }, async () =>
      (await db.query("select id from public.reservations where profile_id = $1", [other])).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("비로그인 방문자는 회원 연락처를 볼 수 없다", async () => {
    const rows = await asRole(db, { role: "anon" }, async () => (await db.query("select phone from public.profiles")).rows);
    expect(rows).toHaveLength(0);
  });

  it("회원은 자기 역할을 admin으로 바꿀 수 없다", async () => {
    await asRole(db, { sub: member, role: "authenticated" }, async () => {
      await db.query("update public.profiles set role = 'admin' where id = $1", [member]).catch(() => undefined);
    });
    await actAs(db, null);
    const { rows } = await db.query<{ role: string }>("select role from public.profiles where id = $1", [member]);
    expect(rows[0].role).toBe("user");
  });

  it("출입구 비밀번호는 공개 설정에서 읽히지 않는다", async () => {
    await actAs(db, null);
    await db.query("insert into public.space_settings (key, value) values ('door_code', '1234') on conflict (key) do update set value = excluded.value");
    const rows = await asRole(db, { role: "anon" }, async () => (await db.query("select value from public.space_settings where key = 'door_code'")).rows);
    expect(rows).toHaveLength(0);
  });

  it("화면 오류는 누구나 남길 수 있지만 관리자만 읽는다 (0062)", async () => {
    await asRole(db, { role: "anon" }, async () => {
      await db.query("insert into public.client_error_logs (kind, message) values ('error', 'TypeError: test')");
    });
    const asMember = await asRole(db, { sub: member, role: "authenticated" }, async () => (await db.query("select id from public.client_error_logs")).rows);
    const asAdmin = await asRole(db, { sub: admin, role: "authenticated", aal: "aal1" }, async () => (await db.query("select id from public.client_error_logs")).rows);
    expect(asMember).toHaveLength(0);
    expect(asAdmin.length).toBeGreaterThan(0);
  });
});
