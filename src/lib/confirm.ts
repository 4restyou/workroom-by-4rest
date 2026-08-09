// 되돌릴 수 없는 동작을 실행하기 전에 띄우는 확인 다이얼로그.
//
// window.confirm을 대체한다. 기본 다이얼로그는 (1) PWA standalone에서 브랜드가
// 깨지고, (2) 스타일을 줄 수 없어 "환불"과 "정말요?"가 똑같이 생겼으며,
// (3) 긴 문구가 iOS에서 잘린다. 무엇보다 환불·탈퇴처럼 돈과 계정이 걸린 동작에
// 확인 강도를 다르게 줄 수가 없다.
//
// toast와 같은 구독 방식이라, 화면 어디서든 `await confirmDialog(...)`만 부르면
// 된다. 실제 렌더링은 <ConfirmDialog />(App에 한 번 마운트)가 맡는다.

export type ConfirmTone = "default" | "danger";

/**
 * 확인 다이얼로그 안에서 값을 받아야 할 때 쓰는 입력칸.
 * window.prompt를 대체한다(브랜드가 깨지고, 여러 값을 한 번에 못 받고,
 * PWA에서 두 번 연속 뜨면 두 번째가 무시되는 브라우저가 있었다).
 */
export type PromptField = {
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  /** 숫자 전용 키패드를 띄운다. 값 자체는 문자열로 돌려준다. */
  numeric?: boolean;
  required?: boolean;
};

export type PromptValues = Record<string, string>;

export type ConfirmRequest = {
  id: number;
  title: string;
  /** 본문. 줄바꿈(\n)은 문단으로 렌더링된다. */
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: ConfirmTone;
  /**
   * 값이 있으면 사용자가 이 문구를 그대로 입력해야 확인 버튼이 열린다.
   * 환불·QR 재발급처럼 되돌릴 수 없고 파급이 큰 동작에만 쓴다.
   */
  requireTyped?: string;
  /** 있으면 입력 폼이 되고, 확인 시 입력값을 돌려준다. */
  fields?: PromptField[];
};

export type ConfirmOptions = Omit<Partial<ConfirmRequest>, "id"> & { title: string };

/** false = 취소. true = 확인(입력칸 없음). 객체 = 확인 + 입력값. */
export type ConfirmResult = boolean | PromptValues;

type Listener = (request: ConfirmRequest, resolve: (result: ConfirmResult) => void) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function subscribeConfirm(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  const request: ConfirmRequest = {
    id: nextId++,
    title: options.title,
    description: options.description,
    confirmLabel: options.confirmLabel ?? "확인",
    cancelLabel: options.cancelLabel ?? "취소",
    tone: options.tone ?? "default",
    requireTyped: options.requireTyped,
    fields: options.fields,
  };

  // 다이얼로그를 그릴 대상이 없으면(테스트 등) 막지 않고 통과시킨다.
  if (!listeners.size) return Promise.resolve(true);

  return open(request).then(Boolean);
}

/** 확인과 함께 값을 입력받는다. 취소하면 null. */
export function promptDialog(options: ConfirmOptions & { fields: PromptField[] }): Promise<PromptValues | null> {
  const request: ConfirmRequest = {
    id: nextId++,
    title: options.title,
    description: options.description,
    confirmLabel: options.confirmLabel ?? "확인",
    cancelLabel: options.cancelLabel ?? "취소",
    tone: options.tone ?? "default",
    requireTyped: options.requireTyped,
    fields: options.fields,
  };

  // 렌더링 대상이 없으면 기본값으로 진행한다(테스트 등).
  if (!listeners.size) {
    return Promise.resolve(Object.fromEntries(options.fields.map((field) => [field.name, field.defaultValue ?? ""])));
  }

  return open(request).then((result) => (result === false ? null : typeof result === "object" ? result : {}));
}

function open(request: ConfirmRequest): Promise<ConfirmResult> {
  return new Promise<ConfirmResult>((resolve) => {
    let settled = false;
    const settle = (result: ConfirmResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    listeners.forEach((listener) => listener(request, settle));
  });
}
