import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminPage, { AdminEmpty, AdminFeedback, AdminTabs } from "../components/AdminPage";
import StatusBadge from "../components/StatusBadge";
import { downloadCsv } from "../lib/csv";
import { formatDate, formatTimeRange, todayValue } from "../lib/format";
import { getCurrentProfile } from "../lib/profiles";
import { isLongTermReservation, reservationCoversDate } from "../lib/reservations";
import { supabase } from "../lib/supabase";
import { badge, buttonClass } from "../lib/ui";
import type { Attendance, Coupon, Profile, Reservation } from "../lib/types";

type MemberView = "all" | "active" | "noted";

export default function AdminMembers() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Profile[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<MemberView>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function checkAndLoad() {
      if (!supabase) { setError("Supabase 환경 변수가 연결되지 않았습니다."); setIsLoading(false); return; }
      const { data } = await supabase.auth.getSession();
      if (!data.session) { navigate("/admin", { replace: true }); return; }
      const profile = await getCurrentProfile();
      if (profile?.role !== "admin") { navigate("/account", { replace: true }); return; }
      await loadMembers();
    }
    void checkAndLoad();
  }, [navigate]);

  async function loadMembers() {
    if (!supabase) return;
    setIsLoading(true); setError("");
    const [memberResult, reservationResult, attendanceResult, couponResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("role", "user").order("created_at", { ascending: false }).limit(1000),
      supabase.from("reservations").select("*").order("date", { ascending: false }).limit(2000),
      supabase.from("attendance").select("*").order("check_in_at", { ascending: false }).limit(1500),
      supabase.from("coupons").select("*").order("issued_at", { ascending: false }).limit(1000),
    ]);
    setIsLoading(false);
    const loadError = memberResult.error || reservationResult.error || attendanceResult.error || couponResult.error;
    if (loadError) { setError(loadError.message); return; }
    const nextMembers = (memberResult.data ?? []) as Profile[];
    setMembers(nextMembers); setReservations((reservationResult.data ?? []) as Reservation[]); setAttendance((attendanceResult.data ?? []) as Attendance[]); setCoupons((couponResult.data ?? []) as Coupon[]);
    setSelectedId((current) => current ?? nextMembers[0]?.id ?? null);
  }

  async function saveAdminNote(memberId: string, note: string) {
    if (!supabase) return;
    const { error: updateError } = await supabase.from("profiles").update({ admin_note: note.trim() || null }).eq("id", memberId);
    if (updateError) { setError(updateError.message); return; }
    setMembers((current) => current.map((member) => member.id === memberId ? { ...member, admin_note: note.trim() || null } : member));
    setError(""); setSuccess("회원 메모를 저장했습니다.");
  }

  const activeMemberIds = useMemo(() => {
    const today = todayValue();
    return new Set(reservations.filter((item) => item.status === "confirmed" && isLongTermReservation(item) && reservationCoversDate(item, today)).map((item) => item.profile_id).filter(Boolean));
  }, [reservations]);

  const visibleMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return members.filter((member) => {
      if (view === "active" && !activeMemberIds.has(member.id)) return false;
      if (view === "noted" && !member.admin_note) return false;
      if (!q) return true;
      return `${member.full_name ?? ""} ${member.email}`.toLowerCase().includes(q) || (digits && (member.phone ?? "").replace(/\D/g, "").includes(digits));
    });
  }, [activeMemberIds, members, query, view]);

  useEffect(() => {
    if (!visibleMembers.length) setSelectedId(null);
    else if (!visibleMembers.some((member) => member.id === selectedId)) setSelectedId(visibleMembers[0].id);
  }, [selectedId, visibleMembers]);

  const selectedMember = visibleMembers.find((member) => member.id === selectedId) ?? null;
  const selectedReservations = selectedMember ? reservations.filter((item) => item.profile_id === selectedMember.id) : [];
  const selectedAttendance = selectedMember ? attendance.filter((item) => item.profile_id === selectedMember.id) : [];
  const selectedCoupons = selectedMember ? coupons.filter((item) => item.profile_id === selectedMember.id) : [];

  function exportMembers() {
    downloadCsv(`workroom-members-${todayValue()}.csv`, ["이름", "이메일", "연락처", "주소", "가입일", "예약수", "출석수", "사용가능쿠폰", "결제완료금액", "관리자메모"], visibleMembers.map((member) => {
      const memberReservations = reservations.filter((item) => item.profile_id === member.id);
      return [member.full_name, member.email, member.phone, member.address, member.created_at.slice(0, 10), memberReservations.length, attendance.filter((item) => item.profile_id === member.id).length, coupons.filter((item) => item.profile_id === member.id && item.status === "issued").length, memberReservations.filter((item) => item.payment_status === "paid").reduce((sum, item) => sum + (item.price_at_booking ?? 0), 0), member.admin_note];
    }));
  }

  const detail = selectedMember ? <MemberDetail attendance={selectedAttendance} coupons={selectedCoupons} member={selectedMember} onSaveNote={(note) => void saveAdminNote(selectedMember.id, note)} reservations={selectedReservations} /> : null;

  return (
    <AdminPage actions={<><button className={buttonClass("secondary", "md")} onClick={() => void loadMembers()} type="button">새로고침</button><button className={buttonClass("secondary", "md")} disabled={!visibleMembers.length} onClick={exportMembers} type="button">CSV 저장</button></>} description="이용권, 다음 예약, 최근 방문을 기준으로 회원을 확인합니다." title="회원">
      <div className="admin-compact">
        <AdminFeedback error={error} success={success} />
        <div className="mb-5 border-y border-workroom-line bg-white px-3 pt-1">
          <AdminTabs items={[{ value: "all", label: "전체 회원", count: members.length }, { value: "active", label: "이용권 사용 중", count: activeMemberIds.size }, { value: "noted", label: "메모 있음", count: members.filter((item) => item.admin_note).length }]} onChange={setView} value={view} />
          <div className="py-3"><input placeholder="이름, 이메일 또는 전화번호 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        </div>
        {isLoading ? <AdminEmpty>회원 정보를 불러오는 중입니다.</AdminEmpty> : null}

        {!isLoading ? <div className="grid gap-4 xl:grid-cols-[350px_1fr]">
          <section className="border-y border-workroom-line bg-white xl:border">
            <div className="flex items-center justify-between border-b border-workroom-line px-4 py-3"><h2 className="text-sm font-bold">회원 목록</h2><span className="text-xs font-semibold text-workroom-muted">{visibleMembers.length}명</span></div>
            <div className="max-h-[720px] overflow-y-auto">
              {visibleMembers.map((member) => {
                const memberReservations = reservations.filter((item) => item.profile_id === member.id);
                const activePass = memberReservations.find((item) => item.status === "confirmed" && isLongTermReservation(item) && reservationCoversDate(item, todayValue()));
                const next = memberReservations.filter((item) => item.status === "confirmed" && item.date >= todayValue()).sort((a, b) => a.date.localeCompare(b.date))[0];
                return <button className={`admin-row block w-full border-l-[4px] px-4 py-3 text-left ${member.id === selectedId ? "border-l-workroom-yellow bg-workroom-background" : "border-l-transparent bg-white hover:bg-workroom-background"}`} key={member.id} onClick={() => { setSelectedId(member.id); setMobileDetailOpen(true); }} type="button"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{member.full_name || "이름 미입력"}</p><p className="mt-0.5 truncate text-xs text-workroom-muted">{member.phone || member.email}</p></div>{activePass ? <span className={badge("yellow")}>이용권 사용 중</span> : null}</div><p className="mt-2 truncate text-xs font-medium text-workroom-muted">{activePass ? `${activePass.pass_name_snapshot || activePass.pass_type} · ${formatDate(activePass.access_end_date || activePass.date)}까지` : next ? `다음 예약 ${formatDate(next.date)}` : "예정된 예약 없음"}</p></button>;
              })}
              {!visibleMembers.length ? <AdminEmpty>조건에 맞는 회원이 없습니다.</AdminEmpty> : null}
            </div>
          </section>
          <div className="hidden xl:block">{detail ?? <AdminEmpty>회원 목록에서 확인할 회원을 선택해 주세요.</AdminEmpty>}</div>
        </div> : null}

        {mobileDetailOpen && selectedMember ? <div className="fixed inset-0 z-[70] overflow-y-auto bg-workroom-background xl:hidden"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-workroom-ink bg-workroom-background px-4 py-3"><button className={buttonClass("secondary", "sm")} onClick={() => setMobileDetailOpen(false)} type="button">← 목록</button><p className="text-sm font-semibold">회원 상세</p><span className="w-[70px]" /></div><div className="mx-auto max-w-2xl p-3 pb-24">{detail}</div></div> : null}
      </div>
    </AdminPage>
  );
}

