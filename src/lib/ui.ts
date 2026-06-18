// Shared visual language for the "Bold Outline" system: chunky 2px ink
// borders, chunky radii and heavy type — no drop shadows. Depth is carried by
// the line work; buttons get a light lift on hover and a press feedback.

export type ButtonVariant = "primary" | "accent" | "secondary" | "mint" | "lilac";
export type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex select-none items-center justify-center gap-2 rounded-pill border border-workroom-ink font-bold leading-none " +
  "transition-[transform,background-color,opacity] duration-100 " +
  "hover:-translate-y-px " +
  "active:translate-y-0 active:scale-[0.97] active:opacity-90 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workroom-yellow " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:translate-y-0 disabled:active:scale-100";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-workroom-ink text-white",
  accent: "bg-workroom-yellow text-workroom-ink",
  secondary: "bg-workroom-surface text-workroom-ink",
  mint: "bg-workroom-sky text-workroom-ink",
  lilac: "bg-workroom-sky text-workroom-ink",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-3 text-sm sm:text-base",
  lg: "px-6 py-4 text-base sm:text-lg",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
) {
  return [buttonBase, buttonVariants[variant], buttonSizes[size], extra].filter(Boolean).join(" ");
}

// Card surfaces. The brand keeps its bold CTA moments, while content panels use
// a quieter line so the page feels more like a work lounge than a poster.
export const card = "rounded-card border border-workroom-line bg-workroom-surface";
export const cardFlat = card;

export type TintColor = "yellow" | "mint" | "lilac" | "sky" | "coral" | "danger" | "ink";

// Palette discipline: the site runs on black/white/grey + yellow (primary) and
// sky (secondary), with danger kept only for errors. Older / leftover tints are
// collapsed onto that set here so every call site reduces to the same palette.
const COLLAPSE: Partial<Record<TintColor, TintColor>> = { mint: "sky", lilac: "sky", coral: "yellow" };

export function normTint(color: TintColor): TintColor {
  return COLLAPSE[color] ?? color;
}

export function tintCard(color: TintColor, extra = "") {
  const c = normTint(color);
  const bg = c === "ink" ? "bg-workroom-ink text-white" : `bg-workroom-${c}`;
  const border = c === "ink" ? "border-workroom-ink" : "border-workroom-line";
  return `rounded-card border ${border} ${bg} ${extra}`.trim();
}

// Small label chip.
export function badge(color: TintColor = "yellow", extra = "") {
  const c = normTint(color);
  const bg = c === "ink" ? "bg-workroom-ink text-white" : `bg-workroom-${c} text-workroom-ink`;
  const border = c === "ink" ? "border-workroom-ink" : "border-workroom-line";
  return `inline-flex items-center rounded-pill border ${border} px-3 py-1 text-xs font-bold ${bg} ${extra}`.trim();
}
