import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AdminPage, { AdminFeedback, AdminTabs } from "../components/AdminPage";
import StatusBadge from "../components/StatusBadge";
import { downloadCsv } from "../lib/csv";
import { formatDate, formatPrice, formatTimeRange, statusLabel, todayValue } from "../lib/format";
import { getCurrentProfile } from "../lib/profiles";
import { refundReservationPayment } from "../lib/portone";
import { isLongTermReservation, reservationCoversDate } from "../lib/reservations";
import { supabase } from "../lib/supabase";
import type {
  PaymentStatus,
  Pass,
  Reservation,
  ReservationAuditLog,
  ReservationInquiry,
  ReservationPaymentLog,
  ReservationSmsLog,
  ReservationStatus,
  ReservationInsert,
} from "../lib/types";
import { buttonClass, card, tintCard } from "../lib/ui";

const statusOptions: ReservationStatus[] = ["pending", "confirmed", "canceled", "completed", "no_show"];
const statusTabs: ("all" | ReservationStatus)[] = ["pending", "confirmed", "all", "canceled", "completed", "no_show"];
const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: "미결제",
  paid: "결제완료",
  refunded: "환불",
  service: "서비스",
};
const paymentStatusOptions: PaymentStatus[] = ["unpaid", "paid", "refunded", "service"];
type ReservationView = "today" | "pending" | "longterm" | "all";

type ReservationEdit = {
  status: ReservationStatus;
  payment_method: string | null;
  payment_status: PaymentStatus;
  payment_preference: "online" | "onsite";
  admin_note: string;
  name: string;
  phone: string;
  email: string | null;
  pass_type: string;
  pass_id: string | null;
  pass_name_snapshot: string;
  price_at_booking: number | null;
  seat_type_id: string | null;
  access_start_date: string | null;
  access_end_date: string | null;
  access_weekdays: number[] | null;
  access_paused_from: string | null;
  access_paused_until: string | null;
  date: string;
  start_time: string;
  end_time: string;
  people: number;
};

function isReservationStatus(value: string | null): value is ReservationStatus {
  return Boolean(value && statusOptions.includes(value as ReservationStatus));
}

