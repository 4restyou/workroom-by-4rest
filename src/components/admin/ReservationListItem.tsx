import StatusBadge from "../StatusBadge";
import { formatTimeRange } from "../../lib/format";
import { formatCompactDate, formatCompactPeriod } from "../../lib/adminReservations";
import { isLongTermReservation } from "../../lib/reservations";
import type { Reservation, ReservationStatus } from "../../lib/types";

export default function ReservationListItem({
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
  const barColor: Record<ReservationStatus, string> = {
    pending: "bg-workroom-yellow",
    confirmed: "bg-workroom-sky",
    completed: "bg-workroom-ink",
    canceled: "bg-workroom-line",
    no_show: "bg-workroom-danger",
  };
  const dimmed = reservation.status === "canceled" || reservation.status === "no_show";
  const longTerm = isLongTermReservation(reservation);
  const periodStart = reservation.access_start_date ?? reservation.date;
  const periodEnd = reservation.access_end_date ?? reservation.date;
  const passName = reservation.pass_name_snapshot || reservation.pass_type;

  return (
    <button
      aria-pressed={isSelected}
      className={`group flex w-full items-center justify-between gap-3 border-b border-workroom-line py-3 pl-3 pr-4 text-left transition-colors last:border-b-0 ${selectedClass} ${dimmed ? "opacity-55" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span aria-hidden className={`-my-3 mr-1 w-1 self-stretch shrink-0 rounded-full ${barColor[reservation.status]}`} />
      <div className="min-w-0 flex-1">
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
