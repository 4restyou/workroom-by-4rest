// 단체 문자 — 화면에서 쓰는 이름표.
//
// 규칙(표기·시간·대상 제한)은 엣지 함수와 같은 파일에 있다. 두 벌로 두면
// 화면은 막는데 서버는 보내 주거나, 그 반대가 된다.

export {
  canSendAdTo,
  checkBroadcast,
  composeBroadcast,
  isAdQuietHours,
  smsByteLength,
  smsType,
  type BroadcastAudience,
  type BroadcastCheck,
  type BroadcastKind,
  type CheckInput,
  type ComposeInput,
} from "../../supabase/functions/_shared/broadcast";

import type { BroadcastAudience } from "../../supabase/functions/_shared/broadcast";

export const audienceLabels: Record<BroadcastAudience, string> = {
  active: "이용 중인 회원",
  upcoming: "예정 예약이 있는 회원",
  recent6m: "최근 6개월 이용자",
  consented: "광고 수신 동의자",
  all: "전체 회원",
};

export const audienceHints: Record<BroadcastAudience, string> = {
  active: "오늘 유효한 이용권이 있는 회원. 휴무·시설 공지에 씁니다.",
  upcoming: "앞으로 예약이 잡혀 있는 회원.",
  recent6m: "최근 6개월 안에 이용한 회원. 동의 없이도 광고를 보낼 수 있는 범위입니다.",
  consented: "광고 수신에 동의한 회원.",
  all: "가입한 모든 회원. 광고는 보낼 수 없습니다.",
};

