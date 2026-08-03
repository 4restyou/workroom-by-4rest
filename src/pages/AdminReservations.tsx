import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AdminPage, { AdminFeedback, AdminTabs } from "../components/AdminPage";
import ManualReservationForm from "../components/admin/ManualReservationForm";
import ReservationCard from "../components/admin/ReservationCard";
import ReservationListItem from "../components/admin/ReservationListItem";
import { downloadCsv } from "../lib/csv";
import { formatDate, formatPrice, statusLabel, todayValue } from "../lib/format";
import { refundReservationPayment } from "../lib/portone";
import { isLongTermReservation, reservationCoversDate } from "../lib/reservations";
import { ALL_WEEKDAYS, openWeekdaysFromRows } from "../lib/businessHours";
import { PASS_COLUMNS } from "../lib/columns";
import { supabase } from "../lib/supabase";
import { useFeedbackToast } from "../lib/useFeedbackToast";
import { useOverlayBackClose } from "../lib/useOverlayBackClose";
import type {
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
import { confirmDialog } from "../lib/confirm";
import { useSession } from "../lib/sessionContext";
import {
  getConflictCount,
  isReservationStatus,
  paymentStatusLabels,
  shiftMonth,
  statusOptions,
  statusTabs,
} from "../lib/adminReservations";
import type { ReservationEdit } from "../lib/adminReservations";

type ReservationView = "today" | "upcoming" | "past" | "pending" | "longterm" | "all";



export default function AdminReservations() {
  const { status: sessionStatus, isSignedIn, isAdmin } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reservationParam = searchParams.get("reservation");
  const statusParam = searchParams.get("status");
  const dateParam = searchParams.get("date");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [passes, setPasses] = useState<Pass[]>([]);
  // 영업 요일(휴무가 아닌 요일). 월권·주간권 기본 이용 요일에서 휴무일을 제외한다.
  const [openWeekdays, setOpenWeekdays] = useState<number[]>(ALL_WEEKDAYS);
  // 장기 이용 탭: 기본은 이번 달에 걸친 이용권만 본다("" = 전체 기간).
  const [longTermMonth, setLongTermMonth] = useState(() => todayValue().slice(0, 7));
  const [showCreate, setShowCreate] = useState(false);
  const [dateFilter, setDateFilter] = useState(dateParam ?? (reservationParam || statusParam ? "" : todayValue()));
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ReservationStatus>(isReservationStatus(statusParam) ? statusParam : "all");
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived">("active");
  const [viewMode, setViewMode] = useState<ReservationView>(statusParam === "pending" ? "pending" : reservationParam ? "all" : "today");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(Boolean(reservationParam));
  useOverlayBackClose(mobileDetailOpen, () => setMobileDetailOpen(false));
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<ReservationInquiry[]>([]);
  const [auditLogs, setAuditLogs] = useState<ReservationAuditLog[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<ReservationPaymentLog[]>([]);
  const [smsLogs, setSmsLogs] = useState<ReservationSmsLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useFeedbackToast(success, error);

  useEffect(() => {
    // 세션·권한은 SessionProvider가 이미 읽어 뒀다(RequireAdmin도 같은 값을 본다).
    if (sessionStatus !== "ready") return;

    async function checkSessionAndLoad() {
      if (!supabase) {
        setError("Supabase 환경 변수가 아직 연결되지 않았습니다.");
        setIsLoading(false);
        return;
      }
      if (!isSignedIn) {
        navigate("/admin", { replace: true });
        return;
      }
      if (!isAdmin) {
        navigate("/account", { replace: true });
        return;
      }

      await loadReservations();
    }

    void checkSessionAndLoad();
  }, [sessionStatus, isSignedIn, isAdmin, navigate]);

  async function loadReservations() {
    if (!supabase) return;
    setIsLoading(true);
    setError("");

    const [{ data, error: loadError }, { data: passRows }, { data: hourRows }] = await Promise.all([
      // 이 화면은 목록과 상세 편집이 같은 배열을 쓴다. 상세 카드가 관리자 메모·
      // 결제수단·요청사항까지 편집하므로 여기서는 전체 컬럼이 필요하다.
      // (목록만 쓰는 화면은 lib/columns의 좁은 목록을 사용한다.)
      supabase.from("reservations").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
      supabase.from("passes").select(PASS_COLUMNS).eq("is_active", true).order("sort_order"),
      supabase.from("business_hours").select("weekday,is_closed"),
    ]);

    setIsLoading(false);

    if (loadError) {
      setError(loadError.message);
      return;
    }

    setReservations(data ?? []);
    setPasses((passRows ?? []) as Pass[]);
    if (hourRows?.length) {
      setOpenWeekdays(openWeekdaysFromRows(hourRows as { weekday: number; is_closed: boolean }[]));
    }
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
      .filter((reservation) => {
        // 이용 기간이 선택한 달과 하루라도 겹치면 그 달의 이용자로 본다.
        if (viewMode !== "longterm" || !longTermMonth) return true;
        const start = reservation.access_start_date ?? reservation.date;
        const end = reservation.access_end_date ?? reservation.date;
        return start.slice(0, 7) <= longTermMonth && end.slice(0, 7) >= longTermMonth;
      })
      .filter((reservation) => (viewMode === "today" ? reservation.status !== "canceled" && reservation.status !== "no_show" : true))
      .filter((reservation) => {
        // 예정: 오늘 이후 진행 예정(대기·확정) / 지난: 오늘보다 이전에 끝난 예약
        if (viewMode !== "upcoming" && viewMode !== "past") return true;
        const today = todayValue();
        const end = reservation.access_end_date ?? reservation.date;
        if (viewMode === "upcoming") {
          return end >= today && (reservation.status === "pending" || reservation.status === "confirmed");
        }
        return end < today;
      })
      .filter((reservation) => {
        if (!q) return true;
        const nameMatch = reservation.name.toLowerCase().includes(q);
        const phoneMatch = qDigits.length > 0 && reservation.phone.replace(/\D/g, "").includes(qDigits);
        return nameMatch || phoneMatch;
      });
  }, [archiveFilter, dateFilter, longTermMonth, query, reservations, viewMode]);

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(statusOptions.map((status) => [status, 0])) as Record<ReservationStatus, number>;
    statusBaseReservations.forEach((reservation) => {
      counts[reservation.status] += 1;
    });
    return counts;
  }, [statusBaseReservations]);

  const visibleReservations = useMemo(() => {
    const today = todayValue();
    // 지난 예약은 최근이 위로, 나머지는 가까운 날짜가 위로.
    const past = viewMode === "past";
    return statusBaseReservations
      .filter((reservation) => (statusFilter === "all" ? true : reservation.status === statusFilter))
      .sort((a, b) => {
        if (!past) {
          const aPending = a.status === "pending" ? 0 : 1;
          const bPending = b.status === "pending" ? 0 : 1;
          if (aPending !== bPending) return aPending - bPending;
        }
        if (dateFilter) return (a.start_time ?? "").localeCompare(b.start_time ?? "");
        const aKey = `${a.access_start_date ?? a.date} ${a.start_time ?? ""}`;
        const bKey = `${b.access_start_date ?? b.date} ${b.start_time ?? ""}`;
        if (past) return bKey.localeCompare(aKey);
        const aFuture = (a.access_end_date ?? a.date) >= today ? 0 : 1;
        const bFuture = (b.access_end_date ?? b.date) >= today ? 0 : 1;
        if (aFuture !== bFuture) return aFuture - bFuture;
        return aKey.localeCompare(bKey);
      });
  }, [dateFilter, statusBaseReservations, statusFilter, viewMode]);

  // 특정 이용일 필터가 없을 때는 이용일(장기는 시작일)별로 묶어 헤더를 붙인다.
  const groupedReservations = useMemo(() => {
    if (dateFilter) return [{ key: "all", label: "", items: visibleReservations }];
    const map = new Map<string, Reservation[]>();
    for (const reservation of visibleReservations) {
      const day = reservation.access_start_date ?? reservation.date;
      const list = map.get(day) ?? [];
      list.push(reservation);
      map.set(day, list);
    }
    return Array.from(map.entries()).map(([day, items]) => ({
      key: day,
      label: formatDate(day),
      items,
    }));
  }, [dateFilter, visibleReservations]);

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
    // 돈이 즉시 되돌아가고 취소할 수 없는 동작이라, 금액을 직접 입력해야 열린다.
    const amount = reservation.price_at_booking ?? 0;
    const confirmedRefund = await confirmDialog({
      title: `${reservation.name}님에게 ${formatPrice(amount)}을 환불할까요?`,
      description: "카드 승인 취소가 즉시 실행되며 되돌릴 수 없습니다.",
      confirmLabel: "환불 실행",
      tone: "danger",
      requireTyped: String(amount),
    });
    if (!confirmedRefund) return;
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
    const target = reservations.find((item) => item.id === id);
    // 상태가 바뀔 때만 고객에게 문자가 나간다(DB 트리거). 이미 끝난 예약은
    // 상태를 건드리지 않고 숨기기만 해서 엉뚱한 '취소' 문자를 막는다.
    const willCancel = target?.status === "pending" || target?.status === "confirmed";
    const confirmed = await confirmDialog({
      title: "예약을 보관 처리할까요?",
      description: willCancel
        ? "목록에서 숨겨지고 상태가 취소로 바뀝니다.\n고객에게 취소 문자가 발송됩니다."
        : "목록에서만 숨겨지고 상태는 그대로 유지됩니다.",
      confirmLabel: "보관",
      tone: willCancel ? "danger" : "default",
    });
    if (!confirmed) return;

    const deletedAt = new Date().toISOString();
    const patch = willCancel ? { status: "canceled" as const, deleted_at: deletedAt } : { deleted_at: deletedAt };
    const { error: archiveError } = await supabase.from("reservations").update(patch).eq("id", id);
    if (archiveError) {
      setError(archiveError.message);
      return;
    }
    setReservations((current) =>
      current.map((reservation) => (reservation.id === id ? { ...reservation, ...patch } : reservation)),
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
    } else if (next === "upcoming" || next === "past") {
      setDateFilter("");
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
      openWeekdays={openWeekdays}
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
              { value: "upcoming", label: "예정", count: reservations.filter((item) => !item.deleted_at && (item.access_end_date ?? item.date) >= todayValue() && (item.status === "pending" || item.status === "confirmed")).length },
              { value: "pending", label: "확인 대기", count: pendingCount },
              {
                value: "longterm",
                label: "장기 이용",
                // 뱃지도 현재 보고 있는 달 기준으로 맞춘다(목록과 숫자가 어긋나지 않도록).
                count: reservations.filter((item) => {
                  if (item.deleted_at || item.status !== "confirmed" || !isLongTermReservation(item)) return false;
                  if (!longTermMonth) return true;
                  const start = item.access_start_date ?? item.date;
                  const end = item.access_end_date ?? item.date;
                  return start.slice(0, 7) <= longTermMonth && end.slice(0, 7) >= longTermMonth;
                }).length,
              },
              { value: "past", label: "지난 예약" },
              { value: "all", label: "전체" },
            ]}
            onChange={changeView}
            value={viewMode}
          />
          {/* 장기 이용은 기간 이용권이라 전부 나열하면 지난 회원까지 쌓인다.
              기본은 이번 달에 걸친 이용자만 보고, 달 이동·전체 보기를 제공한다. */}
          {viewMode === "longterm" ? (
            <div className="flex flex-wrap items-center gap-1.5 py-3">
              <button
                aria-label="이전 달"
                className={buttonClass("secondary", "sm", "px-3")}
                disabled={!longTermMonth}
                onClick={() => setLongTermMonth((current) => shiftMonth(current, -1))}
                type="button"
              >
                ‹
              </button>
              <div className="grid h-[38px] min-w-[120px] place-items-center rounded-[6px] border border-workroom-ink bg-white px-3 text-sm font-bold tabular-nums">
                {longTermMonth ? `${longTermMonth.slice(0, 4)}년 ${Number(longTermMonth.slice(5, 7))}월` : "전체 기간"}
              </div>
              <button
                aria-label="다음 달"
                className={buttonClass("secondary", "sm", "px-3")}
                disabled={!longTermMonth}
                onClick={() => setLongTermMonth((current) => shiftMonth(current, 1))}
                type="button"
              >
                ›
              </button>
              <button className={buttonClass("secondary", "sm")} onClick={() => setLongTermMonth(todayValue().slice(0, 7))} type="button">
                이번 달
              </button>
              <button
                className={buttonClass(longTermMonth ? "secondary" : "accent", "sm")}
                onClick={() => setLongTermMonth((current) => (current ? "" : todayValue().slice(0, 7)))}
                type="button"
              >
                {longTermMonth ? "전체 보기" : "전체 기간 보는 중"}
              </button>
            </div>
          ) : null}
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
              {groupedReservations.map((group) => (
                <div key={group.key}>
                  {group.label ? (
                    <p className="sticky top-0 z-[1] border-b border-workroom-line bg-[#f3f0e8] px-4 py-1.5 text-xs font-black text-workroom-ink">
                      {group.label} <span className="text-workroom-muted">· {group.items.length}건</span>
                    </p>
                  ) : null}
                  {group.items.map((reservation) => (
                    <ReservationListItem
                      isSelected={reservation.id === selectedReservationId}
                      key={reservation.id}
                      onSelect={() => { setSelectedReservationId(reservation.id); setMobileDetailOpen(true); }}
                      reservation={reservation}
                    />
                  ))}
                </div>
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
            <div className="mx-auto max-w-2xl p-3 pb-24">
              {/* 오버레이가 화면을 덮으므로 피드백도 안에서 한 번 더 보여준다. */}
              <AdminFeedback error={error} success={success} />
              {reservationCard}
            </div>
          </div>
        ) : null}
      </div>
    </AdminPage>
  );
}
