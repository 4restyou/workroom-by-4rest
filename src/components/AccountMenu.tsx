import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setOpen(false);
    if (supabase) await supabase.auth.signOut();
    navigate("/", { replace: true });
  }

  const itemClass = "rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors hover:bg-workroom-yellow";

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1 transition-colors hover:text-workroom-ink"
      >
        내정보
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 grid w-44 animate-pop-in gap-1 rounded-card border-2 border-workroom-ink bg-workroom-surface p-2 text-workroom-ink shadow-hard">
          <Link className={itemClass} to="/account?tab=reservations" onClick={() => setOpen(false)}>
            예약현황
          </Link>
          <Link className={itemClass} to="/account?tab=profile" onClick={() => setOpen(false)}>
            회원정보
          </Link>
          <button className={itemClass} onClick={() => void signOut()} type="button">
            로그아웃
          </button>
        </div>
      ) : null}
    </div>
  );
}
