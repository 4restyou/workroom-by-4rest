// 배포가 열려 있는 화면을 깨뜨리는 문제를 다룬다.
//
// 무슨 일이 일어나는가.
//   1) 새 버전을 올리면 파일 이름의 해시가 바뀐다(assets/Reserve-A1B2.js → -C3D4.js).
//   2) 서비스워커는 autoUpdate + skipWaiting 이라 새 버전이 곧바로 활성화되고,
//      cleanupOutdatedCaches 가 예전 캐시를 지운다.
//   3) 그런데 이미 열려 있던 탭은 여전히 예전 자바스크립트를 돌리고 있다.
//   4) 그 상태에서 예약·관리자 같은 지연 로딩 화면으로 이동하면, 예전 이름의
//      파일을 받으러 가는데 캐시에도 서버에도 없다 → import 실패 → 오류 화면.
//
// 즉 '오류'가 아니라 '화면이 낡았다'는 신호다. 하루에도 몇 번씩 배포하면
// 탭을 오래 켜 두는 사람(특히 운영자 본인)이 가장 자주 만난다.
//
// 그래서 두 겹으로 막는다.
//   - 새 버전이 켜지면 표시해 두었다가, 다음 화면 이동처럼 잃을 게 없는
//     순간에 조용히 새로고침한다(예약 작성 중에 갑자기 날아가지 않도록).
//   - 그래도 놓친 경우에는 import 실패를 잡아 한 번만 새로고침한다.

/** 사라진 청크를 받으려다 실패한 오류인가(브라우저마다 문구가 다르다). */
export function isStaleModuleError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|dynamically imported module/i.test(
    message,
  );
}

const RELOAD_FLAG = "workroom:reloaded-for-update";

export type ReloadEnv = {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  reload: () => void;
};

function browserEnv(): ReloadEnv | null {
  if (typeof window === "undefined") return null;
  try {
    return { storage: window.sessionStorage, reload: () => window.location.reload() };
  } catch {
    // 사파리 시크릿 모드 등에서 sessionStorage 접근이 막히면 새로고침만 한다.
    return { storage: memoryStorage, reload: () => window.location.reload() };
  }
}

const memoryFallback = new Map<string, string>();
const memoryStorage: ReloadEnv["storage"] = {
  getItem: (key) => memoryFallback.get(key) ?? null,
  setItem: (key, value) => void memoryFallback.set(key, value),
  removeItem: (key) => void memoryFallback.delete(key),
};

/**
 * 새 버전을 받으러 한 번만 새로고침한다.
 * 이미 시도했으면 false — 새로고침해도 안 되는 상황에서 무한 반복하지 않는다.
 */
export function reloadOnceForUpdate(env: ReloadEnv | null = browserEnv()): boolean {
  if (!env) return false;
  if (env.storage.getItem(RELOAD_FLAG)) return false;
  env.storage.setItem(RELOAD_FLAG, "1");
  env.reload();
  return true;
}

/** 화면이 정상으로 뜬 뒤 호출 — 다음 배포에서 다시 복구할 수 있게 표시를 지운다. */
export function clearReloadGuard(env: ReloadEnv | null = browserEnv()): void {
  env?.storage.removeItem(RELOAD_FLAG);
}

let updatePending = false;

/** 새 버전이 활성화됐는지 — 다음 화면 이동에서 새로고침할지 판단한다. */
export function isUpdatePending(): boolean {
  return updatePending;
}

/**
 * 서비스워커가 새 버전으로 교체되는 순간을 지켜본다.
 * 첫 방문(제어자가 없던 상태)에서의 교체는 새 버전이 아니므로 무시한다.
 */
export function watchForAppUpdate(): void {
  if (typeof window === "undefined") return;

  // Vite가 청크 미리 받기에 실패하면 알려 준다. 이 시점엔 화면이 이미 망가진
  // 뒤라 새로고침이 가장 빠른 복구다.
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadOnceForUpdate();
  });

  if (!("serviceWorker" in navigator)) return;
  // 제어자가 없으면 첫 설치다. 이때의 교체는 '새 버전'이 아니므로 세지 않는다.
  if (!navigator.serviceWorker.controller) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    updatePending = true;
  });
}
