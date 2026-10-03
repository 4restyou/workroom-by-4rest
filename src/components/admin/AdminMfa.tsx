import { FormEvent, useEffect, useState } from "react";
import {
  cleanOtp,
  finishTotpEnrollment,
  readAdminMfaState,
  startTotpEnrollment,
  verifyAdminOtp,
  type AdminMfaState,
  type TotpEnrollment,
} from "../../lib/adminMfa";
import { supabase } from "../../lib/supabase";
import { buttonClass, card, tintCard } from "../../lib/ui";

function OtpInput({ value, onChange, autoFocus }: { value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  return (
    <input
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      className="text-center font-display text-2xl font-bold tracking-[0.4em]"
      inputMode="numeric"
      maxLength={7}
      onChange={(event) => onChange(cleanOtp(event.target.value))}
      pattern="[0-9]*"
      placeholder="000000"
      value={value}
    />
  );
}

/** 인증 앱을 등록한 관리자가 이번 세션에서 처음 관리자 화면에 들어올 때. */
export function AdminMfaChallenge({ onVerified }: { onVerified: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError("");
    const failure = await verifyAdminOtp(code);
    setBusy(false);
    if (failure) {
      setError(failure);
      setCode("");
      return;
    }
    onVerified();
  }

  return (
    <main className="px-4 pb-20 pt-10 sm:pt-16">
      <section className="mx-auto max-w-md">
        <div className="border-b border-workroom-ink pb-5">
          <p className="text-sm font-semibold text-workroom-muted">WORKROOM 운영</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">인증 코드 확인</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">인증 앱(구글 OTP 등)에 보이는 6자리 코드를 넣어 주세요.</p>
        </div>
        <form className="mt-5 grid gap-4 border border-workroom-line bg-white p-5 sm:p-6" onSubmit={submit}>
          <OtpInput autoFocus onChange={setCode} value={code} />
          {error ? <p className={`${tintCard("danger")} p-3 text-sm font-bold`}>{error}</p> : null}
          <button className={buttonClass("primary", "lg")} disabled={busy || code.length !== 6} type="submit">
            {busy ? "확인 중…" : "확인"}
          </button>
          <button className={buttonClass("secondary", "md")} onClick={() => void supabase?.auth.signOut()} type="button">
            로그아웃
          </button>
        </form>
      </section>
    </main>
  );
}

/** 설정 > 보안. 인증 앱 등록 상태를 보여 주고, 없으면 등록을 안내한다. */
export function AdminMfaSetup() {
  const [state, setState] = useState<AdminMfaState | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void readAdminMfaState().then(setState);
  }, []);

  async function begin() {
    setBusy(true);
    setError("");
    const result = await startTotpEnrollment();
    setBusy(false);
    if (typeof result === "string") setError(result);
    else setEnrollment(result);
  }

  async function finish(event: FormEvent) {
    event.preventDefault();
    if (!enrollment || code.length !== 6) return;
    setBusy(true);
    setError("");
    const failure = await finishTotpEnrollment(enrollment.factorId, code);
    setBusy(false);
    if (failure) {
      setError(failure);
      setCode("");
      return;
    }
    setEnrollment(null);
    setCode("");
    setState(await readAdminMfaState());
  }

  if (state === null) return <div className={`${card} p-5 text-sm font-medium text-workroom-muted`}>확인 중…</div>;

  if (state !== "none") {
    return (
      <div className={`${tintCard("mint")} grid gap-2 p-5`}>
        <p className="text-base font-bold">2단계 인증이 켜져 있어요</p>
        <p className="text-sm font-medium leading-6">
          새로 로그인할 때마다 인증 앱 코드를 확인합니다. 휴대폰을 바꾸거나 잃어버리면 Supabase SQL 편집기에서
          <code className="mx-1 rounded bg-white/70 px-1">auth.mfa_factors</code>의 관리자 행을 지운 뒤 다시 등록하세요.
        </p>
      </div>
    );
  }

  return (
    <div className={`${card} grid gap-4 p-5`}>
      <div>
        <p className="text-base font-bold">2단계 인증</p>
        <p className="mt-1 text-sm font-medium leading-6 text-workroom-muted">
          비밀번호가 새어 나가도 휴대폰의 인증 앱 코드 없이는 관리자 화면·회원 정보·환불·단체 문자에 접근할 수 없게 합니다.
        </p>
      </div>
      {!enrollment ? (
        <button className={buttonClass("primary", "md")} disabled={busy} onClick={() => void begin()} type="button">
          {busy ? "준비 중…" : "인증 앱 등록하기"}
        </button>
      ) : (
        <form className="grid gap-4" onSubmit={finish}>
          <ol className="grid gap-1 text-sm font-medium leading-6">
            <li>1. 휴대폰에 Google Authenticator(또는 다른 OTP 앱)를 설치합니다.</li>
            <li>2. 앱에서 + → QR 코드 스캔으로 아래 코드를 찍습니다.</li>
            <li>3. 앱에 생긴 6자리 코드를 넣고 확인을 누릅니다.</li>
          </ol>
          <img alt="인증 앱 등록 QR 코드" className="mx-auto h-48 w-48 border border-workroom-line bg-white p-2" src={enrollment.qrCode} />
          <p className="break-all text-center text-xs font-medium text-workroom-muted">
            QR을 찍을 수 없으면 직접 입력: <span className="font-mono font-bold text-workroom-ink">{enrollment.secret}</span>
          </p>
          <OtpInput onChange={setCode} value={code} />
          <button className={buttonClass("primary", "md")} disabled={busy || code.length !== 6} type="submit">
            {busy ? "확인 중…" : "확인하고 켜기"}
          </button>
        </form>
      )}
      {error ? <p className={`${tintCard("danger")} p-3 text-sm font-bold`}>{error}</p> : null}
    </div>
  );
}
