import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import { formatDate, formatTimeRange } from "../lib/format";
import { isLongTermReservation, reservationEndTime, reservationPassName, reservationStartTime } from "../lib/reservations";
import { badge, buttonClass, card, cardFlat, tintCard } from "../lib/ui";
import type { Attendance, BusinessDateException, BusinessHour, Reservation } from "../lib/types";

type Props = {
  attendance: Attendance[];
  businessHours: BusinessHour[];
  dateExceptions: BusinessDateException[];
  now: number;
  reservations: Reservation[];
};

export default function MemberReservationDashboard({ attendance, businessHours, dateExceptions, now, reservations }: Props) {
  const today = kstDate(new Date(now));
  const activeReservations = reservations.filter((item) => !item.deleted_at && (item.status === "pending" || item.status === "confirmed"));
  const current = activeReservations.find((reservation) => isCurrentReservation(reservation, today, now, businessHours, dateExceptions));
  const next = [...activeReservations]
    .filter((reservation) => reservation.status === "pending" || nextRelevantTime(reservation, today) >= now)
    .sort((a, b) => nextRelevantTime(a, today) - nextRelevantTime(b, today))[0];
  const focus = current ?? next ?? null;
  const longTerm = activeReservations.filter(isLongTermReservation).sort((a, b) => (a.access_start_date ?? a.date).localeCompare(b.access_start_date ?? b.date));
  const pendingCount = activeReservations.filter((item) => item.status === "pending").length;
  const confirmedCount = activeReservations.filter((item) => item.status === "confirmed").length;

  return (
    <div className="mb-5 grid gap-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <MiniSummary label="확인 대기" value={`${pendingCount}건`} tone="yellow" />
        <MiniSummary label="예정·이용 중" value={`${confirmedCount}건`} tone="sky" />
        <MiniSummary label="지난 이용" value={`${reservations.filter((item) => item.status === "completed").length}건`} tone="surface" />
      </div>

      {focus ? (
        <CurrentReservation reservation={focus} attendance={attendance} now={now} today={today} />
      ) : (
        <div className={`${card} p-5`}>
          <p className="text-lg font-black">예정된 예약이 없습니다</p>
          <p className="mt-1 text-sm font-medium text-workroom-muted">이용권과 날짜를 선택해 새 예약을 신청할 수 있습니다.</p>
          <Link className={`${buttonClass("accent", "md")} mt-4`} to="/reserve">예약하기</Link>
        </div>
      )}

      {longTerm.map((reservation) => (
        <MembershipCalendar
          attendance={attendance.filter((item) => item.reservation_id === reservation.id)}
          businessHours={businessHours}
          dateExceptions={dateExceptions}
          key={reservation.id}
          now={now}
          reservation={reservation}
        />
      ))}
    </div>
  );
}

