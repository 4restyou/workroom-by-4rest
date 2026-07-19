import type { Pass } from "./types";

export const defaultPasses: Pass[] = [
  {
    id: "default-three-hour",
    name: "3시간권",
    description: "기본 이용권 / 커피 1잔",
    price: 12000,
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
    description: "08:00-다음 날 01:00 / 커피 1일 3잔",
    price: 40000,
  },
  {
    id: "default-week",
    name: "주간권",
    description: "월-금 08:00-다음 날 01:00 / 커피 1일 3잔",
    price: 149000,
  },
  {
    id: "default-month-flex",
    name: "월권 자유석",
    description: "4주 기준 / 비지정석 / 커피 1일 3잔",
    price: 199000,
  },
  {
    id: "default-month-fixed",
    name: "월권 지정석",
    description: "4주 기준 / 지정석 / 커피 1일 3잔",
    price: 299000,
  },
];
