import { Link } from "react-router-dom";
import { formatPrice } from "../lib/format";
import type { Pass } from "../lib/types";

type PriceCardProps = {
  pass: Pass;
};

export default function PriceCard({ pass }: PriceCardProps) {
  return (
    <Link
      className="group block rounded-card border border-workroom-line bg-workroom-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-workroom-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-workroom-yellow"
      to={`/reserve?pass=${encodeURIComponent(pass.name)}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-black">{pass.name}</h3>
          <p className="mt-1 text-sm font-medium text-workroom-muted">{pass.description}</p>
          <p className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-workroom-muted transition group-hover:text-workroom-text">
            예약하기
            <span aria-hidden className="transition group-hover:translate-x-0.5">→</span>
          </p>
        </div>
        <p className="shrink-0 rounded-full bg-workroom-yellow px-3 py-1 text-sm font-black">
          {formatPrice(pass.price)}
        </p>
      </div>
    </Link>
  );
}
