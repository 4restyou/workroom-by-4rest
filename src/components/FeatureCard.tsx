import { card, type TintColor } from "../lib/ui";

type FeatureCardProps = {
  title: string;
  body: string;
  mark: string;
  accent?: TintColor;
};

export default function FeatureCard({ title, body, mark, accent = "mint" }: FeatureCardProps) {
  return (
    <article className={`${card} p-5 transition-colors duration-150 hover:border-workroom-ink`}>
      <div
        className={`mb-5 grid h-10 w-10 place-items-center rounded-pill border border-workroom-line bg-workroom-${accent} text-sm font-bold`}
      >
        {mark}
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">{body}</p>
    </article>
  );
}
