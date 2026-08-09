import { useCallback, useEffect, useState } from "react";
import { subscribeToast, type ToastMessage } from "../lib/toast";
import { CheckIcon } from "./icons";

const AUTO_DISMISS_MS = 3200;

// 하단 탭바 위에 떠서, 페이지 어느 위치에서 버튼을 눌러도 결과가 바로 보인다.
export default function Toaster() {
  const [items, setItems] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: ToastMessage["id"]) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    return subscribeToast((message) => {
      setItems((current) => [...current, message].slice(-3));
      window.setTimeout(() => dismiss(message.id), AUTO_DISMISS_MS);
    });
  }, [dismiss]);

  // 예전에는 토스트를 마우스로 눌러야만 닫을 수 있었다(div + onClick).
  // 키보드·보조기기 사용자를 위해 Esc와 닫기 버튼을 둔다.
  useEffect(() => {
    if (!items.length) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setItems([]);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [items.length]);

  if (!items.length) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      {items.map((item) => (
        <div
          className={`animate-pop-in pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-card border py-3 pl-4 pr-1 text-sm font-bold shadow-[0_10px_24px_-12px_rgba(20,20,20,0.5)] ${
            item.tone === "error"
              ? "border-red-500 bg-red-50 text-red-800"
              : item.tone === "success"
                ? "border-workroom-ink bg-workroom-yellow text-workroom-ink"
                : "border-workroom-ink bg-workroom-surface text-workroom-ink"
          }`}
          key={item.id}
          role={item.tone === "error" ? "alert" : "status"}
        >
          {item.tone === "success" ? <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> : null}
          <span className="flex-1 leading-5">{item.text}</span>
          <button
            aria-label="알림 닫기"
            className="-my-2 grid h-11 w-11 shrink-0 place-items-center rounded-[5px] text-base font-black opacity-70 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            onClick={() => dismiss(item.id)}
            type="button"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
