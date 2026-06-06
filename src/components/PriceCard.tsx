import { formatPrice } from "../lib/format";
import type { Pass } from "../lib/types";

type PriceCardProps = {
  pass: Pass;
};

export default function PriceCard({ pass }: PriceCardProps) {
  return (
    <article className="rounded-card border border-workroom-line bg-workroom-surface p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black">{pass.name}</h3>
          <p className="mt-1 text-sm font-semibold text-workroom-muted">{pass.description}</p>
        </div>
        <p className="shrink-0 rounded-full bg-workroom-yellow px-3 py-1 text-sm font-black">
          {formatPrice(pass.price)}
        </p>
      </div>
    </article>
  );
}
