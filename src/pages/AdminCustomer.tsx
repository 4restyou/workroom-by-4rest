import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AdminPage, { AdminEmpty, AdminFeedback } from "../components/AdminPage";
import StatusBadge from "../components/StatusBadge";
import { buildPaymentRequestMessage, smsEventLabel } from "../lib/adminReservations";
import { ATTENDANCE_COLUMNS, COUPON_COLUMNS, RESERVATION_LIST_COLUMNS } from "../lib/columns";
import { promptDialog } from "../lib/confirm";
import { summarizeCustomer } from "../lib/customer";
import { kstDate as kstDateShared, kstDateTime, kstTime, kstToday } from "../lib/datetime";
import { formatDate, formatPrice, formatTimeRange } from "../lib/format";
import { isLongTermReservation } from "../lib/reservations";
import type { RevenueLog } from "../lib/revenue";
import { supabase } from "../lib/supabase";
import { useFeedbackToast } from "../lib/useFeedbackToast";
import { badge, buttonClass, cardFlat, tintCard } from "../lib/ui";
import { useSession } from "../lib/sessionContext";
import type { Attendance, Coupon, Profile, Reservation, ReservationInquiry, ReservationSmsLog } from "../lib/types";

type PaymentLogRow = RevenueLog & { id: string; status: string; created_at: string; message: string | null };

/**
 * 고객 한 명을 한 화면에서 본다.
 *
 * 예전에는 이용권·방문은 회원 탭, 결제·환불·문자는 예약 탭, 오늘 입실 여부는
 * 입퇴실 탭에 있어서 손님 응대 중에 탭을 오가야 했다. 여기서는 그 조각을 모으고
 * 자주 쓰는 동작(결제 안내 복사·쿠폰 발급·연락)을 같은 자리에 둔다.
 */
