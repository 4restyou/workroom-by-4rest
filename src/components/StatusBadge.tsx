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
      className={`inline-flex shrink-0 items-center rounded-[4px] border border-workroom-line px-2.5 py-1 text-[11px] font-bold ${statusClass[status]}`}
    >
      {statusLabel[status]}
    </span>
  );
}
