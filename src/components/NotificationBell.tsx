import { useEffect, useState } from "react";
import { formatDate } from "../lib/format";
import { supabase } from "../lib/supabase";
import { buttonClass, card, cardFlat, tintCard } from "../lib/ui";
import type { ReservationNotification } from "../lib/types";

export default function NotificationBell() {
  const [items, setItems] = useState<ReservationNotification[]>([]);
  const [open, setOpen] = useState(false);

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
    setItems((data ?? []) as ReservationNotification[]);
  }

  useEffect(() => {
    void load();
  }, []);

  const unread = items.filter((item) => !item.is_read).length;

  async function openPopup() {
    setOpen(true);
    if (!supabase) return;
    const unreadIds = items.filter((item) => !item.is_read).map((item) => item.id);
    if (!unreadIds.length) return;
    await supabase.from("reservation_notifications").update({ is_read: true }).in("id", unreadIds);
    setItems((current) => current.map((item) => (unreadIds.includes(item.id) ? { ...item, is_read: true } : item)));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPopup()}
        aria-label={`알림${unread ? ` ${unread}건` : ""}`}
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
        <div className="fixed inset-0 z-50 grid justify-center bg-black/50 p-4 pt-20" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className={`${card} h-fit max-h-[75vh] w-full max-w-md overflow-y-auto p-5`} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">알림</h2>
              <button className={buttonClass("secondary", "sm")} onClick={() => setOpen(false)} type="button">
                닫기
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {items.length ? (
                items.map((item) => (
                  <div className={`${tintCard("yellow")} p-3`} key={item.id}>
                    <p className="text-sm font-bold">{item.title}</p>
                    {item.body ? <p className="mt-1 text-sm font-medium leading-6">{item.body}</p> : null}
                    <p className="mt-1 text-xs font-medium text-workroom-muted">{formatDate(item.created_at.slice(0, 10))}</p>
                  </div>
                ))
              ) : (
                <p className={`${cardFlat} px-4 py-3 text-sm font-medium text-workroom-muted`}>새 알림이 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
