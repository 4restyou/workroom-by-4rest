import type { SVGProps } from "react";

// Shared line-icon set: single visual language (24×24 grid, 2px stroke,
// currentColor) so the UI stops mixing emoji glyphs in as icons.
type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function SubwayIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5" y="3" width="14" height="14" rx="3" />
      <path d="M5 11h14M9 17l-2 4M15 17l2 4" />
      <circle cx="9" cy="14" r="0.5" />
      <circle cx="15" cy="14" r="0.5" />
    </Base>
  );
}

export function BusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="4" width="16" height="13" rx="2.5" />
      <path d="M4 11h16M8 17v3M16 17v3" />
      <circle cx="8.5" cy="14" r="0.5" />
      <circle cx="15.5" cy="14" r="0.5" />
    </Base>
  );
}

export function ParkingIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3" />
    </Base>
  );
}

export function IdCardIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.5 16a3 3 0 0 1 6 0M14 10h4M14 13.5h3" />
    </Base>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 3h6M10 3l-.8 6.2L6 12h12l-3.2-2.8L14 3M12 12v8" />
    </Base>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 12.5l4.5 4.5L19 6.5" />
    </Base>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 4 2.5 20h19L12 4zM12 10v4M12 17.5h.01" />
    </Base>
  );
}
