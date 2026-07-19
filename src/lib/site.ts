// Single source of truth for business / contact info used across the site.
export const SITE = {
  name: "WORKROOM by 4REST",
  tagline: "필요한 시간만큼 머무는 조용한 작업 공간",
  address: "전남광주통합특별시 동구 충장로5가 96-23, 2층",
  phone: "010-4931-3298",
  hoursLabel: "08:00–다음 날 01:00",
  booking: {
    memberOnly: true,
    confirmationLabel: "예약 신청 후 확인 문자를 보내드립니다.",
    onlinePayment: "예약 확인 후 온라인 결제를 선택한 분께 별도의 결제 링크를 보내드립니다. 링크 수신 후 2시간 이내 결제해 주세요.",
    onsitePayment: "현장 결제는 방문 시 바로 진행할 수 있습니다.",
  },
  instagramUrl: "https://instagram.com/workroom_by4rest",
  threadsUrl: "https://www.threads.net/@workroom_by4rest",
  naverMapUrl: "https://map.naver.com/p/search/%EC%A0%84%EB%82%A8%EA%B4%91%EC%A3%BC%ED%86%B5%ED%95%A9%ED%8A%B9%EB%B3%84%EC%8B%9C%20%EB%8F%99%EA%B5%AC%20%EC%B6%A9%EC%9E%A5%EB%A1%9C5%EA%B0%80%2096-23",
  kakaoMapUrl: "https://map.kakao.com/link/search/%EC%A0%84%EB%82%A8%EA%B4%91%EC%A3%BC%ED%86%B5%ED%95%A9%ED%8A%B9%EB%B3%84%EC%8B%9C%20%EB%8F%99%EA%B5%AC%20%EC%B6%A9%EC%9E%A5%EB%A1%9C5%EA%B0%80%2096-23",
  parking: {
    name: "충장로상점가 공영주차장",
    address: "광주 동구 금남로5가 124-1",
  },
} as const;
