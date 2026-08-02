import { useEffect, useRef } from "react";

// 전체화면 상세 오버레이는 상태로만 열리기 때문에, 안드로이드 뒤로가기를 누르면
// 오버레이가 아니라 페이지 자체가 닫혀 버린다. 열릴 때 히스토리 항목을 하나
// 넣어 두고 popstate로 닫아, 뒤로가기가 '목록으로'처럼 동작하게 한다.
export function useOverlayBackClose(open: boolean, close: () => void) {
  const pushedRef = useRef(false);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open) return;

    window.history.pushState({ overlay: true }, "");
    pushedRef.current = true;

    function onPop() {
      // 뒤로가기로 우리가 넣은 항목이 사라진 상태 — 오버레이만 닫는다.
      pushedRef.current = false;
      closeRef.current();
    }

    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // 버튼으로 닫은 경우엔 우리가 넣은 히스토리 항목을 되돌려 준다.
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
    };
  }, [open]);
}
