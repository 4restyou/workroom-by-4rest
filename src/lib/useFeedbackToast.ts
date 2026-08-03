import { useEffect } from "react";
import { toast } from "./toast";

// 각 화면이 이미 갖고 있는 success/error 상태를 그대로 토스트로도 띄운다.
// 호출 지점을 일일이 고치지 않고도, 페이지 위쪽에만 뜨던 결과 메시지를
// 버튼 근처(화면 하단)에서 바로 확인할 수 있게 된다.
export function useFeedbackToast(success?: string, error?: string) {
  useEffect(() => {
    if (success) toast.success(success);
  }, [success]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);
}
