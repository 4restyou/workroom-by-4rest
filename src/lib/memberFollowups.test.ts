import { describe, expect, it } from "vitest";
import { memberFollowups } from "./memberFollowups";
import type { Reservation } from "./types";

const today = "2026-10-07";
const member = (id: string, full_name = id) => ({ id, full_name });
const visit = (profile_id: string, day: string) => ({ profile_id, check_in_at: `${day}T02:00:00Z` });
const res = (fields: Partial<Reservation>) =>
  ({ id: "r1", profile_id: "a", status: "confirmed", pass_type: "4주 월권", date: "2026-10-01", deleted_at: null, ...fields }) as Reservation;

describe("memberFollowups", () => {
  it("이용이 끝나 멀어진 회원은 마지막 방문일을 키로 한 번만 알린다", () => {
    const items = memberFollowups(today, [member("a")], [visit("a", "2026-07-29")], []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "dormant-a-2026-07-29", snoozeDays: 36500 });
    expect(items[0].title).toContain("70일째");
  });

  it("다음 날이 돼도 키가 그대로라 확인한 건 다시 뜨지 않는다", () => {
    const a = memberFollowups(today, [member("a")], [visit("a", "2026-07-29")], [])[0].key;
    const b = memberFollowups("2026-10-20", [member("a")], [visit("a", "2026-07-29")], [])[0].key;
    expect(a).toBe(b);
  });

  it("예약이 잡혀 있으면 휴면으로 보지 않는다", () => {
    const items = memberFollowups(today, [member("a")], [visit("a", "2026-07-29")], [res({ pass_type: "3시간권", date: "2026-10-10" })]);
    expect(items).toEqual([]);
  });

  it("30일이 안 됐거나 한 번도 안 온 회원은 알리지 않는다", () => {
    expect(memberFollowups(today, [member("a"), member("b")], [visit("a", "2026-09-20")], [])).toEqual([]);
  });

  it("기간권이 유효한데 7일 넘게 안 오면 알린다(일주일마다 다시)", () => {
    const pass = res({ access_start_date: "2026-09-20", access_end_date: "2026-10-20" });
    const items = memberFollowups(today, [member("a")], [visit("a", "2026-09-25")], [pass]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "idle-pass-r1", snoozeDays: 7 });
    expect(items[0].title).toContain("12일째");
  });

  it("기간권을 산 뒤 한 번도 안 왔으면 시작일부터 센다", () => {
    const pass = res({ access_start_date: "2026-09-28", access_end_date: "2026-10-25" });
    const items = memberFollowups(today, [member("a")], [visit("a", "2026-06-01")], [pass]);
    expect(items[0].title).toContain("9일째");
    expect(items[0].detail).toContain("한 번도");
  });

  it("기간권으로 잘 오고 있으면 조용하다", () => {
    const pass = res({ access_start_date: "2026-09-20", access_end_date: "2026-10-20" });
    expect(memberFollowups(today, [member("a")], [visit("a", "2026-10-05")], [pass])).toEqual([]);
  });
});
