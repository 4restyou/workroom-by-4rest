import { Link } from "react-router-dom";
import { formatPrice } from "../lib/format";
import { card } from "../lib/ui";
import type { Pass } from "../lib/types";

type PriceCardProps = {
  pass: Pass;
};

export default function PriceCard({ pass }: PriceCardProps) {
  return (
    <Link
      className={`group ${card} block p-5 transition-transform duration-150 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-workroom-yellow`}
      to={`/reserve?pass=${encodeURIComponent(pass.name)}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-bold">{pass.name}</h3>
          <p className="mt-1 text-sm font-medium text-workroom-muted">{pass.description}</p>
          <p className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-workroom-muted transition-colors group-hover:text-workroom-ink">
            예약하기
            <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
          </p>
        </div>
        <p className="shrink-0 rounded-pill border-2 border-workroom-ink bg-workroom-yellow px-3 py-1 text-sm font-black">
          {formatPrice(pass.price)}
        </p>
      </div>
    </Link>
  );
}
