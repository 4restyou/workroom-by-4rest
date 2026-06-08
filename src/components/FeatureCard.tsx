import { card, type TintColor } from "../lib/ui";

type FeatureCardProps = {
  title: string;
  body: string;
  mark: string;
  accent?: TintColor;
};

export default function FeatureCard({ title, body, mark, accent = "mint" }: FeatureCardProps) {
  return (
    <article className={`${card} p-5 transition-transform duration-150 hover:-translate-y-1`}>
      <div
        className={`mb-5 grid h-11 w-11 place-items-center rounded-pill border-2 border-workroom-ink bg-workroom-${accent} text-base font-black`}
      >
        {mark}
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">{body}</p>
    </article>
  );
}
