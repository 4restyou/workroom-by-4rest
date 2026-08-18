import { describe, expect, it } from "vitest";
import { clearReloadGuard, isStaleModuleError, reloadOnceForUpdate, type ReloadEnv } from "./appUpdate";

function fakeEnv() {
  const items = new Map<string, string>();
  let reloads = 0;
  const env: ReloadEnv = {
    storage: {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => void items.set(key, value),
      removeItem: (key) => void items.delete(key),
    },
    reload: () => void (reloads += 1),
  };
  return { env, reloads: () => reloads };
}

describe("isStaleModuleError", () => {
  it("recognises the message each browser uses for a missing chunk", () => {
    // 배포 직후 예전 파일이 사라졌을 때 브라우저별로 오는 문구.
    expect(isStaleModuleError(new Error("Failed to fetch dynamically imported module: /assets/Reserve-A1B2.js"))).toBe(true);
    expect(isStaleModuleError(new Error("Importing a module script failed."))).toBe(true);
    expect(isStaleModuleError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isStaleModuleError(new Error("Unable to preload CSS for /assets/index-A1B2.css"))).toBe(true);
  });

  it("leaves real bugs alone", () => {
    // 진짜 오류까지 새로고침으로 덮으면 원인을 영영 못 본다.
    expect(isStaleModuleError(new TypeError("Cannot read properties of null (reading 'price')"))).toBe(false);
    expect(isStaleModuleError(new Error("column passes.min_people does not exist"))).toBe(false);
    expect(isStaleModuleError(null)).toBe(false);
  });

  it("reads the error name too", () => {
    const error = new Error("Loading chunk 12 failed");
    error.name = "ChunkLoadError";
    expect(isStaleModuleError(error)).toBe(true);
  });
});

describe("reloadOnceForUpdate", () => {
  it("reloads once and then refuses", () => {
    // 새로고침해도 안 고쳐지는 상황에서 무한 새로고침에 갇히지 않아야 한다.
    const { env, reloads } = fakeEnv();
    expect(reloadOnceForUpdate(env)).toBe(true);
    expect(reloadOnceForUpdate(env)).toBe(false);
    expect(reloads()).toBe(1);
  });

  it("allows a fresh attempt after the app comes up cleanly", () => {
    const { env, reloads } = fakeEnv();
    reloadOnceForUpdate(env);
    clearReloadGuard(env);
    expect(reloadOnceForUpdate(env)).toBe(true);
    expect(reloads()).toBe(2);
  });

  it("does nothing outside the browser", () => {
    expect(reloadOnceForUpdate(null)).toBe(false);
  });
});
