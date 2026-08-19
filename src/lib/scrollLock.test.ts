import { describe, expect, it } from "vitest";
import { lockScroll } from "./scrollLock";

function target() {
  return { style: { overflow: "" } };
}

describe("lockScroll", () => {
  it("locks and restores", () => {
    const body = target();
    const release = lockScroll(body);
    expect(body.style.overflow).toBe("hidden");
    release();
    expect(body.style.overflow).toBe("");
  });

  it("keeps the page locked until the last holder lets go", () => {
    // 예약 완료 시트 위에 확인창이 뜨는 경우.
    const body = target();
    const outer = lockScroll(body);
    const inner = lockScroll(body);
    inner();
    expect(body.style.overflow).toBe("hidden");
    outer();
    expect(body.style.overflow).toBe("");
  });

  it("does not re-lock the page when holders close out of order", () => {
    // 예전 방식이 페이지를 영영 잠그던 순서 — 안쪽이 나중에 닫힌다.
    const body = target();
    const outer = lockScroll(body);
    const inner = lockScroll(body);
    outer();
    inner();
    expect(body.style.overflow).toBe("");
  });

  it("ignores a release called twice", () => {
    const body = target();
    const first = lockScroll(body);
    const second = lockScroll(body);
    first();
    first();
    expect(body.style.overflow).toBe("hidden");
    second();
    expect(body.style.overflow).toBe("");
  });

  it("restores whatever the page had before", () => {
    const body = { style: { overflow: "auto" } };
    lockScroll(body)();
    expect(body.style.overflow).toBe("auto");
  });

  it("does nothing without a document", () => {
    expect(() => lockScroll(null)()).not.toThrow();
  });
});
