import { useEffect } from "react";

// 전체화면 상세 오버레이는 상태로만 열리기 때문에, 안드로이드 뒤로가기를 누르면
// 오버레이가 아니라 페이지 자체가 닫혀 버린다. 열릴 때 히스토리 항목을 하나
// 넣어 두고 popstate로 닫아, 뒤로가기가 '목록으로'처럼 동작하게 한다.
//
// 주의: 정리(cleanup) 단계에서 history.back()을 부르면 안 된다. 오버레이가
// 렌더링되지 않는 넓은 화면에서도 상태는 켜질 수 있어서, 다른 메뉴로 이동하는
// 순간 언마운트 → back()이 실행돼 방금 연 화면에서 튕겨 나온다.
// 그래서 (1) 오버레이가 실제로 보이는 폭에서만 동작시키고, (2) 정리에서는
// 리스너만 제거한다. 남는 히스토리 항목 하나는 같은 페이지를 가리키므로 무해하다.
const OVERLAY_MEDIA = "(max-width: 1279px)";

export function useOverlayBackClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined" || !window.matchMedia(OVERLAY_MEDIA).matches) return;

    window.history.pushState({ overlay: true }, "");

    function onPop() {
      close();
    }

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // close는 매 렌더 새로 만들어질 수 있어 의존성에서 제외한다(열림 상태로만 제어).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