function CurrentReservation({ attendance, now, reservation, today }: { attendance: Attendance[]; now: number; reservation: Reservation; today: string }) {
  const isLong = isLongTermReservation(reservation);
  const periodStart = reservation.access_start_date ?? reservation.date;
  const periodEnd = reservation.access_end_date ?? reservation.date;
  const date = isLong ? (today < periodStart ? periodStart : today) : reservation.date;
  const start = reservationStartTime(reservation, date);
  const end = reservationEndTime(reservation, date);
  const checkedIn = attendance.some((item) => item.reservation_id === reservation.id && kstDate(new Date(item.check_in_at)) === today && !item.check_out_at);
  const beforeStart = now < start;
  const using = reservation.status === "confirmed" && now >= start && now < end && (isLong || reservation.date === today);
  const remaining = using ? end - now : beforeStart ? start - now : 0;
  const warning = using && remaining <= 20 * 60 * 1000;
  const progress = using ? Math.min(100, Math.max(0, ((now - start) / Math.max(1, end - start)) * 100)) : 0;

  let headline = "다음 예약";
  let timing = `${formatDate(reservation.date)} · ${formatTimeRange(reservation.start_time, reservation.end_time)}`;
  if (reservation.status === "pending") headline = "예약 확인 대기";
  else if (using) headline = warning ? "종료가 가까워졌어요" : "현재 이용 중";
  else if (beforeStart) headline = `시작까지 ${formatRemaining(remaining)}`;
  else if (isLong && today <= periodEnd) headline = "이용 기간 중";
  if (isLong) timing = `${formatDate(periodStart)} – ${formatDate(periodEnd)}`;

  return (
    <article className={`${warning ? tintCard("yellow") : card} overflow-hidden p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-workroom-muted">{headline}</p>
          <h3 className="mt-1 text-2xl font-black">{reservationPassName(reservation)}</h3>
          <p className="mt-1 text-sm font-bold text-workroom-muted">{timing}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {checkedIn ? <span className={badge("mint")}>출근 완료</span> : null}
          <StatusBadge status={reservation.status} />
        </div>
      </div>

      {using ? (
        <div className="mt-5">
          <div className="flex items-end justify-between gap-3">
            <p className="text-sm font-bold">이용 종료까지</p>
            <p className="text-3xl font-black tabular-nums">{formatRemaining(remaining)}</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-pill bg-workroom-line/60">
            <div className="h-full rounded-pill bg-workroom-ink transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          {warning ? <p className="mt-2 text-xs font-bold">종료 20분 전입니다. 연장이 필요하면 운영자에게 문의해 주세요.</p> : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-workroom-line pt-4">
        {reservation.status === "confirmed" && (using || (isLong && today >= periodStart && today <= periodEnd)) ? (
          <Link className={buttonClass("primary", "sm")} to="/attendance">출근부 확인</Link>
        ) : null}
        <span className={badge(reservation.payment_status === "paid" ? "mint" : reservation.payment_status === "refunded" ? "lilac" : reservation.payment_status === "service" ? "sky" : "yellow")}>
          {reservation.payment_status === "paid" ? "결제완료" : reservation.payment_status === "refunded" ? "환불완료" : reservation.payment_status === "service" ? "서비스" : "미결제"}
        </span>
      </div>
    </article>
  );
}

function MembershipCalendar({ attendance, businessHours, dateExceptions, now, reservation }: {
  attendance: Attendance[];
  businessHours: BusinessHour[];
  dateExceptions: BusinessDateException[];
  now: number;
  reservation: Reservation;
}) {
  const start = reservation.access_start_date ?? reservation.date;
  const end = reservation.access_end_date ?? reservation.date;
  const today = kstDate(new Date(now));
  const leading = weekday(start);
  const dates = dateRange(start, end);
  const cells: Array<string | null> = [...Array.from({ length: leading }, () => null), ...dates];
  const attendedDates = new Set(attendance.map((item) => kstDate(new Date(item.check_in_at))));
  const exceptionMap = new Map(dateExceptions.map((item) => [item.date, item]));
  const hourMap = new Map(businessHours.map((item) => [item.weekday, item]));
  const remainingDays = Math.max(0, diffDays(today, end) + 1);
  const attendedCount = attendedDates.size;

  function available(date: string) {
    const day = weekday(date);
    if (reservation.access_weekdays?.length && !reservation.access_weekdays.includes(day)) return false;
    if (reservation.access_paused_from && reservation.access_paused_until && date >= reservation.access_paused_from && date <= reservation.access_paused_until) return false;
    const exception = exceptionMap.get(date);
    if (exception) return !exception.is_closed;
    return !hourMap.get(day)?.is_closed;
  }

  return (
    <article className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-workroom-muted">장기 이용권</p>
          <h3 className="mt-1 text-xl font-black">{reservationPassName(reservation)}</h3>
          <p className="mt-1 text-sm font-bold text-workroom-muted">{formatDate(start)} – {formatDate(end)}</p>
        </div>
        <StatusBadge status={reservation.status} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className={`${tintCard("sky")} p-3`}><p className="text-xs font-bold text-workroom-muted">남은 이용기간</p><p className="mt-1 text-xl font-black">{today < start ? "이용 전" : `${remainingDays}일`}</p></div>
        <div className={`${tintCard("yellow")} p-3`}><p className="text-xs font-bold text-workroom-muted">출근</p><p className="mt-1 text-xl font-black">{attendedCount}회</p></div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs">
        {["일", "월", "화", "수", "목", "금", "토"].map((label) => <p className="py-1 font-black text-workroom-muted" key={label}>{label}</p>)}
        {cells.map((date, index) => {
          if (!date) return <span aria-hidden className="aspect-square" key={`blank-${index}`} />;
          const isAvailable = available(date);
          const isAttended = attendedDates.has(date);
          const isToday = date === today;
          return (
            <div
              aria-label={`${date}${isAvailable ? " 이용 가능" : " 이용 불가"}${isAttended ? " 출근 완료" : ""}`}
              className={`relative grid aspect-square place-items-center rounded-[5px] border font-bold ${
                isToday ? "border-workroom-ink bg-workroom-yellow" : isAvailable ? "border-workroom-line bg-workroom-surface" : "border-transparent bg-workroom-line/20 text-workroom-muted"
              }`}
              key={date}
            >
              {Number(date.slice(-2))}
              {isAttended ? <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-workroom-ink" /> : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-bold text-workroom-muted">
        <span>● 오늘</span><span>검정 점 출근</span><span>흐린 날짜 휴무·이용불가</span>
      </div>
      {reservation.access_paused_from && reservation.access_paused_until ? (
        <p className={`${cardFlat} mt-3 p-3 text-xs font-bold`}>일시정지 · {formatDate(reservation.access_paused_from)} – {formatDate(reservation.access_paused_until)}</p>
      ) : null}
    </article>
  );
}

function MiniSummary({ label, tone, value }: { label: string; tone: "yellow" | "sky" | "surface"; value: string }) {
  const className = tone === "surface" ? cardFlat : tintCard(tone);
  return <div className={`${className} p-3`}><p className="text-xs font-bold text-workroom-muted">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>;
}

function isCurrentReservation(reservation: Reservation, today: string, now: number, businessHours: BusinessHour[], exceptions: BusinessDateException[]) {
  if (reservation.status !== "confirmed") return false;
  if (isLongTermReservation(reservation)) {
    const start = reservation.access_start_date ?? reservation.date;
    const end = reservation.access_end_date ?? reservation.date;
    if (today < start || today > end || !isLongAccessDay(reservation, today, businessHours, exceptions)) return false;
    return now >= reservationStartTime(reservation, today) && now < reservationEndTime(reservation, today);
  }
  return reservation.date === today && now >= reservationStartTime(reservation) && now < reservationEndTime(reservation);
}

function isLongAccessDay(reservation: Reservation, date: string, businessHours: BusinessHour[], exceptions: BusinessDateException[]) {
  const day = weekday(date);
  if (reservation.access_weekdays?.length && !reservation.access_weekdays.includes(day)) return false;
  if (reservation.access_paused_from && reservation.access_paused_until && date >= reservation.access_paused_from && date <= reservation.access_paused_until) return false;
  const exception = exceptions.find((item) => item.date === date);
  if (exception) return !exception.is_closed;
  return !businessHours.find((item) => item.weekday === day)?.is_closed;
}

function nextRelevantTime(reservation: Reservation, today: string) {
  if (isLongTermReservation(reservation)) {
    const start = reservation.access_start_date ?? reservation.date;
    if (today >= start && today <= (reservation.access_end_date ?? start)) return reservationStartTime(reservation, today);
    return reservationStartTime(reservation, start);
  }
  return reservationStartTime(reservation);
}

function formatRemaining(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}일 ${hours}시간`;
  if (hours) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function kstDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(value);
}

function weekday(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function addDays(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function dateRange(start: string, end: string) {
  const result: string[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) result.push(current);
  return result;
}

function diffDays(start: string, end: string) {
  return Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}
