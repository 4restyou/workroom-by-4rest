import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import StatusBadge from "../components/StatusBadge";
import { downloadCsv } from "../lib/csv";
import { formatDate, formatTimeRange } from "../lib/format";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import { badge, buttonClass, card, cardFlat, tintCard } from "../lib/ui";
import type { Attendance, Coupon, Profile, Reservation } from "../lib/types";

export default function AdminMembers() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Profile[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
      await loadMembers();
    }
    void checkAndLoad();
  }, [navigate]);

  async function loadMembers() {
    if (!supabase) return;
    setIsLoading(true);
    setError("");
    const [memberResult, reservationResult, attendanceResult, couponResult] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("reservations").select("*").order("date", { ascending: false }).limit(1000),
      supabase.from("attendance").select("*").order("check_in_at", { ascending: false }).limit(1000),
      supabase.from("coupons").select("*").order("issued_at", { ascending: false }).limit(1000),
    ]);
    setIsLoading(false);
    const loadError = memberResult.error || reservationResult.error || attendanceResult.error || couponResult.error;
    if (loadError) {
      setError(loadError.message);
      return;
    }
    const nextMembers = (memberResult.data ?? []) as Profile[];
    setMembers(nextMembers);
    setReservations((reservationResult.data ?? []) as Reservation[]);
    setAttendance((attendanceResult.data ?? []) as Attendance[]);
    setCoupons((couponResult.data ?? []) as Coupon[]);
    setSelectedId((current) => current ?? nextMembers.find((member) => member.role !== "admin")?.id ?? nextMembers[0]?.id ?? null);
  }

  async function saveAdminNote(memberId: string, note: string) {
    if (!supabase) return;
    const { error: updateError } = await supabase.from("profiles").update({ admin_note: note.trim() || null }).eq("id", memberId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMembers((current) => current.map((member) => (member.id === memberId ? { ...member, admin_note: note.trim() || null } : member)));
    setError("");
    setSuccess("회원 메모를 저장했습니다.");
  }

  const visibleMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    if (!q) return members;
    return members.filter((member) => {
      const haystack = `${member.full_name ?? ""} ${member.email}`.toLowerCase();
      const phoneMatch = qDigits.length > 0 && (member.phone ?? "").replace(/\D/g, "").includes(qDigits);
      return haystack.includes(q) || phoneMatch;
    });
  }, [members, query]);

  useEffect(() => {
    if (!visibleMembers.length) {
      setSelectedId(null);
    } else if (!visibleMembers.some((member) => member.id === selectedId)) {
      setSelectedId(visibleMembers[0].id);
    }
  }, [selectedId, visibleMembers]);

  const selectedMember = visibleMembers.find((member) => member.id === selectedId) ?? null;
  const selectedReservations = selectedMember ? reservations.filter((item) => item.profile_id === selectedMember.id) : [];
  const selectedAttendance = selectedMember ? attendance.filter((item) => item.profile_id === selectedMember.id) : [];
  const selectedCoupons = selectedMember ? coupons.filter((item) => item.profile_id === selectedMember.id) : [];

  function exportMembers() {
    downloadCsv(
      `workroom-members-${new Date().toISOString().slice(0, 10)}.csv`,
      ["이름", "이메일", "연락처", "주소", "가입일", "예약수", "출석수", "사용가능쿠폰", "결제완료금액", "관리자메모"],
      visibleMembers.filter((member) => member.role !== "admin").map((member) => {
        const memberReservations = reservations.filter((item) => item.profile_id === member.id);
        return [
          member.full_name,
          member.email,
          member.phone,
          member.address,
          member.created_at.slice(0, 10),
          memberReservations.length,
          attendance.filter((item) => item.profile_id === member.id).length,
          coupons.filter((item) => item.profile_id === member.id && item.status === "issued").length,
          memberReservations.filter((item) => item.payment_status === "paid").reduce((sum, item) => sum + (item.price_at_booking ?? 0), 0),
          member.admin_note,
        ];
      }),
    );
  }

  return (
    <main className="pb-12">
      <Section eyebrow="Admin" title="회원 관리" accent="ink">
        <div className={`mb-5 grid gap-3 ${card} p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end`}>
          <label className="grid gap-2 text-sm font-bold">
            이름 · 이메일 · 전화 검색
            <input placeholder="이름, 이메일 또는 전화번호로 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button className={buttonClass("accent", "md")} onClick={() => void loadMembers()} type="button">새로고침</button>
          <button className={buttonClass("secondary", "md")} disabled={!visibleMembers.length} onClick={exportMembers} type="button">회원 CSV</button>
          <Link className={buttonClass("secondary", "md")} to="/admin/reservations">예약관리</Link>
        </div>

        <p className={`mb-4 ${tintCard("yellow")} p-4 text-sm font-bold`}>전체 회원 {members.filter((member) => member.role !== "admin").length}명</p>
        {isLoading ? <p className={`${tintCard("yellow")} p-4 font-bold`}>회원 정보를 불러오는 중입니다.</p> : null}
        {error ? <p className={`mb-4 ${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}
        {success ? <p className={`mb-4 ${tintCard("mint")} p-4 text-sm font-bold`}>{success}</p> : null}

        <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
          <section className={`${card} p-3`}>
            <div className="mb-3 flex items-center justify-between px-2">
              <h2 className="font-black">회원 목록</h2>
              <span className="text-sm font-bold text-workroom-muted">{visibleMembers.length}명</span>
            </div>
            <div className="grid max-h-[720px] gap-2 overflow-y-auto pr-1">
              {visibleMembers.map((member) => {
                const memberReservations = reservations.filter((item) => item.profile_id === member.id);
                const isSelected = member.id === selectedId;
                return (
                  <button
                    className={`rounded-card border p-4 text-left ${isSelected ? "border-workroom-ink bg-workroom-yellow" : "border-workroom-line bg-workroom-background hover:border-workroom-ink"}`}
                    key={member.id}
                    onClick={() => setSelectedId(member.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-black">{member.full_name || "이름 미입력"}</p>
                        <p className="mt-1 truncate text-xs font-medium text-workroom-muted">{member.phone || member.email}</p>
                      </div>
                      <span className={badge(member.role === "admin" ? "ink" : "mint")}>{member.role === "admin" ? "관리자" : `${memberReservations.length}회`}</span>
                    </div>
                  </button>
                );
              })}
              {!isLoading && !visibleMembers.length ? <p className={`${cardFlat} p-4 text-sm text-workroom-muted`}>조건에 맞는 회원이 없습니다.</p> : null}
            </div>
          </section>

          {selectedMember ? (
            <MemberDetail
              attendance={selectedAttendance}
              coupons={selectedCoupons}
              member={selectedMember}
              onSaveNote={(note) => void saveAdminNote(selectedMember.id, note)}
              reservations={selectedReservations}
            />
          ) : <p className={`${card} p-6 text-center font-bold`}>회원 목록에서 확인할 회원을 선택해 주세요.</p>}
        </div>
      </Section>
    </main>
  );
}

function MemberDetail({ attendance, coupons, member, onSaveNote, reservations }: {
  attendance: Attendance[];
  coupons: Coupon[];
  member: Profile;
  onSaveNote: (note: string) => void;
  reservations: Reservation[];
}) {
  const [note, setNote] = useState(member.admin_note ?? "");
  useEffect(() => setNote(member.admin_note ?? ""), [member]);
  const paidAmount = reservations.filter((item) => item.payment_status === "paid").reduce((sum, item) => sum + (item.price_at_booking ?? 0), 0);
  const activeCoupons = coupons.filter((item) => item.status === "issued");

  return (
    <article className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-workroom-line pb-4">
        <div>
          <h2 className="text-2xl font-black">{member.full_name || "이름 미입력"}</h2>
          <a className="mt-1 block text-sm font-bold underline underline-offset-2" href={`mailto:${member.email}`}>{member.email}</a>
          {member.phone ? <a className="mt-1 block text-sm font-bold underline underline-offset-2" href={`tel:${member.phone}`}>{member.phone}</a> : null}
          {member.address ? <p className="mt-1 text-sm font-medium text-workroom-muted">{member.address}</p> : null}
        </div>
        <div className="text-right text-xs font-medium text-workroom-muted">
          <span className={badge(member.role === "admin" ? "ink" : "mint")}>{member.role === "admin" ? "관리자" : "회원"}</span>
          <p className="mt-2">가입일 {formatDate(member.created_at.slice(0, 10))}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <MiniStat label="전체 예약" value={`${reservations.length}건`} />
        <MiniStat label="출석" value={`${attendance.length}회`} />
        <MiniStat label="결제 완료" value={`${paidAmount.toLocaleString("ko-KR")}원`} />
        <MiniStat label="사용 가능 쿠폰" value={`${activeCoupons.length}장`} />
      </div>

      <label className="mt-5 grid gap-2 text-sm font-bold">
        관리자 전용 메모
        <textarea placeholder="회원 응대에 필요한 내용만 기록하세요." rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <button className={`${buttonClass("primary", "sm")} mt-2`} disabled={note === (member.admin_note ?? "")} onClick={() => onSaveNote(note)} type="button">메모 저장</button>

      <h3 className="mb-2 mt-6 font-black">예약 이력</h3>
      <div className="grid gap-2">
        {reservations.slice(0, 10).map((reservation) => (
          <Link className={`${cardFlat} flex flex-wrap items-center justify-between gap-3 p-3 hover:border-workroom-ink`} key={reservation.id} to={`/admin/reservations?reservation=${reservation.id}`}>
            <div>
              <p className="text-sm font-bold">{formatDate(reservation.date)} · {formatTimeRange(reservation.start_time, reservation.end_time)}</p>
              <p className="mt-1 text-xs font-medium text-workroom-muted">{reservation.pass_name_snapshot || reservation.pass_type}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={badge(reservation.payment_status === "paid" ? "mint" : reservation.payment_status === "refunded" ? "lilac" : "yellow")}>{reservation.payment_status === "paid" ? "결제완료" : reservation.payment_status === "refunded" ? "환불" : "미결제"}</span>
              <StatusBadge status={reservation.status} />
            </div>
          </Link>
        ))}
        {!reservations.length ? <p className={`${cardFlat} p-3 text-sm text-workroom-muted`}>예약 이력이 없습니다.</p> : null}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 font-black">최근 출석</h3>
          <div className="grid gap-2">
            {attendance.slice(0, 8).map((item) => <p className={`${cardFlat} p-3 text-sm font-bold`} key={item.id}>{dateTimeLabel(item.check_in_at)}{item.check_out_at ? ` → ${timeLabel(item.check_out_at)}` : " · 이용 중"}</p>)}
            {!attendance.length ? <p className={`${cardFlat} p-3 text-sm text-workroom-muted`}>출석 이력이 없습니다.</p> : null}
          </div>
        </div>
        <div>
          <h3 className="mb-2 font-black">쿠폰 이력</h3>
          <div className="grid gap-2">
            {coupons.slice(0, 8).map((coupon) => <div className={`${cardFlat} flex items-center justify-between gap-2 p-3 text-sm`} key={coupon.id}><div><p className="font-bold">{coupon.label}</p><p className="text-xs text-workroom-muted">{coupon.code}</p></div><span className={badge(coupon.status === "issued" ? "yellow" : "lilac")}>{coupon.status === "issued" ? "사용 가능" : "사용 완료"}</span></div>)}
            {!coupons.length ? <p className={`${cardFlat} p-3 text-sm text-workroom-muted`}>쿠폰 이력이 없습니다.</p> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className={`${tintCard("sky")} p-3`}><p className="text-xs font-bold text-workroom-muted">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>;
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