function MemberDetail({ attendance, coupons, member, onSaveNote, reservations }: { attendance: Attendance[]; coupons: Coupon[]; member: Profile; onSaveNote: (note: string) => void; reservations: Reservation[] }) {
  const [note, setNote] = useState(member.admin_note ?? "");
  useEffect(() => setNote(member.admin_note ?? ""), [member]);
  const today = todayValue();
  const activePass = reservations.find((item) => item.status === "confirmed" && isLongTermReservation(item) && reservationCoversDate(item, today));
  const nextReservation = reservations.filter((item) => item.status === "confirmed" && item.date >= today).sort((a, b) => `${a.date}${a.start_time ?? ""}`.localeCompare(`${b.date}${b.start_time ?? ""}`))[0];
  const paidAmount = reservations.filter((item) => item.payment_status === "paid").reduce((sum, item) => sum + (item.price_at_booking ?? 0), 0);
  const activeCoupons = coupons.filter((item) => item.status === "issued");

  return <article className="border border-workroom-line bg-white p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-workroom-line pb-4"><div><h2 className="text-2xl font-bold">{member.full_name || "이름 미입력"}</h2><div className="mt-2 flex flex-wrap gap-2">{member.phone ? <a className={buttonClass("secondary", "sm")} href={`tel:${member.phone}`}>전화</a> : null}<a className={buttonClass("secondary", "sm")} href={`mailto:${member.email}`}>이메일</a></div></div><p className="text-xs font-medium text-workroom-muted">가입 {formatDate(member.created_at.slice(0, 10))}</p></header>
    <div className="grid border-b border-workroom-line sm:grid-cols-2"><InfoCell label="현재 이용권" value={activePass ? `${activePass.pass_name_snapshot || activePass.pass_type} · ${formatDate(activePass.access_end_date || activePass.date)}까지` : "사용 중인 이용권 없음"} /><InfoCell label="다음 예약" value={nextReservation ? `${formatDate(nextReservation.date)} · ${formatTimeRange(nextReservation.start_time, nextReservation.end_time)}` : "예정 없음"} /></div>
    <div className="grid grid-cols-2 border-b border-workroom-line sm:grid-cols-4"><SmallStat label="예약" value={`${reservations.length}건`} /><SmallStat label="방문" value={`${attendance.length}회`} /><SmallStat label="결제" value={`${paidAmount.toLocaleString("ko-KR")}원`} /><SmallStat label="쿠폰" value={`${activeCoupons.length}장`} /></div>
    {member.address ? <p className="border-b border-workroom-line py-3 text-sm font-medium text-workroom-muted">{member.address}</p> : null}
    <label className="mt-4 grid gap-1.5 text-sm font-semibold">관리자 메모<textarea placeholder="응대에 필요한 내용만 기록하세요." rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label><button className={`${buttonClass("primary", "sm")} mt-2`} disabled={note === (member.admin_note ?? "")} onClick={() => onSaveNote(note)} type="button">메모 저장</button>
    <details className="mt-5 border-t border-workroom-line pt-3" open><summary className="cursor-pointer text-sm font-semibold">예약 이력 {reservations.length}건</summary><div className="mt-2 border-y border-workroom-line">{reservations.slice(0, 12).map((reservation) => <Link className="admin-row flex items-center justify-between gap-3 px-3 py-3 hover:bg-workroom-background" key={reservation.id} to={`/admin/reservations?reservation=${reservation.id}`}><div><p className="text-sm font-semibold">{formatDate(reservation.date)} · {formatTimeRange(reservation.start_time, reservation.end_time)}</p><p className="mt-0.5 text-xs text-workroom-muted">{reservation.pass_name_snapshot || reservation.pass_type}</p></div><StatusBadge status={reservation.status} /></Link>)}{!reservations.length ? <AdminEmpty>예약 이력이 없습니다.</AdminEmpty> : null}</div></details>
    <details className="mt-4 border-t border-workroom-line pt-3"><summary className="cursor-pointer text-sm font-semibold">방문·쿠폰 기록</summary><div className="mt-3 grid gap-4 sm:grid-cols-2"><div><p className="mb-2 text-xs font-semibold text-workroom-muted">최근 방문</p>{attendance.slice(0, 8).map((item) => <p className="admin-row py-2 text-sm" key={item.id}>{dateTimeLabel(item.check_in_at)}{item.check_out_at ? ` → ${timeLabel(item.check_out_at)}` : " · 이용 중"}</p>)}</div><div><p className="mb-2 text-xs font-semibold text-workroom-muted">쿠폰</p>{coupons.slice(0, 8).map((coupon) => <div className="admin-row flex items-center justify-between py-2 text-sm" key={coupon.id}><span>{coupon.label}</span><span className={badge(coupon.status === "issued" ? "yellow" : "sky")}>{coupon.status === "issued" ? "사용 가능" : "사용 완료"}</span></div>)}</div></div></details>
  </article>;
}

function InfoCell({ label, value }: { label: string; value: string }) { return <div className="border-b border-workroom-line px-3 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-xs font-semibold text-workroom-muted">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
function SmallStat({ label, value }: { label: string; value: string }) { return <div className="border-b border-r border-workroom-line px-3 py-3 even:border-r-0 sm:border-b-0 sm:even:border-r sm:last:border-r-0"><p className="text-xs font-semibold text-workroom-muted">{label}</p><p className="mt-1 text-base font-bold tabular-nums">{value}</p></div>; }
function dateTimeLabel(value: string) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function timeLabel(value: string) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
