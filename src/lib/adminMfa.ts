import { supabase } from "./supabase";

// 관리자 2단계 인증(TOTP) 상태.
//   none     인증 앱을 아직 등록하지 않음 — 들어올 수는 있지만 등록을 권한다
//   verified 이번 세션에서 코드까지 확인함(aal2)
//   needed   등록은 했는데 이번 세션에서는 아직 코드를 넣지 않음
export type AdminMfaState = "none" | "verified" | "needed";

export function mfaStateFrom(current: string | null | undefined, next: string | null | undefined): AdminMfaState {
  if (current === "aal2") return "verified";
  if (next === "aal2") return "needed";
  return "none";
}

export async function readAdminMfaState(): Promise<AdminMfaState> {
  if (!supabase) return "none";
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return "none";
  return mfaStateFrom(data.currentLevel, data.nextLevel);
}

/** 6자리 숫자만 남긴다. 붙여넣기한 "123 456" 같은 값도 받는다. */
export function cleanOtp(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

async function verifiedTotpFactorId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp.find((factor) => factor.status === "verified")?.id ?? null;
}

/** 로그인 후 코드 확인. 성공하면 세션이 aal2로 바뀐다. */
export async function verifyAdminOtp(code: string): Promise<string | null> {
  if (!supabase) return "서버에 연결할 수 없습니다.";
  const factorId = await verifiedTotpFactorId();
  if (!factorId) return "등록된 인증 앱이 없습니다.";
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: cleanOtp(code) });
  return error ? "코드가 맞지 않아요. 인증 앱의 최신 코드를 넣어 주세요." : null;
}

export type TotpEnrollment = { factorId: string; qrCode: string; secret: string };

/** 등록 시작: QR과 수동 입력용 키를 돌려준다. 확인 전 남은 미완료 등록은 지운다. */
export async function startTotpEnrollment(): Promise<TotpEnrollment | string> {
  if (!supabase) return "서버에 연결할 수 없습니다.";
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const factor of list?.all ?? []) {
    if (factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `WORKROOM 관리자 ${Date.now()}` });
  if (error || !data) return error?.message ?? "등록을 시작하지 못했습니다.";
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function finishTotpEnrollment(factorId: string, code: string): Promise<string | null> {
  if (!supabase) return "서버에 연결할 수 없습니다.";
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: cleanOtp(code) });
  return error ? "코드가 맞지 않아요. 인증 앱에 새로 생긴 항목의 코드를 넣어 주세요." : null;
}
