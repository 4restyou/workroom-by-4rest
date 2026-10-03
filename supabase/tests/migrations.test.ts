import { describe, expect, it } from "vitest";
import { createDb } from "./harness";

describe("마이그레이션", () => {
  it("0001부터 끝까지 빈 DB에 순서대로 적용된다", async () => {
    const db = await createDb();
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
    expect(rows[0].n).toBeGreaterThan(10);
  }, 60_000);
});
