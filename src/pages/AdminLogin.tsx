import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentProfile, signInWithGoogle } from "../lib/profiles";
import { configuredAdminEmails, hasSupabaseConfig, supabase } from "../lib/supabase";
import { buttonClass, tintCard } from "../lib/ui";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  useEffect(() => {
    async function redirectIfSignedIn() {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const profile = await getCurrentProfile();
        navigate(profile?.role === "admin" ? "/admin/dashboard" : "/account", { replace: true });
      }
    }

    void redirectIfSignedIn();
  }, [navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!supabase) {
      setError("Supabase 환경 변수가 아직 연결되지 않았습니다.");
      return;
    }

    setIsSubmitting(true);
    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setIsSubmitting(false);

    if (loginError) {
      setError(loginError.message);
      return;
    }

    const allowedEmails = configuredAdminEmails();
    const signedInEmail = data.user?.email?.toLowerCase() ?? "";
    if (allowedEmails.length && !allowedEmails.includes(signedInEmail)) {
      await supabase.auth.signOut();
      setError("관리자 이메일로 등록된 계정만 접근할 수 있습니다.");
      return;
    }

    const profile = await getCurrentProfile();
    if (profile?.role !== "admin") {
      await supabase.auth.signOut();
      setError("관리자 권한이 확인되지 않았습니다.");
      return;
    }

    navigate("/admin/dashboard");
  }

  async function handleGoogleLogin() {
    setError("");
    setIsGoogleSubmitting(true);
    try {
      await signInWithGoogle("/admin/dashboard");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "구글 로그인을 시작하지 못했습니다.");
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <main className="px-4 pb-20 pt-10 sm:pt-16">
      <section className="mx-auto max-w-md">
        <div className="border-b border-workroom-ink pb-5">
          <p className="text-sm font-semibold text-workroom-muted">WORKROOM 운영</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">관리자 로그인</h1>
        </div>
        <form className="mt-5 grid gap-4 border border-workroom-line bg-white p-5 sm:p-6" onSubmit={handleSubmit}>
          {!hasSupabaseConfig ? (
            <p className={`${tintCard("yellow")} p-4 text-sm font-bold`}>
              `.env`에 Supabase URL과 anon key를 넣으면 로그인이 활성화됩니다.
            </p>
          ) : null}
          <label className="grid gap-2 text-sm font-bold">
            이메일
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            비밀번호
            <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className={`${tintCard("danger")} p-3 text-sm font-bold`}>{error}</p> : null}
          <button className={buttonClass("primary", "lg")} disabled={isSubmitting} type="submit">
            {isSubmitting ? "확인 중…" : "로그인"}
          </button>
          <button
            className={buttonClass("secondary", "lg")}
            disabled={isGoogleSubmitting || !hasSupabaseConfig}
            onClick={() => void handleGoogleLogin()}
            type="button"
          >
            {isGoogleSubmitting ? "구글로 이동 중…" : "Google 관리자 로그인"}
          </button>
        </form>
      </section>
    </main>
  );
}
