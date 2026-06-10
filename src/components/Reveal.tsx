import { useEffect, useRef, useState, type ReactNode } from "react";

// Fades + lifts its children into view as they enter the viewport. Mounts with
// the content (so it works on lazy-loaded pages too). Reduced-motion users and
// browsers without IntersectionObserver get the content immediately; the hidden
// start state lives behind a prefers-reduced-motion media query in globals.css.
export default function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${shown ? "is-visible" : ""} ${className}`.trim()}>
      {children}
    </div>
  );
}
