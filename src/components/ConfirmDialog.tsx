import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeConfirm, type ConfirmRequest } from "../lib/confirm";
import { useOverlayBackClose } from "../lib/useOverlayBackClose";
import { buttonClass } from "../lib/ui";

type Pending = { request: ConfirmRequest; settle: (ok: boolean) => void };

// lib/confirm의 confirmDialog() 요청을 실제로 그려 주는 단일 마운트 컴포넌트.
// App에 한 번만 올려 두면 어느 화면에서든 await confirmDialog(...)가 동작한다.
export default function ConfirmDialog() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [typed, setTyped] = useState("");
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const typedInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // 다이얼로그가 닫힌 뒤 원래 누르던 버튼으로 포커스를 돌려준다.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return subscribeConfirm((request, settle) => {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setTyped("");
      setPending({ request, settle });
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    setPending((current) => {
      current?.settle(ok);
      return null;
    });
    setTyped("");
    // 상태 반영 후 포커스를 되돌린다.
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) window.setTimeout(() => target.focus(), 0);
  }, []);

  // 안드로이드 뒤로가기로도 닫힌다(취소 처리).
  useOverlayBackClose(Boolean(pending), () => close(false));

  // 열릴 때 첫 포커스를 준다. 타이핑 확인이 필요하면 입력칸으로.
  useEffect(() => {
    if (!pending) return;
    const target = pending.request.requireTyped ? typedInputRef.current : confirmButtonRef.current;
    target?.focus();
  }, [pending]);

  // Esc로 취소, Tab은 다이얼로그 안에서 순환시킨다(포커스 트랩).
  useEffect(() => {
    if (!pending) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pending, close]);

  // 다이얼로그가 떠 있는 동안 뒤 배경이 스크롤되지 않게 한다.
  useEffect(() => {
    if (!pending) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [pending]);

  if (!pending) return null;

  const { request } = pending;
  const needsTyping = Boolean(request.requireTyped);
  const typingSatisfied = !needsTyping || typed.trim() === request.requireTyped;
  const titleId = `confirm-title-${request.id}`;
  const descriptionId = request.description ? `confirm-desc-${request.id}` : undefined;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:items-center sm:pb-4">
      {/* 바깥을 눌러도 닫히지만, 파괴적 동작에서는 실수 방지를 위해 막는다. */}
      <button
        aria-label="닫기"
        className="absolute inset-0 cursor-default"
        disabled={request.tone === "danger"}
        onClick={() => close(false)}
        tabIndex={-1}
        type="button"
      />

      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="animate-pop-in relative w-full max-w-sm rounded-card border-2 border-workroom-ink bg-workroom-surface p-5 shadow-hard-lg"
        ref={dialogRef}
        role="alertdialog"
      >
        <h2 className="text-base font-black leading-6" id={titleId}>
          {request.title}
        </h2>

        {request.description ? (
          <div className="mt-2 space-y-1.5 text-sm font-medium leading-5 text-workroom-muted" id={descriptionId}>
            {request.description.split("\n").map((line, index) =>
              line.trim() ? <p key={index}>{line}</p> : <span className="block h-1" key={index} />,
            )}
          </div>
        ) : null}

        {needsTyping ? (
          <div className="mt-4 grid gap-1.5">
            <label className="text-xs font-black" htmlFor={`confirm-typed-${request.id}`}>
              계속하려면 <span className="font-mono">{request.requireTyped}</span> 을(를) 입력해 주세요.
            </label>
            <input
              autoComplete="off"
              className="w-full rounded-[6px] border border-workroom-ink bg-workroom-background px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-workroom-yellow"
              id={`confirm-typed-${request.id}`}
              onChange={(event) => setTyped(event.target.value)}
              ref={typedInputRef}
              value={typed}
            />
          </div>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button className={`${buttonClass("secondary", "md")} flex-1`} onClick={() => close(false)} type="button">
            {request.cancelLabel}
          </button>
          <button
            className={`${buttonClass("primary", "md")} flex-1 ${
              request.tone === "danger" ? "border-red-600 bg-red-500 text-white" : ""
            }`}
            disabled={!typingSatisfied}
            onClick={() => close(true)}
            ref={confirmButtonRef}
            type="button"
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
