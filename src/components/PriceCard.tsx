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
      className={`group ${card} block p-5 transition-[transform,background-color,border-color] duration-150 ease-out hover:border-workroom-ink hover:bg-workroom-yellow/20 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workroom-yellow sm:p-6`}
      to={`/reserve?pass=${encodeURIComponent(pass.name)}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-xl font-bold tracking-tight">{pass.name}</h3>
          <p className="mt-1 text-sm font-medium text-workroom-muted">{pass.description}</p>
          <p className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-workroom-muted transition-colors group-hover:text-workroom-ink">
            예약하기
            <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="border-b-4 border-workroom-yellow px-1 pb-1 text-lg font-bold">{formatPrice(pass.price)}</p>
          {/* 결제 금액은 1인 요금 x 인원이다. 단가만 크게 보이면 총액을 오해한다. */}
          <p className="mt-1 text-[11px] font-bold text-workroom-muted">
            1인 기준{(pass.min_people ?? 1) > 1 ? ` · ${pass.min_people}명 이상` : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}
