import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import { badge, buttonClass, card, cardFlat, tintCard } from "../lib/ui";

type AttendanceRow = {
  id: string;
  check_in_at: string;
  check_out_at: string | null;
  profile: { full_name: string | null; phone: string | null } | null;
};

type CouponRow = {
  id: string;
  code: string;
  label: string;
  status: "issued" | "used";
  issued_at: string;
  profile: { full_name: string | null } | null;
};

function kstDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(value));
}

function hhmm(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function AdminAttendance() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    if (!supabase) return;
    setIsLoading(true);
    const [{ data: att }, { data: cps }] = await Promise.all([
      supabase
        .from("attendance")
        .select("id,check_in_at,check_out_at,profile:profiles(full_name,phone)")
        .order("check_in_at", { ascending: false })
        .limit(200),
      supabase
        .from("coupons")
        .select("id,code,label,status,issued_at,profile:profiles(full_name)")
        .order("issued_at", { ascending: false })
        .limit(100),
    ]);
    setRows((att ?? []) as unknown as AttendanceRow[]);
    setCoupons((cps ?? []) as unknown as CouponRow[]);
    setIsLoading(false);
  }

  useEffect(() => {
    async function checkAndLoad() {
      if (!supabase) {
        setError("Supabase 환경 변수가 아직 연결되지 않았습니다.");
        setIsLoading(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/admin", { replace: true });
        return;
      }
      const profile = await getCurrentProfile();
      if (profile?.role !== "admin") {
        navigate("/account", { replace: true });
        return;
      }
      await load();
    }
    void checkAndLoad();
  }, [navigate]);

  async function redeemCoupon(id: string) {
    if (!supabase) return;
    if (!window.confirm("이 쿠폰을 사용 처리할까요?")) return;
    setBusy(id);
    const { error: updateError } = await supabase
      .from("coupons")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCoupons((current) => current.map((c) => (c.id === id ? { ...c, status: "used" } : c)));
  }

  const today = kstDate(new Date());
  const todays = rows.filter((r) => kstDate(r.check_in_at) === today);
  const pendingCoupons = coupons.filter((c) => c.status === "issued");

  return (
    <main className="pb-12">
      <Section eyebrow="Admin" title="출근 현황" accent="ink">
        <div className="mb-5 flex flex-wrap gap-2">
          <button className={buttonClass("accent", "md")} onClick={() => void load()} type="button">
            새로고침
          </button>
          <Link className={buttonClass("secondary", "md")} to="/admin/settings">
            QR · 설정
          </Link>
          <Link className={buttonClass("secondary", "md")} to="/admin/reservations">
            예약관리
          </Link>
        </div>

        {error ? <p className={`mb-4 ${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}
        {isLoading ? <p className={`${tintCard("yellow")} p-4 font-bold`}>불러오는 중입니다…</p> : null}

        <p className={`mb-3 ${tintCard("yellow")} p-4 text-sm font-bold`}>오늘 출근 {todays.length}명</p>
        <div className="mb-8 grid gap-2">
          {todays.length ? (
            todays.map((r) => (
              <div className={`${card} flex items-center justify-between gap-3 p-4`} key={r.id}>
                <div>
                  <p className="font-bold">{r.profile?.full_name || "이름 미입력"}</p>
                  {r.profile?.phone ? <p className="text-xs font-medium text-workroom-muted">{r.profile.phone}</p> : null}
                </div>
                <div className="text-right text-sm">
                  <p className="font-bold">{hhmm(r.check_in_at)} 출근</p>
                  <p className="font-medium text-workroom-muted">{r.check_out_at ? `${hhmm(r.check_out_at)} 퇴근` : "근무 중"}</p>
                </div>
              </div>
            ))
          ) : (
            <p className={`${cardFlat} p-4 text-sm font-medium text-workroom-muted`}>오늘 출근한 회원이 없습니다.</p>
          )}
        </div>

        <h2 className="mb-3 text-lg font-black">사용 가능한 쿠폰 ({pendingCoupons.length})</h2>
        <div className="grid gap-2">
          {pendingCoupons.length ? (
            pendingCoupons.map((c) => (
              <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`} key={c.id}>
                <div>
                  <p className="font-bold">
                    {c.profile?.full_name || "회원"} · {c.label}
                  </p>
                  <p className="text-xs font-bold text-workroom-muted">코드 {c.code}</p>
                </div>
                <button className={buttonClass("primary", "sm")} disabled={busy === c.id} onClick={() => void redeemCoupon(c.id)} type="button">
                  {busy === c.id ? "처리 중…" : "사용 처리"}
                </button>
              </div>
            ))
          ) : (
            <p className={`${cardFlat} p-4 text-sm font-medium text-workroom-muted`}>사용 대기 중인 쿠폰이 없습니다.</p>
          )}
          {coupons.some((c) => c.status === "used") ? (
            <span className={`${badge("lilac")} mt-1`}>사용완료 {coupons.filter((c) => c.status === "used").length}장</span>
          ) : null}
        </div>
      </Section>
    </main>
  );
}
