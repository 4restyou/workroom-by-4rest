import { supabase } from "./supabase";
import type { Pass } from "./types";

// 이용권 조회 한 곳.
//
// 이 프로젝트는 프론트엔드가 먼저 배포되고(푸시 즉시 Netlify) SQL 마이그레이션은
// 나중에 손으로 돌린다. 그래서 새 컬럼을 select에 바로 넣으면 그 사이에 화면이
// "column passes.min_people does not exist"로 통째로 깨진다.
//
// 새 컬럼을 포함해 한 번 조회해 보고, 컬럼이 아직 없으면 예전 목록으로 다시 조회한다.
// 마이그레이션을 돌리는 순간 별도 배포 없이 새 값이 살아난다.

const COLUMNS_WITH_MIN_PEOPLE = "id,name,description,price,min_people,seat_type_id,is_active,sort_order";
const COLUMNS_LEGACY = "id,name,description,price,seat_type_id,is_active,sort_order";

function isMissingColumn(message: string | undefined) {
  return Boolean(message && message.includes("min_people") && message.includes("does not exist"));
}

export type LoadPassesOptions = { activeOnly?: boolean };

export async function loadPasses({ activeOnly = false }: LoadPassesOptions = {}): Promise<{
  data: Pass[] | null;
  error: { message: string } | null;
  /** migration 0043이 적용돼 min_people을 읽고 쓸 수 있는지. */
  hasMinPeople: boolean;
}> {
  if (!supabase) return { data: null, error: { message: "서비스 연결에 문제가 있습니다." }, hasMinPeople: false };

  const withMinPeople = activeOnly
    ? await supabase.from("passes").select(COLUMNS_WITH_MIN_PEOPLE).eq("is_active", true).order("sort_order", { ascending: true })
    : await supabase.from("passes").select(COLUMNS_WITH_MIN_PEOPLE).order("sort_order", { ascending: true });

  if (!withMinPeople.error) return { data: withMinPeople.data as Pass[], error: null, hasMinPeople: true };
  if (!isMissingColumn(withMinPeople.error.message)) {
    return { data: null, error: { message: withMinPeople.error.message }, hasMinPeople: false };
  }

  // migration 0043이 아직 적용되지 않은 상태. 최소 인원은 1로 본다.
  const legacy = activeOnly
    ? await supabase.from("passes").select(COLUMNS_LEGACY).eq("is_active", true).order("sort_order", { ascending: true })
    : await supabase.from("passes").select(COLUMNS_LEGACY).order("sort_order", { ascending: true });

  if (legacy.error) return { data: null, error: { message: legacy.error.message }, hasMinPeople: false };
  return { data: (legacy.data ?? []).map((pass) => ({ ...pass, min_people: 1 })) as Pass[], error: null, hasMinPeople: false };
}
