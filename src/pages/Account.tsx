import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Section from "../components/Section";
import StatusBadge from "../components/StatusBadge";
import MemberReservationDashboard from "../components/MemberReservationDashboard";
import AccountProfileForm from "../components/AccountProfileForm";
import { formatDate, formatPrice, formatTimeRange, maxBookingDateValue, passDurationHours, todayValue } from "../lib/format";
import { kstLongDateTime } from "../lib/datetime";
import { canCancelReservation, isRefundPending } from "../lib/paymentPolicy";
import { canPayOnline, canSubscribe, cancelOwnReservation, cancelSubscription, payReservation, subscribeMonthly } from "../lib/portone";
import { isLongTermReservation, passPeriodWeeks, readableReservationError } from "../lib/reservations";
import { ensureCurrentProfile } from "../lib/profiles";
import { SITE } from "../lib/site";
import { supabase } from "../lib/supabase";
import { useFeedbackToast } from "../lib/useFeedbackToast";
import { badge, buttonClass, card, cardFlat, tintCard } from "../lib/ui";
import type { Attendance, BusinessDateException, BusinessHour, Profile, Reservation, ReservationInquiry, ReservationStatus } from "../lib/types";
import { confirmDialog } from "../lib/confirm";

type AccountTab = "reservations" | "profile";

const tabLabels: Record<AccountTab, string> = {
  reservations: "예약현황",
  profile: "회원정보",
};

// 취소 가능 시점·환불 대기 판정은 lib/paymentPolicy에 모아 두고
// (서버·DB와 같은 기준) 여기서는 그대로 가져다 쓴다.
const canCancel = canCancelReservation;

const reservationStatusCardClass: Record<ReservationStatus, string> = {
  pending: "border-workroom-ink bg-workroom-yellow/25",
  confirmed: "border-workroom-ink bg-workroom-sky",
  canceled: "border-workroom-line bg-workroom-surface opacity-75",
  completed: "border-workroom-ink bg-workroom-surface",
  no_show: "border-workroom-ink bg-workroom-danger/70",
};

// 회원이 볼 수 있는 결제·환불 기록(migration 0038의 my_payment_receipts 뷰).
type PaymentReceipt = {
  id: string;
  reservation_id: string;
  // confirm: 단건 카드결제, subscribe: 정기결제 첫 회차, recurring: 4주마다 자동청구
  action: "confirm" | "refund" | "subscribe" | "recurring";
  amount: number | null;
  created_at: string;
};

type SubscriptionRow = {
  id: string;
  pass_name: string;
  amount: number;
  status: "active" | "paused" | "canceled";
  next_charge_at: string | null;
  method_label: string | null;
};

const reservationStatusMessage: Record<ReservationStatus, string> = {
  pending: "운영자 확인을 기다리고 있습니다.",
  confirmed: "예약이 확정되었습니다.",
  canceled: "취소된 예약입니다.",
  completed: "이용이 완료되었습니다.",
  no_show: "방문하지 않은 예약입니다.",
};

