import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isUpdatePending } from "../lib/appUpdate";

// 새 버전이 활성화됐다고 표시돼 있으면, 화면을 옮기는 순간 새로고침한다.
//
// 바로 새로고침하지 않는 이유: 예약 폼을 쓰는 중이거나 결제창을 띄운 순간에
// 화면이 날아가면 그게 더 큰 사고다. 화면 이동은 어차피 내용을 버리는
// 순간이라 여기서 갈아타면 손님은 로딩 한 번으로 느낀다.
export default function ApplyAppUpdate() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isUpdatePending()) return;
    // 결제 복귀 화면은 건드리지 않는다. 승인 결과를 확인하는 중에 새로고침하면
    // 돈은 빠져나갔는데 예약이 안 잡히는 상태가 될 수 있다.
    if (pathname.startsWith("/payment")) return;
    window.location.reload();
  }, [pathname]);

  return null;
}
