import { useEffect, useState } from "react";

// Desktop-only "back to top" button that appears after scrolling. On mobile the
// fixed reserve bar already occupies the bottom edge, so it stays hidden there.
export default function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  function toTop() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      aria-label="맨 위로"
      onClick={toTop}
      className="fixed bottom-6 right-6 z-30 hidden h-11 w-11 place-items-center rounded-[5px] border border-workroom-ink bg-workroom-surface text-workroom-ink transition-transform duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-95 sm:grid"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}
