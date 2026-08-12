import type { Pass } from "./types";

// Supabase 연결이 끊겼을 때만 쓰이는 예비 가격표. 평소에는 DB 값을 보여주지만,
// 하필 그 순간 손님에게 노출되므로 실제 판매가와 맞춰 둔다.
// (가격은 1인 기준이며 실제 결제 금액은 가격 x 인원 — migration 0043)
export const defaultPasses: Pass[] = [
  {
    id: "default-three-hour",
    name: "3시간권",
    description: "기본 이용권 / 커피 1잔",
    price: 14000,
  },
  {
    id: "default-extra-hour",
    name: "추가 1시간",
    description: "3시간 이후 좌석 여유 시 연장",
    price: 4000,
  },
  {
    id: "default-day",
    name: "종일권",
    description: "08:00-다음 날 01:00 / 커피 1일 3잔 / 17시 이전 입장 권장",
    price: 35000,
  },
  {
    id: "default-week",
    name: "주간권",
    description: "6일 이용(일요일 휴무) / 08:00-다음 날 01:00 / 커피 1일 3잔",
    price: 149000,
  },
  {
    id: "default-month-flex",
    name: "월권 자유석",
    description: "4주 기준 / 비지정석 / 커피 1일 3잔",
    price: 229000,
  },
  {
    id: "default-month-fixed",
    name: "월권 지정석",
    description: "4주 기준 / 지정석 / 커피 1일 3잔",
    price: 299000,
  },
  {
    id: "default-group-inquiry",
    name: "단체 및 모임 이용권",
    description: "6인 이상 대관 · 3시간 기준. 일요일 대관은 문의 후 날짜를 열어드립니다. 주류·음식 반입 불가, 음료와 간단한 핑거푸드 가능",
    price: 25000,
    min_people: 6,
  },
];
