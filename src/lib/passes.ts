import { supabase } from "./supabase";
import type { Pass } from "./types";

// 이용권 조회 한 곳.
//
// 이 프로젝트는 프론트엔드가 먼저 배포되고(푸시 즉시 Netlify) SQL 마이그레이션은
// 나중에 손으로 돌린다. 그래서 새 컬럼을 select에 바로 넣으면 그 사이에 화면이
// "column passes.min_people does not exist"로 통째로 깨진다.
//
// 새 컬럼부터 넣어 조회해 보고, 아직 없으면 한 단계씩 물러난다.
// 마이그레이션을 돌리는 순간 별도 배포 없이 새 값이 살아난다.

const BASE = "id,name,description,price,seat_type_id,is_active,sort_order";
const COLUMNS_WITH_DISCOUNT = `${BASE},min_people,discount_percent,discount_until`;
const COLUMNS_WITH_MIN_PEOPLE = `${BASE},min_people`;

function missingColumn(message: string | undefined, column: string) {
  return Boolean(message && message.includes(column) && message.includes("does not exist"));
}

export type LoadPassesOptions = { activeOnly?: boolean };

export type LoadPassesResult = {
  data: Pass[] | null;
  error: { message: string } | null;
  /** migration 0043이 적용돼 min_people을 읽고 쓸 수 있는지. */
  hasMinPeople: boolean;
  /** migration 0047이 적용돼 할인율을 읽고 쓸 수 있는지. */
  hasDiscount: boolean;
};

function query(columns: string, activeOnly: boolean) {
  if (!supabase) return null;
  const base = supabase.from("passes").select(columns);
  return (activeOnly ? base.eq("is_active", true) : base).order("sort_order", { ascending: true });
}

export async function loadPasses({ activeOnly = false }: LoadPassesOptions = {}): Promise<LoadPassesResult> {
  if (!supabase) {
    return { data: null, error: { message: "서비스 연결에 문제가 있습니다." }, hasMinPeople: false, hasDiscount: false };
  }

  const withDiscount = await query(COLUMNS_WITH_DISCOUNT, activeOnly)!;
  if (!withDiscount.error) {
    return { data: withDiscount.data as unknown as Pass[], error: null, hasMinPeople: true, hasDiscount: true };
  }
  if (!missingColumn(withDiscount.error.message, "discount_percent") && !missingColumn(withDiscount.error.message, "discount_until")) {
    // 할인 컬럼 때문이 아니라면 min_people 단계에서 다시 판단한다.
    if (!missingColumn(withDiscount.error.message, "min_people")) {
      return { data: null, error: { message: withDiscount.error.message }, hasMinPeople: false, hasDiscount: false };
    }
  }

  // migration 0047이 아직 적용되지 않은 상태.
  const withMinPeople = await query(COLUMNS_WITH_MIN_PEOPLE, activeOnly)!;
  if (!withMinPeople.error) {
    return { data: withMinPeople.data as unknown as Pass[], error: null, hasMinPeople: true, hasDiscount: false };
  }
  if (!missingColumn(withMinPeople.error.message, "min_people")) {
    return { data: null, error: { message: withMinPeople.error.message }, hasMinPeople: false, hasDiscount: false };
  }

  // migration 0043도 아직. 최소 인원은 1로 본다.
  const legacy = await query(BASE, activeOnly)!;
  if (legacy.error) {
    return { data: null, error: { message: legacy.error.message }, hasMinPeople: false, hasDiscount: false };
  }
  return {
    data: ((legacy.data ?? []) as unknown as Pass[]).map((pass) => ({ ...pass, min_people: 1 })),
    error: null,
    hasMinPeople: false,
    hasDiscount: false,
  };
}
