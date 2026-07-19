import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import { badge, buttonClass, card, cardFlat, tintCard } from "../lib/ui";

type AttendanceRow = {
  id: string;
  profile_id: string;
  reservation_id: string | null;
  check_in_at: string;
  check_out_at: string | null;
  profile: { full_name: string | null; phone: string | null } | null;
};

type MemberOption = { id: string; full_name: string | null; phone: string | null };

type CouponRow = {
  id: string;
  code: string;
  label: string;
  status: "issued" | "used";
  issued_at: string;
  used_at: string | null;
  profile: { full_name: string | null } | null;
};

function kstDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(value));
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function AdminAttendance() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<MemberOption[]>([]);

  async function load() {
    if (!supabase) return;
    setIsLoading(true);
    setError("");
    const [attendanceResult, couponResult] = await Promise.all([
      supabase
        .from("attendance")
        .select("id,profile_id,reservation_id,check_in_at,check_out_at,profile:profiles(full_name,phone)")
        .order("check_in_at", { ascending: false })
        .limit(500),
      supabase
        .from("coupons")
        .select("id,code,label,status,issued_at,used_at,profile:profiles(full_name)")
        .order("issued_at", { ascending: false })
        .limit(500),
    ]);
    setIsLoading(false);
    if (attendanceResult.error || couponResult.error) {
      setError(attendanceResult.error?.message ?? couponResult.error?.message ?? "데이터를 불러오지 못했습니다.");
      return;
    }
    setRows((attendanceResult.data ?? []) as unknown as AttendanceRow[]);
    setCoupons((couponResult.data ?? []) as unknown as CouponRow[]);
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

  async function searchMembers(query: string) {
    if (!supabase) return;
    const q = query.trim();
    setManualQuery(query);
    if (q.length < 2) {
      setManualResults([]);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id,full_name,phone")
      .eq("role", "user")
      .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(8);
    setManualResults((data ?? []) as MemberOption[]);
  }

  // QR을 찍기 어려운 회원(폰 미지참·워크인)을 관리자가 직접 출석 처리.
  async function addManualAttendance(member: MemberOption) {
    if (!supabase) return;
    if (!window.confirm(`${member.full_name || "이름 미입력"}님을 지금 출석 처리할까요?`)) return;
    setBusy("manual");
    const { error: insertError } = await supabase.from("attendance").insert({ profile_id: member.id });
    setBusy(null);
    if (insertError) {
      setError(insertError.message.includes("row-level security") ? "수기 출석 등록 권한이 없습니다. 마이그레이션(0021) 적용을 확인해 주세요." : insertError.message);
      return;
    }
    setManualQuery("");
    setManualResults([]);
    setError("");
    setSuccess(`${member.full_name || "회원"}님을 출석 처리했습니다.`);
    await load();
  }

  async function updateAttendance(id: string, payload: { check_in_at?: string; check_out_at?: string | null }, message: string) {
    if (!supabase) return;
    setBusy(id);
    const { error: updateError } = await supabase.from("attendance").update(payload).eq("id", id);
    setBusy(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...payload } : row)));
    setError("");
    setSuccess(message);
  }

  async function deleteAttendance(id: string) {
    if (!supabase || !window.confirm("잘못 등록된 출석 기록을 삭제할까요? 삭제 이력은 관리자 감사 기록에 남습니다.")) return;
    setBusy(id);
    const { error: deleteError } = await supabase.from("attendance").delete().eq("id", id);
    setBusy(null);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setRows((current) => current.filter((row) => row.id !== id));
    setError("");
    setSuccess("출석 기록을 삭제했습니다.");
  }

  async function changeCoupon(coupon: CouponRow, nextStatus: "issued" | "used") {
    if (!supabase) return;
    const action = nextStatus === "used" ? "사용" : "사용 취소";
    if (!window.confirm(`이 쿠폰을 ${action} 처리할까요?`)) return;
    setBusy(coupon.id);
    const usedAt = nextStatus === "used" ? new Date().toISOString() : null;
    const { error: updateError } = await supabase.from("coupons").update({ status: nextStatus, used_at: usedAt }).eq("id", coupon.id);
    setBusy(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCoupons((current) => current.map((item) => (item.id === coupon.id ? { ...item, status: nextStatus, used_at: usedAt } : item)));
    setError("");
    setSuccess(`쿠폰을 ${action} 처리했습니다.`);
  }

  const today = kstDate(new Date());
  const todays = rows.filter((row) => kstDate(row.check_in_at) === today);
  const recent = rows.filter((row) => kstDate(row.check_in_at) !== today).slice(0, 50);
  const pendingCoupons = coupons.filter((coupon) => coupon.status === "issued");
  const usedCoupons = coupons.filter((coupon) => coupon.status === "used");

  return (
    <main className="pb-12">
      <Section eyebrow="Admin" title="출석 관리" accent="ink">
        <div className="mb-5 flex flex-wrap gap-2">
          <button className={buttonClass("accent", "md")} onClick={() => void load()} type="button">새로고침</button>
          <Link className={buttonClass("secondary", "md")} to="/admin/settings">QR · 설정</Link>
          <Link className={buttonClass("secondary", "md")} to="/admin/reservations">예약관리</Link>
        </div>

        {error ? <p className={`mb-4 ${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}
        {success ? <p className={`mb-4 ${tintCard("mint")} p-4 text-sm font-bold`}>{success}</p> : null}
        {isLoading ? <p className={`${tintCard("yellow")} p-4 font-bold`}>불러오는 중입니다…</p> : null}

        <details className={`${card} mb-5 p-4`}>
          <summary className="cursor-pointer font-black">수기 출석 등록 (QR 없이 직접 처리)</summary>
          <div className="mt-3 grid gap-2">
            <input
              placeholder="회원 이름 또는 연락처로 검색 (2자 이상)"
              value={manualQuery}
              onChange={(event) => void searchMembers(event.target.value)}
              aria-label="수기 출석 회원 검색"
            />
            {manualResults.length ? (
              <div className="grid gap-1.5">
                {manualResults.map((member) => (
                  <button
                    className={`${cardFlat} flex items-center justify-between gap-3 p-3 text-left transition-colors hover:border-workroom-ink`}
                    disabled={busy === "manual"}
                    key={member.id}
                    onClick={() => void addManualAttendance(member)}
                    type="button"
                  >
                    <span className="font-bold">{member.full_name || "이름 미입력"}</span>
                    <span className="text-xs font-medium text-workroom-muted">{member.phone || ""} · 지금 출석 처리</span>
                  </button>
                ))}
              </div>
            ) : manualQuery.trim().length >= 2 ? (
              <p className="text-xs font-medium text-workroom-muted">검색 결과가 없습니다.</p>
            ) : null}
          </div>
        </details>

        <p className={`mb-3 ${tintCard("yellow")} p-4 text-sm font-bold`}>오늘 출석 {todays.length}명 · 이용 중 {todays.filter((row) => !row.check_out_at).length}명</p>
        <div className="mb-8 grid gap-2">
          {todays.length ? todays.map((row) => (
            <AttendanceCard busy={busy === row.id} key={row.id} onDelete={() => void deleteAttendance(row.id)} onSave={(payload) => void updateAttendance(row.id, payload, "출석 시간을 정정했습니다.")} onCheckout={() => void updateAttendance(row.id, { check_out_at: new Date().toISOString() }, "퇴실 처리했습니다.")} row={row} />
          )) : <p className={`${cardFlat} p-4 text-sm font-medium text-workroom-muted`}>오늘 출석한 회원이 없습니다.</p>}
        </div>

        <h2 className="mb-3 text-lg font-black">최근 출석 기록</h2>
        <div className="mb-8 grid gap-2">
          {recent.length ? recent.map((row) => (
            <AttendanceCard busy={busy === row.id} key={row.id} onDelete={() => void deleteAttendance(row.id)} onSave={(payload) => void updateAttendance(row.id, payload, "출석 시간을 정정했습니다.")} onCheckout={() => void updateAttendance(row.id, { check_out_at: new Date().toISOString() }, "퇴실 처리했습니다.")} row={row} />
          )) : <p className={`${cardFlat} p-4 text-sm font-medium text-workroom-muted`}>지난 출석 기록이 없습니다.</p>}
        </div>

        <h2 className="mb-3 text-lg font-black">사용 가능한 쿠폰 ({pendingCoupons.length})</h2>
        <div className="grid gap-2">
          {pendingCoupons.length ? pendingCoupons.map((coupon) => (
            <CouponCard busy={busy === coupon.id} coupon={coupon} key={coupon.id} onClick={() => void changeCoupon(coupon, "used")} />
          )) : <p className={`${cardFlat} p-4 text-sm font-medium text-workroom-muted`}>사용 대기 중인 쿠폰이 없습니다.</p>}
        </div>

        <details className={`${card} mt-5 p-4`}>
          <summary className="cursor-pointer font-black">사용 완료 쿠폰 ({usedCoupons.length})</summary>
          <div className="mt-3 grid gap-2">
            {usedCoupons.map((coupon) => <CouponCard busy={busy === coupon.id} coupon={coupon} key={coupon.id} onClick={() => void changeCoupon(coupon, "issued")} />)}
            {!usedCoupons.length ? <p className={`${cardFlat} p-4 text-sm text-workroom-muted`}>사용 완료된 쿠폰이 없습니다.</p> : null}
          </div>
        </details>
      </Section>
    </main>
  );
}

function AttendanceCard({ busy, onCheckout, onDelete, onSave, row }: {
  busy: boolean;
  onCheckout: () => void;
  onDelete: () => void;
  onSave: (payload: { check_in_at: string; check_out_at: string | null }) => void;
  row: AttendanceRow;
}) {
  const [checkIn, setCheckIn] = useState(toKstInput(row.check_in_at));
  const [checkOut, setCheckOut] = useState(row.check_out_at ? toKstInput(row.check_out_at) : "");
  return (
    <article className={`${card} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-black">{row.profile?.full_name || "이름 미입력"}</p>
          {row.profile?.phone ? <a className="text-xs font-bold text-workroom-muted underline" href={`tel:${row.profile.phone}`}>{row.profile.phone}</a> : null}
          <p className="mt-1 text-xs font-medium text-workroom-muted">{dateTime(row.check_in_at)} 입실{row.check_out_at ? ` · ${dateTime(row.check_out_at)} 퇴실` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={badge(row.check_out_at ? "sky" : "mint")}>{row.check_out_at ? "퇴실" : "이용 중"}</span>
          {!row.check_out_at ? <button className={buttonClass("primary", "sm")} disabled={busy} onClick={onCheckout} type="button">퇴실 처리</button> : null}
        </div>
      </div>
      <details className="mt-3 border-t border-workroom-line pt-3">
        <summary className="cursor-pointer text-xs font-bold text-workroom-muted">시간 정정 · 기록 삭제</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold">입실 시간<input type="datetime-local" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} /></label>
          <label className="grid gap-1 text-xs font-bold">퇴실 시간<input type="datetime-local" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} /></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={buttonClass("secondary", "sm")} disabled={busy || !checkIn} onClick={() => onSave({ check_in_at: fromKstInput(checkIn), check_out_at: checkOut ? fromKstInput(checkOut) : null })} type="button">시간 저장</button>
          <button className={buttonClass("secondary", "sm")} disabled={busy} onClick={onDelete} type="button">잘못된 기록 삭제</button>
        </div>
      </details>
    </article>
  );
}

function CouponCard({ busy, coupon, onClick }: { busy: boolean; coupon: CouponRow; onClick: () => void }) {
  const isUsed = coupon.status === "used";
  return (
    <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}>
      <div>
        <p className="font-bold">{coupon.profile?.full_name || "회원"} · {coupon.label}</p>
        <p className="text-xs font-bold text-workroom-muted">코드 {coupon.code}{coupon.used_at ? ` · ${dateTime(coupon.used_at)} 사용` : ""}</p>
      </div>
      <button className={buttonClass(isUsed ? "secondary" : "primary", "sm")} disabled={busy} onClick={onClick} type="button">{busy ? "처리 중…" : isUsed ? "사용 취소" : "사용 처리"}</button>
    </div>
  );
}

function toKstInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function fromKstInput(value: string) {
  return new Date(`${value}:00+09:00`).toISOString();
}
