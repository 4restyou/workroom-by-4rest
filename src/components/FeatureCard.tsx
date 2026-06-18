import { card, normTint, type TintColor } from "../lib/ui";

export type FeatureIcon = "seat" | "table" | "camera" | "coffee";

const icons: Record<FeatureIcon, JSX.Element> = {
  seat: (
    <>
      <path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4" />
      <path d="M4 11a2 2 0 0 1 2 2v2h12v-2a2 2 0 0 1 4 0v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M6 19v2M18 19v2" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="6" width="18" height="3.2" rx="1" />
      <path d="M6 9.2V18M18 9.2V18" />
    </>
  ),
  camera: (
    <>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  coffee: (
    <>
      <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" />
      <path d="M6 2v2M10 2v2M14 2v2" />
    </>
  ),
};

type FeatureCardProps = {
  title: string;
  body: string;
  icon: FeatureIcon;
  accent?: TintColor;
};

export default function FeatureCard({ title, body, icon, accent = "yellow" }: FeatureCardProps) {
  return (
    <article className={`${card} p-5 transition-colors duration-150 hover:border-workroom-ink`}>
      <div className={`mb-3 grid h-10 w-10 place-items-center rounded-pill border border-workroom-line bg-workroom-${normTint(accent)} text-workroom-ink`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {icons[icon]}
        </svg>
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">{body}</p>
    </article>
  );
}
