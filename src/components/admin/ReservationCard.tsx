import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import StatusBadge from "../StatusBadge";
import { formatDate, formatPrice, formatTimeRange, statusLabel } from "../../lib/format";
import {
  buildCanceledMessage,
  buildConfirmedMessage,
  describeAuditLog,
  describePaymentLog,
  formatAuditTime,
  paymentLogTint,
  paymentStatusLabels,
  paymentStatusOptions,
  paymentWorkflowDescription,
  paymentWorkflowLabel,
  smsEventLabel,
  smsLogTint,
  smsStatusLabel,
  statusOptions,
} from "../../lib/adminReservations";
import { confirmDialog } from "../../lib/confirm";
import { isLongTermReservation, accessEndDate, passUsableDays } from "../../lib/reservations";
import { buttonClass, tintCard } from "../../lib/ui";
import type { ReservationEdit } from "../../lib/adminReservations";
import type {
  PaymentStatus,
  Pass,
  Reservation,
  ReservationAuditLog,
  ReservationInquiry,
  ReservationPaymentLog,
  ReservationSmsLog,
  ReservationStatus,
} from "../../lib/types";

export default function ReservationCard({
  conflictCount,
  auditLogs,
  paymentLogs,
  smsLogs,
  passes,
  openWeekdays,
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
  openWeekdays: number[];
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
    weekdays: reservation.access_weekdays ?? openWeekdays,
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
      weekdays: reservation.access_weekdays ?? openWeekdays,
      pausedFrom: reservation.access_paused_from ?? "",
      pausedUntil: reservation.access_paused_until ?? "",
    });
  }, [reservation, openWeekdays]);

  async function save() {
    // 상태가 바뀌면 DB 트리거가 고객에게 문자를 보내므로 한 번 더 확인받는다.
    if (status !== reservation.status) {
      const label = statusLabel[status] ?? status;
      const notifies = status === "confirmed" || status === "canceled" || status === "no_show";
      const ok = await confirmDialog({
        title: `예약 상태를 '${label}'(으)로 바꿀까요?`,
        description: notifies ? "고객에게 안내 문자가 발송됩니다." : undefined,
        confirmLabel: "변경",
        tone: notifies ? "danger" : "default",
      });
      if (!ok) return;
    }
    // 일정 변경은 고객에게 자동 통보되지 않는다(문자는 상태 변경에만 붙어 있다).
    // 운영자가 그 사실을 모른 채 시간을 옮기는 일이 없도록 알린다.
    const scheduleChanged =
      bookingDraft.date !== reservation.date ||
      bookingDraft.start_time !== (reservation.start_time ?? "").slice(0, 5) ||
      bookingDraft.end_time !== (reservation.end_time ?? "").slice(0, 5);
    if (scheduleChanged) {
      const ok = await confirmDialog({
        title: "이용 일정을 바꿀까요?",
        description: "고객에게는 자동으로 안내가 가지 않습니다. 저장 후 '안내 문구'로 직접 알려 주세요.",
        confirmLabel: "변경",
      });
      if (!ok) return;
    }

    const selectedPass = passes.find((pass) => pass.name === bookingDraft.pass_type);
    // 이용권 자체가 바뀔 때만 금액을 다시 매긴다(아래 payload에서 사용).
    const currentPassName = reservation.pass_name_snapshot || reservation.pass_type;
    const passChanged = bookingDraft.pass_type !== currentPassName;
    if (passChanged && selectedPass && selectedPass.price !== reservation.price_at_booking) {
      const ok = await confirmDialog({
        title: "이용권을 바꾸면 금액도 함께 바뀝니다",
        description: `${formatPrice(reservation.price_at_booking ?? 0)} → ${formatPrice(selectedPass.price)}로 변경됩니다.`,
        confirmLabel: "변경",
        tone: "danger",
      });
      if (!ok) return;
    }
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
        {/* 이 예약자가 실제로 얼마나 이용했는지 바로 확인할 수 있게 연결한다. */}
        {reservation.profile_id ? (
          <Link className={buttonClass("secondary", "sm")} to={`/admin/members?member=${reservation.profile_id}`}>
            이용내역 보기
          </Link>
        ) : null}
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
          {/* 결제 여부와 무관하게 '확정'이 가장 앞에 온다 — 미결제 확정이 정상 흐름이며,
              결제 완료 처리와 섞이면 받지 않은 돈이 매출로 잡힌다. */}
          {reservation.status === "pending" ? (
            <button
              className={buttonClass("accent", "sm")}
              onClick={() => {
                void confirmDialog({
                  title: `${reservation.name}님 예약을 확정할까요?`,
                  description: "고객에게 확정 문자가 발송됩니다.",
                  confirmLabel: "확정",
                }).then((ok) => {
                  if (ok) onPatch({ status: "confirmed" });
                });
              }}
              type="button"
            >
              예약 확정{reservation.payment_status === "unpaid" ? " (결제 전)" : ""}
            </button>
          ) : null}
          {reservation.payment_status === "unpaid" && reservation.status !== "canceled" ? (
            <button
              className={buttonClass("secondary", "sm")}
              onClick={() => {
                void confirmDialog({
                  title: `${reservation.name}님의 결제를 받은 것으로 처리할까요?`,
                  description: "매출에 반영되고 예약도 확정됩니다.",
                  confirmLabel: "결제 받음",
                  tone: "danger",
                }).then((ok) => {
                  if (!ok) return;
                  onPatch({ payment_status: "paid", payment_method: reservation.payment_preference === "onsite" ? "현장결제" : "외부결제", status: "confirmed" });
                });
              }}
              type="button"
            >
              결제 받음 · 확정
            </button>
          ) : null}
          {reservation.payment_status === "unpaid" && reservation.status !== "canceled" ? (
            <button
              className={buttonClass("secondary", "sm")}
              onClick={() => {
                void confirmDialog({
                  title: `${reservation.name}님 예약을 무료(서비스)로 확정할까요?`,
                  description: "요금이 청구되지 않고 확정 문자가 발송됩니다.",
                  confirmLabel: "무료 확정",
                  tone: "danger",
                }).then((ok) => {
                  if (!ok) return;
                  onPatch({ payment_status: "service", payment_method: "서비스", status: "confirmed" });
                });
              }}
              type="button"
            >
              서비스로 확정
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
          <p className="mt-2 text-xs font-medium text-workroom-muted">
            {bookingDraft.pass_type}은 <b className="text-workroom-ink">이용 {passUsableDays(bookingDraft.pass_type, openWeekdays.length)}일</b> 기준이에요(휴무일 제외). 시작일을 바꾸면 종료일이 영업일 기준으로 자동 계산됩니다.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold text-workroom-muted">이용 시작일
              <input type="date" value={accessDraft.start} onChange={(event) => { const start = event.target.value; setAccessDraft((current) => ({ ...current, start, end: start ? accessEndDate(start, bookingDraft.pass_type, openWeekdays) : current.end })); }} />
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

      <div className="mt-5 border-t border-workroom-line pt-4">
        <p className="text-sm font-semibold text-workroom-muted">상태·결제 기록 직접 수정</p>
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
        {/* 상세가 길어 어디서 수정하든 바로 저장할 수 있도록 하단에 고정한다. */}
        <div className="sticky bottom-0 -mx-4 border-t border-workroom-line bg-white px-4 py-3 sm:-mx-5 sm:px-5">
          <button className={buttonClass("primary", "lg", "w-full")} onClick={() => void save()} type="button">
            변경사항 저장
          </button>
        </div>
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
          <button
            className={buttonClass("secondary", "sm", "border-red-400")}
            onClick={() => {
              void confirmDialog({
                title: `${reservation.name}님 예약을 노쇼로 처리할까요?`,
                description: "고객에게 노쇼 안내 문자가 발송됩니다.",
                confirmLabel: "노쇼 처리",
                tone: "danger",
              }).then((ok) => {
                if (ok) onPatch({ status: "no_show" });
              });
            }}
            type="button"
          >
            노쇼 처리
          </button>
        ) : null}
        {reservation.payment_status === "paid" && reservation.payment_key && (reservation.payment_method ?? "").includes("포트원") ? (
          <button className={buttonClass("secondary", "sm", "border-red-400")} onClick={onPortoneRefund} type="button">PG 환불 실행</button>
        ) : null}
      </div>
      </div>

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
