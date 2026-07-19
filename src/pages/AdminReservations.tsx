import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Section from "../components/Section";
import StatusBadge from "../components/StatusBadge";
import { formatDate, formatPrice, formatTimeRange, statusLabel, todayValue } from "../lib/format";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import type {
  PaymentStatus,
  Reservation,
  ReservationAuditLog,
  ReservationInquiry,
  ReservationPaymentLog,
  ReservationStatus,
} from "../lib/types";
import { buttonClass, card, tintCard } from "../lib/ui";

const statusOptions: ReservationStatus[] = ["pending", "confirmed", "canceled", "completed", "no_show"];
const statusTabs: ("all" | ReservationStatus)[] = ["pending", "confirmed", "all", "canceled", "completed", "no_show"];
const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: "미결제",
  paid: "결제완료",
  refunded: "환불",
};
const paymentStatusOptions: PaymentStatus[] = ["unpaid", "paid", "refunded"];

type ReservationEdit = {
  status: ReservationStatus;
  payment_method: string | null;
  payment_status: PaymentStatus;
  admin_note: string;
};

const statusHelp: Record<ReservationStatus, string> = {
  pending: "확인·문자 발송 필요",
  confirmed: "방문 예정",
  canceled: "취소됨",
  completed: "이용 완료",
  no_show: "미방문",
};

const statusListClass: Record<ReservationStatus, string> = {
  pending: "border-workroom-ink bg-workroom-yellow/20",
  confirmed: "border-workroom-line bg-workroom-sky/35",
  canceled: "border-workroom-line bg-workroom-surface opacity-70",
  completed: "border-workroom-line bg-workroom-surface",
  no_show: "border-workroom-line bg-workroom-danger/20",
};

const statusMetaClass: Record<ReservationStatus, string> = {
  pending: "bg-workroom-yellow text-workroom-ink",
  confirmed: "bg-workroom-sky text-workroom-ink",
  canceled: "bg-workroom-surface text-workroom-muted",
  completed: "bg-workroom-ink text-white",
  no_show: "bg-workroom-danger text-workroom-ink",
};

