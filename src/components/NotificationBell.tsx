import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDate } from "../lib/format";
import { supabase } from "../lib/supabase";
import { buttonClass, cardFlat, tintCard } from "../lib/ui";
import type { ReservationNotification } from "../lib/types";

const SEEN_KEY = "wr_notif_seen_at";

// Where a notification should take you when tapped.
function routeFor(item: ReservationNotification): string {
  if (item.type === "inquiry") {
    return item.reservation_id ? `/admin/reservations?reservation=${item.reservation_id}` : "/admin/reservations";
  }
  return "/account?tab=reservations";
}

export default function NotificationBell() {
  const [items, setItems] = useState<ReservationNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<ReservationNotification | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  function goTo(item: ReservationNotification) {
    setOpen(false);
    setToast(null);
    navigate(routeFor(item));
  }

  // Pop a toast for the newest unread notification we haven't surfaced yet.
  function maybeToast(list: ReservationNotification[]) {
    if (typeof window === "undefined") return;
    const newestUnread = list.find((item) => !item.is_read);
    if (!newestUnread) return;
    const seen = window.localStorage.getItem(SEEN_KEY) ?? "";
    if (newestUnread.created_at > seen) {
      setToast(newestUnread);
      window.localStorage.setItem(SEEN_KEY, newestUnread.created_at);
    }
  }

  async function load() {
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      setItems([]);
      return;
    }
    const { data } = await supabase
      .from("reservation_notifications")
      .select("*")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const rows = (data ?? []) as ReservationNotification[];
    setItems(rows);
    maybeToast(rows);
  }

  // Initial load + light polling so new notifications surface during a session.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
    // load is intentionally mount-only (polling); deps left empty on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Close dropdown on outside click / Escape.
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

  const unread = items.filter((item) => !item.is_read).length;

  async function markRead() {
    if (!supabase) return;
    const unreadIds = items.filter((item) => !item.is_read).map((item) => item.id);
    if (!unreadIds.length) return;
    await supabase.from("reservation_notifications").update({ is_read: true }).in("id", unreadIds);
    setItems((current) => current.map((item) => (unreadIds.includes(item.id) ? { ...item, is_read: true } : item)));
  }

  async function openDropdown() {
    setToast(null);
    setOpen(true);
    await markRead();
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : void openDropdown())}
        aria-label={`알림${unread ? ` ${unread}건` : ""}`}
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-pill border-2 border-workroom-ink bg-workroom-surface text-workroom-ink transition active:translate-x-[1px] active:translate-y-[1px]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread ? (
          <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-[16px] place-items-center rounded-pill border-2 border-workroom-ink bg-workroom-yellow px-0.5 text-[9px] font-black">
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(20rem,calc(100vw-2rem))] animate-pop-in rounded-card border-2 border-workroom-ink bg-workroom-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-black">알림</h2>
            <button className={buttonClass("secondary", "sm")} onClick={() => setOpen(false)} type="button">
              닫기
            </button>
          </div>
          <div className="mt-3 grid max-h-[60vh] gap-2 overflow-y-auto">
            {items.length ? (
              items.map((item) => (
                <button type="button" onClick={() => goTo(item)} className={`${tintCard("yellow")} block w-full p-3 text-left`} key={item.id}>
                  <p className="text-sm font-bold">{item.title}</p>
                  {item.body ? <p className="mt-1 text-sm font-medium leading-6">{item.body}</p> : null}
                  <p className="mt-1 text-xs font-medium text-workroom-muted">{formatDate(item.created_at.slice(0, 10))}</p>
                </button>
              ))
            ) : (
              <p className={`${cardFlat} px-4 py-3 text-sm font-medium text-workroom-muted`}>새 알림이 없습니다.</p>
            )}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-3 top-[70px] z-[60] w-[min(20rem,calc(100vw-1.5rem))] animate-pop-in rounded-card border-2 border-workroom-ink bg-workroom-yellow"
        >
          <button type="button" onClick={() => goTo(toast)} className="block w-full p-4 pr-9 text-left">
            <p className="text-sm font-black">{toast.title}</p>
            {toast.body ? <p className="mt-1 text-sm font-medium leading-6">{toast.body}</p> : null}
          </button>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="닫기"
            className="absolute right-2 top-2 grid h-6 w-6 place-items-center text-sm font-black"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
