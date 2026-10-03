import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { formatDate, formatPrice } from "../../lib/format";
import { canPayOnline, canSubscribe } from "../../lib/portone";
import { accessEndDate, isLongTermPassName, passUsableDays } from "../../lib/reservations";
import { SITE } from "../../lib/site";
import { buttonClass, card, tintCard } from "../../lib/ui";
import type { Reservation } from "../../lib/types";

export type SubmittedReservation = {
  reservation: Reservation;
  passName: string;
  date: string;
  startTime: string;
  endTime: string;
  people: number;
  name: string;
  phone: string;
  price: number | null;
  paymentPreference: "online" | "onsite";
};

// 예약 신청 직후 아래에서 올라오는 시트: 신청 내용, 결제·정기결제 버튼, 다음 행동.
export default function ReserveSuccessSheet({
  closedDates,
  isPaymentBusy,
  noticeItems,
  onClose,
  onPay,
  onSubscribe,
  openWeekdays,
  panelRef,
  paymentError,
  paymentMessage,
  submittedReservation,
}: {
  closedDates: string[];
  isPaymentBusy: boolean;
  noticeItems: [string, string][];
  onClose: () => void;
  onPay: () => void;
  onSubscribe: () => void;
  openWeekdays: number[];
  panelRef: RefObject<HTMLDivElement>;
  paymentError: string;
  paymentMessage: string;
  submittedReservation: SubmittedReservation | null;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        aria-labelledby="reserve-success-title"
        aria-modal="true"
        className={`${card} animate-sheet-up max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-b-none rounded-t-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-card sm:pb-6`}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-pill bg-workroom-line sm:hidden" />
        <p className="text-2xl font-bold" id="reserve-success-title">
          {submittedReservation?.reservation.payment_status === "paid" ? "예약이 확정되었습니다 🎉" : "예약 신청이 접수되었습니다"}
        </p>
        <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
          {submittedReservation?.reservation.payment_status === "paid"
            ? "결제가 완료되어 예약이 바로 확정되었습니다. 확정 문자도 함께 발송됩니다."
            : SITE.booking.onlinePaymentLive && submittedReservation?.paymentPreference === "online" && (submittedReservation.price ?? 0) > 0
              ? "아래에서 결제하면 예약이 바로 확정됩니다."
              : "예약 신청이 접수되었습니다. 운영자 확인 후 결제 링크를 보내드리거나 현장에서 결제(카드·현금)로 확정됩니다."}
        </p>

        {submittedReservation ? (
          <div className={`${tintCard("yellow")} mt-5 p-4`}>
            <p className="text-sm font-bold">신청 내용</p>
            <dl className="mt-3 grid grid-cols-[74px_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="font-bold text-workroom-muted">이용권</dt>
              <dd className="font-bold">{submittedReservation.passName}</dd>
              {isLongTermPassName(submittedReservation.passName) ? (
                <>
                  <dt className="font-bold text-workroom-muted">이용 기간</dt>
                  <dd className="font-bold">
                    {formatDate(submittedReservation.date)} ~ {formatDate(accessEndDate(submittedReservation.date, submittedReservation.passName, openWeekdays, closedDates))}
                    <span className="ml-1 font-medium text-workroom-muted">(이용 {passUsableDays(submittedReservation.passName, openWeekdays.length)}일)</span>
                  </dd>
                </>
              ) : (
                <>
                  <dt className="font-bold text-workroom-muted">날짜</dt>
                  <dd className="font-bold">{formatDate(submittedReservation.date)}</dd>
                  <dt className="font-bold text-workroom-muted">시간</dt>
                  <dd className="font-bold">
                    {submittedReservation.startTime} - {submittedReservation.endTime}
                  </dd>
                </>
              )}
              <dt className="font-bold text-workroom-muted">인원</dt>
              <dd className="font-bold">{submittedReservation.people}명</dd>
              <dt className="font-bold text-workroom-muted">예약자</dt>
              <dd className="font-bold">
                {submittedReservation.name} · {submittedReservation.phone}
              </dd>
              <dt className="font-bold text-workroom-muted">금액</dt>
              <dd className="font-bold">{submittedReservation.price ? formatPrice(submittedReservation.price) : "확인 후 안내"}</dd>
              {SITE.booking.paymentEnabled ? (
                <>
                  <dt className="font-bold text-workroom-muted">결제</dt>
                  <dd className="font-bold">{submittedReservation.paymentPreference === "online" ? "신용카드 결제" : "현장 결제(문의)"}</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}

        {paymentMessage ? <p className={`${tintCard("mint")} mt-4 p-3 text-sm font-bold`}>{paymentMessage}</p> : null}
        {paymentError ? <p className={`${tintCard("danger")} mt-4 p-3 text-sm font-bold`}>{paymentError}</p> : null}

        {/* 카드 결제가 기본이고, 월권은 그 아래에 4주 자동결제를 선택지로 둔다.
            정기결제는 카드사별 지원이 확인되기 전까지 앞세우지 않는다. */}
        {submittedReservation && canPayOnline(submittedReservation.reservation) ? (
          <button
            className={buttonClass("accent", "lg", "mt-6 w-full")}
            disabled={isPaymentBusy}
            onClick={() => onPay()}
            type="button"
          >
            {isPaymentBusy ? "결제 진행 중…" : `신용카드로 ${formatPrice(submittedReservation.price ?? 0)} 결제하기`}
          </button>
        ) : null}
        {submittedReservation && canSubscribe(submittedReservation.reservation) ? (
          <>
            <button
              className={buttonClass("secondary", "lg", "mt-2 w-full")}
              disabled={isPaymentBusy}
              onClick={() => onSubscribe()}
              type="button"
            >
              {isPaymentBusy ? "카드 등록 중…" : "4주마다 자동결제로 등록"}
            </button>
            <p className="mt-2 text-xs font-medium leading-5 text-workroom-muted">{SITE.booking.recurringHint}</p>
          </>
        ) : null}
        <Link
          className={buttonClass(submittedReservation?.reservation.payment_status === "paid" ? "primary" : "secondary", "lg", "mt-2 w-full")}
          to="/account?tab=reservations"
        >
          {submittedReservation?.reservation.payment_status === "paid" ? "확정된 예약 보기" : "예약현황에서 보기"}
        </Link>
        {/* 처음 오는 손님이 제일 궁금한 것 — 문은 어떻게 열고 자리는 어디에 앉나.
            이용일이 되면 이 화면에서 출입구 비밀번호까지 보여 준다. */}
        <Link className={buttonClass("secondary", "lg", "mt-2 w-full")} to="/visit">
          방문 안내 보기
        </Link>
        <button className={buttonClass("secondary", "md", "mt-2 w-full")} onClick={() => onClose()} type="button">
          닫기
        </button>

        {/* 안내는 접어 둔다 — 펼쳐 두면 다음 행동(예약현황·닫기)이 화면 밖으로 밀린다. */}
        {noticeItems.length ? (
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-bold">이용 안내 {noticeItems.length}가지</summary>
            <div className="mt-3 grid gap-3">
              {noticeItems.map(([title, body]) => (
                <div className={`${tintCard("mint")} p-3`} key={title}>
                  <p className="text-sm font-bold">{title}</p>
                  <p className="mt-1 text-sm font-medium leading-6">{body}</p>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
