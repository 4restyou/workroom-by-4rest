import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// 운영 DB에 적용한 마이그레이션 전부를 메모리 Postgres(PGlite)에 그대로 올려
// 트리거·RLS 함수를 실제로 돌려 보는 테스트 환경.
//
// Supabase가 제공하는 것 중 마이그레이션이 기대는 부분만 흉내 낸다:
//   역할 anon / authenticated / service_role
//   auth.uid() / auth.role() / auth.jwt()  — request.jwt.claims 설정값을 읽는다(실제와 같은 방식)
//   auth.users / auth.mfa_factors           — 외래키·조회용 최소 컬럼

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

const SUPABASE_STUBS = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

-- Supabase는 public의 새 표·함수에 이 역할들의 권한을 기본으로 준다(실제 보호는 RLS).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create schema if not exists extensions;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'unverified'
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;
`;

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort();
}

export async function createDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  for (const name of migrationFiles()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
    } catch (error) {
      throw new Error(`${name}: ${(error as Error).message}`);
    }
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof createDb>>;

/** 이후 쿼리를 이 사람의 JWT로 실행한 것처럼 만든다. null이면 SQL 편집기(역할 없음). */
export async function actAs(db: Db, claims: { sub?: string; role: string; aal?: string } | null) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims ? JSON.stringify(claims) : ""]);
}

/** RLS까지 실제처럼 적용하려면 슈퍼유저가 아닌 역할로 내려가야 한다. */
export async function asRole<T>(db: Db, claims: { sub?: string; role: "anon" | "authenticated"; aal?: string }, run: () => Promise<T>) {
  await actAs(db, claims);
  await db.exec(`set role ${claims.role}`);
  try {
    return await run();
  } finally {
    await db.exec("reset role");
  }
}

export async function createUser(db: Db, opts: { role?: "admin" | "user"; name?: string } = {}) {
  const email = `${crypto.randomUUID()}@test.local`;
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify({ full_name: opts.name ?? "테스트" })],
  );
  const id = rows[0].id;
  // handle_new_user 트리거가 없거나 다르게 바뀌어도 프로필이 있도록 보장한다.
  await db.query(
    "insert into public.profiles (id, email, role) values ($1, $2, $3) on conflict (id) do update set role = excluded.role",
    [id, email, opts.role ?? "user"],
  );
  return id;
}
