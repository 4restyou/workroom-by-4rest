import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import StatusBadge from "../components/StatusBadge";
import { formatDate, formatTimeRange, statusLabel, todayValue } from "../lib/format";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import type { Reservation, ReservationStatus } from "../lib/types";

const statusOptions: ReservationStatus[] = ["pending", "confirmed", "canceled", "completed"];

export default function AdminReservations() {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dateFilter, setDateFilter] = useState(todayValue());
  const [statusFilter, setStatusFilter] = useState<"all" | ReservationStatus>("all");
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
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
    return reservations
      .filter((reservation) => (dateFilter ? reservation.date === dateFilter : true))
      .filter((reservation) => (statusFilter === "all" ? true : reservation.status === statusFilter))
      .sort((a, b) => {
        const aFuture = a.date >= today ? 0 : 1;
        const bFuture = b.date >= today ? 0 : 1;
        if (aFuture !== bFuture) return aFuture - bFuture;
        return `${a.date} ${a.start_time ?? ""}`.localeCompare(`${b.date} ${b.start_time ?? ""}`);
      });
  }, [dateFilter, reservations, statusFilter]);

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

  async function updateStatus(id: string, status: ReservationStatus) {
    if (!supabase) return;
    const { error: updateError } = await supabase.from("reservations").update({ status }).eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setReservations((current) => current.map((reservation) => (reservation.id === id ? { ...reservation, status } : reservation)));
  }

  async function updateNote(id: string, adminNote: string) {
    if (!supabase) return;
    const { error: updateError } = await supabase.from("reservations").update({ admin_note: adminNote }).eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setReservations((current) => current.map((reservation) => (reservation.id === id ? { ...reservation, admin_note: adminNote } : reservation)));
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

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    navigate("/admin", { replace: true });
  }

  const pendingCount = reservations.filter((reservation) => reservation.status === "pending").length;
  const selectedReservation = visibleReservations.find((reservation) => reservation.id === selectedReservationId) ?? null;

  return (
    <main className="pb-12">
      <Section eyebrow="Admin" title="예약 관리">
        <div className="mb-5 grid gap-3 rounded-card border border-workroom-line bg-workroom-surface p-4 shadow-soft lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end">
          <label className="grid gap-2 text-sm font-black">
            날짜별 필터
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-black">
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
          <button className="rounded-full border border-workroom-line bg-workroom-yellow px-5 py-3 font-black" onClick={loadReservations} type="button">
            새로고침
          </button>
          <button className="rounded-full border border-workroom-line bg-white px-5 py-3 font-black" onClick={() => setDateFilter("")} type="button">
            전체 날짜
          </button>
          <button className="rounded-full border border-workroom-line bg-white px-5 py-3 font-black" onClick={signOut} type="button">
            로그아웃
          </button>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <p className="rounded-card border border-workroom-line bg-workroom-yellow p-4 text-sm font-black">
            확인이 필요한 예약 {pendingCount}건
          </p>
          <Link className="rounded-card border border-workroom-line bg-white p-4 text-center text-sm font-black shadow-soft" to="/admin/stats">
            통계 보기
          </Link>
          <Link className="rounded-card border border-workroom-line bg-white p-4 text-center text-sm font-black shadow-soft" to="/admin/members">
            회원 관리로 이동
          </Link>
        </div>

        {isLoading ? <p className="rounded-card border border-workroom-line bg-workroom-yellow p-4 font-black">예약을 불러오는 중입니다.</p> : null}
        {error ? <p className="mb-4 rounded-card border border-workroom-line bg-red-100 p-4 text-sm font-black">{error}</p> : null}
        {!isLoading && !visibleReservations.length ? (
          <p className="rounded-card border border-workroom-line bg-workroom-surface p-6 text-center font-black shadow-sketch">조건에 맞는 예약이 없습니다.</p>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <section className="rounded-card border border-workroom-line bg-workroom-surface p-3 shadow-soft">
            <div className="mb-3 flex items-center justify-between gap-3 px-2">
              <h2 className="text-lg font-black">예약 목록</h2>
              <span className="text-sm font-black text-workroom-muted">{visibleReservations.length}건</span>
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
              onDelete={() => void deleteReservation(selectedReservation.id)}
              onNote={(note) => void updateNote(selectedReservation.id, note)}
              onStatus={(status) => void updateStatus(selectedReservation.id, status)}
            />
          ) : (
            <p className="rounded-card border border-workroom-line bg-workroom-surface p-6 text-center font-black shadow-soft">
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
      className={`rounded-card border px-4 py-3 text-left transition ${
        isSelected ? "border-workroom-text bg-workroom-yellow" : "border-workroom-line bg-white hover:border-workroom-text"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black">{reservation.name}</p>
          <p className="mt-1 text-xs font-bold text-workroom-muted">
            {formatDate(reservation.date)} · {formatTimeRange(reservation.start_time, reservation.end_time)}
          </p>
          <p className="mt-1 text-xs font-bold text-workroom-muted">{reservation.pass_type}</p>
        </div>
        <StatusBadge status={reservation.status} />
      </div>
    </button>
  );
}

function ReservationCard({
  reservation,
  onDelete,
  onNote,
  onStatus,
}: {
  reservation: Reservation;
  onDelete: () => void;
  onNote: (note: string) => void;
  onStatus: (status: ReservationStatus) => void;
}) {
  const [note, setNote] = useState(reservation.admin_note ?? "");

  useEffect(() => {
    setNote(reservation.admin_note ?? "");
  }, [reservation.admin_note]);

  return (
    <article className="rounded-card border border-workroom-line bg-workroom-surface p-5 shadow-sketch">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-black">{reservation.name}</h3>
          <p className="mt-1 text-sm font-bold text-workroom-muted">{reservation.phone}</p>
          {reservation.email ? <p className="text-sm font-bold text-workroom-muted">{reservation.email}</p> : null}
        </div>
        <StatusBadge status={reservation.status} />
      </div>

      <dl className="mt-5 grid grid-cols-[86px_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="font-black text-workroom-muted">이용권</dt>
        <dd className="font-black">{reservation.pass_type}</dd>
        <dt className="font-black text-workroom-muted">날짜</dt>
        <dd className="font-black">{formatDate(reservation.date)}</dd>
        <dt className="font-black text-workroom-muted">시간</dt>
        <dd className="font-black">{formatTimeRange(reservation.start_time, reservation.end_time)}</dd>
        <dt className="font-black text-workroom-muted">인원</dt>
        <dd className="font-black">{reservation.people}명</dd>
        <dt className="font-black text-workroom-muted">요청사항</dt>
        <dd className="whitespace-pre-wrap font-semibold">{reservation.message || "-"}</dd>
      </dl>

      <div className="mt-5 grid gap-3">
        <label className="grid gap-2 text-sm font-black">
          상태 변경
          <select value={reservation.status} onChange={(event) => onStatus(event.target.value as ReservationStatus)}>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {statusLabel[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-black">
          관리자 메모
          <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button className="rounded-full border border-workroom-line bg-workroom-yellow px-4 py-3 font-black" onClick={() => onNote(note)} type="button">
            메모 저장
          </button>
          <button className="rounded-full border border-workroom-line bg-white px-4 py-3 font-black" onClick={() => onStatus("canceled")} type="button">
            취소 처리
          </button>
        </div>
        <button className="rounded-full border border-workroom-line bg-workroom-text px-4 py-3 font-black text-white" onClick={onDelete} type="button">
          예약 삭제
        </button>
      </div>
    </article>
  );
}
