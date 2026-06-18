import { statusLabel } from "../lib/format";
import type { ReservationStatus } from "../lib/types";

const statusClass: Record<ReservationStatus, string> = {
  pending: "bg-workroom-yellow text-workroom-ink",
  confirmed: "bg-workroom-sky text-workroom-ink",
  canceled: "bg-workroom-surface text-workroom-muted",
  completed: "bg-workroom-ink text-white",
  no_show: "bg-workroom-danger text-workroom-ink",
};

type StatusBadgeProps = {
  status: ReservationStatus;
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-pill border border-workroom-line px-3 py-1 text-xs font-bold ${statusClass[status]}`}
    >
      {statusLabel[status]}
    </span>
  );
}
