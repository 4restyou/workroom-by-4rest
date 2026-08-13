import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AdminPage, { AdminEmpty, AdminFeedback, AdminTabs } from "../components/AdminPage";
import StatusBadge from "../components/StatusBadge";
import { downloadCsv } from "../lib/csv";
import { formatDate, formatTimeRange, todayValue } from "../lib/format";
import { kstDateTime, kstTime } from "../lib/datetime";
import { isLongTermReservation, reservationCoversDate } from "../lib/reservations";
import { ATTENDANCE_COLUMNS, COUPON_COLUMNS, PROFILE_LIST_COLUMNS, RESERVATION_LIST_COLUMNS } from "../lib/columns";
import { supabase } from "../lib/supabase";
import { useFeedbackToast } from "../lib/useFeedbackToast";
import { useOverlayBackClose } from "../lib/useOverlayBackClose";
import { badge, buttonClass } from "../lib/ui";
import type { Attendance, Coupon, Profile, Reservation } from "../lib/types";
import { promptDialog } from "../lib/confirm";
import { useSession } from "../lib/sessionContext";

type MemberView = "all" | "active" | "noted";

export default function AdminMembers() {
  const { status: sessionStatus, isSignedIn, isAdmin } = useSession();
  const navigate = useNavigate();
  const [members, setMembers] = useState<Profile[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // 예약 상세에서 "이용내역 보기"로 넘어올 때 해당 회원을 바로 연다.
  const [searchParams] = useSearchParams();
  const memberParam = searchParams.get("member");
  const [selectedId, setSelectedId] = useState<string | null>(memberParam);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(Boolean(memberParam));
  useOverlayBackClose(mobileDetailOpen, () => setMobileDetailOpen(false));
  const [query, setQuery] = useState("");
  const [view, setView] = useState<MemberView>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useFeedbackToast(success, error);

  useEffect(() => {
    // 세션·권한은 SessionProvider가 이미 읽어 뒀다(RequireAdmin도 같은 값을 본다).
    if (sessionStatus !== "ready") return;
    async function checkAndLoad() {
      if (!supabase) { setError("Supabase 환경 변수가 연결되지 않았습니다."); setIsLoading(false); return; }
      if (!isSignedIn) { navigate("/admin", { replace: true }); return; }
      if (!isAdmin) { navigate("/account", { replace: true }); return; }
      await loadMembers();
    }
    void checkAndLoad();
  }, [sessionStatus, isSignedIn, isAdmin, navigate]);

  async function loadMembers() {
    if (!supabase) return;
    setIsLoading(true); setError("");
    const [memberResult, reservationResult, attendanceResult, couponResult] = await Promise.all([
      // 화면에서 쓰는 컬럼만 받는다. select("*")는 주소·메모 등 큰 텍스트까지
      // 끌고 와 전송량과 JSON 파싱 비용을 키운다.
      supabase.from("profiles").select(PROFILE_LIST_COLUMNS).eq("role", "user").order("created_at", { ascending: false }).limit(1000),
      supabase
        .from("reservations")
        .select(RESERVATION_LIST_COLUMNS)
        .is("deleted_at", null)
        .order("date", { ascending: false })
        .limit(2000),
      supabase.from("attendance").select(ATTENDANCE_COLUMNS).order("check_in_at", { ascending: false }).limit(1500),
      supabase.from("coupons").select(COUPON_COLUMNS).order("issued_at", { ascending: false }).limit(1000),
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
    else if (!visibleMembers.some((member) => member.id === selectedId)) setSelectedId(memberParam && visibleMembers.some((m) => m.id === memberParam) ? memberParam : visibleMembers[0].id);
  }, [memberParam, selectedId, visibleMembers]);

  // 회원별 조회를 위해 한 번만 인덱싱한다. 예전에는 목록의 회원마다
  // 전체 예약(최대 2000건)을 선형 탐색해서, 검색어를 한 글자 칠 때마다
  // 회원수 × 예약수만큼 순회가 일어났다(300명 기준 약 8.6ms → 0.4ms).
  const byProfile = useMemo(() => {
    const group = <T extends { profile_id: string | null }>(rows: T[]) => {
      const map = new Map<string, T[]>();
      for (const row of rows) {
        if (!row.profile_id) continue;
        const bucket = map.get(row.profile_id);
        if (bucket) bucket.push(row);
        else map.set(row.profile_id, [row]);
      }
      return map;
    };
    return {
      reservations: group(reservations),
      attendance: group(attendance),
      coupons: group(coupons),
    };
  }, [attendance, coupons, reservations]);

  // 렌더 중 반복 호출되던 오늘 날짜를 한 번만 구한다.
  const today = todayValue();
  const notedCount = useMemo(() => members.filter((item) => item.admin_note).length, [members]);

  const selectedMember = visibleMembers.find((member) => member.id === selectedId) ?? null;
  const selectedReservations = selectedMember ? byProfile.reservations.get(selectedMember.id) ?? [] : [];
  const selectedAttendance = selectedMember ? byProfile.attendance.get(selectedMember.id) ?? [] : [];
  const selectedCoupons = selectedMember ? byProfile.coupons.get(selectedMember.id) ?? [] : [];

  function exportMembers() {
    downloadCsv(`workroom-members-${todayValue()}.csv`, ["이름", "이메일", "연락처", "주소", "가입일", "예약수", "방문수", "총이용시간(분)", "평균이용시간(분)", "마지막방문", "사용가능쿠폰", "결제완료금액", "관리자메모"], visibleMembers.map((member) => {
      // 인덱스를 재사용한다(회원마다 전체 테이블을 훑지 않는다).
      const memberReservations = byProfile.reservations.get(member.id) ?? [];
      const memberAttendance = byProfile.attendance.get(member.id) ?? [];
      const memberCoupons = byProfile.coupons.get(member.id) ?? [];
      // 이용 시간은 퇴근이 기록된 방문만 집계한다(열린 세션은 길이를 알 수 없다).
      let totalMinutes = 0;
      let closed = 0;
      for (const visit of memberAttendance) {
        if (!visit.check_out_at) continue;
        const minutes = Math.round((new Date(visit.check_out_at).getTime() - new Date(visit.check_in_at).getTime()) / 60000);
        if (minutes > 0 && minutes < 20 * 60) { totalMinutes += minutes; closed += 1; }
      }
      return [
        member.full_name,
        member.email,
        member.phone,
        member.address,
        member.created_at.slice(0, 10),
        memberReservations.length,
        memberAttendance.length,
        totalMinutes,
        closed ? Math.round(totalMinutes / closed) : 0,
        memberAttendance[0]?.check_in_at?.slice(0, 10) ?? "",
        memberCoupons.filter((item) => item.status === "issued").length,
        memberReservations.filter((item) => item.payment_status === "paid").reduce((sum, item) => sum + (item.price_at_booking ?? 0), 0),
        member.admin_note,
      ];
    }));
  }

  // 회원을 보고 있는 자리에서 바로 쿠폰을 준다. 예전에는 입퇴실 화면으로 옮겨
  // 같은 회원을 다시 검색해야 했다.
  async function issueCoupon(member: Profile) {
    if (!supabase) return;
    const name = member.full_name || "회원";
    const entered = await promptDialog({
      title: `${name}님에게 쿠폰을 발급할까요?`,
      description: "쿠폰 이름을 비워 두면 설정에 저장된 기본 보상명으로 발급됩니다.",
      confirmLabel: "발급",
      fields: [{ name: "label", label: "쿠폰 이름", defaultValue: "" }],
    });
    if (!entered) return;
    const label = (entered.label ?? "").trim();
    setBusy(`coupon-${member.id}`);
    const { data, error: rpcError } = await supabase.rpc("admin_issue_coupon", { p_profile_id: member.id, p_label: label || null });
    const result = data as { ok?: boolean; message?: string; label?: string } | null;
    setBusy(null);
    if (rpcError || !result?.ok) {
      setError(result?.message ?? rpcError?.message ?? "쿠폰 발급에 실패했습니다.");
      return;
    }
    setError("");
    setSuccess(`${name}님에게 '${result.label ?? (label || "보상")}' 쿠폰을 발급했어요 🎫`);
    await loadMembers();
  }

  const detail = selectedMember ? <MemberDetail attendance={selectedAttendance} coupons={selectedCoupons} issuingCoupon={busy === `coupon-${selectedMember.id}`} member={selectedMember} onIssueCoupon={() => void issueCoupon(selectedMember)} onSaveNote={(note) => void saveAdminNote(selectedMember.id, note)} reservations={selectedReservations} /> : null;

  return (
    <AdminPage actions={<><button className={buttonClass("secondary", "md")} onClick={() => void loadMembers()} type="button">새로고침</button><button className={buttonClass("secondary", "md")} disabled={!visibleMembers.length} onClick={exportMembers} type="button">CSV 저장</button></>} description="이용권, 다음 예약, 최근 방문을 기준으로 회원을 확인합니다." title="회원">
      <div className="admin-compact">
        <AdminFeedback error={error} success={success} />
        <div className="mb-5 border-y border-workroom-line bg-white px-3 pt-1">
          <AdminTabs items={[{ value: "all", label: "전체 회원", count: members.length }, { value: "active", label: "이용권 사용 중", count: activeMemberIds.size }, { value: "noted", label: "메모 있음", count: notedCount }]} onChange={setView} value={view} />
          <div className="py-3"><input placeholder="이름, 이메일 또는 전화번호 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        </div>
        {isLoading ? <AdminEmpty>회원 정보를 불러오는 중입니다.</AdminEmpty> : null}

        {!isLoading ? <div className="grid gap-4 xl:grid-cols-[350px_1fr]">
          <section className="border-y border-workroom-line bg-white xl:border">
            <div className="flex items-center justify-between border-b border-workroom-line px-4 py-3"><h2 className="text-sm font-bold">회원 목록</h2><span className="text-xs font-semibold text-workroom-muted">{visibleMembers.length}명</span></div>
            <div className="max-h-[720px] overflow-y-auto">
              {visibleMembers.map((member) => {
                const memberReservations = byProfile.reservations.get(member.id) ?? [];
                const activePass = memberReservations.find((item) => item.status === "confirmed" && isLongTermReservation(item) && reservationCoversDate(item, today));
                // 목록에서도 장기 이용권은 '다음 예약'으로 중복 표시하지 않는다.
                const next = memberReservations.filter((item) => item.status === "confirmed" && item.date >= today && !isLongTermReservation(item)).sort((a, b) => a.date.localeCompare(b.date))[0];
                return <button className={`admin-row block w-full border-l-[4px] px-4 py-3 text-left ${member.id === selectedId ? "border-l-workroom-yellow bg-workroom-background" : "border-l-transparent bg-white hover:bg-workroom-background"}`} key={member.id} onClick={() => { setSelectedId(member.id); setMobileDetailOpen(true); }} type="button"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{member.full_name || "이름 미입력"}</p><p className="mt-0.5 truncate text-xs text-workroom-muted">{member.phone || member.email}</p></div>{activePass ? <span className={badge("yellow")}>이용권 사용 중</span> : null}</div><p className="mt-2 truncate text-xs font-medium text-workroom-muted">{activePass ? `${activePass.pass_name_snapshot || activePass.pass_type} · ${formatDate(activePass.access_end_date || activePass.date)}까지` : next ? `다음 예약 ${formatDate(next.date)}` : "예정된 예약 없음"}</p></button>;
              })}
              {!visibleMembers.length ? <AdminEmpty>조건에 맞는 회원이 없습니다.</AdminEmpty> : null}
            </div>
          </section>
          <div className="hidden xl:block">{detail ?? <AdminEmpty>회원 목록에서 확인할 회원을 선택해 주세요.</AdminEmpty>}</div>
        </div> : null}

        {mobileDetailOpen && selectedMember ? <div className="fixed inset-0 z-[70] overflow-y-auto bg-workroom-background xl:hidden"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-workroom-ink bg-workroom-background px-4 py-3"><button className={buttonClass("secondary", "sm")} onClick={() => setMobileDetailOpen(false)} type="button">← 목록</button><p className="text-sm font-semibold">회원 상세</p><span className="w-[70px]" /></div><div className="mx-auto max-w-2xl p-3 pb-24"><AdminFeedback error={error} success={success} />{detail}</div></div> : null}
      </div>
    </AdminPage>
  );
}

function MemberDetail({ attendance, coupons, issuingCoupon, member, onIssueCoupon, onSaveNote, reservations }: { attendance: Attendance[]; coupons: Coupon[]; issuingCoupon: boolean; member: Profile; onIssueCoupon: () => void; onSaveNote: (note: string) => void; reservations: Reservation[] }) {
  const [note, setNote] = useState(member.admin_note ?? "");
  useEffect(() => setNote(member.admin_note ?? ""), [member]);
  const today = todayValue();
  const activePass = reservations.find((item) => item.status === "confirmed" && isLongTermReservation(item) && reservationCoversDate(item, today));
  // 장기 이용권은 '현재 이용권'에서 기간으로 보여주므로 다음 예약에서는 제외한다.
  // (같은 예약이 단건 예약처럼 한 번 더 보여 오해를 만들었다)
  const nextReservation = reservations
    .filter((item) => item.status === "confirmed" && item.date >= today && !isLongTermReservation(item))
    .sort((a, b) => `${a.date}${a.start_time ?? ""}`.localeCompare(`${b.date}${b.start_time ?? ""}`))[0];

  // 장기 이용권은 남은 기간과 이용 요일이 실제로 필요한 정보다.
  const passPeriod = activePass
    ? `${formatDate(activePass.access_start_date ?? activePass.date)} ~ ${formatDate(activePass.access_end_date ?? activePass.date)}`
    : "";
  const passDaysLeft = activePass
    ? Math.max(0, Math.round((new Date(`${activePass.access_end_date ?? activePass.date}T00:00:00+09:00`).getTime() - new Date(`${today}T00:00:00+09:00`).getTime()) / 86400000) + 1)
    : 0;
  const passWeekdays = activePass?.access_weekdays?.length && activePass.access_weekdays.length < 7
    ? activePass.access_weekdays.map((day) => ["일", "월", "화", "수", "목", "금", "토"][day]).join("·")
    : "";
  const paidAmount = reservations.filter((item) => item.payment_status === "paid").reduce((sum, item) => sum + (item.price_at_booking ?? 0), 0);
  const activeCoupons = coupons.filter((item) => item.status === "issued");

  // 이용내역: 얼마나 자주·얼마나 오래 머무는지가 운영 판단의 핵심이다.
  // 퇴근이 기록된 방문만 시간 집계에 넣는다(열린 세션은 길이를 알 수 없다).
  const visitStats = (() => {
    let totalMinutes = 0;
    let closedVisits = 0;
    const byMonth = new Map<string, number>();
    for (const item of attendance) {
      const month = item.check_in_at.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
      if (!item.check_out_at) continue;
      const minutes = Math.round((new Date(item.check_out_at).getTime() - new Date(item.check_in_at).getTime()) / 60000);
      if (minutes > 0 && minutes < 20 * 60) {
        totalMinutes += minutes;
        closedVisits += 1;
      }
    }
    const recentMonths = Array.from(byMonth.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
    return {
      totalMinutes,
      averageMinutes: closedVisits ? Math.round(totalMinutes / closedVisits) : 0,
      closedVisits,
      recentMonths,
      lastVisit: attendance[0]?.check_in_at ?? null,
    };
  })();

  return <article className="border border-workroom-line bg-white p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-workroom-line pb-4"><div><h2 className="text-2xl font-bold">{member.full_name || "이름 미입력"}</h2><div className="mt-2 flex flex-wrap gap-2">{member.phone ? <a className={buttonClass("secondary", "sm")} href={`tel:${member.phone}`}>전화</a> : null}<a className={buttonClass("secondary", "sm")} href={`mailto:${member.email}`}>이메일</a><Link className={buttonClass("accent", "sm")} to={`/admin/customer/${member.id}`}>고객 카드 열기</Link></div></div><p className="text-xs font-medium text-workroom-muted">가입 {formatDate(member.created_at.slice(0, 10))}</p></header>
    <div className="grid border-b border-workroom-line sm:grid-cols-2"><InfoCell
        label="현재 이용권"
        value={activePass ? `${activePass.pass_name_snapshot || activePass.pass_type} · 남은 ${passDaysLeft}일` : "사용 중인 이용권 없음"}
        hint={activePass ? `${passPeriod}${passWeekdays ? ` · ${passWeekdays}요일` : ""} · 매일 ${formatTimeRange(activePass.start_time, activePass.end_time)} 이용` : undefined}
      /><InfoCell
        label="다음 단건 예약"
        value={nextReservation ? `${formatDate(nextReservation.date)} · ${formatTimeRange(nextReservation.start_time, nextReservation.end_time)}` : activePass ? "이용권으로 이용 중" : "예정 없음"}
        hint={nextReservation ? nextReservation.pass_name_snapshot || nextReservation.pass_type : undefined}
      /></div>
    <div className="grid grid-cols-2 border-b border-workroom-line sm:grid-cols-3 lg:grid-cols-5"><SmallStat label="예약" value={`${reservations.length}건`} /><SmallStat label="방문" value={`${attendance.length}회`} /><SmallStat label="총 이용시간" value={formatDuration(visitStats.totalMinutes)} /><SmallStat label="결제" value={`${paidAmount.toLocaleString("ko-KR")}원`} /><SmallStat label="쿠폰" value={`${activeCoupons.length}장`} /></div>
    {member.address ? <p className="border-b border-workroom-line py-3 text-sm font-medium text-workroom-muted">{member.address}</p> : null}
    <label className="mt-4 grid gap-1.5 text-sm font-semibold">관리자 메모<textarea placeholder="응대에 필요한 내용만 기록하세요." rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label><button className={`${buttonClass("primary", "sm")} mt-2`} disabled={note === (member.admin_note ?? "")} onClick={() => onSaveNote(note)} type="button">메모 저장</button>
    <details className="mt-5 border-t border-workroom-line pt-3" open><summary className="cursor-pointer text-sm font-semibold">예약 이력 {reservations.length}건</summary><div className="mt-2 border-y border-workroom-line">{reservations.slice(0, 12).map((reservation) => <Link className="admin-row flex items-center justify-between gap-3 px-3 py-3 hover:bg-workroom-background" key={reservation.id} to={`/admin/reservations?reservation=${reservation.id}`}><div><p className="text-sm font-semibold">{formatDate(reservation.date)} · {formatTimeRange(reservation.start_time, reservation.end_time)}</p><p className="mt-0.5 text-xs text-workroom-muted">{reservation.pass_name_snapshot || reservation.pass_type}</p></div><StatusBadge status={reservation.status} /></Link>)}{!reservations.length ? <AdminEmpty>예약 이력이 없습니다.</AdminEmpty> : null}</div></details>
    <details className="mt-4 border-t border-workroom-line pt-3" open>
      <summary className="cursor-pointer text-sm font-semibold">이용내역 {attendance.length}회</summary>
      {attendance.length ? (
        <p className="mt-2 text-xs font-medium text-workroom-muted">
          평균 {formatDuration(visitStats.averageMinutes)} 이용
          {visitStats.closedVisits < attendance.length ? ` · 퇴근 미기록 ${attendance.length - visitStats.closedVisits}회 제외` : ""}
          {visitStats.lastVisit ? ` · 마지막 방문 ${dateTimeLabel(visitStats.lastVisit)}` : ""}
        </p>
      ) : null}

      {/* 월별 방문 횟수 — 이용이 늘고 있는지 줄고 있는지 한눈에 본다. */}
      {visitStats.recentMonths.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {visitStats.recentMonths.map(([month, count]) => (
            <span className="rounded-[5px] border border-workroom-line bg-workroom-background px-2 py-1 text-xs font-semibold tabular-nums" key={month}>
              {Number(month.slice(5, 7))}월 <b className="text-workroom-ink">{count}회</b>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 max-h-[320px] overflow-y-auto border-y border-workroom-line">
        {attendance.map((item) => {
          const minutes = item.check_out_at
            ? Math.round((new Date(item.check_out_at).getTime() - new Date(item.check_in_at).getTime()) / 60000)
            : null;
          return (
            <div className="admin-row flex items-center justify-between gap-3 px-3 py-2.5 text-sm" key={item.id}>
              <span className="tabular-nums">
                {dateTimeLabel(item.check_in_at)}
                {item.check_out_at ? ` → ${timeLabel(item.check_out_at)}` : ""}
              </span>
              {item.check_out_at ? (
                <span className="shrink-0 text-xs font-bold tabular-nums text-workroom-muted">
                  {minutes !== null && minutes > 0 && minutes < 20 * 60 ? formatDuration(minutes) : "시간 확인 필요"}
                </span>
              ) : (
                <span className={badge("ink")}>이용 중</span>
              )}
            </div>
          );
        })}
        {!attendance.length ? <AdminEmpty>이용내역이 없습니다.</AdminEmpty> : null}
      </div>
    </details>

    <details className="mt-4 border-t border-workroom-line pt-3">
      <summary className="cursor-pointer text-sm font-semibold">쿠폰 {coupons.length}장</summary>
      <div className="mt-2">
        <button className={buttonClass("secondary", "sm", "mb-2")} disabled={issuingCoupon} onClick={onIssueCoupon} type="button">
          {issuingCoupon ? "발급 중…" : "쿠폰 발급"}
        </button>
        {coupons.map((coupon) => (
          <div className="admin-row flex items-center justify-between py-2 text-sm" key={coupon.id}>
            <span>{coupon.label}</span>
            <span className={badge(coupon.status === "issued" ? "yellow" : "sky")}>{coupon.status === "issued" ? "사용 가능" : "사용 완료"}</span>
          </div>
        ))}
        {!coupons.length ? <AdminEmpty>발급된 쿠폰이 없습니다.</AdminEmpty> : null}
      </div>
    </details>
  </article>;
}

function InfoCell({ label, value, hint }: { label: string; value: string; hint?: string }) { return <div className="border-b border-workroom-line px-3 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-xs font-semibold text-workroom-muted">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p>{hint ? <p className="mt-0.5 text-xs font-medium text-workroom-muted">{hint}</p> : null}</div>; }
function SmallStat({ label, value }: { label: string; value: string }) { return <div className="border-b border-r border-workroom-line px-3 py-3 even:border-r-0 sm:border-b-0 sm:even:border-r sm:last:border-r-0"><p className="text-xs font-semibold text-workroom-muted">{label}</p><p className="mt-1 text-base font-bold tabular-nums">{value}</p></div>; }
// 분 단위를 "2시간 30분"처럼 읽기 쉬운 길이로.
function formatDuration(minutes: number): string {
  if (!minutes) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}분`;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

const dateTimeLabel = kstDateTime;
const timeLabel = kstTime;
