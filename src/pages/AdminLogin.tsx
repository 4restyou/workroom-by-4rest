import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Section from "../components/Section";
import { signInWithGoogle } from "../lib/profiles";
import { configuredAdminEmails, hasSupabaseConfig, supabase } from "../lib/supabase";

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
        navigate("/admin/reservations", { replace: true });
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

    navigate("/admin/reservations");
  }

  async function handleGoogleLogin() {
    setError("");
    setIsGoogleSubmitting(true);
    try {
      await signInWithGoogle("/admin/reservations");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "구글 로그인을 시작하지 못했습니다.");
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <main className="pb-12">
      <Section eyebrow="Admin" title="관리자 로그인">
        <form className="mx-auto grid max-w-md gap-4 rounded-card border-2 border-workroom-line bg-workroom-surface p-5 shadow-sketch" onSubmit={handleSubmit}>
          {!hasSupabaseConfig ? (
            <p className="rounded-card border-2 border-workroom-line bg-workroom-yellow p-4 text-sm font-black">
              `.env`에 Supabase URL과 anon key를 넣으면 로그인이 활성화됩니다.
            </p>
          ) : null}
          <label className="grid gap-2 text-sm font-black">
            이메일
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-black">
            비밀번호
            <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="rounded-card border-2 border-workroom-line bg-red-100 p-3 text-sm font-black">{error}</p> : null}
          <button
            className="rounded-full border-2 border-workroom-line bg-workroom-text px-5 py-4 font-black text-white disabled:bg-workroom-muted"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "확인 중" : "로그인"}
          </button>
          <button
            className="rounded-full border-2 border-workroom-line bg-white px-5 py-4 font-black disabled:bg-workroom-muted"
            disabled={isGoogleSubmitting || !hasSupabaseConfig}
            onClick={() => void handleGoogleLogin()}
            type="button"
          >
            {isGoogleSubmitting ? "구글로 이동 중" : "Google 관리자 로그인"}
          </button>
        </form>
      </Section>
    </main>
  );
}
