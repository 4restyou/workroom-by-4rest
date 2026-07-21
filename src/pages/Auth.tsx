import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import { authErrorMessage, passwordValidationMessage } from "../lib/auth";
import { getCurrentProfile, signInWithGoogle } from "../lib/profiles";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { buttonClass, card, tintCard } from "../lib/ui";

type AuthMode = "login" | "signup" | "forgot";

const modeTitle: Record<AuthMode, string> = {
  login: "이메일로 로그인",
  signup: "이메일로 회원가입",
  forgot: "비밀번호 찾기",
};

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  useEffect(() => {
    async function redirectIfSignedIn() {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const profile = await getCurrentProfile();
      navigate(profile?.role === "admin" ? "/admin/dashboard" : "/account", { replace: true });
    }

    void redirectIfSignedIn();
  }, [navigate]);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    setPassword("");
    setPasswordConfirmation("");
  }

  async function handleGoogleLogin() {
    setError("");
    setMessage("");
    setIsGoogleSubmitting(true);
    try {
      await signInWithGoogle("/account");
    } catch (loginError) {
      setError(authErrorMessage(loginError, "구글 로그인을 시작하지 못했습니다."));
      setIsGoogleSubmitting(false);
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!supabase) {
      setError("서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("이메일을 입력해 주세요.");
      return;
    }

    if (mode === "forgot") {
      setIsSubmitting(true);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setIsSubmitting(false);

      if (resetError) {
        setError(authErrorMessage(resetError, "비밀번호 재설정 메일을 보내지 못했습니다."));
        return;
      }

      setMessage("가입된 이메일이라면 비밀번호 재설정 메일이 발송됩니다. 받은편지함과 스팸함을 확인해 주세요.");
      return;
    }

    if (mode === "signup") {
      if (!fullName.trim()) {
        setError("이름을 입력해 주세요.");
        return;
      }
      const validationMessage = passwordValidationMessage(password, passwordConfirmation);
      if (validationMessage) {
        setError(validationMessage);
        return;
      }

      setIsSubmitting(true);
      const { data, error: signupError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/account?tab=profile`,
        },
      });
      setIsSubmitting(false);

      if (signupError) {
        setError(authErrorMessage(signupError, "회원가입을 완료하지 못했습니다."));
        return;
      }

      if (data.session) {
        navigate("/account?tab=profile", { replace: true });
        return;
      }

      setMessage("인증 메일을 보냈습니다. 메일의 ‘이메일 인증’ 버튼을 누르면 가입이 완료됩니다.");
      return;
    }

    setIsSubmitting(true);
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    setIsSubmitting(false);

    if (loginError) {
      setError(authErrorMessage(loginError, "로그인하지 못했습니다. 입력한 정보를 확인해 주세요."));
      return;
    }

    navigate("/account", { replace: true });
  }

  return (
    <main className="pb-16">
      <Section eyebrow="Member" title="로그인 · 회원가입" accent="lilac">
        <div className={`mx-auto grid max-w-lg gap-5 ${card} p-5 sm:p-6`}>
          {!hasSupabaseConfig ? (
            <p className={`${tintCard("yellow")} p-4 text-sm font-bold`}>
              `.env`에 Supabase URL과 anon key를 넣으면 로그인이 활성화됩니다.
            </p>
          ) : null}

          <button
            className={buttonClass("secondary", "lg", "w-full")}
            disabled={isGoogleSubmitting || isSubmitting || !hasSupabaseConfig}
            onClick={() => void handleGoogleLogin()}
            type="button"
          >
            {isGoogleSubmitting ? "구글로 이동 중…" : "Google로 계속하기"}
          </button>

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-workroom-line" />
            <span className="text-xs font-bold text-workroom-muted">또는</span>
            <span className="h-px flex-1 bg-workroom-line" />
          </div>

          {mode !== "forgot" ? (
            <div className="grid grid-cols-2 rounded-[6px] border border-workroom-line bg-workroom-background p-1" role="tablist" aria-label="이메일 로그인 방식">
              <button
                aria-selected={mode === "login"}
                className={`rounded-[4px] px-3 py-2.5 text-sm font-bold transition-colors ${mode === "login" ? "bg-workroom-ink text-white" : "text-workroom-muted"}`}
                onClick={() => changeMode("login")}
                role="tab"
                type="button"
              >
                로그인
              </button>
              <button
                aria-selected={mode === "signup"}
                className={`rounded-[4px] px-3 py-2.5 text-sm font-bold transition-colors ${mode === "signup" ? "bg-workroom-ink text-white" : "text-workroom-muted"}`}
                onClick={() => changeMode("signup")}
                role="tab"
                type="button"
              >
                회원가입
              </button>
            </div>
          ) : (
            <button className="w-fit text-sm font-bold underline underline-offset-4" onClick={() => changeMode("login")} type="button">
              ← 로그인으로 돌아가기
            </button>
          )}

          <form className="grid gap-4" onSubmit={handleEmailSubmit}>
            <div>
              <h3 className="text-lg font-bold">{modeTitle[mode]}</h3>
              <p className="mt-1 text-sm font-medium leading-6 text-workroom-muted">
                {mode === "signup"
                  ? "가입 후 이메일 인증을 완료하고 회원정보를 입력해 주세요."
                  : mode === "forgot"
                    ? "가입한 이메일로 비밀번호 재설정 링크를 보내드립니다."
                    : "가입한 이메일과 비밀번호를 입력해 주세요."}
              </p>
            </div>

            {mode === "signup" ? (
              <label className="grid gap-2 text-sm font-bold">
                이름
                <input
                  autoComplete="name"
                  maxLength={40}
                  placeholder="이름을 입력해 주세요"
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </label>
            ) : null}

            <label className="grid gap-2 text-sm font-bold">
              이메일
              <input
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                placeholder="name@example.com"
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            {mode !== "forgot" ? (
              <label className="grid gap-2 text-sm font-bold">
                비밀번호
                <input
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={mode === "signup" ? 8 : undefined}
                  placeholder={mode === "signup" ? "8자 이상 입력해 주세요" : "비밀번호를 입력해 주세요"}
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            ) : null}

            {mode === "signup" ? (
              <label className="grid gap-2 text-sm font-bold">
                비밀번호 확인
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
            ) : null}

            {error ? <p className={`${tintCard("danger")} p-3 text-sm font-bold leading-6`} role="alert">{error}</p> : null}
            {message ? <p className={`${tintCard("sky")} p-3 text-sm font-bold leading-6`} aria-live="polite">{message}</p> : null}

            <button className={buttonClass("primary", "lg", "w-full")} disabled={isSubmitting || isGoogleSubmitting || !hasSupabaseConfig} type="submit">
              {isSubmitting ? "처리 중…" : mode === "login" ? "이메일로 로그인" : mode === "signup" ? "회원가입" : "재설정 메일 보내기"}
            </button>

            {mode === "login" ? (
              <button className="text-sm font-bold text-workroom-muted underline underline-offset-4" onClick={() => changeMode("forgot")} type="button">
                비밀번호를 잊으셨나요?
              </button>
            ) : null}
          </form>

          <p className="text-center text-xs font-medium leading-5 text-workroom-muted">
            회원가입 시 <Link className="font-bold underline underline-offset-2" to="/terms">이용약관</Link> 및{" "}
            <Link className="font-bold underline underline-offset-2" to="/privacy">개인정보처리방침</Link>에 동의한 것으로 봅니다.
          </p>
          <Link className="text-center text-sm font-bold text-workroom-muted underline underline-offset-4 transition-colors hover:text-workroom-ink" to="/">
            홈으로 돌아가기
          </Link>
        </div>
      </Section>
    </main>
  );
}
