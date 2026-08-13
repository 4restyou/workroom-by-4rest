// 오늘 일정을 시간축 위에 놓기 위한 계산.
//
// 목록만으로는 "몇 시가 비어 있는지", "언제 겹치는지"가 안 보인다. 예약을 시간축에
// 올려 두면 빈 시간과 몰리는 시간이 한눈에 들어온다.
//
// 순수 함수만 두고 화면은 src/components/admin/TodayTimeline.tsx 가 그린다.

export type TimelineItem<T> = {
  item: T;
  /** 축 시작(운영 시작)으로부터의 분. */
  startMin: number;
  endMin: number;
};

export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

/**
 * 자정을 넘는 운영 시간을 하나의 축으로 편다.
 * 08:00~01:00 이면 축은 480분에서 1500분까지다.
 */
export function axisRange(openTime: string | null, closeTime: string | null) {
  const open = timeToMinutes(openTime) ?? 8 * 60;
  let close = timeToMinutes(closeTime) ?? 25 * 60;
  if (close <= open) close += 24 * 60;
  return { open, close };
}

/** 예약의 시작·종료를 축 위의 분으로 옮긴다. 축을 벗어나면 잘라 낸다. */
export function toSpan(
  startTime: string | null,
  endTime: string | null,
  axis: { open: number; close: number },
): { startMin: number; endMin: number } | null {
  let start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (start === null || end === null) return null;
  // 새벽에 끝나는 예약(23:00~01:00)은 종료가 시작보다 작게 들어온다.
  if (end <= start) end += 24 * 60;
  // 운영이 자정을 넘는데 예약이 새벽 시간대만 차지하는 경우(00:00~01:00).
  if (start < axis.open && start + 24 * 60 <= axis.close) {
    start += 24 * 60;
    end += 24 * 60;
  }
  const clampedStart = Math.max(axis.open, start);
  const clampedEnd = Math.min(axis.close, end);
  if (clampedEnd <= clampedStart) return null;
  return { startMin: clampedStart, endMin: clampedEnd };
}

/**
 * 겹치지 않는 예약을 같은 줄에 몰아 넣는다.
 * 줄 수가 곧 그 시간대의 동시 예약 수라, 몰리는 시간이 눈에 보인다.
 */
export function packLanes<T>(items: readonly TimelineItem<T>[]): TimelineItem<T>[][] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const lanes: TimelineItem<T>[][] = [];
  for (const entry of sorted) {
    const lane = lanes.find((candidate) => {
      const last = candidate[candidate.length - 1];
      return last.endMin <= entry.startMin;
    });
    if (lane) lane.push(entry);
    else lanes.push([entry]);
  }
  return lanes;
}

/** 축 위 위치를 백분율로. 0 = 운영 시작, 100 = 운영 종료. */
export function percentOf(minute: number, axis: { open: number; close: number }) {
  const span = Math.max(1, axis.close - axis.open);
  return ((minute - axis.open) / span) * 100;
}

/** 축에 그릴 시간 눈금(정시 기준). */
export function axisTicks(axis: { open: number; close: number }, everyHours = 2) {
  const ticks: { minute: number; label: string }[] = [];
  const firstHour = Math.ceil(axis.open / 60);
  for (let hour = firstHour; hour * 60 <= axis.close; hour += everyHours) {
    ticks.push({ minute: hour * 60, label: `${String(hour % 24).padStart(2, "0")}시` });
  }
  return ticks;
}
