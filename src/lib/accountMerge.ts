import { supabase } from "./supabase";

// 같은 연락처로 가입된 계정 합치기(migration 0065).
//
// 순서: 지금 계정에서 "합치기" → 서버가 일회용 코드를 준다 → 로그아웃하고 합칠
// 계정으로 로그인 → 앱이 코드를 확인해 그 계정의 기록을 지금 계정으로 옮긴다.
// 두 계정 모두에 로그인해 본 사람만 합칠 수 있게 하려고 이렇게 두 번 로그인한다.

export type DuplicateAccount = {
  id: string;
  email_masked: string | null;
  provider: string;
  reservations: number;
  last_sign_in_at: string | null;
};

export type PendingMerge = { code: string; target: string; createdAt: number };

const KEY = "workroom:account-merge";
const PENDING_TTL_MS = 30 * 60 * 1000;

export function providerLabel(provider: string): string {
  if (provider === "google") return "구글";
  if (provider === "kakao") return "카카오";
  if (provider === "apple") return "애플";
  return "이메일";
}

export function describeAccount(account: Pick<DuplicateAccount, "email_masked" | "provider">): string {
  return `${providerLabel(account.provider)} 로그인 · ${account.email_masked ?? "이메일 미상"}`;
}

export function readPendingMerge(now = Date.now()): PendingMerge | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingMerge;
    if (!value?.code || now - value.createdAt > PENDING_TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function savePendingMerge(value: PendingMerge) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // 저장이 막힌 브라우저(사생활 보호 모드 등)에서는 합치기를 이어 갈 수 없다.
  }
}

export function clearPendingMerge() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}

export async function loadDuplicateAccounts(): Promise<DuplicateAccount[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("my_duplicate_accounts");
  if (error) return [];
  return (data ?? []) as DuplicateAccount[];
}

export async function startAccountMerge(otherId: string): Promise<{ ok: boolean; code?: string; message?: string }> {
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다." };
  const { data, error } = await supabase.rpc("start_account_merge", { p_other: otherId });
  if (error) return { ok: false, message: error.message };
  return data as { ok: boolean; code?: string; message?: string };
}

export type ConfirmResult = { ok: boolean; code?: string; message?: string; keep_email?: string };

export async function confirmAccountMerge(code: string): Promise<ConfirmResult> {
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다." };
  const { data, error } = await supabase.rpc("confirm_account_merge", { p_code: code });
  if (error) return { ok: false, message: error.message };
  return data as ConfirmResult;
}

export async function adminMergeProfiles(fromId: string, toId: string): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다." };
  const { data, error } = await supabase.rpc("admin_merge_profiles", { p_from: fromId, p_to: toId });
  if (error) {
    const missing = error.message?.includes("function") || error.message?.includes("schema cache");
    return { ok: false, message: missing ? "계정 합치기는 마이그레이션 0065를 적용해야 동작합니다." : error.message };
  }
  return data as { ok: boolean; message?: string };
}

/** 연락처 숫자만. 관리자 화면에서 같은 연락처 계정을 묶을 때 쓴다(DB normalized_phone과 같은 규칙). */
export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

export type PhoneGroup<T extends { id: string; phone: string | null }> = { phone: string; members: T[] };

/** 같은 연락처를 쓰는 계정끼리 묶는다(2개 이상인 것만). */
export function duplicatePhoneGroups<T extends { id: string; phone: string | null }>(members: T[]): PhoneGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const member of members) {
    const phone = normalizePhone(member.phone);
    if (phone.length < 9) continue;
    groups.set(phone, [...(groups.get(phone) ?? []), member]);
  }
  return [...groups.entries()].filter(([, list]) => list.length > 1).map(([phone, list]) => ({ phone, members: list }));
}
