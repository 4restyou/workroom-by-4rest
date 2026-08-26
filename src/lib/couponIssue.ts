// 관리자 쿠폰 발급 — 세 화면(입퇴실·회원·고객 카드)이 같은 규칙을 쓴다.
//
// 할인율은 서버(0049)가 다시 검증한다. 여기서는 화면에서 들어온 값을 다듬고,
// 마이그레이션이 아직 안 돌았을 때 무슨 일인지 알 수 있는 문구를 만든다.

import { couponScopeLabels, type CouponScope } from "./coupon";
import { supabase } from "./supabase";

export { couponScopeOf, couponScopeOptions, type CouponScope } from "./coupon";

/** 화면에서 들어온 할인율을 0~90 사이 정수로 다듬는다. */
export function normalizeCouponPercent(value: unknown): number {
  const percent = Math.round(Number(value));
  if (!Number.isFinite(percent)) return 0;
  return Math.min(90, Math.max(0, percent));
}

/** 발급 전 확인 문구. 얼마짜리를 어디에 쓸 수 있는지 그대로 읽힌다. */
export function describeCoupon(percent: number, scope: CouponScope): string {
  if (percent <= 0) return "결제 할인이 없는 현물 쿠폰";
  return `${couponScopeLabels[scope]} ${percent}% 할인`;
}

export type IssueCouponResult = { ok: boolean; message: string; label?: string; code?: string };

export async function issueCoupon(input: {
  profileId: string;
  label?: string;
  percent: number;
  scope: CouponScope;
}): Promise<IssueCouponResult> {
  if (!supabase) return { ok: false, message: "서비스 연결에 문제가 있습니다." };

  const { data, error } = await supabase.rpc("admin_issue_coupon", {
    p_profile_id: input.profileId,
    p_label: input.label?.trim() || null,
    p_discount_percent: normalizeCouponPercent(input.percent),
    p_applies_to: input.scope,
  });

  const result = data as { ok?: boolean; message?: string; label?: string; code?: string } | null;
  if (error) {
    // 프론트엔드는 즉시 배포되고 SQL은 나중에 손으로 돌린다. 그 사이에 나오는
    // 오류를 '발급 실패'로만 보여주면 원인을 알 수 없다.
    const missing = error.message?.includes("function") || error.message?.includes("schema cache");
    return {
      ok: false,
      message: missing
        ? "할인율을 지정한 발급은 마이그레이션 0049를 적용해야 동작합니다."
        : error.message || "쿠폰 발급에 실패했습니다.",
    };
  }
  if (!result?.ok) return { ok: false, message: result?.message ?? "쿠폰 발급에 실패했습니다." };
  return { ok: true, message: result.message ?? "쿠폰을 발급했어요.", label: result.label, code: result.code };
}
