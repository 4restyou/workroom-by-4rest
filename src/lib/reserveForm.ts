import { operatingTimeSlots, todayValue } from "./format";
import type { Pass } from "./types";

// 예약 화면(Reserve)에서 쓰는 순수 계산. 화면 파일이 1,300줄을 넘어 테스트하기
// 어려운 계산만 따로 뺐다.

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export type PassGroup = "시간권" | "종일권" | "주간 / 월권" | "단체·기타";
export type PassOption = Pass & { group: PassGroup };

export function groupPasses(passes: Pass[]) {
  // 0원 항목은 결제 심사에서 허용되지 않고 예약 흐름에도 맞지 않는다.
  // 촬영·모임·장기 이용 상담은 전화·문자 문의로 안내한다.
  const passOptions: PassOption[] = passes.map((pass) => ({
    ...pass,
    group: getPassGroup(pass.name),
  }));

  return (["시간권", "종일권", "주간 / 월권", "단체·기타"] as const)
    .map((name) => ({
      name,
      items: passOptions.filter((pass) => pass.group === name),
    }))
    .filter((group) => group.items.length > 0);
}

export function getPassGroup(passName: string): PassGroup {
  if (passName.includes("시간")) return "시간권";
  if (passName.includes("종일")) return "종일권";
  if (passName.includes("주간") || passName.includes("월권")) return "주간 / 월권";
  return "단체·기타";
}

export function startTimesForDate(date: string, open: string, close: string, durationHours: number, now = new Date()) {
  let earliestMinute: number | undefined;
  if (date === todayValue()) {
    const openMinute = Number(open.slice(0, 2)) * 60 + Number(open.slice(3, 5));
    const nowMinute = now.getHours() * 60 + now.getMinutes() + (now.getSeconds() > 0 ? 1 : 0);
    earliestMinute = nowMinute < openMinute ? openMinute : Math.ceil(nowMinute / 60) * 60;
  }
  return operatingTimeSlots(open, close, durationHours, earliestMinute);
}

export function isWithinOperatingHours(start: string, end: string, open: string, close: string) {
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const openMinute = minutes(open);
  let closeMinute = minutes(close);
  const startMinute = minutes(start);
  let endMinute = minutes(end);
  if (closeMinute <= openMinute) closeMinute += 24 * 60;
  if (endMinute <= startMinute) endMinute += 24 * 60;
  return startMinute >= openMinute && endMinute <= closeMinute;
}
