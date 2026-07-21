import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import Section from "../components/Section";
import { authErrorMessage, passwordValidationMessage } from "../lib/auth";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { buttonClass, card, tintCard } from "../lib/ui";

export default function ResetPassword() {
  const [session, setSession] = useState<Session | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setIsChecking(false);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsChecking(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setIsChecking(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const validationMessage = passwordValidationMessage(password, passwordConfirmation);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    if (!supabase || !session) {
      setError("재설정 링크가 만료되었거나 올바르지 않습니다. 새 링크를 받아 주세요.");
      return;
    }

    setIsSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (updateError) {
      setError(authErrorMessage(updateError, "비밀번호를 변경하지 못했습니다. 새 재설정 링크를 받아 다시 시도해 주세요."));
      return;
    }

    await supabase.auth.signOut();
    setSession(null);
    setIsComplete(true);
  }

  return (
    <main className="pb-16">
      <Section eyebrow="Member" title="비밀번호 설정" accent="lilac">
        <div className={`mx-auto grid max-w-lg gap-5 ${card} p-5 sm:p-6`}>
          {!hasSupabaseConfig ? (
            <p className={`${tintCard("yellow")} p-4 text-sm font-bold`}>서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요.</p>
          ) : isComplete ? (
            <>
              <p className={`${tintCard("sky")} p-4 text-sm font-bold leading-6`}>
                비밀번호를 설정했습니다. 이제 같은 이메일과 새 비밀번호로 로그인할 수 있습니다.
              </p>
              <Link className={buttonClass("primary", "lg", "w-full")} to="/login">로그인하기</Link>
            </>
          ) : isChecking ? (
            <p className={`${tintCard("yellow")} p-4 text-sm font-bold`}>재설정 링크를 확인하고 있습니다.</p>
          ) : session ? (
            <form className="grid gap-4" onSubmit={handleSubmit}>
              <p className="text-sm font-medium leading-6 text-workroom-muted">
                새 비밀번호를 설정하면 구글 계정으로 가입한 회원도 같은 이메일로 로그인할 수 있습니다.
              </p>
              <label className="grid gap-2 text-sm font-bold">
                새 비밀번호
                <input
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="8자 이상 입력해 주세요"
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                새 비밀번호 확인
                <input
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="비밀번호를 한 번 더 입력해 주세요"
                  required
                  type="password"
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                />
              </label>
              {error ? <p className={`${tintCard("danger")} p-3 text-sm font-bold leading-6`} role="alert">{error}</p> : null}
              <button className={buttonClass("primary", "lg", "w-full")} disabled={isSubmitting} type="submit">
                {isSubmitting ? "변경 중…" : "비밀번호 설정하기"}
              </button>
            </form>
          ) : (
            <>
              <p className={`${tintCard("danger")} p-4 text-sm font-bold leading-6`}>
                재설정 링크가 만료되었거나 올바르지 않습니다. 로그인 화면에서 새 링크를 받아 주세요.
              </p>
              <Link className={buttonClass("primary", "lg", "w-full")} to="/login">비밀번호 찾기로 돌아가기</Link>
            </>
          )}
          <Link className="text-center text-sm font-bold text-workroom-muted underline underline-offset-4" to="/">홈으로 돌아가기</Link>
        </div>
      </Section>
    </main>
  );
}