export default function AdminReservations() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reservationParam = searchParams.get("reservation");
  const statusParam = searchParams.get("status");
  const dateParam = searchParams.get("date");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [dateFilter, setDateFilter] = useState(dateParam ?? (reservationParam || statusParam ? "" : todayValue()));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ReservationStatus>(isReservationStatus(statusParam) ? statusParam : "all");
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived">("active");
  const [viewMode, setViewMode] = useState<ReservationView>(statusParam === "pending" ? "pending" : reservationParam ? "all" : "today");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(Boolean(reservationParam));
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<ReservationInquiry[]>([]);
  const [auditLogs, setAuditLogs] = useState<ReservationAuditLog[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<ReservationPaymentLog[]>([]);
  const [smsLogs, setSmsLogs] = useState<ReservationSmsLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function checkSessionAndLoad() {
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

      await loadReservations();
    }

    void checkSessionAndLoad();
  }, [navigate]);

  async function loadReservations() {
    if (!supabase) return;
    setIsLoading(true);
    setError("");

    const [{ data, error: loadError }, { data: passRows }] = await Promise.all([
      supabase.from("reservations").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
      supabase.from("passes").select("id,name,description,price,seat_type_id,is_active,sort_order").eq("is_active", true).order("sort_order"),
    ]);

    setIsLoading(false);

    if (loadError) {
      setError(loadError.message);
      return;
    }

    setReservations(data ?? []);
    setPasses((passRows ?? []) as Pass[]);
  }

  async function createManualReservation(payload: ReservationInsert) {
    if (!supabase) return;
    const { data, error: insertError } = await supabase.from("reservations").insert(payload).select("*").single();
    if (insertError || !data) {
      setError(insertError?.message ?? "예약을 등록하지 못했습니다.");
      return;
    }
    const created = data as Reservation;
    setReservations((current) => [...current, created]);
    setDateFilter("");
    setStatusFilter(created.status);
    setArchiveFilter("active");
    setSelectedReservationId(created.id);
    setShowCreate(false);
    setError("");
    setSuccess("예약을 등록했습니다.");
  }

  const statusBaseReservations = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return reservations
      .filter((reservation) => (archiveFilter === "archived" ? Boolean(reservation.deleted_at) : !reservation.deleted_at))
      .filter((reservation) => (dateFilter ? reservationCoversDate(reservation, dateFilter) : true))
      .filter((reservation) => (viewMode === "longterm" ? isLongTermReservation(reservation) : true))
      .filter((reservation) => (viewMode === "today" ? reservation.status !== "canceled" && reservation.status !== "no_show" : true))
      .filter((reservation) => {
        if (!q) return true;
        const nameMatch = reservation.name.toLowerCase().includes(q);
        const phoneMatch = qDigits.length > 0 && reservation.phone.replace(/\D/g, "").includes(qDigits);
        return nameMatch || phoneMatch;
      });
  }, [archiveFilter, dateFilter, query, reservations, viewMode]);

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(statusOptions.map((status) => [status, 0])) as Record<ReservationStatus, number>;
    statusBaseReservations.forEach((reservation) => {
      counts[reservation.status] += 1;
    });
    return counts;
  }, [statusBaseReservations]);

  const visibleReservations = useMemo(() => {
    const today = todayValue();
    return statusBaseReservations
      .filter((reservation) => (statusFilter === "all" ? true : reservation.status === statusFilter))
      .sort((a, b) => {
        const aPending = a.status === "pending" ? 0 : 1;
        const bPending = b.status === "pending" ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        if (dateFilter) return (a.start_time ?? "").localeCompare(b.start_time ?? "");
        const aFuture = a.date >= today ? 0 : 1;
        const bFuture = b.date >= today ? 0 : 1;
        if (aFuture !== bFuture) return aFuture - bFuture;
        return `${a.date} ${a.start_time ?? ""}`.localeCompare(`${b.date} ${b.start_time ?? ""}`);
      });
  }, [dateFilter, statusBaseReservations, statusFilter]);

  useEffect(() => {
    if (!visibleReservations.length) {
      setSelectedReservationId(null);
      return;
    }

    const selectedStillVisible = visibleReservations.some((reservation) => reservation.id === selectedReservationId);
    if (!selectedStillVisible) {
      setSelectedReservationId(visibleReservations[0].id);
    }
  }, [selectedReservationId, visibleReservations]);

  // Deep link from a notification: open the specific reservation.
  useEffect(() => {
    if (!reservationParam) return;
    const reservation = reservations.find((item) => item.id === reservationParam);
    if (reservation) {
      setDateFilter("");
      setStatusFilter("all");
      setQuery("");
      setArchiveFilter(reservation.deleted_at ? "archived" : "active");
      setViewMode("all");
      setSelectedReservationId(reservationParam);
      setMobileDetailOpen(true);
    }
  }, [reservationParam, reservations]);

  useEffect(() => {
    if (reservationParam) return;
    setStatusFilter(isReservationStatus(statusParam) ? statusParam : "all");
    setDateFilter(dateParam ?? (statusParam ? "" : todayValue()));
    setViewMode(statusParam === "pending" ? "pending" : dateParam ? "today" : statusParam ? "all" : "today");
  }, [dateParam, reservationParam, statusParam]);

  useEffect(() => {
    async function loadInquiries() {
      if (!supabase || !selectedReservationId) {
        setInquiries([]);
        return;
      }
      const { data } = await supabase
        .from("reservation_inquiries")
        .select("*")
        .eq("reservation_id", selectedReservationId)
        .order("created_at", { ascending: true });
      setInquiries((data ?? []) as ReservationInquiry[]);
    }

    void loadInquiries();
  }, [selectedReservationId]);

  useEffect(() => {
    async function loadSmsLogs() {
      if (!supabase || !selectedReservationId) {
        setSmsLogs([]);
        return;
      }
      const { data } = await supabase
        .from("reservation_sms_logs")
        .select("*")
        .eq("reservation_id", selectedReservationId)
        .order("created_at", { ascending: false })
        .limit(30);
      setSmsLogs((data ?? []) as ReservationSmsLog[]);
    }

    void loadSmsLogs();
  }, [selectedReservationId]);

  useEffect(() => {
    async function loadAuditLogs() {
      if (!supabase || !selectedReservationId) {
        setAuditLogs([]);
        return;
      }
      const { data } = await supabase
        .from("reservation_audit_logs")
        .select("*")
        .eq("reservation_id", selectedReservationId)
        .order("created_at", { ascending: false })
        .limit(20);
      setAuditLogs((data ?? []) as ReservationAuditLog[]);
    }

    void loadAuditLogs();
  }, [selectedReservationId]);

  useEffect(() => {
    async function loadPaymentLogs() {
      if (!supabase || !selectedReservationId) {
        setPaymentLogs([]);
        return;
      }
      const { data } = await supabase
        .from("reservation_payment_logs")
        .select("*")
        .eq("reservation_id", selectedReservationId)
        .order("created_at", { ascending: false })
        .limit(20);
      setPaymentLogs((data ?? []) as ReservationPaymentLog[]);
    }

    void loadPaymentLogs();
  }, [selectedReservationId]);

  async function saveReservation(id: string, payload: ReservationEdit) {
    if (!supabase) return;
    const { data: updatedReservation, error: updateError } = await supabase.from("reservations").update(payload).eq("id", id).select("*").single();
    if (updateError || !updatedReservation) {
      setError(updateError?.message ?? "예약 변경사항을 확인하지 못했습니다.");
      return;
    }
    setError("");
    setSuccess("예약 변경사항을 저장했습니다.");
    setReservations((current) => current.map((reservation) => (reservation.id === id ? updatedReservation as Reservation : reservation)));
    const { data } = await supabase
      .from("reservation_audit_logs")
      .select("*")
      .eq("reservation_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    setAuditLogs((data ?? []) as ReservationAuditLog[]);
  }

  async function patchReservation(id: string, payload: Partial<Reservation>) {
    if (!supabase) return;
    const { data: updatedReservation, error: updateError } = await supabase.from("reservations").update(payload).eq("id", id).select("*").single();
    if (updateError || !updatedReservation) {
      setError(updateError?.message ?? "처리 결과를 확인하지 못했습니다.");
      return;
    }
    setError("");
    setSuccess("처리 상태를 변경했습니다.");
    setReservations((current) => current.map((reservation) => (reservation.id === id ? updatedReservation as Reservation : reservation)));
  }

  // 포트원으로 결제된 예약의 실제 PG 환불. 성공하면 payment_status가 refunded로 바뀐다.
  async function refundViaPortone(reservation: Reservation) {
    const reason = window.prompt("환불 사유를 입력해 주세요. (고객 안내에 사용)", "예약 취소에 따른 환불");
    if (reason === null) return;
    if (!window.confirm(`${reservation.name}님의 결제 ${formatPrice(reservation.price_at_booking ?? 0)}을 환불할까요?\n카드 승인 취소가 즉시 실행됩니다.`)) return;
    const result = await refundReservationPayment(reservation.id, reason);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError("");
    setSuccess(result.message);
    setReservations((current) => current.map((item) => (item.id === reservation.id ? { ...item, payment_status: "refunded" as const } : item)));
  }

  async function resendStatusSms(reservation: Reservation, kind: "confirmed" | "canceled") {
    if (!supabase) return;
    const { error: invokeError } = await supabase.functions.invoke("admin-reservation-sms", {
      body: { reservationId: reservation.id, kind },
    });
    if (invokeError) {
      setError("문자 재전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const { data } = await supabase
      .from("reservation_sms_logs")
      .select("*")
      .eq("reservation_id", reservation.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setSmsLogs((data ?? []) as ReservationSmsLog[]);
    setError("");
    setSuccess("문자를 재전송했습니다.");
  }

  async function archiveReservation(id: string) {
    if (!supabase) return;
    const confirmed = window.confirm("예약을 보관 처리할까요? 목록에서는 숨겨지고 상태는 취소로 바뀝니다.");
    if (!confirmed) return;

    const { error: archiveError } = await supabase
      .from("reservations")
      .update({ status: "canceled", deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (archiveError) {
      setError(archiveError.message);
      return;
    }
    const deletedAt = new Date().toISOString();
    setReservations((current) =>
      current.map((reservation) => (reservation.id === id ? { ...reservation, status: "canceled", deleted_at: deletedAt } : reservation)),
    );
    setArchiveFilter("archived");
    setSelectedReservationId(id);
  }

  async function replyInquiry(inquiryId: string, reply: string) {
    if (!supabase || !reply.trim()) return;
    const repliedAt = new Date().toISOString();
    const { error: replyError } = await supabase
      .from("reservation_inquiries")
      .update({ admin_reply: reply.trim(), replied_at: repliedAt })
      .eq("id", inquiryId);
    if (replyError) {
      setError(replyError.message);
      return;
    }
    setInquiries((current) =>
      current.map((inquiry) => (inquiry.id === inquiryId ? { ...inquiry, admin_reply: reply.trim(), replied_at: repliedAt } : inquiry)),
    );
  }

  const pendingCount = reservations.filter((reservation) => !reservation.deleted_at && reservation.status === "pending").length;
  const selectedReservation = visibleReservations.find((reservation) => reservation.id === selectedReservationId) ?? null;
  const selectedDateConfirmed = dateFilter
    ? statusBaseReservations.filter((reservation) => reservation.status === "confirmed")
    : [];
  const selectedDateLongTerm = selectedDateConfirmed.filter(isLongTermReservation);
  const selectedDatePeople = selectedDateConfirmed.reduce((sum, reservation) => sum + reservation.people, 0);

  function changeView(next: ReservationView) {
    setViewMode(next);
    setArchiveFilter("active");
    if (next === "today") {
      setDateFilter(todayValue());
      setStatusFilter("all");
    } else if (next === "pending") {
      setDateFilter("");
      setStatusFilter("pending");
    } else if (next === "longterm") {
      setDateFilter("");
      setStatusFilter("confirmed");
    } else {
      setDateFilter("");
      setStatusFilter("all");
    }
  }

  function exportReservations() {
    downloadCsv(
      `workroom-reservations-${todayValue()}.csv`,
      ["이용일", "이용기간 시작", "이용기간 종료", "시작", "종료", "이름", "연락처", "이용권", "인원", "예약상태", "결제선택", "결제상태", "예약금액", "요청사항", "관리자메모"],
      visibleReservations.map((reservation) => [
        dateFilter && reservationCoversDate(reservation, dateFilter) ? dateFilter : reservation.date,
        reservation.access_start_date ?? reservation.date,
        reservation.access_end_date ?? reservation.date,
        reservation.start_time,
        reservation.end_time,
        reservation.name,
        reservation.phone,
        reservation.pass_name_snapshot || reservation.pass_type,
        reservation.people,
        statusLabel[reservation.status],
        reservation.payment_preference === "onsite" ? "방문 결제" : "온라인 결제",
        paymentStatusLabels[reservation.payment_status ?? "unpaid"],
        reservation.price_at_booking,
        reservation.message,
        reservation.admin_note,
      ]),
    );
  }

  const reservationCard = selectedReservation ? (
    <ReservationCard
      conflictCount={getConflictCount(selectedReservation, reservations)}
      auditLogs={auditLogs}
      paymentLogs={paymentLogs}
      smsLogs={smsLogs}
      passes={passes}
      isArchived={Boolean(selectedReservation.deleted_at)}
      key={selectedReservation.id}
      reservation={selectedReservation}
      inquiries={inquiries}
      onArchive={() => void archiveReservation(selectedReservation.id)}
      onReply={(inquiryId, reply) => void replyInquiry(inquiryId, reply)}
      onSave={(payload) => void saveReservation(selectedReservation.id, payload)}
      onPatch={(payload) => void patchReservation(selectedReservation.id, payload)}
      onPortoneRefund={() => void refundViaPortone(selectedReservation)}
      onResendSms={(kind) => void resendStatusSms(selectedReservation, kind)}
    />
  ) : null;

  return (
    <AdminPage
      actions={
        <>
          <button className={buttonClass("secondary", "md")} disabled={!visibleReservations.length} onClick={exportReservations} type="button">CSV 저장</button>
          <button className={buttonClass("accent", "md")} onClick={() => setShowCreate((current) => !current)} type="button">
            {showCreate ? "등록 닫기" : "예약 등록"}
          </button>
        </>
      }
      description="오늘 이용 현황을 기본으로 표시합니다. 월권·주간권도 이용일에 맞춰 포함됩니다."
      title="예약"
    >
      <div className="admin-compact">
        {showCreate ? <ManualReservationForm onSubmit={(payload) => void createManualReservation(payload)} passes={passes} /> : null}
        <div className="mb-4 bg-white px-3 pt-1 border-y border-workroom-line">
          <AdminTabs
            items={[
              { value: "today", label: "오늘 운영", count: reservations.filter((item) => !item.deleted_at && reservationCoversDate(item, todayValue()) && item.status !== "canceled" && item.status !== "no_show").length },
              { value: "pending", label: "확인 대기", count: pendingCount },
              { value: "longterm", label: "장기 이용", count: reservations.filter((item) => !item.deleted_at && item.status === "confirmed" && isLongTermReservation(item)).length },
              { value: "all", label: "전체·지난 예약" },
            ]}
            onChange={changeView}
            value={viewMode}
          />
          <div className="grid gap-2 py-3 sm:grid-cols-[1fr_170px_auto_auto] sm:items-end">
            <label className="grid gap-1 text-xs font-semibold text-workroom-muted">이름·전화 검색<input placeholder="이름 또는 전화번호" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <label className="grid gap-1 text-xs font-semibold text-workroom-muted">이용일<input type="date" value={dateFilter} onChange={(event) => { setDateFilter(event.target.value); setViewMode(event.target.value === todayValue() ? "today" : "all"); }} /></label>
            <button className={buttonClass("secondary", "sm", "sm:h-[42px]")} onClick={() => void loadReservations()} type="button">새로고침</button>
            <button className={buttonClass("secondary", "sm", "sm:h-[42px]")} onClick={() => { setArchiveFilter((current) => current === "active" ? "archived" : "active"); setViewMode("all"); }} type="button">{archiveFilter === "active" ? "보관 예약" : "진행 예약"}</button>
          </div>
          <details className="border-t border-workroom-line py-2">
            <summary className="cursor-pointer text-xs font-semibold text-workroom-muted">예약 상태로 더 좁히기</summary>
            <div className="mt-2 flex flex-wrap gap-1.5 pb-1">
              {statusTabs.map((status) => (
                <button className={`rounded-[4px] border px-2.5 py-1.5 text-xs font-semibold ${statusFilter === status ? "border-workroom-ink bg-workroom-ink text-white" : "border-workroom-line bg-white"}`} key={status} onClick={() => setStatusFilter(status)} type="button">
                  {status === "all" ? "전체" : statusLabel[status]} {status === "all" ? statusBaseReservations.length : statusCounts[status]}
                </button>
              ))}
            </div>
          </details>
        </div>

        {dateFilter ? <p className="mb-4 text-sm font-medium text-workroom-muted">{formatDate(dateFilter)} · 확정 {selectedDateConfirmed.length}건 · {selectedDatePeople}명 · 장기 이용 {selectedDateLongTerm.length}건</p> : null}

        {isLoading ? <p className={`${tintCard("yellow")} p-4 font-bold`}>예약을 불러오는 중입니다.</p> : null}
        <AdminFeedback error={error} success={success} />
        {!isLoading && !visibleReservations.length ? (
          <p className={`${card} mb-4 p-6 text-center font-bold`}>조건에 맞는 예약이 없습니다.</p>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
          <section className={`${card} p-3`}>
            <div className="mb-3 flex items-center justify-between gap-3 px-2">
              <h2 className="text-lg font-bold">{archiveFilter === "archived" ? "보관 예약" : "예약 목록"}</h2>
              <span className="text-sm font-bold text-workroom-muted">{visibleReservations.length}건</span>
            </div>
            <div className="overflow-hidden rounded-[6px] border border-workroom-line bg-white">
              {visibleReservations.map((reservation) => (
                <ReservationListItem
                  isSelected={reservation.id === selectedReservationId}
                  key={reservation.id}
                  onSelect={() => { setSelectedReservationId(reservation.id); setMobileDetailOpen(true); }}
                  reservation={reservation}
                />
              ))}
            </div>
          </section>

          <div className="hidden xl:block">{reservationCard ?? (
            <p className={`${card} p-6 text-center font-bold`}>
              왼쪽 목록에서 예약을 선택하면 상세가 표시됩니다.
            </p>
          )}</div>
        </div>
        {mobileDetailOpen && selectedReservation ? (
          <div className="fixed inset-0 z-[70] overflow-y-auto bg-workroom-background xl:hidden">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-workroom-ink bg-workroom-background px-4 py-3">
              <button className={buttonClass("secondary", "sm")} onClick={() => setMobileDetailOpen(false)} type="button">← 목록</button>
              <p className="text-sm font-semibold">예약 상세</p>
              <span className="w-[70px]" />
            </div>
            <div className="mx-auto max-w-2xl p-3 pb-24">{reservationCard}</div>
          </div>
        ) : null}
      </div>
    </AdminPage>
  );
}

function ReservationListItem({
  isSelected,
  onSelect,
  reservation,
}: {
  isSelected: boolean;
  onSelect: () => void;
  reservation: Reservation;
}) {
  const selectedClass = isSelected
    ? "bg-[#f3f0e8]"
    : "bg-white hover:bg-[#faf8f2]";
  const longTerm = isLongTermReservation(reservation);
  const periodStart = reservation.access_start_date ?? reservation.date;
  const periodEnd = reservation.access_end_date ?? reservation.date;
  const passName = reservation.pass_name_snapshot || reservation.pass_type;

  return (
    <button
      aria-pressed={isSelected}
      className={`group flex w-full items-center justify-between gap-3 border-b border-workroom-line px-4 py-3 text-left transition-colors last:border-b-0 ${selectedClass}`}
      onClick={onSelect}
      type="button"
    >
      <div className="min-w-0">
        <p className="truncate font-bold">{reservation.name}</p>
        <p className="mt-1 truncate text-xs font-medium text-workroom-muted">
          {longTerm
            ? `${formatCompactPeriod(periodStart, periodEnd)} · ${passName}`
            : `${formatCompactDate(reservation.date)} · ${formatTimeRange(reservation.start_time, reservation.end_time)} · ${passName}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={reservation.status} />
        <span aria-hidden="true" className="text-base text-workroom-muted transition-transform group-hover:translate-x-0.5">›</span>
      </div>
    </button>
  );
}

function formatCompactDate(value: string) {
  const [, month, day] = value.split("-").map(Number);
  return `${month}월 ${day}일`;
}

function formatCompactPeriod(start: string, end: string) {
  const [, startMonth, startDay] = start.split("-").map(Number);
  const [, endMonth, endDay] = end.split("-").map(Number);
  if (startMonth === endMonth) return `${startMonth}월 ${startDay}–${endDay}일`;
  return `${startMonth}월 ${startDay}일–${endMonth}월 ${endDay}일`;
}

function ManualReservationForm({ passes, onSubmit }: { passes: Pass[]; onSubmit: (payload: ReservationInsert) => void }) {
  const [draft, setDraft] = useState({
    name: "",
    phone: "",
    email: "",
    pass_type: "",
    date: todayValue(),
    start_time: "08:00",
    end_time: "11:00",
    people: 1,
    message: "",
    status: "confirmed" as "pending" | "confirmed",
    payment_preference: "onsite" as "online" | "onsite",
    payment_status: "unpaid" as PaymentStatus,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.phone.trim() || !draft.pass_type) return;
    const pass = passes.find((item) => item.name === draft.pass_type);
    onSubmit({
      profile_id: null,
      pass_id: pass?.id ?? null,
      pass_name_snapshot: pass?.name ?? draft.pass_type,
      price_at_booking: pass?.price ?? null,
      seat_type_id: pass?.seat_type_id ?? null,
      payment_preference: draft.payment_preference,
      payment_method: draft.payment_status === "service" ? "서비스" : draft.payment_preference === "onsite" ? "현장결제" : null,
      payment_status: draft.payment_status,
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim() || null,
      pass_type: draft.pass_type,
      date: draft.date,
      start_time: draft.start_time,
      end_time: draft.end_time,
      people: Number(draft.people),
      message: draft.message.trim(),
      status: draft.status,
    });
  }

  return (
    <form className={`${tintCard("sky")} mb-5 grid gap-4 p-5`} onSubmit={submit}>
      <div>
        <h2 className="text-lg font-black">관리자 예약 등록</h2>
        <p className="mt-1 text-xs font-medium text-workroom-muted">전화 예약이나 현장 방문 예약을 등록합니다.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">이름
          <input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">연락처
          <input required value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">이메일
          <input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">이용권
          <select required value={draft.pass_type} onChange={(event) => setDraft((current) => ({ ...current, pass_type: event.target.value }))}>
            <option value="">선택</option>
            {passes.map((pass) => <option key={pass.id} value={pass.name}>{pass.name}</option>)}
            <option value="기타 문의">기타 문의</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">날짜
          <input required type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">시작
          <input required type="time" value={draft.start_time} onChange={(event) => setDraft((current) => ({ ...current, start_time: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">종료
          <input required type="time" value={draft.end_time} onChange={(event) => setDraft((current) => ({ ...current, end_time: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">인원
          <input min={1} max={12} required type="number" value={draft.people} onChange={(event) => setDraft((current) => ({ ...current, people: Number(event.target.value) }))} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">예약 상태
          <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as "pending" | "confirmed" }))}>
            <option value="confirmed">확정</option>
            <option value="pending">확인 대기</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">결제 선택
          <select value={draft.payment_preference} onChange={(event) => setDraft((current) => ({ ...current, payment_preference: event.target.value as "online" | "onsite" }))}>
            <option value="onsite">방문 결제</option>
            <option value="online">온라인 결제</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">결제 상태
          <select value={draft.payment_status} onChange={(event) => setDraft((current) => ({ ...current, payment_status: event.target.value as PaymentStatus }))}>
            {paymentStatusOptions.filter((option) => option !== "refunded").map((option) => (
              <option key={option} value={option}>{paymentStatusLabels[option]}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-xs font-bold text-workroom-muted">고객 요청사항
        <textarea rows={2} value={draft.message} onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))} />
      </label>
      <button className={buttonClass("primary", "md", "w-full sm:w-auto sm:justify-self-start")} type="submit">예약 등록</button>
    </form>
  );
}

function ReservationCard({
  conflictCount,
  auditLogs,
  paymentLogs,
  smsLogs,
  passes,
  isArchived,
  reservation,
  inquiries,
  onArchive,
  onReply,
  onSave,
  onPatch,
  onPortoneRefund,
  onResendSms,
}: {
  conflictCount: number;
  auditLogs: ReservationAuditLog[];
  paymentLogs: ReservationPaymentLog[];
  smsLogs: ReservationSmsLog[];
  passes: Pass[];
  isArchived: boolean;
  reservation: Reservation;
  inquiries: ReservationInquiry[];
  onArchive: () => void;
  onReply: (inquiryId: string, reply: string) => void;
  onSave: (payload: ReservationEdit) => void;
  onPatch: (payload: Partial<Reservation>) => void;
  onPortoneRefund: () => void;
  onResendSms: (kind: "confirmed" | "canceled") => void;
}) {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<ReservationStatus>(reservation.status);
  const [note, setNote] = useState(reservation.admin_note ?? "");
  const [paymentMethod, setPaymentMethod] = useState(reservation.payment_method ?? "");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(reservation.payment_status ?? "unpaid");
  const [paymentPreference, setPaymentPreference] = useState<"online" | "onsite">(reservation.payment_preference ?? "online");
  const [bookingDraft, setBookingDraft] = useState({
    name: reservation.name,
    phone: reservation.phone,
    email: reservation.email ?? "",
    pass_type: reservation.pass_name_snapshot || reservation.pass_type,
    date: reservation.date,
    start_time: (reservation.start_time ?? "08:00").slice(0, 5),
    end_time: (reservation.end_time ?? "11:00").slice(0, 5),
    people: reservation.people,
  });
  const [accessDraft, setAccessDraft] = useState({
    start: reservation.access_start_date ?? reservation.date,
    end: reservation.access_end_date ?? reservation.date,
    weekdays: reservation.access_weekdays ?? [0, 1, 2, 3, 4, 5, 6],
    pausedFrom: reservation.access_paused_from ?? "",
    pausedUntil: reservation.access_paused_until ?? "",
  });
  const [copiedMessage, setCopiedMessage] = useState<"confirmed" | "canceled" | null>(null);

  useEffect(() => {
    setStatus(reservation.status);
    setNote(reservation.admin_note ?? "");
    setPaymentMethod(reservation.payment_method ?? "");
    setPaymentStatus(reservation.payment_status ?? "unpaid");
    setPaymentPreference(reservation.payment_preference ?? "online");
    setBookingDraft({
      name: reservation.name,
      phone: reservation.phone,
      email: reservation.email ?? "",
      pass_type: reservation.pass_name_snapshot || reservation.pass_type,
      date: reservation.date,
      start_time: (reservation.start_time ?? "08:00").slice(0, 5),
      end_time: (reservation.end_time ?? "11:00").slice(0, 5),
      people: reservation.people,
    });
    setAccessDraft({
      start: reservation.access_start_date ?? reservation.date,
      end: reservation.access_end_date ?? reservation.date,
      weekdays: reservation.access_weekdays ?? [0, 1, 2, 3, 4, 5, 6],
      pausedFrom: reservation.access_paused_from ?? "",
      pausedUntil: reservation.access_paused_until ?? "",
    });
  }, [reservation]);

  function save() {
    const selectedPass = passes.find((pass) => pass.name === bookingDraft.pass_type);
    const longTerm = bookingDraft.pass_type.includes("주간권") || bookingDraft.pass_type.includes("월권");
    onSave({
      status,
      payment_method: paymentStatus === "service" ? "서비스" : paymentMethod === "서비스" ? null : paymentMethod || null,
      payment_status: paymentStatus,
      payment_preference: paymentPreference,
      admin_note: note,
      name: bookingDraft.name.trim(),
      phone: bookingDraft.phone.trim(),
      email: bookingDraft.email.trim() || null,
      pass_type: bookingDraft.pass_type,
      pass_id: selectedPass?.id ?? null,
      pass_name_snapshot: selectedPass?.name ?? bookingDraft.pass_type,
      price_at_booking: selectedPass?.price ?? reservation.price_at_booking,
      seat_type_id: selectedPass?.seat_type_id ?? null,
      access_start_date: longTerm ? accessDraft.start : null,
      access_end_date: longTerm ? accessDraft.end : null,
      access_weekdays: longTerm ? accessDraft.weekdays : null,
      access_paused_from: longTerm && accessDraft.pausedFrom && accessDraft.pausedUntil ? accessDraft.pausedFrom : null,
      access_paused_until: longTerm && accessDraft.pausedFrom && accessDraft.pausedUntil ? accessDraft.pausedUntil : null,
      date: bookingDraft.date,
      start_time: bookingDraft.start_time,
      end_time: bookingDraft.end_time,
      people: Number(bookingDraft.people),
    });
  }

  async function copyMessage(kind: "confirmed" | "canceled") {
    const message = kind === "confirmed" ? buildConfirmedMessage(reservation) : buildCanceledMessage(reservation);
    await navigator.clipboard.writeText(message);
    setCopiedMessage(kind);
    window.setTimeout(() => setCopiedMessage(null), 1800);
  }

  return (
    <article className="rounded-[8px] border border-workroom-line bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold">{reservation.name}</h3>
          <a
            href={`tel:${reservation.phone}`}
            className="mt-1 inline-block text-sm font-bold text-workroom-ink underline underline-offset-2"
          >
            {reservation.phone}
          </a>
          {reservation.email ? <p className="text-sm font-medium text-workroom-muted">{reservation.email}</p> : null}
        </div>
        <div className="grid justify-items-end gap-1">
          <StatusBadge status={reservation.status} />
          {isArchived ? <span className="text-xs font-bold text-workroom-muted">보관됨</span> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a className={buttonClass("secondary", "sm")} href={`tel:${reservation.phone}`}>
          전화 걸기
        </a>
        <a className={buttonClass("secondary", "sm")} href={`sms:${reservation.phone}`}>
          문자 보내기
        </a>
        <details className="relative">
          <summary className={`${buttonClass("secondary", "sm")} list-none`}>안내 문구</summary>
          <div className="absolute left-0 top-[calc(100%+6px)] z-10 grid w-40 gap-1 border border-workroom-ink bg-white p-2">
            <button className={buttonClass("secondary", "sm")} onClick={() => void copyMessage("confirmed")} type="button">{copiedMessage === "confirmed" ? "복사됨" : "확정 문구 복사"}</button>
            <button className={buttonClass("secondary", "sm")} onClick={() => void copyMessage("canceled")} type="button">{copiedMessage === "canceled" ? "복사됨" : "취소 문구 복사"}</button>
          </div>
        </details>
      </div>

      {conflictCount > 0 ? (
        <p className={`${tintCard("yellow")} mt-4 p-3 text-sm font-bold`}>
          같은 시간대에 겹치는 예약이 {conflictCount}건 있습니다. 확정 전에 시간을 확인해 주세요.
        </p>
      ) : null}

      <div className="mt-4 border border-workroom-line border-l-[4px] border-l-workroom-yellow bg-workroom-background px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">결제 · {paymentWorkflowLabel(reservation)}</p>
            <p className="mt-1 text-xs font-medium leading-5 text-workroom-muted">{paymentWorkflowDescription(reservation)}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {reservation.payment_status === "unpaid" && reservation.status !== "canceled" ? (
            <button
              className={buttonClass("accent", "sm")}
              onClick={() => {
                if (window.confirm(`${reservation.name}님의 외부·현장 결제를 완료 처리할까요? 예약도 함께 확정됩니다.`)) {
                  onPatch({ payment_status: "paid", payment_method: reservation.payment_preference === "onsite" ? "현장결제" : "외부결제", status: "confirmed" });
                }
              }}
              type="button"
            >
              외부·현장 결제 완료
            </button>
          ) : null}
          {reservation.payment_status === "unpaid" && reservation.status !== "canceled" ? (
            <button
              className={buttonClass("secondary", "sm")}
              onClick={() => onPatch({ payment_status: "service", payment_method: "서비스", status: "confirmed" })}
              type="button"
            >
              서비스로 확정
            </button>
          ) : null}
          {reservation.status === "pending" && (reservation.payment_status === "paid" || reservation.payment_status === "service") ? (
            <button className={buttonClass("accent", "sm")} onClick={() => onPatch({ status: "confirmed" })} type="button">
              예약 확정
            </button>
          ) : null}
          {reservation.status === "confirmed" ? (
            <button className={buttonClass("primary", "sm")} onClick={() => onPatch({ status: "completed" })} type="button">
              이용 완료
            </button>
          ) : null}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-[86px_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="font-bold text-workroom-muted">이용권</dt>
        <dd className="font-bold">{reservation.pass_name_snapshot || reservation.pass_type}</dd>
        <dt className="font-bold text-workroom-muted">예약가</dt>
        <dd className="font-bold">{reservation.price_at_booking ? formatPrice(reservation.price_at_booking) : "-"}</dd>
        <dt className="font-bold text-workroom-muted">날짜</dt>
        <dd className="font-bold">{formatDate(reservation.date)}</dd>
        <dt className="font-bold text-workroom-muted">시간</dt>
        <dd className="font-bold">{formatTimeRange(reservation.start_time, reservation.end_time)}</dd>
        <dt className="font-bold text-workroom-muted">결제</dt>
        <dd className="font-bold">
          {paymentStatusLabels[reservation.payment_status ?? "unpaid"]}
          {reservation.payment_method ? ` / ${reservation.payment_method}` : ""}
        </dd>
        <dt className="font-bold text-workroom-muted">결제 선택</dt>
        <dd className="font-bold">{reservation.payment_preference === "onsite" ? "방문 결제" : "온라인 결제"}</dd>
        <dt className="font-bold text-workroom-muted">인원</dt>
        <dd className="font-bold">{reservation.people}명</dd>
        <dt className="font-bold text-workroom-muted">요청사항</dt>
        <dd className="whitespace-pre-wrap font-medium">{reservation.message || "-"}</dd>
      </dl>

      <details className="mt-5 rounded-card border border-workroom-line bg-white p-4">
        <summary className="cursor-pointer text-sm font-black">예약자·일정 수정</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-workroom-muted">이름
            <input value={bookingDraft.name} onChange={(event) => setBookingDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-workroom-muted">연락처
            <input value={bookingDraft.phone} onChange={(event) => setBookingDraft((current) => ({ ...current, phone: event.target.value }))} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-workroom-muted">이메일
            <input type="email" value={bookingDraft.email} onChange={(event) => setBookingDraft((current) => ({ ...current, email: event.target.value }))} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-workroom-muted">이용권
            <select value={bookingDraft.pass_type} onChange={(event) => setBookingDraft((current) => ({ ...current, pass_type: event.target.value }))}>
              {passes.map((pass) => <option key={pass.id} value={pass.name}>{pass.name}</option>)}
              <option value="기타 문의">기타 문의</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-workroom-muted">날짜
            <input type="date" value={bookingDraft.date} onChange={(event) => setBookingDraft((current) => ({ ...current, date: event.target.value }))} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-workroom-muted">인원
            <input min={1} max={12} type="number" value={bookingDraft.people} onChange={(event) => setBookingDraft((current) => ({ ...current, people: Number(event.target.value) }))} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-workroom-muted">시작
            <input type="time" value={bookingDraft.start_time} onChange={(event) => setBookingDraft((current) => ({ ...current, start_time: event.target.value }))} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-workroom-muted">종료
            <input type="time" value={bookingDraft.end_time} onChange={(event) => setBookingDraft((current) => ({ ...current, end_time: event.target.value }))} />
          </label>
        </div>
        <p className="mt-3 text-xs font-medium text-workroom-muted">수정한 내용은 아래 ‘변경사항 저장’을 눌러야 반영됩니다.</p>
      </details>

      {isLongTermReservation(reservation) ? (
        <details className="mt-3 rounded-card border border-workroom-line bg-white p-4" open>
          <summary className="cursor-pointer text-sm font-black">주간권·월권 이용기간</summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold text-workroom-muted">이용 시작일
              <input type="date" value={accessDraft.start} onChange={(event) => setAccessDraft((current) => ({ ...current, start: event.target.value }))} />
            </label>
            <label className="grid gap-1 text-xs font-bold text-workroom-muted">이용 종료일
              <input min={accessDraft.start} type="date" value={accessDraft.end} onChange={(event) => setAccessDraft((current) => ({ ...current, end: event.target.value }))} />
            </label>
          </div>
          <fieldset className="mt-3">
            <legend className="text-xs font-bold text-workroom-muted">이용 가능 요일</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {["일", "월", "화", "수", "목", "금", "토"].map((label, day) => (
                <label className={`flex cursor-pointer items-center gap-1 rounded-[5px] border px-2.5 py-2 text-xs font-bold ${accessDraft.weekdays.includes(day) ? "border-workroom-ink bg-workroom-yellow" : "border-workroom-line bg-workroom-surface"}`} key={label}>
                  <input
                    checked={accessDraft.weekdays.includes(day)}
                    className="h-4 w-4"
                    onChange={(event) => setAccessDraft((current) => ({
                      ...current,
                      weekdays: event.target.checked
                        ? [...current.weekdays, day].sort()
                        : current.weekdays.length > 1
                          ? current.weekdays.filter((item) => item !== day)
                          : current.weekdays,
                    }))}
                    type="checkbox"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold text-workroom-muted">일시정지 시작
              <input max={accessDraft.pausedUntil || undefined} type="date" value={accessDraft.pausedFrom} onChange={(event) => setAccessDraft((current) => ({ ...current, pausedFrom: event.target.value }))} />
            </label>
            <label className="grid gap-1 text-xs font-bold text-workroom-muted">일시정지 종료
              <input min={accessDraft.pausedFrom || undefined} type="date" value={accessDraft.pausedUntil} onChange={(event) => setAccessDraft((current) => ({ ...current, pausedUntil: event.target.value }))} />
            </label>
          </div>
          <p className="mt-3 text-xs font-medium text-workroom-muted">휴무일과 일시정지 날짜는 회원 달력에서 이용 불가로 표시됩니다.</p>
        </details>
      ) : null}

      {inquiries.length ? (
        <div className="mt-5">
          <p className="text-sm font-bold">회원 문의 {inquiries.length}건</p>
          <div className="mt-2 grid gap-3">
            {inquiries.map((inquiry) => {
              const draft = replyDrafts[inquiry.id] ?? inquiry.admin_reply ?? "";
              return (
                <div className={`${tintCard("lilac")} p-3`} key={inquiry.id}>
                  <p className="whitespace-pre-wrap text-sm font-medium leading-6">{inquiry.body}</p>
                  <p className="mt-1 text-xs font-medium text-workroom-muted">
                    {formatDate(inquiry.created_at.slice(0, 10))}
                    {inquiry.edited_at ? " · 회원이 수정함" : ""}
                  </p>
                  <div className="mt-2 grid gap-2">
                    <textarea
                      rows={2}
                      placeholder="답변을 입력하면 회원에게 알림이 전달됩니다."
                      value={draft}
                      onChange={(event) => setReplyDrafts((current) => ({ ...current, [inquiry.id]: event.target.value }))}
                    />
                    <button
                      className={buttonClass("primary", "sm")}
                      disabled={!draft.trim() || draft.trim() === (inquiry.admin_reply ?? "")}
                      onClick={() => onReply(inquiry.id, draft)}
                      type="button"
                    >
                      {inquiry.admin_reply ? "답변 수정" : "답변 저장"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <details className="mt-5 border-t border-workroom-line pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-workroom-muted">상태·결제 기록 직접 수정</summary>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-2 text-sm font-bold">
          상태 변경
          <select value={status} onChange={(event) => setStatus(event.target.value as ReservationStatus)}>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {statusLabel[option]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold">
            고객 선택
            <select value={paymentPreference} onChange={(event) => setPaymentPreference(event.target.value as "online" | "onsite")}>
              <option value="online">온라인 결제</option>
              <option value="onsite">방문 결제</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold">
            결제 방식
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              <option value="">미정</option>
              <option value="카드">카드</option>
              <option value="계좌이체">계좌이체</option>
              <option value="현장결제">현장결제</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold">
            결제 상태
            <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}>
              {paymentStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {paymentStatusLabels[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="grid gap-2 text-sm font-bold">
          관리자 메모
          <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <button className={buttonClass("primary", "lg")} onClick={save} type="button">
          변경사항 저장
        </button>
        {isArchived ? (
          <p className={`${tintCard("yellow")} p-3 text-sm font-bold`}>이 예약은 보관 처리되어 진행 예약 목록에서 숨겨져 있습니다.</p>
        ) : (
          <button className={buttonClass("secondary", "md")} onClick={onArchive} type="button">
            보관 처리
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-workroom-line pt-3">
        {reservation.status === "pending" || reservation.status === "confirmed" ? (
          <button className={buttonClass("secondary", "sm", "border-red-400")} onClick={() => { if (window.confirm(`${reservation.name}님 예약을 노쇼로 처리할까요?`)) onPatch({ status: "no_show" }); }} type="button">노쇼 처리</button>
        ) : null}
        {reservation.payment_status === "paid" && reservation.payment_key && (reservation.payment_method ?? "").includes("포트원") ? (
          <button className={buttonClass("secondary", "sm", "border-red-400")} onClick={onPortoneRefund} type="button">PG 환불 실행</button>
        ) : null}
      </div>
      </details>

      <details className="mt-5 border-t border-workroom-line pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-workroom-muted">문자·결제·변경 이력</summary>
        <div className="mt-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold">문자 발송 이력</p>
          <div className="flex flex-wrap gap-2">
            {reservation.status === "confirmed" ? (
              <button className={buttonClass("secondary", "sm")} onClick={() => onResendSms("confirmed")} type="button">확정 문자 재전송</button>
            ) : null}
            {reservation.status === "canceled" ? (
              <button className={buttonClass("secondary", "sm")} onClick={() => onResendSms("canceled")} type="button">취소 문자 재전송</button>
            ) : null}
          </div>
        </div>
        {smsLogs.length ? (
          <div className="mt-2 grid gap-2">
            {smsLogs.map((log) => (
              <div className={`${smsLogTint(log.status)} p-3 text-sm`} key={log.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{smsEventLabel(log.event)} · {smsStatusLabel(log.status)}</p>
                  <span className="text-xs font-bold text-workroom-muted">{formatAuditTime(log.created_at)}</span>
                </div>
                {log.error_message ? <p className="mt-1 text-xs font-medium text-workroom-muted">{log.error_message}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className={`${tintCard("yellow")} mt-2 p-3 text-sm font-bold`}>아직 기록된 문자 발송 이력이 없습니다.</p>
        )}
      </div>

      <div className="mt-5">
        <p className="text-sm font-bold">결제/환불 이력</p>
        {paymentLogs.length ? (
          <div className="mt-2 grid gap-2">
            {paymentLogs.map((log) => (
              <div className={`${paymentLogTint(log.status)} p-3 text-sm`} key={log.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{describePaymentLog(log)}</p>
                  <span className="text-xs font-bold text-workroom-muted">{formatAuditTime(log.created_at)}</span>
                </div>
                {log.message ? <p className="mt-1 text-xs font-medium text-workroom-muted">{log.message}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className={`${tintCard("yellow")} mt-2 p-3 text-sm font-bold`}>아직 결제/환불 이력이 없습니다.</p>
        )}
      </div>

      <div className="mt-5">
        <p className="text-sm font-bold">변경 이력</p>
        {auditLogs.length ? (
          <div className="mt-2 grid gap-2">
            {auditLogs.map((log) => (
              <div className={`${tintCard("mint")} p-3 text-sm`} key={log.id}>
                <p className="font-bold">{describeAuditLog(log)}</p>
                <p className="mt-1 text-xs font-medium text-workroom-muted">{formatAuditTime(log.created_at)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className={`${tintCard("yellow")} mt-2 p-3 text-sm font-bold`}>
            아직 기록된 변경 이력이 없습니다. 새로 저장하는 변경부터 기록됩니다.
          </p>
        )}
      </div>
        </div>
      </details>
    </article>
  );
}

function buildConfirmedMessage(reservation: Reservation) {
  const passName = reservation.pass_name_snapshot || reservation.pass_type;
  return [
    "[WORKROOM by 4REST]",
    `${reservation.name}님, 예약이 확정되었습니다.`,
    "",
    `이용권: ${passName}`,
    `일시: ${formatDate(reservation.date)} ${formatTimeRange(reservation.start_time, reservation.end_time)}`,
    `인원: ${reservation.people}명`,
    reservation.price_at_booking ? `금액: ${formatPrice(reservation.price_at_booking)}` : null,
    "",
    "결제와 이용 안내는 방문 전 다시 안내드릴게요.",
    "Out of office, Into Workroom.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCanceledMessage(reservation: Reservation) {
  const passName = reservation.pass_name_snapshot || reservation.pass_type;
  return [
    "[WORKROOM by 4REST]",
    `${reservation.name}님, 요청하신 예약은 현재 확정이 어렵습니다.`,
    "",
    `이용권: ${passName}`,
    `신청 일시: ${formatDate(reservation.date)} ${formatTimeRange(reservation.start_time, reservation.end_time)}`,
    "",
    "가능한 시간대를 다시 확인해 주시면 조정 도와드릴게요.",
  ].join("\n");
}

function describeAuditLog(log: ReservationAuditLog) {
  const changes: string[] = [];
  if (log.before_status !== log.after_status) {
    changes.push(`상태 ${labelStatus(log.before_status)} → ${labelStatus(log.after_status)}`);
  }
  if (log.before_payment_status !== log.after_payment_status) {
    changes.push(`결제 ${labelPayment(log.before_payment_status)} → ${labelPayment(log.after_payment_status)}`);
  }
  if (log.before_admin_note !== log.after_admin_note) {
    changes.push("관리자 메모 변경");
  }
  if (!changes.length && log.action === "archived") return "보관 처리";
  if (!changes.length) return "예약 정보 변경";
  return changes.join(" · ");
}

function describePaymentLog(log: ReservationPaymentLog) {
  const action = log.action === "confirm" ? "결제 승인" : "환불/취소";
  const status: Record<ReservationPaymentLog["status"], string> = {
    requested: "요청",
    succeeded: "성공",
    failed: "실패",
    skipped: "처리 제외",
  };
  const amount = log.amount ? ` · ${formatPrice(log.amount)}` : "";
  const code = log.provider_code ? ` · ${log.provider_code}` : "";
  return `${action} ${status[log.status]}${amount}${code}`;
}

function paymentLogTint(status: ReservationPaymentLog["status"]) {
  if (status === "succeeded") return tintCard("mint");
  if (status === "failed") return tintCard("danger");
  if (status === "skipped") return tintCard("yellow");
  return tintCard("lilac");
}

function paymentWorkflowLabel(reservation: Reservation) {
  if (reservation.payment_status === "service") return "서비스 이용";
  if (reservation.payment_status === "refunded") return "환불 완료";
  if (reservation.payment_status === "paid") return "결제 완료";
  if (reservation.status === "canceled") return "취소 · 환불 확인";
  if (reservation.payment_preference === "onsite") return "현장 결제 예정 (문의)";
  return "온라인 결제 대기";
}

function paymentWorkflowDescription(reservation: Reservation) {
  if (reservation.payment_status === "service") return "결제 없이 제공한 서비스 예약입니다. 매출과 미수금에 포함되지 않습니다.";
  if (reservation.payment_status === "paid") return `${reservation.payment_method || "결제"}로 완료 처리되었습니다.`;
  if (reservation.payment_status === "refunded") return "환불 완료로 기록된 예약입니다.";
  if (reservation.status === "canceled") return reservation.payment_status === "unpaid" ? "미결제 취소입니다." : "환불 처리가 필요한지 확인해 주세요.";
  if (reservation.payment_preference === "onsite") return "현장 결제(카드·현금) 예약입니다. 방문 전 문의로 협의해 주세요.";
  return "회원이 카드로 결제하면 결제완료와 예약확정이 함께 자동 반영됩니다.";
}

function smsEventLabel(event: string) {
  const labels: Record<string, string> = {
    reservation_received: "예약 접수 문자",
    admin_new_reservation: "관리자 새 예약 알림",
    reservation_confirmed: "예약 확정 문자",
    reservation_canceled: "예약 취소 문자",
    reservation_no_show: "노쇼 안내 문자",
    admin_cancellation: "관리자 취소 알림",
    admin_schedule_changed: "관리자 변경 알림",
    reservation_end_reminder: "종료 20분 전 안내",
    manual_confirmed: "확정 문자 재전송",
    manual_canceled: "취소 문자 재전송",
  };
  return labels[event] ?? event;
}

function smsStatusLabel(status: ReservationSmsLog["status"]) {
  return status === "succeeded" ? "발송 성공" : status === "failed" ? "발송 실패" : "발송 안 됨";
}

function smsLogTint(status: ReservationSmsLog["status"]) {
  if (status === "succeeded") return tintCard("mint");
  if (status === "failed") return tintCard("danger");
  return tintCard("yellow");
}

function labelStatus(status: ReservationStatus | null) {
  return status ? statusLabel[status] : "-";
}

function labelPayment(status: PaymentStatus | null) {
  return status ? paymentStatusLabels[status] : "-";
}

function formatAuditTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getConflictCount(target: Reservation, reservations: Reservation[]) {
  if (!target.start_time || !target.end_time) return 0;
  if (target.status === "canceled" || target.status === "completed" || target.status === "no_show" || target.deleted_at) return 0;

  return reservations.filter((reservation) => {
    if (reservation.id === target.id) return false;
    if (reservation.deleted_at) return false;
    if (reservation.date !== target.date) return false;
    if (!reservation.start_time || !reservation.end_time) return false;
    if (reservation.status === "canceled" || reservation.status === "completed" || reservation.status === "no_show") return false;

    return target.start_time! < reservation.end_time && target.end_time! > reservation.start_time;
  }).length;
}
