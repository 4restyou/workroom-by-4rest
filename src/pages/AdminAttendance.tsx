import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminPage, { AdminEmpty, AdminFeedback, AdminTabs } from "../components/AdminPage";
import { formatTimeRange, todayValue } from "../lib/format";
import { kstDate as kstDateShared, kstDateTime, kstTime } from "../lib/datetime";
import { currentOccupancy, peopleByReservationId } from "../lib/occupancy";
import { isLongTermReservation, reservationCoversDate } from "../lib/reservations";
import { supabase } from "../lib/supabase";
import { useFeedbackToast } from "../lib/useFeedbackToast";
import { badge, buttonClass, type TintColor } from "../lib/ui";
import type { Reservation } from "../lib/types";
import { confirmDialog } from "../lib/confirm";
import { useSession } from "../lib/sessionContext";

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

const minutePartsFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const kstDate = kstDateShared;
const dateTime = kstDateTime;
const timeOnly = kstTime;
function currentMinute() {
  const parts = minutePartsFmt.formatToParts(new Date());
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
  const { status: sessionStatus, isSignedIn, isAdmin } = useSession();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("today");
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useFeedbackToast(success, error);
  const [busy, setBusy] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [manualResults, setManualResults] = useState<MemberOption[]>([]);
  const [couponQuery, setCouponQuery] = useState("");
  const [couponResults, setCouponResults] = useState<MemberOption[]>([]);
  const [couponTarget, setCouponTarget] = useState<MemberOption | null>(null);
  const [couponLabel, setCouponLabel] = useState("");

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
    // 세션·권한은 SessionProvider가 이미 읽어 뒀다(RequireAdmin도 같은 값을 본다).
    if (sessionStatus !== "ready") return;
    let active = true;
    async function checkAndLoad() {
      if (!supabase) { setError("Supabase 환경 변수가 연결되지 않았습니다."); setIsLoading(false); return; }
      if (!isSignedIn) { navigate("/admin", { replace: true }); return; }
      if (!isAdmin) { navigate("/account", { replace: true }); return; }
      if (!active) return;
      await load();
    }
    void checkAndLoad();
    const timer = window.setInterval(() => void load(true), 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [sessionStatus, isSignedIn, isAdmin, navigate]);

  async function searchMembers(query: string) {
    if (!supabase) return;
    const q = query.trim();
    setManualQuery(query);
    if (q.length < 2) { setManualResults([]); return; }
    const { data } = await supabase.from("profiles").select("id,full_name,phone").eq("role", "user").or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8);
    setManualResults((data ?? []) as MemberOption[]);
  }

  async function searchCouponMembers(query: string) {
    if (!supabase) return;
    const q = query.trim();
    setCouponQuery(query);
    setCouponTarget(null);
    if (q.length < 2) { setCouponResults([]); return; }
    const { data } = await supabase.from("profiles").select("id,full_name,phone").eq("role", "user").or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`).limit(8);
    setCouponResults((data ?? []) as MemberOption[]);
  }

  async function issueCoupon() {
    if (!supabase || !couponTarget) return;
    const name = couponTarget.full_name || "회원";
    const label = couponLabel.trim() || "보상";
    const ok = await confirmDialog({ title: `${name}님에게 '${label}' 쿠폰을 발급할까요?`, confirmLabel: "발급" });
    if (!ok) return;
    setBusy("coupon");
    const { data, error: rpcError } = await supabase.rpc("admin_issue_coupon", { p_profile_id: couponTarget.id, p_label: couponLabel.trim() || null });
    const result = data as { ok?: boolean; message?: string; label?: string } | null;
    setBusy(null);
    if (rpcError || !result?.ok) {
      setError(rpcError?.message?.includes("function") ? "쿠폰 발급 기능이 아직 준비되지 않았습니다. 마이그레이션(0031) 적용을 확인해 주세요." : result?.message ?? rpcError?.message ?? "쿠폰 발급에 실패했습니다.");
      return;
    }
    setSuccess(`${name}님에게 '${result.label ?? label}' 쿠폰을 발급했어요 🎫`);
    setCouponQuery(""); setCouponResults([]); setCouponTarget(null); setCouponLabel("");
    await load(true);
  }

  // 회원 연결이 없는 예약(전화·워크인)을 번호로 찾은 회원에 이어 붙이고 입실시킨다.
  async function linkAndCheckIn(reservation: Reservation) {
    if (!supabase) return;
    const digits = (reservation.phone ?? "").replace(/\D/g, "");
    if (digits.length < 9) {
      setError("연락처가 없어 회원을 찾을 수 없습니다. 아래 '예약 없이 수기 입실 처리'를 이용해 주세요.");
      return;
    }
    setBusy(reservation.id);
    const { data } = await supabase.from("profiles").select("id,full_name,phone").eq("role", "user").limit(200);
    const match = (data ?? []).find((row) => (row.phone ?? "").replace(/\D/g, "") === digits);
    if (!match) {
      setBusy(null);
      setError(`${reservation.name}님과 같은 번호의 회원을 찾지 못했습니다. 회원가입 후 다시 시도하거나 수기 입실을 이용해 주세요.`);
      return;
    }
    const { error: linkError } = await supabase.from("reservations").update({ profile_id: match.id }).eq("id", reservation.id);
    setBusy(null);
    if (linkError) {
      setError(linkError.message);
      return;
    }
    await addAttendance(match.id, reservation.id, reservation.name);
    await load(true);
  }

  async function addAttendance(profileId: string, reservationId: string | null, name: string) {
    if (!supabase) return;
    const ok = await confirmDialog({ title: `${name}님에게 오늘 출근 도장을 찍어줄까요?`, confirmLabel: "도장 찍기" });
    if (!ok) return;
    setBusy(reservationId ?? "manual");
    // 하루 1회 규칙·쿠폰 발급까지 자동 출근과 동일하게 처리하는 RPC 경유.
    const { data, error: rpcError } = await supabase.rpc("admin_attendance_stamp", { p_profile_id: profileId, p_reservation_id: reservationId });
    const result = data as { ok?: boolean; message?: string; coupon?: boolean } | null;
    setBusy(null);
    if (rpcError || !result?.ok) {
      setError(rpcError?.message?.includes("function") ? "관리자 도장 기능이 아직 준비되지 않았습니다. 마이그레이션(0030) 적용을 확인해 주세요." : result?.message ?? rpcError?.message ?? "처리에 실패했습니다.");
      return;
    }
    setManualQuery(""); setManualResults([]);
    setSuccess(result.coupon ? `${name}님 도장 완료! 스탬프를 다 채워 쿠폰이 발급됐어요 🎉` : `${name}님 ${result.message ?? "도장을 찍었어요."}`);
    await load(true);
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
    if (!supabase) return;
    const ok = await confirmDialog({
      title: "출석 기록을 삭제할까요?",
      description: "잘못 등록된 기록을 지웁니다. 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(id);
    const { error: deleteError } = await supabase.from("attendance").delete().eq("id", id);
    setBusy(null);
    if (deleteError) { setError(deleteError.message); return; }
    setRows((current) => current.filter((row) => row.id !== id)); setSuccess("출석 기록을 삭제했습니다.");
  }

  async function changeCoupon(coupon: CouponRow, nextStatus: "issued" | "used") {
    if (!supabase) return;
    const action = nextStatus === "used" ? "사용" : "사용 취소";
    const ok = await confirmDialog({ title: `이 쿠폰을 ${action} 처리할까요?`, confirmLabel: action });
    if (!ok) return;
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
  // 오늘 운영 대시보드와 같은 기준(단체 예약은 인원수, 워크인은 1명)으로 센다.
  const activeCount = currentOccupancy(todays.filter((row) => !row.check_out_at), peopleByReservationId(reservations));
  // 예약과 연결되지 않은 오늘 입실(워크인·수기 도장).
  const walkIns = todays.filter((row) => !row.reservation_id);
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
          {/* 세 지표 모두 '건수'가 아니라 '사람 수'다(단체 예약은 인원수, 워크인은 1명). */}
          <Summary label="오늘 예정" value={`${todayReservations.reduce((sum, item) => sum + item.people, 0)}명`} />
          <Summary label="입실 완료" value={`${currentOccupancy(todays, peopleByReservationId(reservations))}명`} />
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
                    {attendance ? (
                      <p className="mt-1 text-xs font-bold tabular-nums text-workroom-ink">
                        {timeOnly(attendance.check_in_at)} 입실
                        {attendance.check_out_at ? ` · ${timeOnly(attendance.check_out_at)} 퇴실` : " · 이용 중"}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <span className={badge(tone)}>{state}</span>
                    {!attendance && reservation.status === "confirmed" && reservation.profile_id ? <button className={buttonClass("primary", "sm", "min-h-[44px] px-5")} disabled={busy === reservation.id} onClick={() => void addAttendance(reservation.profile_id!, reservation.id, reservation.name)} type="button">입실</button> : null}
                    {/* 회원 연결이 없는 전화·워크인 예약은 출석을 기록할 대상이 없다.
                        번호로 회원을 찾아 이어 붙인 뒤 그대로 입실 처리한다. */}
                    {!attendance && reservation.status === "confirmed" && !reservation.profile_id ? (
                      <button className={buttonClass("secondary", "sm", "min-h-[44px] px-4")} disabled={busy === reservation.id} onClick={() => void linkAndCheckIn(reservation)} type="button">
                        회원 연결 후 입실
                      </button>
                    ) : null}
                    {attendance && !attendance.check_out_at ? <button className={buttonClass("primary", "sm", "min-h-[44px] px-5")} disabled={busy === attendance.id} onClick={() => void updateAttendance(attendance.id, { check_out_at: new Date().toISOString() }, "퇴실 처리했습니다.")} type="button">퇴실</button> : null}
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

            {/* 예약 없이 찍은 워크인은 예약 기준 목록에 안 잡히므로 따로 보여준다.
                오늘 기록도 여기서 바로 정정·삭제할 수 있어야 실수를 되돌릴 수 있다. */}
            {walkIns.length ? (
              <div className="mt-5">
                <p className="mb-1.5 text-xs font-black uppercase tracking-[0.08em] text-workroom-muted">
                  예약 없는 입실 <span className="text-workroom-ink">{walkIns.length}</span>
                </p>
                <div className="grid gap-2">
                  {walkIns.map((row) => (
                    <div className="border border-workroom-line bg-white px-4 py-3" key={row.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{row.profile?.full_name || "이름 미입력"}</p>
                          <p className="mt-0.5 text-xs font-bold tabular-nums text-workroom-ink">
                            {timeOnly(row.check_in_at)} 입실{row.check_out_at ? ` · ${timeOnly(row.check_out_at)} 퇴실` : " · 이용 중"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={badge(row.check_out_at ? "sky" : "ink")}>{row.check_out_at ? "퇴실" : "이용 중"}</span>
                          {!row.check_out_at ? (
                            <button className={buttonClass("primary", "sm", "min-h-[44px] px-5")} disabled={busy === row.id} onClick={() => void updateAttendance(row.id, { check_out_at: new Date().toISOString() }, "퇴실 처리했습니다.")} type="button">퇴실</button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <details className="mt-5 border-y border-workroom-line bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold">오늘 기록 정정·삭제</summary>
              <p className="mt-2 text-xs text-workroom-muted">잘못 찍은 입·퇴실을 바로잡거나 삭제할 수 있습니다.</p>
              <div className="mt-3 grid gap-2">
                {todays.length ? (
                  todays.map((row) => (
                    <AttendanceCard busy={busy === row.id} key={row.id} onDelete={() => void deleteAttendance(row.id)} onSave={(payload) => void updateAttendance(row.id, payload, "출석 시간을 정정했습니다.")} row={row} />
                  ))
                ) : (
                  <p className="text-sm text-workroom-muted">오늘 입실 기록이 없습니다.</p>
                )}
              </div>
            </details>

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
            <section className="border border-workroom-line bg-white p-4">
              <h2 className="text-base font-bold">쿠폰 직접 발급</h2>
              <p className="mt-0.5 text-xs text-workroom-muted">스탬프와 상관없이 회원에게 쿠폰을 바로 지급합니다. (예: 사과·이벤트·선물)</p>
              <div className="mt-3 grid gap-2">
                {couponTarget ? (
                  <div className="flex items-center justify-between gap-2 border border-workroom-line px-3 py-2">
                    <span className="text-sm font-semibold">{couponTarget.full_name || "이름 미입력"}{couponTarget.phone ? <span className="ml-1 text-xs font-medium text-workroom-muted">{couponTarget.phone}</span> : null}</span>
                    <button className="text-xs font-semibold text-workroom-muted underline" onClick={() => { setCouponTarget(null); setCouponQuery(""); }} type="button">회원 변경</button>
                  </div>
                ) : (
                  <>
                    <input placeholder="회원 이름 또는 연락처로 검색" value={couponQuery} onChange={(event) => void searchCouponMembers(event.target.value)} />
                    {couponResults.map((member) => (
                      <button className="flex items-center justify-between border-b border-workroom-line px-2 py-3 text-left last:border-0" key={member.id} onClick={() => { setCouponTarget(member); setCouponResults([]); }} type="button">
                        <span className="font-semibold">{member.full_name || "이름 미입력"}</span>
                        <span className="text-xs text-workroom-muted">{member.phone || ""}</span>
                      </button>
                    ))}
                  </>
                )}
                <input placeholder="쿠폰 이름 (비워두면 기본 보상명)" value={couponLabel} onChange={(event) => setCouponLabel(event.target.value)} />
                <button className={buttonClass("primary", "md")} disabled={!couponTarget || busy === "coupon"} onClick={() => void issueCoupon()} type="button">{busy === "coupon" ? "발급 중…" : "쿠폰 발급"}</button>
              </div>
            </section>
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
