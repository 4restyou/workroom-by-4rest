import { statusLabel } from "../lib/format";
import type { ReservationStatus } from "../lib/types";

const statusClass: Record<ReservationStatus, string> = {
  pending: "bg-workroom-yellow text-workroom-text",
  confirmed: "bg-green-200 text-workroom-text",
  canceled: "bg-zinc-200 text-workroom-muted",
  completed: "bg-workroom-text text-white",
};

type StatusBadgeProps = {
  status: ReservationStatus;
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex rounded-full border border-workroom-line px-3 py-1 text-xs font-black ${statusClass[status]}`}>
      {statusLabel[status]}
    </span>
  );
}
