// 배경 스크롤 잠금.
//
// 예전에는 잠그는 쪽마다 document.body.style.overflow 를 직접 만졌다. 하나가
// 열려 있는 동안 다른 하나가 열리면, 나중 것이 '이전 값'으로 hidden 을 기억한다.
// 그러면 먼저 열린 쪽이 닫히며 풀어 준 잠금을 나중 것이 닫히면서 다시 걸어,
// 아무 창도 없는데 페이지가 영영 스크롤되지 않는 상태가 된다.
//
// 그래서 몇 겹이 걸렸는지 세고, 맨 처음 값은 한 번만 기억한다.

type LockTarget = { style: { overflow: string } };

type LockState = { depth: number; saved: string };

const states = new WeakMap<LockTarget, LockState>();

function bodyTarget(): LockTarget | null {
  if (typeof document === "undefined" || !document.body) return null;
  return document.body;
}

/** 스크롤을 잠그고, 푸는 함수를 돌려준다. 두 번 불러도 한 번만 풀린다. */
export function lockScroll(target: LockTarget | null = bodyTarget()): () => void {
  if (!target) return () => {};

  const state = states.get(target) ?? { depth: 0, saved: target.style.overflow };
  if (state.depth === 0) state.saved = target.style.overflow;
  state.depth += 1;
  states.set(target, state);
  target.style.overflow = "hidden";

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = states.get(target);
    if (!current) return;
    current.depth = Math.max(0, current.depth - 1);
    if (current.depth === 0) {
      target.style.overflow = current.saved;
      states.delete(target);
    }
  };
}
