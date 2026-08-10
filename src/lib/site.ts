// 단건 카드 결제(PG) 정식 오픈 여부. 10개 카드사 심사가 모두 '완료'로 바뀌어
// 예약 직후 결제·자동 확정을 정식으로 안내한다.
// (문자 안내는 supabase/functions/reservation-sms 의 ONLINE_PAYMENT_LIVE도 함께 변경)
const onlinePaymentLive: boolean = true;

// 정기결제(빌링키 자동청구) 정식 오픈 여부는 단건과 따로 둔다.
// 카드사심사 등록현황에서 '정기과금'이 표기된 카드사(KB국민·하나·하나(외환)·
// 롯데아멕스·우리)와 표기가 없는 카드사(삼성·신한·현대·NH)가 갈려 있고, BC카드는
// 비고에 '거부'가 붙어 있다. 전 카드사 지원이 확인되기 전까지는 정기결제를
// '되면 편한 선택지'로만 안내하고, 기본 결제 수단은 단건으로 둔다.
const recurringPaymentLive: boolean = false;

// 결제창(카드 결제·정기결제) 노출 여부. 운영 중 결제를 통째로 내려야 할 때 쓰는
// 비상 스위치다.
const paymentEnabled: boolean = true;

// Single source of truth for business / contact info used across the site.
export const SITE = {
  name: "WORKROOM by 4REST",
  tagline: "필요한 시간만큼 머무는 조용한 작업 공간",
  address: "전남광주통합특별시 동구 충장로5가 96-23, 2층",
  phone: "010-4931-3298",
  // 카드사·전자상거래법 표시용 유선번호. 사업자 정보 줄과 문의 안내에 함께 노출한다.
  landline: "070-8211-1734",
  hoursLabel: "08:00–다음 날 01:00",
  booking: {
    memberOnly: true,
    onlinePaymentLive,
    recurringPaymentLive,
    paymentEnabled,
    confirmationLabel: onlinePaymentLive
      ? "온라인 결제 예약은 결제 완료 즉시 자동 확정됩니다."
      : "예약은 신청 후 운영자 확인을 거쳐 확정됩니다.",
    onlinePayment: onlinePaymentLive
      ? "예약 신청 직후 카드로 결제할 수 있으며, 결제가 완료되면 확정 문자도 자동 발송됩니다."
      : "카드 결제는 예약 후 관리자가 보내드리는 결제 링크 또는 현장 결제(카드·현금)로 진행됩니다.",
    onsitePayment: "현장 결제(카드·현금)와 별도 확인이 필요한 예약은 운영자가 확인한 뒤 확정합니다.",
    advanceLimitLabel: "예약은 이용일 기준 오늘부터 최대 2개월 이내까지 가능합니다.",
    recurringNotice: recurringPaymentLive
      ? "월권(자유석·지정석)은 정기결제로 이용할 수 있습니다. 정기결제 신청·해지는 문의해 주세요."
      : "월권(자유석·지정석)은 이용 기간마다 카드로 결제하시면 됩니다. 4주마다 자동으로 결제되는 정기결제는 일부 카드사만 지원되며, 등록이 되지 않으면 이번 회차만 결제해 주세요.",
    // 정기결제 버튼 옆에 붙는 짧은 안내. 카드사별 지원 여부가 확정되면 문구를 줄인다.
    recurringHint: recurringPaymentLive
      ? "카드가 등록되고 첫 회차가 바로 결제됩니다. 이후 4주마다 자동 결제되며 언제든 해지할 수 있어요."
      : "카드가 등록되면 첫 회차가 바로 결제되고 이후 4주마다 자동 결제돼요. 다만 카드사에 따라 등록이 안 될 수 있어요 — 그때는 '이번 회차만 결제'를 이용해 주세요.",
    // 결제 수단 선택지의 설명. 정식 오픈 전에는 "즉시 확정"이라고 말하지 않는다.
    onlinePaymentOptionHint: onlinePaymentLive
      ? "예약 신청 직후 결제하며, 결제가 완료되면 예약도 바로 확정됩니다."
      : "카드사 심사 중이라 결제가 완료되지 않을 수 있어요. 그때는 운영자가 결제 링크를 보내드립니다.",
    // 예약 신청 직전에 보여줄 취소·환불 요약(구매 전 고지).
    cancellationSummary:
      "이용 시작 전 취소는 전액 환불됩니다. 시작 후에는 시간권·종일권은 환불이 어렵고, 주간권은 남은 일수·월권은 남은 주 단위로 정산해 환불합니다.",
    // 온라인 결제(PG) 테스트 기간 안내. onlinePaymentLive가 true면 어디에도 표시되지 않는다.
    // (결제를 다시 내려야 할 때를 대비해 문구는 남겨 둔다.)
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
