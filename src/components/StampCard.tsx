import cat1 from "../../assets/cat1.svg";
import { card, tintCard } from "../lib/ui";

type StampCardProps = {
  filled: number;
  goal: number;
  reward?: string;
};

// Old-school punch card: `goal` slots, filled ones get a cat stamp.
export default function StampCard({ filled, goal, reward }: StampCardProps) {
  const slots = Array.from({ length: Math.max(goal, 1) }, (_, index) => index < filled);

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-black">출근 도장</p>
        <p className="text-sm font-bold text-workroom-muted">
          {filled} / {goal}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2.5">
        {slots.map((on, index) => (
          <div
            key={index}
            className={`grid aspect-square place-items-center rounded-pill border-2 ${
              on ? "border-workroom-ink bg-workroom-yellow" : "border-dashed border-workroom-line bg-workroom-surface"
            }`}
          >
            {on ? (
              <img src={cat1} alt="" aria-hidden className="h-[62%] w-[62%] object-contain" />
            ) : (
              <span className="text-xs font-bold text-workroom-line">{index + 1}</span>
            )}
          </div>
        ))}
      </div>

      {reward ? (
        <p className={`mt-4 ${tintCard("mint")} p-3 text-sm font-bold`}>
          {goal}칸 채우면 → {reward}
        </p>
      ) : null}
    </div>
  );
}
