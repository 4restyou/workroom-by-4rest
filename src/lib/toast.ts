// 화면 어디서 눌러도 보이는 짧은 알림(토스트).
// 저장 버튼이 화면 아래에 있는데 결과 메시지는 페이지 맨 위에만 떠서 "아무 반응이
// 없는 것처럼" 보이던 문제를 해결하기 위한 공용 채널이다.

export type ToastTone = "success" | "error" | "info";
export type ToastMessage = { id: number; tone: ToastTone; text: string };

type Listener = (toast: ToastMessage) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function subscribeToast(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(tone: ToastTone, text: string) {
  const trimmed = text?.trim();
  if (!trimmed) return;
  const message: ToastMessage = { id: nextId++, tone, text: trimmed };
  listeners.forEach((listener) => listener(message));
}

export const toast = {
  success: (text: string) => emit("success", text),
  error: (text: string) => emit("error", text),
  info: (text: string) => emit("info", text),
};
