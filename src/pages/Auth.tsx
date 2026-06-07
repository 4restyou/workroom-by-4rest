import { useState } from "react";
import { Link } from "react-router-dom";
import Section from "../components/Section";
import { hasSupabaseConfig } from "../lib/supabase";
import { signInWithGoogle } from "../lib/profiles";
import { buttonClass, card, tintCard } from "../lib/ui";

export default function Auth() {
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleGoogleLogin() {
    setError("");
    setIsSubmitting(true);
    try {
      await signInWithGoogle("/account");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "구글 로그인을 시작하지 못했습니다.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="pb-16">
      <Section eyebrow="Member" title="구글 계정으로 시작하기" accent="lilac">
        <div className={`mx-auto grid max-w-lg gap-4 ${card} p-6`}>
          {!hasSupabaseConfig ? (
            <p className={`${tintCard("yellow")} p-4 text-sm font-bold`}>
              `.env`에 Supabase URL과 anon key를 넣으면 구글 로그인이 활성화됩니다.
            </p>
          ) : null}
          <p className="text-base font-medium leading-7 text-workroom-muted">
            이메일과 이름은 구글 계정에서 받아오고, 연락처는 로그인 후 내정보에서 한 번만 입력합니다. 주소와 추가 요청 정보는
            선택 입력입니다.
          </p>
          <button
            className={buttonClass("primary", "lg")}
            disabled={isSubmitting || !hasSupabaseConfig}
            onClick={() => void handleGoogleLogin()}
            type="button"
          >
            {isSubmitting ? "구글로 이동 중…" : "Google로 회원가입 / 로그인"}
          </button>
          {error ? <p className={`${tintCard("danger")} p-3 text-sm font-bold`}>{error}</p> : null}
          <Link className="text-center text-sm font-bold text-workroom-muted underline underline-offset-4 transition-colors hover:text-workroom-ink" to="/">
            홈으로 돌아가기
          </Link>
        </div>
      </Section>
    </main>
  );
}
