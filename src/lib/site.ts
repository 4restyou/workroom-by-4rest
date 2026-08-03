// 온라인 결제(PG) 정식 오픈 여부. 결제 시스템이 완료되면 true로 바꾸면
// 예약·안내·FAQ의 '예약 직후 카드 결제/자동 확정' 문구가 한 번에 되살아난다.
// (문자 안내는 supabase/functions/reservation-sms 의 ONLINE_PAYMENT_LIVE도 함께 변경)
const onlinePaymentLive: boolean = false;

// 결제창(카드 결제·정기결제) 노출 여부. 카드사 사전 심사에서는 결제창이 실제로
// 호출되는지(약관·카드사 목록)를 확인하므로, 정식 오픈 문구와 별개로 결제 수단과
// 버튼을 먼저 노출해야 한다. 심사 통과 후 onlinePaymentLive도 true로 바꾼다.
const paymentEnabled: boolean = true;

// Single source of truth for business / contact info used across the site.
export const SITE = {
  name: "WORKROOM by 4REST",
  tagline: "필요한 시간만큼 머무는 조용한 작업 공간",
  address: "전남광주통합특별시 동구 충장로5가 96-23, 2층",
  phone: "010-4931-3298",
  hoursLabel: "08:00–다음 날 01:00",
  booking: {
    memberOnly: true,
    onlinePaymentLive,
    paymentEnabled,
    confirmationLabel: onlinePaymentLive
      ? "온라인 결제 예약은 결제 완료 즉시 자동 확정됩니다."
      : "예약은 신청 후 운영자 확인을 거쳐 확정됩니다.",
    onlinePayment: onlinePaymentLive
      ? "예약 신청 직후 카드로 결제할 수 있으며, 결제가 완료되면 확정 문자도 자동 발송됩니다."
      : "카드 결제는 예약 후 관리자가 보내드리는 결제 링크 또는 현장 결제(카드·현금)로 진행됩니다.",
    onsitePayment: "현장 결제(카드·현금)와 별도 확인이 필요한 예약은 운영자가 확인한 뒤 확정합니다.",
    advanceLimitLabel: "예약은 이용일 기준 오늘부터 최대 2개월 이내까지 가능합니다.",
    recurringNotice: onlinePaymentLive
      ? "월권(자유석·지정석)은 정기결제로 이용할 수 있습니다. 정기결제 신청·해지는 문의해 주세요."
      : "월권(자유석·지정석) 정기결제는 준비 중입니다. 현재는 문의 후 결제 링크 또는 현장 결제로 진행됩니다.",
    // 온라인 결제(PG) 테스트 기간 안내. onlinePaymentLive를 true로 바꾸면 숨겨진다.
    paymentTestNotice: "온라인 카드 결제는 현재 카드사 심사 중입니다. 결제가 완료되지 않을 수 있으며, 그 경우 예약 후 관리자가 보내드리는 결제 링크 또는 현장 결제(카드·현금)로 진행됩니다.",
  },
  business: {
    // 전자상거래법 표시 의무 항목. 대표자명은 확인 후 채운다.
    representative: "박순렬",
    registrationNumber: "412-04-60970",
    mailOrderNumber: "2023-광주북구-0416호",
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
