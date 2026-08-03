import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AddressSearchField from "./AddressSearchField";
import { confirmDialog } from "../lib/confirm";
import { formatPhone } from "../lib/format";
import { supabase } from "../lib/supabase";
import { useFeedbackToast } from "../lib/useFeedbackToast";
import { buttonClass, card, tintCard } from "../lib/ui";
import type { Profile } from "../lib/types";

// 회원정보 탭. 폼 상태(이름·연락처·주소·동의)와 탈퇴까지 한 덩어리로 갖는다.
//
// Account.tsx가 24개의 useState를 한 컴포넌트에 이고 있어서, 예약 목록을
// 건드리다 프로필 저장이 깨지는 식의 사고가 나기 쉬웠다. 프로필은 예약과
// 공유하는 상태가 profile 하나뿐이라 가장 깔끔하게 떨어지는 경계다.
export default function AccountProfileForm({
  profile,
  fallbackName = "",
  onProfileSaved,
}: {
  profile: Profile;
  /** 프로필에 이름이 아직 없을 때 채워 넣을 값(구글 계정 이름 등). */
  fallbackName?: string;
  onProfileSaved: (profile: Profile) => void;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pendingNext = searchParams.get("next");

  const [form, setForm] = useState({
    full_name: profile.full_name || fallbackName,
    phone: profile.phone ?? "",
    address: profile.address ?? "",
  });
  const [detailAddress, setDetailAddress] = useState("");
  const [consent, setConsent] = useState(Boolean(profile.consented_at));
  const [isSaving, setIsSaving] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useFeedbackToast(success, error);

  const isMember = profile.role !== "admin";
  const needsOnboarding = isMember && (!profile.full_name || !profile.phone || !profile.consented_at);

  function updateField(name: "full_name" | "phone" | "address", value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!supabase) return;
    if (!form.full_name.trim() || !form.phone.trim()) {
      setError("이름과 연락처는 필수입니다.");
      return;
    }
    if (!consent) {
      setError("개인정보 수집·이용에 동의해 주세요.");
      return;
    }

    const isCompletingSignup = needsOnboarding;
    setIsSaving(true);
    const { data: savedProfile, error: updateError } = await supabase.rpc("update_my_profile", {
      p_full_name: form.full_name.trim(),
      p_phone: form.phone.trim(),
      p_address: [form.address.trim(), detailAddress.trim()].filter(Boolean).join(" "),
      p_consent: consent,
    });
    setIsSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (!savedProfile) {
      setError("내정보가 저장되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const saved = savedProfile as Profile;
    onProfileSaved(saved);
    setForm((current) => ({ ...current, address: saved.address ?? "" }));
    setDetailAddress("");

    if (isCompletingSignup) {
      // 프로필 때문에 중단됐던 흐름(예약 등)이 있으면 그리로 돌아간다.
      navigate(pendingNext && pendingNext.startsWith("/") ? pendingNext : "/", { replace: true });
      return;
    }
    setSuccess("내정보를 저장했습니다.");
  }

  async function withdraw() {
    if (!supabase) return;
    // 계정이 사라지는 동작이라 문구를 직접 입력해야 열린다.
    const ok = await confirmDialog({
      title: "정말 탈퇴하시겠어요?",
      description: "계정과 개인정보가 삭제되며 되돌릴 수 없습니다.\n지난 예약 기록은 개인정보를 지운 상태로만 남습니다.",
      confirmLabel: "탈퇴",
      cancelLabel: "닫기",
      tone: "danger",
      requireTyped: "탈퇴",
    });
    if (!ok) return;

    setError("");
    setIsWithdrawing(true);
    const { data, error: deleteError } = await supabase.functions.invoke("delete-account", { body: {} });
    const result = data as { ok?: boolean; message?: string } | null;
    if (deleteError || !result?.ok) {
      setIsWithdrawing(false);
      setError(result?.message ?? "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }

  return (
    <form className={`mx-auto grid max-w-2xl gap-4 ${card} p-5`} onSubmit={handleSubmit}>
      {needsOnboarding ? (
        <p className={`${tintCard("yellow")} p-4 text-sm font-bold leading-6`}>
          가입을 완료하려면 이름·연락처를 입력하고 개인정보 수집·이용에 동의한 뒤 저장해 주세요.
        </p>
      ) : null}

      <div>
        <p className="text-sm font-bold text-workroom-muted">{isMember ? "회원" : "관리자"}</p>
        <p className="mt-1 text-2xl font-bold">{profile.full_name || (isMember ? "내 정보" : "관리자 계정")}</p>
      </div>

      {!isMember ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <Link className={buttonClass("accent", "md")} to="/admin/reservations">
            예약관리
          </Link>
          <Link className={buttonClass("secondary", "md")} to="/admin/members">
            회원관리
          </Link>
          <Link className={buttonClass("secondary", "md")} to="/admin/stats">
            통계
          </Link>
        </div>
      ) : null}

      <label className="grid gap-2 text-sm font-bold">
        <span>
          이메일
          <span className="ml-1 align-middle text-xs font-bold text-red-600">필수</span>
        </span>
        <input disabled value={profile.email} />
      </label>

      <label className="grid gap-2 text-sm font-bold">
        <span>
          이름
          <span className="ml-1 align-middle text-xs font-bold text-red-600">필수</span>
        </span>
        <input required value={form.full_name} onChange={(event) => updateField("full_name", event.target.value)} />
        <span className="text-xs font-medium text-workroom-muted">
          {isMember ? "예약자 확인을 위해 알아볼 수 있는 본명으로 적어 주세요." : "관리 화면에서 표시될 이름입니다."}
        </span>
      </label>

      <label className="grid gap-2 text-sm font-bold">
        <span>
          연락처
          <span className="ml-1 align-middle text-xs font-bold text-red-600">필수</span>
        </span>
        <input
          required
          inputMode="numeric"
          placeholder="010-0000-0000"
          value={form.phone}
          onChange={(event) => updateField("phone", formatPhone(event.target.value))}
        />
      </label>

      <AddressSearchField
        address={form.address}
        detailAddress={detailAddress}
        onAddressChange={(value) => updateField("address", value)}
        onDetailAddressChange={setDetailAddress}
      />

      <label className={`${tintCard("yellow")} flex items-start gap-3 p-4 text-sm font-bold`}>
        <input
          className="mt-0.5 h-5 w-5 shrink-0"
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span className="font-medium leading-6">
          <span className="font-bold">[필수]</span> 개인정보 수집·이용에 동의합니다. 예약 운영을 위해 이름·연락처·이메일을 수집하며,{" "}
          <Link className="font-bold underline underline-offset-2" to="/privacy" target="_blank">
            개인정보처리방침
          </Link>
          을 따릅니다.
        </span>
      </label>

      {success ? <p className={`${tintCard("mint")} p-3 text-sm font-bold`}>{success}</p> : null}
      {error ? <p className={`${tintCard("danger")} p-3 text-sm font-bold`}>{error}</p> : null}

      <button className={buttonClass("primary", "lg")} disabled={isSaving} type="submit">
        {isSaving ? "저장 중…" : pendingNext ? "저장하고 예약 계속하기" : "내정보 저장"}
      </button>

      {isMember ? (
        <>
          <div className="mt-2 border-t border-workroom-line pt-4">
            <p className="text-sm font-bold">이메일 로그인 비밀번호</p>
            <p className="mt-1 text-xs font-medium leading-6 text-workroom-muted">
              구글 계정으로 가입했더라도 비밀번호를 설정하면 현재 이메일로 직접 로그인할 수 있습니다.
            </p>
            <Link className={buttonClass("secondary", "sm", "mt-3")} to="/reset-password">
              비밀번호 설정·변경
            </Link>
          </div>

          <div className="mt-2 border-t-2 border-workroom-line pt-4">
            <p className="text-sm font-bold">회원 탈퇴</p>
            <p className="mt-1 text-xs font-medium leading-6 text-workroom-muted">
              탈퇴하면 계정과 개인정보(이름·연락처·이메일)가 삭제되며 되돌릴 수 없습니다. 과거 예약 내역은 익명 처리되어 운영
              기록으로만 남습니다.
            </p>
            <button
              className={buttonClass("secondary", "sm", "mt-3")}
              disabled={isWithdrawing}
              onClick={() => void withdraw()}
              type="button"
            >
              {isWithdrawing ? "처리 중…" : "회원 탈퇴"}
            </button>
          </div>
        </>
      ) : null}
    </form>
  );
}
