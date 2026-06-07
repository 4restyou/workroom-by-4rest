// Shared visual language for the "Bold Playful" system: chunky 2px ink
// borders, hard offset (sticker) shadows, and a tactile press interaction.

export type ButtonVariant = "primary" | "accent" | "secondary" | "mint" | "lilac";
export type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-pill border-2 border-workroom-ink font-bold leading-none " +
  "shadow-hard transition-[transform,box-shadow] duration-100 " +
  "hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-lg " +
  "active:translate-x-[3px] active:translate-y-[3px] active:shadow-none " +
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-workroom-yellow " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-hard";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-workroom-ink text-white",
  accent: "bg-workroom-yellow text-workroom-ink",
  secondary: "bg-workroom-surface text-workroom-ink",
  mint: "bg-workroom-mint text-workroom-ink",
  lilac: "bg-workroom-lilac text-workroom-ink",
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

// Card surfaces. `card` is the standard raised sticker; `cardFlat` drops the
// shadow for nested panels.
export const card = "rounded-card border-2 border-workroom-ink bg-workroom-surface shadow-hard";
export const cardFlat = "rounded-card border-2 border-workroom-ink bg-workroom-surface";

export type TintColor = "yellow" | "mint" | "lilac" | "sky" | "coral" | "danger" | "ink";

export function tintCard(color: TintColor, extra = "") {
  const bg = color === "ink" ? "bg-workroom-ink text-white" : `bg-workroom-${color}`;
  return `rounded-card border-2 border-workroom-ink shadow-hard ${bg} ${extra}`.trim();
}

// Small label chip.
export function badge(color: TintColor = "yellow", extra = "") {
  const bg = color === "ink" ? "bg-workroom-ink text-white" : `bg-workroom-${color} text-workroom-ink`;
  return `inline-flex items-center rounded-pill border-2 border-workroom-ink px-3 py-1 text-xs font-bold ${bg} ${extra}`.trim();
}