const statusPanelClass: Record<ReservationStatus, string> = {
  pending: "border-workroom-ink bg-workroom-yellow/20",
  confirmed: "border-workroom-ink bg-workroom-sky/80",
  canceled: "border-workroom-line bg-workroom-surface opacity-85",
  completed: "border-workroom-ink bg-workroom-surface",
  no_show: "border-workroom-ink bg-workroom-danger/70",
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
  const [dateFilter, setDateFilter] = useState(dateParam ?? "");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ReservationStatus>(isReservationStatus(statusParam) ? statusParam : "pending");
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived">("active");
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<ReservationInquiry[]>([]);
  const [auditLogs, setAuditLogs] = useState<ReservationAuditLog[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<ReservationPaymentLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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

    const { data, error: loadError } = await supabase
      .from("reservations")
      .select("*")
      .order("date", { ascending: true })
      .order("created_at", { ascending: false });

    setIsLoading(false);

    if (loadError) {
      setError(loadError.message);
      return;
    }

    setReservations(data ?? []);
  }

  const statusBaseReservations = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return reservations
      .filter((reservation) => (archiveFilter === "archived" ? Boolean(reservation.deleted_at) : !reservation.deleted_at))
      .filter((reservation) => (dateFilter ? reservation.date === dateFilter : true))
      .filter((reservation) => {
        if (!q) return true;
        const nameMatch = reservation.name.toLowerCase().includes(q);
        const phoneMatch = qDigits.length > 0 && reservation.phone.replace(/\D/g, "").includes(qDigits);
        return nameMatch || phoneMatch;
      });
  }, [archiveFilter, dateFilter, query, reservations]);

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
        const aFuture = a.date >= today ? 0 : 1;
        const bFuture = b.date >= today ? 0 : 1;
        if (aFuture !== bFuture) return aFuture - bFuture;
        return `${a.date} ${a.start_time ?? ""}`.localeCompare(`${b.date} ${b.start_time ?? ""}`);
      });
  }, [statusBaseReservations, statusFilter]);

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
      setSelectedReservationId(reservationParam);
    }
  }, [reservationParam, reservations]);

  useEffect(() => {
    if (reservationParam) return;
    if (isReservationStatus(statusParam)) setStatusFilter(statusParam);
    if (dateParam) setDateFilter(dateParam);
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
    const { error: updateError } = await supabase.from("reservations").update(payload).eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setReservations((current) => current.map((reservation) => (reservation.id === id ? { ...reservation, ...payload } : reservation)));
    const { data } = await supabase
      .from("reservation_audit_logs")
      .select("*")
      .eq("reservation_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    setAuditLogs((data ?? []) as ReservationAuditLog[]);
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

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    navigate("/admin", { replace: true });
  }

  const pendingCount = reservations.filter((reservation) => !reservation.deleted_at && reservation.status === "pending").length;
  const selectedReservation = visibleReservations.find((reservation) => reservation.id === selectedReservationId) ?? null;

  return (
    <main className="pb-12">
      <Section eyebrow="Admin" title="예약 관리" accent="ink">
        <div className={`${card} mb-5 grid gap-3 p-4`}>
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass(archiveFilter === "active" ? "accent" : "secondary", "sm")}
              onClick={() => setArchiveFilter("active")}
              type="button"
            >
              진행 예약
            </button>
            <button
              className={buttonClass(archiveFilter === "archived" ? "accent" : "secondary", "sm")}
              onClick={() => setArchiveFilter("archived")}
              type="button"
            >
              보관 예약
            </button>
          </div>
          <label className="grid gap-2 text-sm font-bold">
            이름 · 전화 검색
            <input placeholder="이름 또는 전화번호로 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:items-end">
            <label className="grid gap-2 text-sm font-bold">
              날짜별 필터
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
            </label>
            <button className={buttonClass("accent", "md")} onClick={loadReservations} type="button">
              새로고침
            </button>
            <button className={buttonClass("secondary", "md")} onClick={() => setDateFilter(todayValue())} type="button">
              오늘
            </button>
            <button className={buttonClass("secondary", "md")} onClick={() => setDateFilter("")} type="button">
              전체 날짜
            </button>
            <button className={buttonClass("secondary", "md")} onClick={signOut} type="button">
              로그아웃
            </button>
          </div>
          <div className="grid gap-2 border-t border-workroom-line pt-3">
            <p className="text-sm font-bold">상태별 보기</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {statusTabs.map((status) => (
                <StatusTab
                  count={status === "all" ? statusBaseReservations.length : statusCounts[status]}
                  isActive={statusFilter === status}
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  status={status}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <p className={`${tintCard("yellow")} p-4 text-sm font-bold`}>
            확인이 필요한 예약 {pendingCount}건
          </p>
          <Link className={buttonClass("secondary", "md", "p-4 text-center text-sm")} to="/admin/stats">
            통계 보기
          </Link>
          <Link className={buttonClass("secondary", "md", "p-4 text-center text-sm")} to="/admin/members">
            회원 관리로 이동
          </Link>
        </div>

        {isLoading ? <p className={`${tintCard("yellow")} p-4 font-bold`}>예약을 불러오는 중입니다.</p> : null}
        {error ? <p className={`${tintCard("danger")} mb-4 p-4 text-sm font-bold`}>{error}</p> : null}
        {!isLoading && !visibleReservations.length ? (
          <p className={`${card} mb-4 p-6 text-center font-bold`}>조건에 맞는 예약이 없습니다.</p>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <section className={`${card} p-3`}>
            <div className="mb-3 flex items-center justify-between gap-3 px-2">
              <h2 className="text-lg font-bold">{archiveFilter === "archived" ? "보관 예약" : "예약 목록"}</h2>
              <span className="text-sm font-bold text-workroom-muted">{visibleReservations.length}건</span>
            </div>
            <div className="grid max-h-[680px] gap-2 overflow-y-auto pr-1">
              {visibleReservations.map((reservation) => (
                <ReservationListItem
                  isSelected={reservation.id === selectedReservationId}
                  key={reservation.id}
                  onSelect={() => setSelectedReservationId(reservation.id)}
                  reservation={reservation}
                />
              ))}
            </div>
          </section>

          {selectedReservation ? (
            <ReservationCard
              conflictCount={getConflictCount(selectedReservation, reservations)}
              auditLogs={auditLogs}
              paymentLogs={paymentLogs}
              isArchived={Boolean(selectedReservation.deleted_at)}
              key={selectedReservation.id}
              reservation={selectedReservation}
              inquiries={inquiries}
              onArchive={() => void archiveReservation(selectedReservation.id)}
              onReply={(inquiryId, reply) => void replyInquiry(inquiryId, reply)}
              onSave={(payload) => void saveReservation(selectedReservation.id, payload)}
            />
          ) : (
            <p className={`${card} p-6 text-center font-bold`}>
              왼쪽 목록에서 예약을 선택하면 상세가 표시됩니다.
            </p>
          )}
        </div>
      </Section>
    </main>
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
    ? "border-workroom-ink bg-workroom-yellow"
    : `${statusListClass[reservation.status]} transition-colors hover:border-workroom-ink`;
  const mutedText = "text-workroom-muted";

  return (
    <button
      className={`rounded-card border px-4 py-3 text-left ${selectedClass}`}
      onClick={onSelect}
      type="button"
    >
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-workroom-line pb-2">
        <span className={`rounded-[4px] border border-workroom-ink px-2 py-1 text-[11px] font-black ${statusMetaClass[reservation.status]}`}>
          {statusHelp[reservation.status]}
        </span>
        {reservation.deleted_at ? <span className="text-[11px] font-bold text-workroom-muted">보관됨</span> : null}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{reservation.name}</p>
          <p className={`mt-1 text-xs font-medium ${mutedText}`}>
            {formatDate(reservation.date)} · {formatTimeRange(reservation.start_time, reservation.end_time)}
          </p>
          <p className={`mt-1 text-xs font-medium ${mutedText}`}>{reservation.pass_name_snapshot || reservation.pass_type}</p>
        </div>
        <div className="grid justify-items-end gap-1">
          <StatusBadge status={reservation.status} />
        </div>
      </div>
    </button>
  );
}

function StatusTab({
  count,
  isActive,
  onClick,
  status,
}: {
  count: number;
  isActive: boolean;
  onClick: () => void;
  status: "all" | ReservationStatus;
}) {
  const label = status === "all" ? "전체" : statusLabel[status];
  const helper = status === "all" ? "모든 예약" : statusHelp[status];
  const activeClass =
    status === "all"
      ? "border-workroom-ink bg-workroom-ink text-white"
      : statusMetaClass[status];

  return (
    <button
      className={`rounded-card border p-3 text-left transition-colors hover:border-workroom-ink ${
        isActive ? activeClass : "border-workroom-line bg-workroom-surface"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="block text-sm font-black">{label}</span>
      <span className="mt-1 block text-2xl font-black">{count}건</span>
      <span
        className={`mt-1 block text-[11px] font-bold ${
          isActive && (status === "all" || status === "completed") ? "text-white/70" : "text-workroom-muted"
        }`}
      >
        {helper}
      </span>
    </button>
  );
}

function ReservationCard({
  conflictCount,
  auditLogs,
  paymentLogs,
  isArchived,
  reservation,
  inquiries,
  onArchive,
  onReply,
  onSave,
}: {
  conflictCount: number;
  auditLogs: ReservationAuditLog[];
  paymentLogs: ReservationPaymentLog[];
  isArchived: boolean;
  reservation: Reservation;
  inquiries: ReservationInquiry[];
  onArchive: () => void;
  onReply: (inquiryId: string, reply: string) => void;
  onSave: (payload: ReservationEdit) => void;
}) {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<ReservationStatus>(reservation.status);
  const [note, setNote] = useState(reservation.admin_note ?? "");
  const [paymentMethod, setPaymentMethod] = useState(reservation.payment_method ?? "");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(reservation.payment_status ?? "unpaid");
  const [copiedMessage, setCopiedMessage] = useState<"confirmed" | "canceled" | null>(null);

  useEffect(() => {
    setStatus(reservation.status);
    setNote(reservation.admin_note ?? "");
    setPaymentMethod(reservation.payment_method ?? "");
    setPaymentStatus(reservation.payment_status ?? "unpaid");
  }, [reservation.status, reservation.admin_note, reservation.payment_method, reservation.payment_status]);

  function save() {
    onSave({ status, payment_method: paymentMethod || null, payment_status: paymentStatus, admin_note: note });
  }

  async function copyMessage(kind: "confirmed" | "canceled") {
    const message = kind === "confirmed" ? buildConfirmedMessage(reservation) : buildCanceledMessage(reservation);
    await navigator.clipboard.writeText(message);
    setCopiedMessage(kind);
    window.setTimeout(() => setCopiedMessage(null), 1800);
  }

  return (
    <article className={`${statusPanelClass[reservation.status]} rounded-card border p-5`}>
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
        <button className={buttonClass("accent", "sm")} onClick={() => void copyMessage("confirmed")} type="button">
          {copiedMessage === "confirmed" ? "복사됨" : "확정 문구 복사"}
        </button>
        <button className={buttonClass("secondary", "sm")} onClick={() => void copyMessage("canceled")} type="button">
          {copiedMessage === "canceled" ? "복사됨" : "취소 문구 복사"}
        </button>
      </div>

      {conflictCount > 0 ? (
        <p className={`${tintCard("yellow")} mt-4 p-3 text-sm font-bold`}>
          같은 시간대에 겹치는 예약이 {conflictCount}건 있습니다. 확정 전에 시간을 확인해 주세요.
        </p>
      ) : null}

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
        <dt className="font-bold text-workroom-muted">인원</dt>
        <dd className="font-bold">{reservation.people}명</dd>
        <dt className="font-bold text-workroom-muted">요청사항</dt>
        <dd className="whitespace-pre-wrap font-medium">{reservation.message || "-"}</dd>
      </dl>

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

      <div className="mt-5 grid gap-3">
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
