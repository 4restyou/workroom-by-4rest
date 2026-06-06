import { Link } from "react-router-dom";
import { formatPrice } from "../lib/format";
import type { Pass } from "../lib/types";

type PriceCardProps = {
  pass: Pass;
};

export default function PriceCard({ pass }: PriceCardProps) {
  return (
    <Link
      className="block rounded-card border border-workroom-line bg-workroom-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-workroom-text"
      to={`/reserve?pass=${encodeURIComponent(pass.name)}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black">{pass.name}</h3>
          <p className="mt-1 text-sm font-semibold text-workroom-muted">{pass.description}</p>
          <p className="mt-3 text-xs font-black text-workroom-muted">선택해서 예약하기</p>
        </div>
        <p className="shrink-0 rounded-full bg-workroom-yellow px-3 py-1 text-sm font-black">
          {formatPrice(pass.price)}
        </p>
      </div>
    </Link>
  );
}
