// Shimmering placeholder for loading states. Uses the .skeleton utility in
// globals.css (reduced-motion safe).
export default function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-card ${className}`} aria-hidden />;
}
