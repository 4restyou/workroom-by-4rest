// '처리할 일' 항목 접어 두기.
//
// 영구 삭제가 아니라 한동안 숨기는 것이다. 연락은 했는데 상황이 그대로면
// 며칠 뒤 다시 떠야 한다 — 한 번 지우면 영영 안 보이는 목록은 놓친 일을
// 조용히 묻어 버린다.
//
// 얼마나 숨길지는 항목 종류가 정한다.
//   쿠폰    1일 — 오늘 안내했으면 됐다. 다음에 또 오면 다시 알린다.
//   휴면    7일 — 연락하고 일주일 기다려 본다.
//   문자실패 7일 — 확인했으면 당분간 접어 둔다.
//
// 급한 항목(결제 미확인·미입실·퇴실 확인)에는 숨기기를 주지 않는다. 처리하면
// 저절로 사라지는 것들이고, 숨길 수 있으면 돈이 새는 걸 못 본 채 지나간다.

export type Dismissal = { key: string; dismissed_at: string };

export type DismissibleAction = {
  key: string;
  /** 없으면 숨길 수 없는 항목. */
  snoozeDays?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** 이 항목이 지금 숨김 상태인가. */
export function isDismissed(action: DismissibleAction, dismissals: Map<string, string>, now: number): boolean {
  if (!action.snoozeDays) return false;
  const at = dismissals.get(action.key);
  if (!at) return false;

  const dismissedAt = new Date(at).getTime();
  if (!Number.isFinite(dismissedAt)) return false;
  return now - dismissedAt < action.snoozeDays * DAY_MS;
}

/** 숨김 기간이 지나지 않은 항목을 걸러낸다. */
export function visibleActions<T extends DismissibleAction>(
  actions: T[],
  dismissals: Map<string, string>,
  now: number,
): T[] {
  return actions.filter((action) => !isDismissed(action, dismissals, now));
}

export function dismissalMap(rows: Dismissal[]): Map<string, string> {
  return new Map(rows.map((row) => [row.key, row.dismissed_at]));
}
