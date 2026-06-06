import type { Pass } from "./types";

export const defaultPasses: Pass[] = [
  {
    id: "default-hourly",
    name: "1시간권",
    description: "1시간 이용",
    price: 4000,
  },
  {
    id: "default-day-light",
    name: "종일권 라이트",
    description: "평일 09:00-18:00",
    price: 30000,
  },
  {
    id: "default-day-standard",
    name: "종일권 스탠다드",
    description: "평일 09:00-21:00",
    price: 40000,
  },
  {
    id: "default-week-light",
    name: "주간권 라이트",
    description: "월-금 09:00-18:00",
    price: 99000,
  },
  {
    id: "default-week-standard",
    name: "주간권 스탠다드",
    description: "월-금 09:00-21:00",
    price: 139000,
  },
  {
    id: "default-month-flex",
    name: "월권 자유석",
    description: "4주 기준 / 비지정석",
    price: 199000,
  },
  {
    id: "default-month-fixed",
    name: "월권 지정석",
    description: "4주 기준 / 지정석",
    price: 299000,
  },
];
