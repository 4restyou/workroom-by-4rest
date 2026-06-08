import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Section from "../components/Section";
import StatusBadge from "../components/StatusBadge";
import { formatDate, formatPrice, formatTimeRange, statusLabel, todayValue } from "../lib/format";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import type { PaymentStatus, Reservation, ReservationInquiry, ReservationStatus } from "../lib/types";
import { buttonClass, card, tintCard } from "../lib/ui";

const statusOptions: ReservationStatus[] = ["pending", "confirmed", "canceled", "completed", "no_show"];
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

export default function AdminReservations() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reservationParam = searchParams.get("reservation");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dateFilter, setDateFilter] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ReservationStatus>("all");
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [inquiries, setInquiries] = useState<ReservationInquiry[]>([]);
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

  const visibleReservations = useMemo(() => {
    const today = todayValue();
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return reservations
      .filter((reservation) => (dateFilter ? reservation.date === dateFilter : true))
      .filter((reservation) => (statusFilter === "all" ? true : reservation.status === statusFilter))
      .filter((reservation) => {
        if (!q) return true;
        const nameMatch = reservation.name.toLowerCase().includes(q);
        const phoneMatch = qDigits.length > 0 && reservation.phone.replace(/\D/g, "").includes(qDigits);
        return nameMatch || phoneMatch;
      })
      .sort((a, b) => {
        const aPending = a.status === "pending" ? 0 : 1;
        const bPending = b.status === "pending" ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        const aFuture = a.date >= today ? 0 : 1;
        const bFuture = b.date >= today ? 0 : 1;
        if (aFuture !== bFuture) return aFuture - bFuture;
        return `${a.date} ${a.start_time ?? ""}`.localeCompare(`${b.date} ${b.start_time ?? ""}`);
      });
  }, [dateFilter, query, reservations, statusFilter]);

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
    if (reservations.some((reservation) => reservation.id === reservationParam)) {
      setDateFilter("");
      setStatusFilter("all");
      setQuery("");
      setSelectedReservationId(reservationParam);
    }
  }, [reservationParam, reservations]);

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

  async function saveReservation(id: string, payload: ReservationEdit) {
    if (!supabase) return;
    const { error: updateError } = await supabase.from("reservations").update(payload).eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setReservations((current) => current.map((reservation) => (reservation.id === id ? { ...reservation, ...payload } : reservation)));
  }

  async function deleteReservation(id: string) {
    if (!supabase) return;
    const confirmed = window.confirm("예약을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.");
    if (!confirmed) return;

    const { error: deleteError } = await supabase.from("reservations").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setReservations((current) => current.filter((reservation) => reservation.id !== id));
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

  const pendingCount = reservations.filter((reservation) => reservation.status === "pending").length;
  const selectedReservation = visibleReservations.find((reservation) => reservation.id === selectedReservationId) ?? null;

  return (
    <main className="pb-12">
      <Section eyebrow="Admin" title="예약 관리" accent="ink">
        <div className={`${card} mb-5 grid gap-3 p-4`}>
          <label className="grid gap-2 text-sm font-bold">
            이름 · 전화 검색
            <input placeholder="이름 또는 전화번호로 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto_auto_auto] lg:items-end">
            <label className="grid gap-2 text-sm font-bold">
              날짜별 필터
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              상태별 필터
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | ReservationStatus)}>
                <option value="all">전체</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel[status]}
                  </option>
                ))}
              </select>
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
              <h2 className="text-lg font-black">예약 목록</h2>
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
              key={selectedReservation.id}
              reservation={selectedReservation}
              inquiries={inquiries}
              onDelete={() => void deleteReservation(selectedReservation.id)}
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
  return (
    <button
      className={`rounded-card px-4 py-3 text-left ${
        isSelected
          ? "border-2 border-workroom-ink bg-workroom-yellow"
          : "border-2 border-workroom-ink bg-white hover:-translate-y-0.5 transition-transform"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black">{reservation.name}</p>
          <p className="mt-1 text-xs font-medium text-workroom-muted">
            {formatDate(reservation.date)} · {formatTimeRange(reservation.start_time, reservation.end_time)}
          </p>
          <p className="mt-1 text-xs font-medium text-workroom-muted">{reservation.pass_name_snapshot || reservation.pass_type}</p>
        </div>
        <StatusBadge status={reservation.status} />
      </div>
    </button>
  );
}

function ReservationCard({
  reservation,
  inquiries,
  onDelete,
  onReply,
  onSave,
}: {
  reservation: Reservation;
  inquiries: ReservationInquiry[];
  onDelete: () => void;
  onReply: (inquiryId: string, reply: string) => void;
  onSave: (payload: ReservationEdit) => void;
}) {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<ReservationStatus>(reservation.status);
  const [note, setNote] = useState(reservation.admin_note ?? "");
  const [paymentMethod, setPaymentMethod] = useState(reservation.payment_method ?? "");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(reservation.payment_status ?? "unpaid");

  useEffect(() => {
    setStatus(reservation.status);
    setNote(reservation.admin_note ?? "");
    setPaymentMethod(reservation.payment_method ?? "");
    setPaymentStatus(reservation.payment_status ?? "unpaid");
  }, [reservation.status, reservation.admin_note, reservation.payment_method, reservation.payment_status]);

  function save() {
    onSave({ status, payment_method: paymentMethod || null, payment_status: paymentStatus, admin_note: note });
  }

  return (
    <article className={`${card} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-black">{reservation.name}</h3>
          <a
            href={`tel:${reservation.phone}`}
            className="mt-1 inline-block text-sm font-bold text-workroom-ink underline underline-offset-2"
          >
            {reservation.phone}
          </a>
          {reservation.email ? <p className="text-sm font-medium text-workroom-muted">{reservation.email}</p> : null}
        </div>
        <StatusBadge status={reservation.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a className={buttonClass("secondary", "sm")} href={`tel:${reservation.phone}`}>
          전화 걸기
        </a>
        <a className={buttonClass("secondary", "sm")} href={`sms:${reservation.phone}`}>
          문자 보내기
        </a>
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
        <dt className="font-bold text-workroom-muted">인원</dt>
        <dd className="font-bold">{reservation.people}명</dd>
        <dt className="font-bold text-workroom-muted">요청사항</dt>
        <dd className="whitespace-pre-wrap font-medium">{reservation.message || "-"}</dd>
      </dl>

      {inquiries.length ? (
        <div className="mt-5">
          <p className="text-sm font-black">회원 문의 {inquiries.length}건</p>
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
        <button className={buttonClass("secondary", "md")} onClick={onDelete} type="button">
          예약 삭제
        </button>
      </div>
    </article>
  );
}
