import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminPage, { AdminEmpty, AdminFeedback, AdminTabs } from "../components/AdminPage";
import { formatTimeRange, todayValue } from "../lib/format";
import { getCurrentProfile } from "../lib/profiles";
import { isLongTermReservation, reservationCoversDate } from "../lib/reservations";
import { supabase } from "../lib/supabase";
import { badge, buttonClass, type TintColor } from "../lib/ui";
import type { Reservation } from "../lib/types";

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
type View = "today" | "history" | "coupons";

function kstDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(value));
}
function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function currentMinute() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}
function startMinute(value?: string | null) {
  if (!value) return null;
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

export default function AdminAttendance() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("today");
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<MemberOption[]>([]);

  async function load(silent = false) {
    if (!supabase) return;
    if (!silent) setIsLoading(true);
    const today = todayValue();
    const [attendanceResult, reservationResult, couponResult] = await Promise.all([
      supabase.from("attendance").select("id,profile_id,reservation_id,check_in_at,check_out_at,profile:profiles(full_name,phone)").order("check_in_at", { ascending: false }).limit(500),
      supabase.from("reservations").select("*").is("deleted_at", null).or(`date.eq.${today},access_end_date.gte.${today}`).order("start_time", { ascending: true }).limit(300),
      supabase.from("coupons").select("id,code,label,status,issued_at,used_at,profile:profiles(full_name)").order("issued_at", { ascending: false }).limit(500),
    ]);
    setIsLoading(false);
    if (attendanceResult.error || reservationResult.error || couponResult.error) {
      setError(attendanceResult.error?.message ?? reservationResult.error?.message ?? couponResult.error?.message ?? "데이터를 불러오지 못했습니다.");
      return;
    }
    setRows((attendanceResult.data ?? []) as unknown as AttendanceRow[]);
    setReservations((reservationResult.data ?? []) as Reservation[]);
    setCoupons((couponResult.data ?? []) as unknown as CouponRow[]);
    setError("");
  }

  useEffect(() => {
    let active = true;
    async function checkAndLoad() {
      if (!supabase) { setError("Supabase 환경 변수가 연결되지 않았습니다."); setIsLoading(false); return; }
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) { navigate("/admin", { replace: true }); return; }
      const profile = await getCurrentProfile();
      if (!active) return;
      if (profile?.role !== "admin") { navigate("/account", { replace: true }); return; }
      await load();
    }
    void checkAndLoad();
    const timer = window.setInterval(() => void load(true), 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [navigate]);

  async function searchMembers(query: string) {
    if (!supabase) return;
    const q = query.trim();
    setManualQuery(query);
    if (q.length < 2) { setManualResults([]); return; }
    const { data } = await supabase.from("profiles").select("id,full_name,phone").eq("role", "user").or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8);
    setManualResults((data ?? []) as MemberOption[]);
  }

  async function addAttendance(profileId: string, reservationId: string | null, name: string) {
    if (!supabase) return;
    if (!window.confirm(`${name}님을 지금 입실 처리할까요?`)) return;
    setBusy(reservationId ?? "manual");
    const { error: insertError } = await supabase.from("attendance").insert({ profile_id: profileId, reservation_id: reservationId });
    setBusy(null);
    if (insertError) { setError(insertError.message); return; }
    setManualQuery(""); setManualResults([]); setSuccess(`${name}님을 입실 처리했습니다.`); await load(true);
  }

  async function updateAttendance(id: string, payload: { check_in_at?: string; check_out_at?: string | null }, message: string) {
    if (!supabase) return;
    setBusy(id);
    const { error: updateError } = await supabase.from("attendance").update(payload).eq("id", id);
    setBusy(null);
    if (updateError) { setError(updateError.message); return; }
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...payload } : row));
    setSuccess(message); setError("");
  }

  async function deleteAttendance(id: string) {
    if (!supabase || !window.confirm("잘못 등록된 출석 기록을 삭제할까요?")) return;
    setBusy(id);
    const { error: deleteError } = await supabase.from("attendance").delete().eq("id", id);
    setBusy(null);
    if (deleteError) { setError(deleteError.message); return; }
    setRows((current) => current.filter((row) => row.id !== id)); setSuccess("출석 기록을 삭제했습니다.");
  }

  async function changeCoupon(coupon: CouponRow, nextStatus: "issued" | "used") {
    if (!supabase) return;
    const action = nextStatus === "used" ? "사용" : "사용 취소";
    if (!window.confirm(`이 쿠폰을 ${action} 처리할까요?`)) return;
    setBusy(coupon.id);
    const usedAt = nextStatus === "used" ? new Date().toISOString() : null;
    const { error: updateError } = await supabase.from("coupons").update({ status: nextStatus, used_at: usedAt }).eq("id", coupon.id);
    setBusy(null);
    if (updateError) { setError(updateError.message); return; }
    setCoupons((current) => current.map((item) => item.id === coupon.id ? { ...item, status: nextStatus, used_at: usedAt } : item));
    setSuccess(`쿠폰을 ${action} 처리했습니다.`);
  }

  const today = todayValue();
  const todays = rows.filter((row) => kstDate(row.check_in_at) === today);
  const recent = rows.filter((row) => kstDate(row.check_in_at) !== today).slice(0, 80);
  const todayReservations = useMemo(() => reservations.filter((item) => reservationCoversDate(item, today) && (item.status === "confirmed" || item.status === "pending")), [reservations, today]);
  const todayAttendanceByReservation = new Map(todays.filter((item) => item.reservation_id).map((item) => [item.reservation_id as string, item]));
  const activeCount = todays.filter((row) => !row.check_out_at).length;
  const pendingCoupons = coupons.filter((coupon) => coupon.status === "issued");
  const usedCoupons = coupons.filter((coupon) => coupon.status === "used");

  return (
    <AdminPage
      actions={<><button className={buttonClass("secondary", "md")} onClick={() => void load()} type="button">새로고침</button><Link className={buttonClass("secondary", "md")} to="/admin/settings">QR 설정</Link></>}
      description="오늘 방문 예정자와 실제 입퇴실 기록을 한 화면에서 확인합니다."
      title="입퇴실"
    >
      <div className="admin-compact">
        <AdminFeedback error={error} success={success} />
        <section className="mb-5 grid border-y border-workroom-line bg-white sm:grid-cols-3">
          <Summary label="오늘 예정" value={`${todayReservations.length}명`} />
          <Summary label="입실 완료" value={`${todays.length}명`} />
          <Summary label="현재 이용 중" value={`${activeCount}명`} />
        </section>

        <div className="mb-5 border-y border-workroom-line bg-white px-3 pt-1">
          <AdminTabs items={[{ value: "today", label: "오늘 운영", count: todayReservations.length }, { value: "history", label: "지난 기록" }, { value: "coupons", label: "쿠폰", count: pendingCoupons.length }]} onChange={setView} value={view} />
        </div>

        {isLoading ? <AdminEmpty>입퇴실 현황을 불러오는 중입니다.</AdminEmpty> : null}

        {!isLoading && view === "today" ? (
          <>
            {(() => {
              // 상태별로 묶어 한눈에: 이용 중 → 입실 예정(미입실·대기 포함) → 퇴실 완료
              const entries = todayReservations.map((reservation) => {
                const attendance = todayAttendanceByReservation.get(reservation.id);
                const start = startMinute(reservation.start_time);
                const late = !attendance && reservation.status === "confirmed" && !isLongTermReservation(reservation) && start !== null && currentMinute() > start + 15;
                const state = reservation.status === "pending" ? "확인 대기" : attendance?.check_out_at ? "퇴실" : attendance ? "이용 중" : late ? "미입실" : "입실 전";
                const tone: TintColor = state === "미입실" ? "danger" : state === "이용 중" ? "ink" : state === "확인 대기" ? "yellow" : "sky";
                return { reservation, attendance, late, state, tone };
              });
              const groups: [string, typeof entries][] = [
                ["현재 이용 중", entries.filter((e) => e.state === "이용 중")],
                ["입실 예정", entries.filter((e) => e.state === "입실 전" || e.state === "미입실" || e.state === "확인 대기")],
                ["퇴실 완료", entries.filter((e) => e.state === "퇴실")],
              ];
              const renderRow = ({ reservation, attendance, late, state, tone }: (typeof entries)[number]) => (
                <div className={`admin-row grid gap-3 px-4 py-4 sm:grid-cols-[120px_1fr_auto] sm:items-center ${late ? "border-l-[3px] border-l-red-500" : ""}`} key={reservation.id}>
                  <p className="text-sm font-bold tabular-nums">{isLongTermReservation(reservation) ? "장기 이용" : formatTimeRange(reservation.start_time, reservation.end_time)}</p>
                  <div>
                    <p className="text-sm font-semibold">{reservation.name} · {reservation.people}명</p>
                    <p className="mt-0.5 text-xs font-medium text-workroom-muted">{reservation.pass_name_snapshot || reservation.pass_type}{reservation.phone ? ` · ${reservation.phone}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <span className={badge(tone)}>{state}</span>
                    {!attendance && reservation.status === "confirmed" && reservation.profile_id ? <button className={buttonClass("primary", "sm")} disabled={busy === reservation.id} onClick={() => void addAttendance(reservation.profile_id!, reservation.id, reservation.name)} type="button">입실</button> : null}
                    {attendance && !attendance.check_out_at ? <button className={buttonClass("primary", "sm")} disabled={busy === attendance.id} onClick={() => void updateAttendance(attendance.id, { check_out_at: new Date().toISOString() }, "퇴실 처리했습니다.")} type="button">퇴실</button> : null}
                  </div>
                </div>
              );
              return (
                <div className="grid gap-4">
                  {groups.map(([label, items]) =>
                    items.length ? (
                      <div key={label}>
                        <p className="mb-1.5 text-xs font-black uppercase tracking-[0.08em] text-workroom-muted">
                          {label} <span className="text-workroom-ink">{items.length}</span>
                        </p>
                        <div className="border-y border-workroom-line bg-white">{items.map(renderRow)}</div>
                      </div>
                    ) : null,
                  )}
                  {!todayReservations.length ? (
                    <div className="border-y border-workroom-line bg-white">
                      <AdminEmpty>오늘 방문 예정자가 없습니다.</AdminEmpty>
                    </div>
                  ) : null}
                </div>
              );
            })()}

            <details className="mt-5 border-y border-workroom-line bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold">예약 없이 수기 입실 처리</summary>
              <div className="mt-3 grid gap-2">
                <input placeholder="회원 이름 또는 연락처로 검색" value={manualQuery} onChange={(event) => void searchMembers(event.target.value)} />
                {manualResults.map((member) => <button className="flex items-center justify-between border-b border-workroom-line px-2 py-3 text-left last:border-0" disabled={busy === "manual"} key={member.id} onClick={() => void addAttendance(member.id, null, member.full_name || "회원")} type="button"><span className="font-semibold">{member.full_name || "이름 미입력"}</span><span className="text-xs text-workroom-muted">{member.phone || ""} · 입실</span></button>)}
              </div>
            </details>
          </>
        ) : null}

        {!isLoading && view === "history" ? <div className="grid gap-2">{recent.map((row) => <AttendanceCard busy={busy === row.id} key={row.id} onDelete={() => void deleteAttendance(row.id)} onSave={(payload) => void updateAttendance(row.id, payload, "출석 시간을 정정했습니다.")} row={row} />)}{!recent.length ? <AdminEmpty>지난 입퇴실 기록이 없습니다.</AdminEmpty> : null}</div> : null}

        {!isLoading && view === "coupons" ? (
          <div className="grid gap-6">
            <section><h2 className="mb-2 text-base font-bold">사용 가능 {pendingCoupons.length}장</h2><div className="border-y border-workroom-line bg-white">{pendingCoupons.map((coupon) => <CouponRow busy={busy === coupon.id} coupon={coupon} key={coupon.id} onClick={() => void changeCoupon(coupon, "used")} />)}{!pendingCoupons.length ? <AdminEmpty>사용 가능한 쿠폰이 없습니다.</AdminEmpty> : null}</div></section>
            <details><summary className="cursor-pointer text-sm font-semibold text-workroom-muted">사용 완료 {usedCoupons.length}장</summary><div className="mt-2 border-y border-workroom-line bg-white">{usedCoupons.map((coupon) => <CouponRow busy={busy === coupon.id} coupon={coupon} key={coupon.id} onClick={() => void changeCoupon(coupon, "issued")} />)}</div></details>
          </div>
        ) : null}
      </div>
    </AdminPage>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-workroom-line px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-xs font-semibold text-workroom-muted">{label}</p><p className="mt-1 text-xl font-bold tabular-nums">{value}</p></div>;
}

function AttendanceCard({ busy, onDelete, onSave, row }: { busy: boolean; onDelete: () => void; onSave: (payload: { check_in_at: string; check_out_at: string | null }) => void; row: AttendanceRow }) {
  const [checkIn, setCheckIn] = useState(toKstInput(row.check_in_at));
  const [checkOut, setCheckOut] = useState(row.check_out_at ? toKstInput(row.check_out_at) : "");
  return (
    <article className="border border-workroom-line bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{row.profile?.full_name || "이름 미입력"}</p><p className="mt-0.5 text-xs text-workroom-muted">{dateTime(row.check_in_at)} 입실{row.check_out_at ? ` · ${dateTime(row.check_out_at)} 퇴실` : ""}</p></div><span className={badge(row.check_out_at ? "sky" : "ink")}>{row.check_out_at ? "퇴실" : "이용 중"}</span></div>
      <details className="mt-3 border-t border-workroom-line pt-2"><summary className="cursor-pointer text-xs font-semibold text-workroom-muted">시간 정정·삭제</summary><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="grid gap-1 text-xs font-semibold">입실<input type="datetime-local" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} /></label><label className="grid gap-1 text-xs font-semibold">퇴실<input type="datetime-local" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} /></label></div><div className="mt-2 flex gap-2"><button className={buttonClass("secondary", "sm")} disabled={busy || !checkIn} onClick={() => onSave({ check_in_at: fromKstInput(checkIn), check_out_at: checkOut ? fromKstInput(checkOut) : null })} type="button">시간 저장</button><button className={buttonClass("secondary", "sm", "border-red-400")} disabled={busy} onClick={onDelete} type="button">기록 삭제</button></div></details>
    </article>
  );
}

function CouponRow({ busy, coupon, onClick }: { busy: boolean; coupon: CouponRow; onClick: () => void }) {
  const isUsed = coupon.status === "used";
  return <div className="admin-row flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-semibold">{coupon.profile?.full_name || "회원"} · {coupon.label}</p><p className="mt-0.5 text-xs text-workroom-muted">{coupon.code}{coupon.used_at ? ` · ${dateTime(coupon.used_at)}` : ""}</p></div><button className={buttonClass("secondary", "sm")} disabled={busy} onClick={onClick} type="button">{isUsed ? "사용 취소" : "사용 처리"}</button></div>;
}

function toKstInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function fromKstInput(value: string) { return new Date(`${value}:00+09:00`).toISOString(); }
