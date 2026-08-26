// 장기 이용권(주간권·월권)의 이용 기간 계산.
//
// 월권은 '4주 = 영업일 24일' 상품이다(일요일 정기휴무 기준). 날짜로 28일이
// 아니라 실제로 쓸 수 있는 날을 세야 한다. 특정일 휴무가 끼면 그만큼 종료일이
// 뒤로 밀려야 판 만큼을 채운다.
//
// 예전에는 자동청구가 그냥 +28일을 더했다. 그래서 첫 회차만 정확하고, 두 번째
// 회차부터는 휴무가 낀 달마다 회원이 하루씩 손해를 봤다.
//
// 프론트엔드(src/lib/reservations.ts)에 같은 규칙이 있고, 두 구현이 어긋나지
// 않는지 src/lib/accessPeriod.test.ts 가 대조한다.

export function passPeriodWeeks(name: string): number {
  const matched = name.match(/(\d+)\s*주/);
  if (matched) return Number(matched[1]);
  if (name.includes("월권") || name.includes("월간")) return 4;
  if (name.includes("주간")) return 1;
  return 4;
}

export function passUsableDays(name: string, openWeekdayCount: number): number {
  const perWeek = openWeekdayCount > 0 ? openWeekdayCount : 7;
  return passPeriodWeeks(name) * perWeek;
}

function dateValue(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** 시작일부터 이용 가능일을 usableDays만큼 채운 마지막 날짜. */
export function accessEndDate(
  startDate: string,
  passName: string,
  openWeekdays: number[],
  closedDates: Iterable<string> = [],
): string {
  if (!startDate) return startDate;
  const open = openWeekdays.length ? openWeekdays : [0, 1, 2, 3, 4, 5, 6];
  const target = passUsableDays(passName, open.length);
  const openSet = new Set(open);
  const closedSet = new Set(closedDates);

  const cursor = new Date(`${startDate}T00:00:00Z`);
  let counted = 0;
  let lastOpen = startDate;
  // 무한 루프 방지: 필요한 날의 4배까지만 본다. 휴무가 많아도 멈춘다.
  for (let step = 0; step < target * 4 + 14 && counted < target; step += 1) {
    const value = dateValue(cursor);
    if (openSet.has(cursor.getUTCDay()) && !closedSet.has(value)) {
      counted += 1;
      lastOpen = value;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return lastOpen;
}