export default function Account() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [inquiries, setInquiries] = useState<ReservationInquiry[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([]);
  const [dateExceptions, setDateExceptions] = useState<BusinessDateException[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [inquiryDrafts, setInquiryDrafts] = useState<Record<string, string>>({});
  const [inquiryBusy, setInquiryBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ date: "", start_time: "", end_time: "" });
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [editingInquiryId, setEditingInquiryId] = useState<string | null>(null);
  const [inquiryEditDraft, setInquiryEditDraft] = useState("");
  const [oauthName, setOauthName] = useState("");
  const [activeTab, setActiveTab] = useState<AccountTab>(tabParam === "profile" ? "profile" : "reservations");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useFeedbackToast(success, error);


  const loadSubscriptions = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("subscriptions")
      .select("id,pass_name,amount,status,next_charge_at,method_label")
      .order("created_at", { ascending: false });
    setSubscriptions((data ?? []) as SubscriptionRow[]);
  }, []);

  // 결제 기록은 뷰가 아직 배포되지 않은 환경에서도 화면이 깨지지 않도록 조용히 비워 둔다.
  const loadReceipts = useCallback(async () => {
    if (!supabase) return;
    const { data, error: receiptError } = await supabase
      .from("my_payment_receipts")
      .select("id,reservation_id,action,amount,created_at")
      .order("created_at", { ascending: true });
    if (receiptError) return;
    setReceipts((data ?? []) as PaymentReceipt[]);
  }, []);

  useEffect(() => {
    async function loadAccount() {
      if (!supabase) {
        setError("서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요.");
        setIsLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }

      try {
        const loadedProfile = await ensureCurrentProfile();
        setProfile(loadedProfile);
        // 프로필에 이름이 아직 없으면 구글 계정 이름을 폼 기본값으로 넘긴다.
        setOauthName(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "");

        if (loadedProfile?.role === "admin") {
          setActiveTab("profile");
          setReservations([]);
          setInquiries([]);
        } else {
          const [reservationResult, inquiryResult, attendanceResult, hourResult, exceptionResult] = await Promise.all([
            supabase.from("reservations").select("*").eq("profile_id", user.id).order("date", { ascending: false }).order("created_at", { ascending: false }),
            supabase.from("reservation_inquiries").select("*").eq("profile_id", user.id).order("created_at", { ascending: true }),
            supabase.from("attendance").select("*").eq("profile_id", user.id).order("check_in_at", { ascending: false }),
            supabase.from("business_hours").select("*").order("weekday"),
            supabase.from("business_date_exceptions").select("*").order("date"),
          ]);

          if (reservationResult.error) throw reservationResult.error;
          setReservations((reservationResult.data ?? []) as Reservation[]);
          void loadSubscriptions();
          void loadReceipts();
          setInquiries((inquiryResult.data ?? []) as ReservationInquiry[]);
          setAttendance((attendanceResult.data ?? []) as Attendance[]);
          setBusinessHours((hourResult.data ?? []) as BusinessHour[]);
          setDateExceptions((exceptionResult.data ?? []) as BusinessDateException[]);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "내정보를 불러오지 못했습니다.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadAccount();
  }, [navigate, loadSubscriptions, loadReceipts]);

  async function cancelSub(id: string) {
    const ok = await confirmDialog({
      title: "정기결제를 해지할까요?",
      description: "이번 이용기간까지는 그대로 이용할 수 있어요.",
      confirmLabel: "해지",
      tone: "danger",
    });
    if (!ok) return;
    setError("");
    setActionBusy(`cancelsub-${id}`);
    const result = await cancelSubscription(id);
    setActionBusy(null);
    if (result.ok) {
      setSuccess(result.message);
      void loadSubscriptions();
    } else {
      setError(result.message);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (tabParam === "profile" || tabParam === "reservations") setActiveTab(tabParam);
  }, [tabParam]);

  useEffect(() => {
    if (profile?.role === "admin" && activeTab !== "profile") setActiveTab("profile");
  }, [activeTab, profile?.role]);

  const orderedReservations = useMemo(() => {
    const active = (reservation: Reservation) => reservation.status === "pending" || reservation.status === "confirmed";
    return [...reservations].sort((a, b) => {
      if (active(a) !== active(b)) return active(a) ? -1 : 1;
      if (active(a)) return `${a.access_start_date ?? a.date} ${a.start_time ?? ""}`.localeCompare(`${b.access_start_date ?? b.date} ${b.start_time ?? ""}`);
      return `${b.date} ${b.start_time ?? ""}`.localeCompare(`${a.date} ${a.start_time ?? ""}`);
    });
  }, [reservations]);

  // 진행 중 예약만 펼쳐 두고, 지난 이용은 접어서 페이지가 길어지지 않게 한다.
  const activeReservations = useMemo(
    () => orderedReservations.filter((item) => item.status === "pending" || item.status === "confirmed"),
    [orderedReservations],
  );
  const pastReservations = useMemo(
    () => orderedReservations.filter((item) => item.status !== "pending" && item.status !== "confirmed"),
    [orderedReservations],
  );

  const receiptsByReservation = useMemo(() => {
    const grouped = new Map<string, PaymentReceipt[]>();
    for (const receipt of receipts) {
      const list = grouped.get(receipt.reservation_id);
      if (list) list.push(receipt);
      else grouped.set(receipt.reservation_id, [receipt]);
    }
    return grouped;
  }, [receipts]);



  async function sendInquiry(reservationId: string) {
    if (!supabase || !profile) return;
    const body = (inquiryDrafts[reservationId] ?? "").trim();
    if (!body) return;

    setInquiryBusy(reservationId);
    const { data, error: inquiryError } = await supabase
      .from("reservation_inquiries")
      .insert({ reservation_id: reservationId, profile_id: profile.id, body })
      .select("*")
      .single();
    setInquiryBusy(null);

    if (inquiryError) {
      setError(inquiryError.message);
      return;
    }

    setInquiries((current) => [...current, data as ReservationInquiry]);
    setInquiryDrafts((current) => ({ ...current, [reservationId]: "" }));
  }

  function startEdit(reservation: Reservation) {
    setError("");
    setEditingId(reservation.id);
    setEditDraft({
      date: reservation.date,
      start_time: (reservation.start_time ?? "08:00").slice(0, 5),
      end_time: (reservation.end_time ?? "11:00").slice(0, 5),
    });
  }

  async function saveEdit(reservation: Reservation) {
    if (!supabase) return;
    setError("");

    // 저장하면 확정이 확인 대기로 돌아간다. 결제한 회원이 놀라지 않도록 먼저 알린다.
    if (reservation.status === "confirmed") {
      const paid = reservation.payment_status === "paid";
      const ok = await confirmDialog({
        title: "시간을 변경하면 다시 확인 대기가 됩니다",
        description: paid
          ? "결제 금액은 그대로 유지되며, 운영자 확인 후 다시 확정됩니다."
          : "운영자 확인 후 다시 확정됩니다.",
        confirmLabel: "변경 신청",
      });
      if (!ok) return;
    }

    // 저장 전에 기본 검증 — 서버 트리거까지 가기 전에 흔한 실수를 잡는다.
    if (!editDraft.date || !editDraft.start_time || !editDraft.end_time) {
      setError("날짜와 시간을 모두 입력해 주세요.");
      return;
    }
    if (editDraft.date < todayValue()) {
      setError("지난 날짜로는 변경할 수 없습니다.");
      return;
    }
    if (editDraft.date > maxBookingDateValue()) {
      setError("예약은 오늘부터 최대 2개월 이내까지 가능합니다.");
      return;
    }
    const passName = reservation.pass_name_snapshot || reservation.pass_type;
    const requiredHours = passDurationHours(passName);
    if (requiredHours) {
      const [sh, sm] = editDraft.start_time.slice(0, 5).split(":").map(Number);
      const [eh, em] = editDraft.end_time.slice(0, 5).split(":").map(Number);
      let span = eh * 60 + em - (sh * 60 + sm);
      if (span <= 0) span += 24 * 60;
      if (span !== requiredHours * 60) {
        setError(`${passName}은 ${requiredHours}시간 이용권이라 시작·종료 시간 간격이 ${requiredHours}시간이어야 해요.`);
        return;
      }
    }

    setActionBusy(reservation.id);
    const patch = { date: editDraft.date, start_time: editDraft.start_time, end_time: editDraft.end_time, status: "pending" as const };
    const { error: editError } = await supabase.from("reservations").update(patch).eq("id", reservation.id);
    setActionBusy(null);
    if (editError) {
      setError(readableReservationError(editError));
      return;
    }
    setReservations((current) => current.map((item) => (item.id === reservation.id ? { ...item, ...patch } : item)));
    setEditingId(null);
  }

  async function payNow(reservation: Reservation) {
    setError("");
    setActionBusy(`pay-${reservation.id}`);
    try {
      const result = await payReservation(reservation);
      if (result.ok) {
        setReservations((current) =>
          current.map((item) => (item.id === reservation.id ? { ...item, payment_status: "paid" as const, status: "confirmed" as const } : item)),
        );
        setSuccess(result.message);
        void loadReceipts();
      } else {
        setError(result.message);
      }
    } finally {
      setActionBusy(null);
    }
  }

  async function subscribeNow(reservation: Reservation) {
    setError("");
    setActionBusy(`sub-${reservation.id}`);
    try {
      const result = await subscribeMonthly(reservation);
      if (result.ok) {
        setReservations((current) =>
          current.map((item) => (item.id === reservation.id ? { ...item, payment_status: "paid" as const, status: "confirmed" as const } : item)),
        );
        setSuccess(result.message);
        void loadSubscriptions();
        void loadReceipts();
      } else {
        setError(result.message);
      }
    } catch (e) {
      setError(`정기결제 처리 중 오류: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionBusy(null);
    }
  }

  async function cancelReservation(reservation: Reservation) {
    if (!supabase) return;
    if (!canCancel(reservation)) {
      setError(
        isLongTermReservation(reservation)
          ? passPeriodWeeks(reservation.pass_name_snapshot || reservation.pass_type) <= 1
            ? "이용이 시작된 이용권은 화면에서 바로 해지할 수 없어요. 남은 일수만큼 일 단위로 환불해 드리니 운영자에게 문의해 주세요."
            : "이용이 시작된 이용권은 화면에서 바로 해지할 수 없어요. 남은 주에 해당하는 금액을 환불해 드리니 운영자에게 문의해 주세요."
          : "예약 시간이 지나 취소·환불이 불가합니다.",
      );
      return;
    }
    const wasPaid = reservation.payment_status === "paid";
    const ok = await confirmDialog({
      title: wasPaid ? `예약을 취소하고 ${formatPrice(reservation.price_at_booking ?? 0)}을 환불할까요?` : "예약을 취소할까요?",
      description: wasPaid ? "카드 승인 취소가 즉시 실행되며 되돌릴 수 없습니다." : "취소한 예약은 되돌릴 수 없습니다.",
      confirmLabel: wasPaid ? "취소하고 환불" : "예약 취소",
      cancelLabel: "닫기",
      tone: "danger",
    });
    if (!ok) return;
    setError("");
    setActionBusy(reservation.id);

    // 결제건은 서버에서 PortOne 환불까지 처리한다. 미결제 예약도 같은 경로로
    // 보내 취소 정책(본인 확인·시작시간)을 한 곳에서만 판정하게 한다.
    const result = await cancelOwnReservation(reservation.id);
    setActionBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setReservations((current) =>
      current.map((item) =>
        item.id === reservation.id
          ? { ...item, status: "canceled", payment_status: result.refunded ? "refunded" : item.payment_status }
          : item,
      ),
    );
    setSuccess(result.message);
    void loadReceipts();
  }

  async function saveInquiryEdit(inquiry: ReservationInquiry) {
    if (!supabase) return;
    const body = inquiryEditDraft.trim();
    if (!body) return;
    setActionBusy(inquiry.id);
    const { error: editError } = await supabase.from("reservation_inquiries").update({ body }).eq("id", inquiry.id);
    setActionBusy(null);
    if (editError) {
      setError(editError.message);
      return;
    }
    setInquiries((current) =>
      current.map((item) => (item.id === inquiry.id ? { ...item, body, edited_at: new Date().toISOString() } : item)),
    );
    setEditingInquiryId(null);
  }

  return (
    <main className="pb-16">
      <Section eyebrow={profile?.role === "admin" ? "Admin Account" : "My Page"} title={profile?.role === "admin" ? "관리자 계정" : "내정보"} accent="mint">
        {isLoading ? <p className={`${tintCard("yellow")} p-4 font-bold`}>내정보를 불러오는 중입니다.</p> : null}
        {error ? <p className={`mb-4 ${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}
        {success && activeTab === "reservations" ? <p className={`mb-4 ${tintCard("sky")} p-4 text-sm font-bold`}>{success}</p> : null}

        {!isLoading && profile ? (
          <div>
            <div className={`mb-5 flex flex-wrap gap-2 ${cardFlat} p-2`}>
              {((profile.role === "admin" ? ["profile"] : Object.keys(tabLabels)) as AccountTab[]).map((tab) => (
                <button
                  className={`rounded-[5px] border px-5 py-2.5 text-sm font-bold transition-colors ${
                    activeTab === tab
                      ? "border-workroom-ink bg-workroom-ink text-white"
                      : "border-transparent text-workroom-muted hover:text-workroom-ink"
                  }`}
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  type="button"
                >
                  {tabLabels[tab]}
                </button>
              ))}
            </div>

            {activeTab === "profile" ? (
              <AccountProfileForm fallbackName={oauthName} onProfileSaved={setProfile} profile={profile} />
            ) : null}

            {activeTab === "reservations" && profile.role !== "admin" ? (
              <>
              {!SITE.booking.onlinePaymentLive ? <p className={`mb-4 ${tintCard("yellow")} p-4 text-sm font-bold leading-6`}>{SITE.booking.paymentTestNotice}</p> : null}
              <MemberReservationDashboard attendance={attendance} businessHours={businessHours} dateExceptions={dateExceptions} now={now} reservations={reservations} />
              {subscriptions.some((sub) => sub.status !== "canceled") ? (
                <section className={`${card} p-5`}>
                  <h2 className="text-xl font-bold">정기결제</h2>
                  <div className="mt-4 grid gap-3">
                    {subscriptions.filter((sub) => sub.status !== "canceled").map((sub) => (
                      <div className={`${cardFlat} flex flex-wrap items-center justify-between gap-3 px-4 py-3`} key={sub.id}>
                        <div className="min-w-0">
                          <p className="text-sm font-bold">
                            {sub.pass_name} · 매월 {formatPrice(sub.amount)}
                            {sub.status === "paused" ? <span className={badge("danger", "ml-2")}>결제 실패·정지</span> : <span className={badge("mint", "ml-2")}>이용 중</span>}
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-workroom-muted">
                            {sub.method_label ? `${sub.method_label} · ` : ""}
                            {sub.next_charge_at ? `다음 결제 ${sub.next_charge_at}` : "다음 결제 예정 없음"}
                          </p>
                        </div>
                        <button
                          className={buttonClass("secondary", "sm")}
                          disabled={actionBusy === `cancelsub-${sub.id}`}
                          onClick={() => void cancelSub(sub.id)}
                          type="button"
                        >
                          {actionBusy === `cancelsub-${sub.id}` ? "해지 중…" : "정기결제 해지"}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              <section className={`${card} p-5`}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">전체 예약 내역</h2>
                  <Link className={buttonClass("accent", "sm")} to="/reserve">
                    예약하기
                  </Link>
                </div>
                <div className="mt-4 grid gap-3">
                  {reservations.length ? (
                    (() => {
                    const renderReservation = (reservation: Reservation) => {
                      const active = reservation.status === "pending" || reservation.status === "confirmed";
                      return (
                        <article className={`${cardFlat} ${reservationStatusCardClass[reservation.status]} border p-4`} key={reservation.id}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold">{reservation.pass_name_snapshot || reservation.pass_type}</p>
                              <p className="mt-1 text-sm font-medium text-workroom-muted">
                                {formatDate(reservation.date)} · {formatTimeRange(reservation.start_time, reservation.end_time)}
                              </p>
                            </div>
                            <StatusBadge status={reservation.status} />
                          </div>
                          <p className="mt-3 text-sm font-bold text-workroom-muted">
                            {reservation.status === "pending" && reservation.payment_preference === "online"
                              ? SITE.booking.onlinePaymentLive
                                ? "카드 결제를 완료하면 예약이 바로 확정됩니다."
                                : "운영자 확인 후 결제 링크를 보내드리거나 현장에서 결제하면 확정됩니다."
                              : reservationStatusMessage[reservation.status]}
                          </p>

                          {reservation.payment_status === "refunded" ? (
                            <div className="mt-3">
                              <span className={badge("lilac")}>환불완료</span>
                            </div>
                          ) : isRefundPending(reservation) ? (
                            <div className="mt-3">
                              <span className={badge("yellow")}>환불 처리 대기</span>
                              <p className="mt-1.5 text-xs font-medium leading-5 text-workroom-muted">
                                결제된 예약이 취소되어 운영자가 환불을 확인 중입니다. 환불이 완료되면 이곳에 표시됩니다.
                              </p>
                            </div>
                          ) : reservation.payment_status === "service" ? (
                            <div className="mt-3">
                              <span className={badge("sky")}>서비스 이용 · 결제 없음</span>
                            </div>
                          ) : null}

                          <PaymentReceipts
                            method={reservation.payment_method}
                            receipts={receiptsByReservation.get(reservation.id) ?? []}
                          />

                          {(reservation.status === "pending" || reservation.status === "confirmed") && reservation.payment_status !== "service" && (reservation.price_at_booking ?? 0) > 0 ? (
                            <div className="mt-3">
                              {reservation.payment_status === "paid" ? (
                                <span className={badge("mint")}>결제완료 · {formatPrice(reservation.price_at_booking ?? 0)}</span>
                              ) : canSubscribe(reservation) ? (
                                // 이번 회차 결제가 기본이고 자동결제는 선택지다. BC카드처럼 정기결제가
                                // 막힌 카드로 등록에 실패해도 회원이 그 자리에서 결제할 수 있어야 한다.
                                <div className="grid gap-2">
                                  <button
                                    className={buttonClass("accent", "md", "w-full sm:w-auto")}
                                    disabled={actionBusy === `pay-${reservation.id}`}
                                    onClick={() => void payNow(reservation)}
                                    type="button"
                                  >
                                    {actionBusy === `pay-${reservation.id}` ? "결제 진행 중…" : `카드로 결제하기 · ${formatPrice(reservation.price_at_booking ?? 0)}`}
                                  </button>
                                  <button
                                    className={buttonClass("secondary", "sm", "w-full sm:w-auto")}
                                    disabled={actionBusy === `sub-${reservation.id}`}
                                    onClick={() => void subscribeNow(reservation)}
                                    type="button"
                                  >
                                    {actionBusy === `sub-${reservation.id}` ? "카드 등록 중…" : "4주마다 자동결제로 등록"}
                                  </button>
                                  <p className="text-xs font-medium leading-5 text-workroom-muted">{SITE.booking.recurringHint}</p>
                                </div>
                              ) : canPayOnline(reservation) ? (
                                <div className="grid gap-2">
                                  <button
                                    className={buttonClass("accent", "md", "w-full sm:w-auto")}
                                    disabled={actionBusy === `pay-${reservation.id}`}
                                    onClick={() => void payNow(reservation)}
                                    type="button"
                                  >
                                    {actionBusy === `pay-${reservation.id}` ? "결제 진행 중…" : `카드로 결제하기 · ${formatPrice(reservation.price_at_booking ?? 0)}`}
                                  </button>
                                  <p className="text-xs font-medium text-workroom-muted">
                                    결제가 완료되면 예약도 바로 확정되고 확정 문자가 발송됩니다.
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs font-medium text-workroom-muted">
                                  현장 결제나 별도 확인이 필요한 예약은 운영자가 확인한 뒤 확정됩니다.
                                </p>
                              )}
                            </div>
                          ) : null}

                          {active ? (
                            editingId === reservation.id ? (
                              <div className="mt-4 grid gap-3 border-t-2 border-workroom-line pt-4">
                                <p className="text-sm font-bold">시간 수정 (저장하면 다시 확인 대기로 바뀝니다)</p>
                                <div className="grid gap-3 sm:grid-cols-3">
                                  <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                                    날짜
                                    <input
                                      type="date"
                                      min={todayValue()}
                                      max={maxBookingDateValue()}
                                      value={editDraft.date}
                                      onChange={(event) => setEditDraft((draft) => ({ ...draft, date: event.target.value }))}
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                                    시작
                                    <input
                                      type="time"
                                      value={editDraft.start_time}
                                      onChange={(event) => setEditDraft((draft) => ({ ...draft, start_time: event.target.value }))}
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                                    종료
                                    <input
                                      type="time"
                                      value={editDraft.end_time}
                                      onChange={(event) => setEditDraft((draft) => ({ ...draft, end_time: event.target.value }))}
                                    />
                                  </label>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    className={buttonClass("primary", "sm")}
                                    disabled={actionBusy === reservation.id}
                                    onClick={() => void saveEdit(reservation)}
                                    type="button"
                                  >
                                    {actionBusy === reservation.id ? "저장 중…" : "변경 신청"}
                                  </button>
                                  <button className={buttonClass("secondary", "sm")} onClick={() => setEditingId(null)} type="button">
                                    닫기
                                  </button>
                                </div>
                              </div>
                            ) : canCancel(reservation) ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button className={buttonClass("secondary", "sm")} onClick={() => startEdit(reservation)} type="button">
                                  시간 수정
                                </button>
                                <button
                                  className={buttonClass("secondary", "sm")}
                                  disabled={actionBusy === reservation.id}
                                  onClick={() => void cancelReservation(reservation)}
                                  type="button"
                                >
                                  {actionBusy === reservation.id
                                    ? "처리 중…"
                                    : reservation.payment_status === "paid"
                                      ? "예약 취소·환불"
                                      : "예약 취소"}
                                </button>
                              </div>
                            ) : (
                              <p className="mt-3 text-xs font-medium leading-5 text-workroom-muted">
                                {isLongTermReservation(reservation) ? (
                                  <>
                                    이용이 시작된 이용권입니다. 중도 해지 시{" "}
                                    {passPeriodWeeks(reservation.pass_name_snapshot || reservation.pass_type) <= 1
                                      ? "남은 일수만큼 일 단위로"
                                      : "주 단위로 정산해 남은 주에 해당하는 금액을"}{" "}
                                    환불해 드려요.{" "}
                                    <a className="font-bold underline underline-offset-2" href={`tel:${SITE.phone}`}>
                                      {SITE.phone}
                                    </a>
                                    로 문의해 주세요.
                                  </>
                                ) : (
                                  "예약 시간이 지나 취소·환불이 불가합니다."
                                )}
                              </p>
                            )
                          ) : null}

                          {reservation.status === "confirmed" ? (
                            <div className="mt-4 border-t-2 border-workroom-line pt-4">
                              <p className="text-sm font-bold">관리자에게 문의</p>
                              {inquiries
                                .filter((inquiry) => inquiry.reservation_id === reservation.id)
                                .map((inquiry) => (
                                  <div className={`${tintCard("mint")} mt-2 p-3`} key={inquiry.id}>
                                    {editingInquiryId === inquiry.id ? (
                                      <div className="grid gap-2">
                                        <textarea rows={2} value={inquiryEditDraft} onChange={(event) => setInquiryEditDraft(event.target.value)} />
                                        <div className="flex flex-wrap gap-2">
                                          <button
                                            className={buttonClass("primary", "sm")}
                                            disabled={actionBusy === inquiry.id || !inquiryEditDraft.trim()}
                                            onClick={() => void saveInquiryEdit(inquiry)}
                                            type="button"
                                          >
                                            저장
                                          </button>
                                          <button className={buttonClass("secondary", "sm")} onClick={() => setEditingInquiryId(null)} type="button">
                                            닫기
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <p className="whitespace-pre-wrap text-sm font-medium leading-6">{inquiry.body}</p>
                                        <p className="mt-1 text-xs font-medium text-workroom-muted">
                                          {formatDate(inquiry.created_at.slice(0, 10))} · 전달됨{inquiry.edited_at ? " · 수정됨" : ""}
                                        </p>
                                        {!inquiry.admin_reply ? (
                                          <button
                                            className="mt-1 text-xs font-bold underline underline-offset-2"
                                            onClick={() => {
                                              setEditingInquiryId(inquiry.id);
                                              setInquiryEditDraft(inquiry.body);
                                            }}
                                            type="button"
                                          >
                                            수정
                                          </button>
                                        ) : null}
                                        {inquiry.admin_reply ? (
                                          <div className="mt-2 rounded-xl border border-workroom-line bg-white p-2.5">
                                            <p className="text-xs font-bold">운영자 답변</p>
                                            <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-6">{inquiry.admin_reply}</p>
                                          </div>
                                        ) : null}
                                      </>
                                    )}
                                  </div>
                                ))}
                              <textarea
                                className="mt-2"
                                rows={2}
                                placeholder="확정된 예약에 대해 궁금한 점을 남겨 주세요."
                                value={inquiryDrafts[reservation.id] ?? ""}
                                onChange={(event) => setInquiryDrafts((current) => ({ ...current, [reservation.id]: event.target.value }))}
                              />
                              <button
                                className={buttonClass("primary", "sm", "mt-2")}
                                disabled={inquiryBusy === reservation.id || !(inquiryDrafts[reservation.id] ?? "").trim()}
                                onClick={() => void sendInquiry(reservation.id)}
                                type="button"
                              >
                                {inquiryBusy === reservation.id ? "보내는 중…" : "문의 보내기"}
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
                    };
                    return (
                      <>
                        {activeReservations.length ? (
                          activeReservations.map(renderReservation)
                        ) : (
                          <p className={`${cardFlat} px-4 py-3 text-sm font-medium text-workroom-muted`}>진행 중인 예약이 없습니다.</p>
                        )}
                        {pastReservations.length ? (
                          <details className={`${cardFlat} px-4 py-3`}>
                            <summary className="cursor-pointer text-sm font-bold text-workroom-muted">
                              지난 이용 {pastReservations.length}건 보기
                            </summary>
                            <div className="mt-3 grid gap-3">{pastReservations.map(renderReservation)}</div>
                          </details>
                        ) : null}
                      </>
                    );
                    })()
                  ) : (
                    <p className={`${cardFlat} px-4 py-3 text-sm font-medium text-workroom-muted`}>아직 예약 내역이 없습니다.</p>
                  )}
                </div>
              </section>
              </>
            ) : null}
          </div>
        ) : null}
      </Section>
    </main>
  );
}

// 결제·환불 기록. 예약 카드의 '결제완료' 배지만으로는 언제 얼마가 결제됐는지,
// 부분 환불이 있었는지 알 수 없어서 거래기록을 그대로 보여 준다.
const receiptActionLabel: Record<PaymentReceipt["action"], string> = {
  confirm: "결제",
  subscribe: "정기결제 첫 회차",
  recurring: "정기결제 자동청구",
  refund: "환불",
};

function PaymentReceipts({ method, receipts }: { method: string | null; receipts: PaymentReceipt[] }) {
  if (!receipts.length) return null;
  const paid = receipts.filter((item) => item.action !== "refund").reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const refunded = receipts.filter((item) => item.action === "refund").reduce((sum, item) => sum + (item.amount ?? 0), 0);

  return (
    <details className="mt-3 rounded-xl border border-workroom-line bg-white/70 px-3 py-2">
      <summary className="cursor-pointer text-xs font-bold text-workroom-muted">
        결제 내역 보기 · 결제 {formatPrice(paid)}
        {refunded > 0 ? ` · 환불 ${formatPrice(refunded)}` : ""}
      </summary>
      <ul className="mt-2 grid gap-1.5">
        {receipts.map((receipt) => (
          <li className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-medium" key={receipt.id}>
            <span className="font-bold">{receiptActionLabel[receipt.action] ?? "결제"}</span>
            <span className="text-workroom-muted">{kstLongDateTime(receipt.created_at)}</span>
            <span className="font-bold tabular-nums">
              {receipt.action === "refund" ? "-" : ""}
              {formatPrice(receipt.amount ?? 0)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] font-medium leading-5 text-workroom-muted">
        결제 수단 {method || "카드"} · 카드사 매출전표는 결제하신 카드사 앱·홈페이지에서 확인하실 수 있어요.
        {refunded > 0 ? " 환불 금액이 카드에 반영되기까지 카드사에 따라 3~5영업일이 걸릴 수 있어요." : ""}
      </p>
    </details>
  );
}
