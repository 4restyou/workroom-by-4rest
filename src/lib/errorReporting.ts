import { isStaleModuleError } from "./appUpdate";
import { supabase } from "./supabase";

// 손님 화면에서 난 오류를 client_error_logs에 한 줄씩 남긴다.
// 화면을 막는 오류(ErrorBoundary)와, 화면은 살아 있지만 뒤에서 터진 오류
// (window error / unhandledrejection) 둘 다 받는다.

export type ClientErrorKind = "render" | "error" | "rejection";

// 한 페이지에서 같은 오류가 반복되거나 루프를 돌아도 몇 건만 보낸다.
const MAX_PER_PAGE = 5;
const sent = new Set<string>();

// 고칠 수 없거나 의미 없는 것: 확장 프로그램·타사 스크립트("Script error."),
// 브라우저 경고성 메시지, 네트워크가 끊겨 난 실패, 배포 직후 낡은 화면(스스로 새로고침함).
const NOISE = [
  /^Script error\.?$/i,
  /ResizeObserver loop/i,
  /^(TypeError: )?(Failed to fetch|NetworkError when attempting to fetch resource|Load failed|네트워크 연결이 끊어진 것 같습니다)\.?$/i,
  /AbortError/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
];

export function describeError(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    const message = error.message ? `${error.name}: ${error.message}` : error.name;
    return { message, stack: error.stack ?? null };
  }
  if (typeof error === "string") return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

export function shouldReport(error: unknown, message: string, stack: string | null) {
  if (!message) return false;
  if (isStaleModuleError(error)) return false;
  return !NOISE.some((pattern) => pattern.test(message) || (stack ? pattern.test(stack) : false));
}

function clip(value: string | null | undefined, max: number) {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

export function reportClientError(kind: ClientErrorKind, error: unknown) {
  try {
    if (!supabase || typeof window === "undefined") return;
    const { message, stack } = describeError(error);
    if (!shouldReport(error, message, stack)) return;
    const key = `${kind}:${message}`;
    if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
    sent.add(key);

    void supabase.from("client_error_logs").insert({
      kind,
      message: clip(message, 500),
      stack: clip(stack, 2000),
      path: clip(window.location.pathname, 200),
      app_version: typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : null,
      user_agent: clip(navigator.userAgent, 300),
    }).then(() => undefined, () => undefined);
  } catch {
    // 오류를 기록하다가 또 오류를 내지 않는다.
  }
}

export function installErrorReporting() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    // 이미지·스크립트 로드 실패도 error 이벤트로 오지만 error 객체가 없다.
    if (!event.error && !event.message) return;
    reportClientError("error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportClientError("rejection", event.reason);
  });
}

export type ClientErrorRow = {
  id: number;
  created_at: string;
  kind: ClientErrorKind;
  message: string;
  stack: string | null;
  path: string | null;
  app_version: string | null;
  user_agent: string | null;
  profile_id: string | null;
};

export type ClientErrorGroup = {
  message: string;
  count: number;
  people: number;
  lastAt: string;
  paths: string[];
  sample: ClientErrorRow;
};

/** 같은 메시지끼리 묶어 많이·최근에 난 순으로. 관리자 화면용. */
export function groupClientErrors(rows: ClientErrorRow[]): ClientErrorGroup[] {
  const groups = new Map<string, { rows: ClientErrorRow[] }>();
  for (const row of rows) {
    const group = groups.get(row.message) ?? { rows: [] };
    group.rows.push(row);
    groups.set(row.message, group);
  }
  return [...groups.entries()]
    .map(([message, { rows: list }]) => {
      const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const people = new Set(list.map((row) => row.profile_id ?? `guest:${row.user_agent ?? ""}`)).size;
      return {
        message,
        count: list.length,
        people,
        lastAt: sorted[0].created_at,
        paths: [...new Set(list.map((row) => row.path).filter((path): path is string => Boolean(path)))].slice(0, 5),
        sample: sorted[0],
      };
    })
    .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
}
