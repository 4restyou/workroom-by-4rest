import { useEffect, useState } from "react";
import { subscribeToast, type ToastMessage } from "../lib/toast";
import { CheckIcon } from "./icons";

const AUTO_DISMISS_MS = 3200;

// 하단 탭바 위에 떠서, 페이지 어느 위치에서 버튼을 눌러도 결과가 바로 보인다.
export default function Toaster() {
  const [items, setItems] = useState<ToastMessage[]>([]);

  useEffect(() => {
    return subscribeToast((message) => {
      setItems((current) => [...current, message].slice(-3));
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== message.id));
      }, AUTO_DISMISS_MS);
    });
  }, []);

  if (!items.length) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      {items.map((item) => (
        <div
          className={`animate-pop-in pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-card border px-4 py-3 text-sm font-bold shadow-[0_10px_24px_-12px_rgba(20,20,20,0.5)] ${
            item.tone === "error"
              ? "border-red-500 bg-red-50 text-red-800"
              : item.tone === "success"
                ? "border-workroom-ink bg-workroom-yellow text-workroom-ink"
                : "border-workroom-ink bg-workroom-surface text-workroom-ink"
          }`}
          key={item.id}
          onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
          role={item.tone === "error" ? "alert" : "status"}
        >
          {item.tone === "success" ? <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> : null}
          <span className="leading-5">{item.text}</span>
        </div>
      ))}
    </div>
  );
}