export default function AdminCustomer() {
  const { profileId = "" } = useParams();
  const navigate = useNavigate();
  const { status: sessionStatus, isSignedIn, isAdmin } = useSession();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<PaymentLogRow[]>([]);
  const [smsLogs, setSmsLogs] = useState<ReservationSmsLog[]>([]);
  const [inquiries, setInquiries] = useState<ReservationInquiry[]>([]);
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useFeedbackToast(success, error);

  const load = useCallback(async () => {
    if (!supabase || !profileId) return;
    setIsLoading(true);
    const [profileResult, reservationResult, attendanceResult, couponResult, inquiryResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", profileId).maybeSingle(),
      supabase.from("reservations").select(RESERVATION_LIST_COLUMNS).eq("profile_id", profileId).order("date", { ascending: false }).limit(200),
      supabase.from("attendance").select(ATTENDANCE_COLUMNS).eq("profile_id", profileId).order("check_in_at", { ascending: false }).limit(300),
      supabase.from("coupons").select(COUPON_COLUMNS).eq("profile_id", profileId).order("issued_at", { ascending: false }).limit(50),
      supabase.from("reservation_inquiries").select("*").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(30),
    ]);

    if (profileResult.error || !profileResult.data) {
      setIsLoading(false);
      setError(profileResult.error?.message ?? "회원을 찾을 수 없습니다.");
      return;
    }

    const loadedReservations = (reservationResult.data ?? []) as Reservation[];
    setProfile(profileResult.data as Profile);
    setNote((profileResult.data as Profile).admin_note ?? "");
    setReservations(loadedReservations);
    setAttendance((attendanceResult.data ?? []) as Attendance[]);
    setCoupons((couponResult.data ?? []) as Coupon[]);
    setInquiries((inquiryResult.data ?? []) as ReservationInquiry[]);

    // 결제·문자 이력은 예약 단위로만 저장된다. 이 회원의 예약 id로 모아 온다.
    const ids = loadedReservations.map((item) => item.id);
    if (ids.length) {
      const [payments, sms] = await Promise.all([
        supabase.from("reservation_payment_logs").select("id,reservation_id,action,amount,status,created_at,message").in("reservation_id", ids).order("created_at", { ascending: false }).limit(200),
        supabase.from("reservation_sms_logs").select("*").in("reservation_id", ids).order("created_at", { ascending: false }).limit(100),
      ]);
      if (!payments.error) setPaymentLogs((payments.data ?? []) as unknown as PaymentLogRow[]);
      if (!sms.error) setSmsLogs((sms.data ?? []) as ReservationSmsLog[]);
    } else {
      setPaymentLogs([]);
      setSmsLogs([]);
    }

    setIsLoading(false);
    setError("");
  }, [profileId]);

  useEffect(() => {
    if (sessionStatus !== "ready") return;
    if (!supabase) { setError("Supabase 환경 변수가 연결되지 않았습니다."); setIsLoading(false); return; }
    if (!isSignedIn) { navigate("/admin", { replace: true }); return; }
    if (!isAdmin) { navigate("/account", { replace: true }); return; }
    void load();
  }, [sessionStatus, isSignedIn, isAdmin, navigate, load]);

  const today = kstToday();
  const summary = useMemo(
    () => summarizeCustomer(reservations, attendance, paymentLogs.filter((log) => log.status === "succeeded"), today, kstDateShared),
    [attendance, paymentLogs, reservations, today],
  );

  const activeCoupons = coupons.filter((item) => item.status === "issued");
  const checkedInToday = attendance.some((item) => kstDateShared(item.check_in_at) === today && !item.check_out_at);
  const upcoming = reservations.filter((item) => !item.deleted_at && item.date >= today && (item.status === "pending" || item.status === "confirmed"));
  const past = reservations.filter((item) => !item.deleted_at && !upcoming.includes(item));

  async function saveNote() {
    if (!supabase || !profile) return;
    setBusy("note");
    const { error: updateError } = await supabase.from("profiles").update({ admin_note: note.trim() || null }).eq("id", profile.id);
    setBusy(null);
    if (updateError) { setError(updateError.message); return; }
    setError("");
    setSuccess("메모를 저장했습니다.");
  }

  async function issueCoupon() {
    if (!supabase || !profile) return;
    const name = profile.full_name || "회원";
    const entered = await promptDialog({
      title: `${name}님에게 쿠폰을 발급할까요?`,
      description: "쿠폰 이름을 비워 두면 설정에 저장된 기본 보상명으로 발급됩니다.",
      confirmLabel: "발급",
      fields: [{ name: "label", label: "쿠폰 이름", defaultValue: "" }],
    });
    if (!entered) return;
    const label = (entered.label ?? "").trim();
    setBusy("coupon");
    const { data, error: rpcError } = await supabase.rpc("admin_issue_coupon", { p_profile_id: profile.id, p_label: label || null });
    const result = data as { ok?: boolean; message?: string; label?: string } | null;
    setBusy(null);
    if (rpcError || !result?.ok) { setError(result?.message ?? rpcError?.message ?? "쿠폰 발급에 실패했습니다."); return; }
    setError("");
    setSuccess(`'${result.label ?? (label || "보상")}' 쿠폰을 발급했어요 🎫`);
    await load();
  }

  async function copyPaymentMessage(reservation: Reservation) {
    await navigator.clipboard.writeText(buildPaymentRequestMessage(reservation));
    setError("");
    setSuccess("결제 안내 문구를 복사했어요. 문자에 붙여넣어 주세요.");
  }

  if (isLoading) return <AdminPage title="고객"><AdminEmpty>불러오는 중입니다.</AdminEmpty></AdminPage>;
  if (!profile) return <AdminPage title="고객"><AdminEmpty>{error || "회원을 찾을 수 없습니다."}</AdminEmpty></AdminPage>;

  const name = profile.full_name || "이름 미입력";

  return (
    <AdminPage
      actions={
        <>
          {profile.phone ? <a className={buttonClass("secondary", "md")} href={`tel:${profile.phone}`}>전화</a> : null}
          {profile.phone ? <a className={buttonClass("secondary", "md")} href={`sms:${profile.phone}`}>문자</a> : null}
          <button className={buttonClass("secondary", "md")} disabled={busy === "coupon"} onClick={() => void issueCoupon()} type="button">쿠폰 발급</button>
        </>
      }
      description={
        <>
          {profile.phone ?? "연락처 없음"}
          {profile.email ? ` · ${profile.email}` : ""}
          {` · 가입 ${formatDate(kstDateShared(profile.created_at))}`}
        </>
      }
      title={name}
    >
      <div className="admin-compact">
        <AdminFeedback error={error} success={success} />

        {/* 응대 중에 제일 먼저 눈에 들어와야 하는 줄. */}
        <section className="grid grid-cols-2 border-y border-workroom-line bg-white lg:grid-cols-4">
          <Cell
            label="현재 이용권"
            value={summary.activePass ? (summary.activePass.pass_name_snapshot || summary.activePass.pass_type) : "없음"}
            sub={summary.passDaysLeft !== null ? `${summary.passDaysLeft}일 남음 · ${formatDate(summary.activePass?.access_end_date ?? "")}까지` : undefined}
            tone={summary.passDaysLeft !== null && summary.passDaysLeft <= 3 ? "yellow" : undefined}
          />
          <Cell
            label="다음 예약"
            value={summary.nextReservation ? formatDate(summary.nextReservation.date) : "없음"}
            sub={summary.nextReservation ? `${summary.nextReservation.pass_name_snapshot || summary.nextReservation.pass_type} · ${formatTimeRange(summary.nextReservation.start_time, summary.nextReservation.end_time)}` : undefined}
          />
          <Cell
            label="미수금"
            value={summary.unpaidAmount ? formatPrice(summary.unpaidAmount) : "없음"}
            tone={summary.unpaidAmount > 0 ? "danger" : undefined}
          />
          <Cell
            label="방문"
            value={`${summary.visitCount}회`}
            sub={summary.lastVisit ? `마지막 ${formatDate(summary.lastVisit)} · ${summary.daysSinceLastVisit}일 전` : "방문 기록 없음"}
            tone={summary.daysSinceLastVisit !== null && summary.daysSinceLastVisit >= 30 ? "yellow" : undefined}
          />
        </section>

        <div className="mt-3 flex flex-wrap gap-2">
          {checkedInToday ? <span className={badge("ink")}>지금 이용 중</span> : null}
          {activeCoupons.length ? <span className={badge("yellow")}>사용 가능 쿠폰 {activeCoupons.length}장</span> : null}
          <span className={badge("sky")}>누적 결제 {formatPrice(summary.netPaid)}</span>
          {summary.totalRefunded > 0 ? <span className={badge("lilac")}>환불 {formatPrice(summary.totalRefunded)}</span> : null}
        </div>

        <Section title={`예정된 예약 ${upcoming.length}건`}>
          {upcoming.length ? (
            <div className="border-y border-workroom-line bg-white">
              {upcoming.map((reservation) => (
                <div className="admin-row flex flex-wrap items-center justify-between gap-3 px-4 py-3.5" key={reservation.id}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {isLongTermReservation(reservation)
                        ? `${formatDate(reservation.access_start_date ?? reservation.date)} – ${formatDate(reservation.access_end_date ?? reservation.date)}`
                        : `${formatDate(reservation.date)} ${formatTimeRange(reservation.start_time, reservation.end_time)}`}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-workroom-muted">
                      {reservation.pass_name_snapshot || reservation.pass_type} · {reservation.people}명
                      {reservation.price_at_booking ? ` · ${formatPrice(reservation.price_at_booking)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={reservation.status} />
                    {(reservation.payment_status ?? "unpaid") === "unpaid" ? (
                      <button className={buttonClass("secondary", "sm")} onClick={() => void copyPaymentMessage(reservation)} type="button">결제 안내 복사</button>
                    ) : null}
                    <Link className={buttonClass("secondary", "sm")} to={`/admin/reservations?reservation=${reservation.id}`}>상세</Link>
                  </div>
                </div>
              ))}
            </div>
          ) : <AdminEmpty>예정된 예약이 없습니다.</AdminEmpty>}
        </Section>

        <Section title="결제·환불 이력">
          {paymentLogs.filter((log) => log.status === "succeeded").length ? (
            <div className="border-y border-workroom-line bg-white">
              {paymentLogs.filter((log) => log.status === "succeeded").map((log) => (
                <div className="admin-row flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm" key={log.id}>
                  <span className="font-semibold">{log.action === "refund" ? "환불" : log.action === "recurring" ? "정기결제 자동청구" : log.action === "subscribe" ? "정기결제 첫 회차" : "결제"}</span>
                  <span className="text-xs font-medium text-workroom-muted">{kstDateTime(log.created_at)}</span>
                  <span className="font-bold tabular-nums">{log.action === "refund" ? "-" : ""}{formatPrice(log.amount ?? 0)}</span>
                </div>
              ))}
            </div>
          ) : <AdminEmpty>결제 이력이 없습니다. (현장 결제는 기록이 남지 않습니다)</AdminEmpty>}
        </Section>

        <Section title={`방문 기록 ${attendance.length}회`}>
          {attendance.length ? (
            <div className="border-y border-workroom-line bg-white">
              {attendance.slice(0, 12).map((row) => (
                <div className="admin-row flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm" key={row.id}>
                  <span className="font-semibold">{formatDate(kstDateShared(row.check_in_at))}</span>
                  <span className="font-medium tabular-nums text-workroom-muted">
                    {kstTime(row.check_in_at)} 입실{row.check_out_at ? ` · ${kstTime(row.check_out_at)} 퇴실` : " · 이용 중"}
                  </span>
                </div>
              ))}
              {attendance.length > 12 ? <p className="px-4 py-2.5 text-xs font-medium text-workroom-muted">외 {attendance.length - 12}회</p> : null}
            </div>
          ) : <AdminEmpty>방문 기록이 없습니다.</AdminEmpty>}
        </Section>

        {inquiries.length ? (
          <Section title={`문의 ${inquiries.length}건`}>
            <div className="grid gap-2">
              {inquiries.map((inquiry) => (
                <div className={`${cardFlat} p-3`} key={inquiry.id}>
                  <p className="whitespace-pre-wrap text-sm font-medium leading-6">{inquiry.body}</p>
                  <p className="mt-1 text-xs font-medium text-workroom-muted">{kstDateTime(inquiry.created_at)}</p>
                  {inquiry.admin_reply ? (
                    <p className="mt-2 border-t border-workroom-line pt-2 text-sm font-medium leading-6">답변: {inquiry.admin_reply}</p>
                  ) : (
                    <span className={badge("yellow", "mt-2")}>답변 대기</span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {smsLogs.length ? (
          <Section title="문자 이력">
            <div className="border-y border-workroom-line bg-white">
              {smsLogs.slice(0, 10).map((log) => (
                <div className="admin-row flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm" key={log.id}>
                  <span className="font-semibold">{smsEventLabel(log.event)}</span>
                  <span className="text-xs font-medium text-workroom-muted">{kstDateTime(log.created_at)}</span>
                  <span className={badge(log.status === "succeeded" ? "sky" : log.status === "failed" ? "danger" : "yellow")}>
                    {log.status === "succeeded" ? "발송" : log.status === "failed" ? "실패" : "발송 안 함"}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        <Section title="지난 예약">
          {past.length ? (
            <details className={`${cardFlat} px-4 py-3`}>
              <summary className="cursor-pointer text-sm font-semibold text-workroom-muted">{past.length}건 보기</summary>
              <div className="mt-2 grid gap-1.5">
                {past.map((reservation) => (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm" key={reservation.id}>
                    <span className="font-medium">{formatDate(reservation.date)} · {reservation.pass_name_snapshot || reservation.pass_type}</span>
                    <StatusBadge status={reservation.status} />
                  </div>
                ))}
              </div>
            </details>
          ) : <AdminEmpty>지난 예약이 없습니다.</AdminEmpty>}
        </Section>

        <Section title="관리자 메모">
          <div className={`${tintCard("sky")} p-4`}>
            <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="좌석 선호, 특이사항 등 (회원에게 보이지 않습니다)" />
            <button className={buttonClass("primary", "sm", "mt-2")} disabled={busy === "note" || note === (profile.admin_note ?? "")} onClick={() => void saveNote()} type="button">
              {busy === "note" ? "저장 중…" : "메모 저장"}
            </button>
          </div>
        </Section>
      </div>
    </AdminPage>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="mt-7">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Cell({ label, sub, tone, value }: { label: string; sub?: string; tone?: "yellow" | "danger"; value: string }) {
  const background = tone === "danger" ? "bg-workroom-danger/40" : tone === "yellow" ? "bg-workroom-yellow/40" : "";
  return (
    <div className={`border-b border-r border-workroom-line px-4 py-3.5 last:border-r-0 even:border-r-0 lg:border-b-0 lg:even:border-r lg:last:border-r-0 ${background}`}>
      <p className="text-xs font-semibold text-workroom-muted">{label}</p>
      <p className="mt-1 truncate text-lg font-bold">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[11px] font-medium text-workroom-muted">{sub}</p> : null}
    </div>
  );
}
