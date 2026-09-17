// 회원 단체 문자.
//
// 두 종류를 한 화면에서 보내되 규칙이 다르다.
//
//   운영 공지 — 이미 맺은 거래에 관한 안내(휴무, 가격 변경, 시설 안내).
//               동의 없이 보낼 수 있고 문구를 그대로 내보낸다.
//   광고     — 새 구매를 유도하는 내용(할인, 이벤트, 재방문 권유).
//               정보통신망법 제50조: 사전 동의가 필요하고, (광고) 표기와
//               무료 수신거부 방법을 문구에 넣어야 하며, 21시~익일 8시에는
//               보낼 수 없다.
//
// 동의 예외: 거래를 통해 직접 받은 연락처로 거래 종료 후 6개월 이내에 같은
// 종류의 상품을 광고하는 경우는 사전 동의가 면제된다(제50조 1항 단서).
// 그래서 '최근 6개월 이용자' 대상이 따로 있다 — 표기·시간 규칙은 그대로 지킨다.
//
// 표기를 빼먹으면 과태료 대상이라, 사람이 손으로 붙이게 두지 않고 여기서 붙인다.

export type BroadcastKind = "notice" | "ad";

export type BroadcastAudience =
  | "active"
  | "upcoming"
  | "recent6m"
  | "consented"
  | "all";

/** 광고를 보낼 수 있는 대상인가. 나머지는 운영 공지만 나간다. */
export function canSendAdTo(audience: BroadcastAudience): boolean {
  return audience === "recent6m" || audience === "consented";
}

/** 21시~익일 8시에는 광고를 보낼 수 없다. */
export function isAdQuietHours(hour: number): boolean {
  return hour >= 21 || hour < 8;
}

export type ComposeInput = {
  kind: BroadcastKind;
  body: string;
  /** 무료 수신거부 방법. 광고에만 붙는다. */
  optOut: string;
};

/** 실제로 발송될 문구. 화면의 미리보기와 발송 내용이 같아야 한다. */
export function composeBroadcast({ kind, body, optOut }: ComposeInput): string {
  const text = body.trim();
  if (kind !== "ad") return text;
  return [`(광고) ${text}`, "", optOut.trim()].filter(Boolean).join("\n");
}

/**
 * 문자 길이(바이트). 한글은 2바이트로 센다 — 통신사 과금 기준이 글자 수가
 * 아니라 바이트라, 90바이트를 넘으면 SMS가 아니라 LMS 요금이 된다.
 */
export function smsByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) bytes += char.charCodeAt(0) > 0x7f ? 2 : 1;
  return bytes;
}

export function smsType(text: string): "SMS" | "LMS" {
  return smsByteLength(text) > 90 ? "LMS" : "SMS";
}

export type BroadcastCheck = {
  ok: boolean;
  /** 막는 이유. ok가 true면 빈 배열. */
  problems: string[];
};

export type CheckInput = {
  kind: BroadcastKind;
  audience: BroadcastAudience;
  body: string;
  recipients: number;
  /** 지금 시각(0~23, KST). */
  hour: number;
};

/** 보내기 전에 막아야 할 것들. 하나라도 걸리면 발송 버튼이 열리지 않는다. */
export function checkBroadcast({ kind, audience, body, recipients, hour }: CheckInput): BroadcastCheck {
  const problems: string[] = [];

  if (!body.trim()) problems.push("보낼 내용을 입력해 주세요.");
  if (recipients <= 0) problems.push("보낼 수 있는 대상이 없습니다.");

  if (kind === "ad") {
    if (!canSendAdTo(audience)) {
      problems.push("이 대상에게는 광고를 보낼 수 없습니다. 최근 6개월 이용자나 수신 동의자를 선택해 주세요.");
    }
    if (isAdQuietHours(hour)) {
      problems.push("광고 문자는 21시부터 다음 날 8시까지 보낼 수 없습니다.");
    }
  }

  return { ok: problems.length === 0, problems };
}
