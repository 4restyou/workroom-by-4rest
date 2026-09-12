// 방문 안내 — 문자와 화면이 같은 내용을 쓴다.
//
// 관리자가 복사해 보내는 문자(buildUsageGuideMessage)와 회원이 앱에서 보는
// 방문 안내 화면이 따로 적혀 있으면, 한쪽만 고쳐 놓고 다른 쪽은 예전 내용을
// 계속 내보낸다. 문 비밀번호나 퇴실 규칙처럼 틀리면 곤란한 내용이라 한 곳에 둔다.
//
// 순서는 손님이 실제로 겪는 순서다 — 문 앞에서 시작해 불 끄고 나가는 것으로 끝난다.

import { SITE } from "./site";

export type GuideSection = {
  title: string;
  lines: string[];
};

/** 하루 종일 머무는 이용권만 3잔, 나머지는 1잔. */
export function guideCupsFor(passName: string): number {
  const allDay = ["종일", "주간", "월권"].some((kind) => passName.includes(kind));
  return allDay ? 3 : 1;
}

export type GuideOptions = {
  /** 커피 잔 수. 이용권에 따라 다르다. null이면 두 경우를 함께 안내한다. */
  cups: number | null;
  /** 출입구 비밀번호. 없으면 따로 안내한다고 적는다. */
  doorCode?: string | null;
};

export function visitGuideSections({ cups, doorCode }: GuideOptions): GuideSection[] {
  const code = (doorCode ?? "").trim();

  return [
    {
      title: "위치",
      lines: [
        SITE.address,
        code ? `출입구 비밀번호 ${code}` : "출입구 비밀번호는 방문 전에 따로 안내드릴게요.",
        `운영 ${SITE.hoursLabel}`,
      ],
    },
    {
      title: "실내화",
      lines: ["들어오시면 신발은 신발장에 넣으시고 실내화로 갈아 신어 주세요."],
    },
    {
      title: "자리",
      lines: ["지정석이 아니니 비어 있는 자리 중 편한 곳으로 앉으시면 됩니다."],
    },
    {
      title: "커피 · 정수기 · 화장실",
      lines: [
        "들어오셔서 왼편에 커피머신과 정수기가 있습니다. 화장실도 같은 쪽입니다.",
        cups === null
          ? "커피는 시간권 1잔, 종일권부터 하루 3잔까지 드립니다."
          : cups >= 3
            ? "커피는 하루 3잔까지 드립니다."
            : "커피는 1잔 드립니다.",
      ],
    },
    {
      title: "컵",
      lines: [
        "일회용품은 되도록 쓰지 말아 주세요. 비치된 컵을 쓰시고,",
        "다 쓰신 뒤에는 설거지까지 부탁드립니다.",
      ],
    },
    {
      title: "음악",
      lines: ["앰프 전원을 켜신 뒤 패드에서 재생을 눌러 주세요.", "패드 잠금 패턴은 'ㄱ' 자입니다."],
    },
    {
      title: "에어컨",
      lines: ["필요하시면 쓰셔도 됩니다. 리모컨은 신발장 위에 있습니다."],
    },
    {
      title: "음식 · 소리",
      lines: [
        "냄새가 강하지 않은 것은 괜찮습니다. (과자, 샌드위치 등)",
        "통화나 대화는 편하게 하셔도 됩니다. 서로 방해되지 않을 정도면 충분합니다.",
        "실내는 전면 금연입니다.",
      ],
    },
    {
      title: "나가실 때",
      lines: ["마지막으로 나가시는 거라면", "에어컨과 오디오, 메인 조명을 꺼 주세요."],
    },
  ];
}

/** 문자로 보낼 한 덩어리 글. */
export function visitGuideText(options: GuideOptions): string {
  const body = visitGuideSections(options).flatMap((section) => [`■ ${section.title}`, ...section.lines, ""]);
  return [
    "[WORKROOM by 4REST] 이용 안내",
    "",
    ...body,
    `주차 ${SITE.parking.name} (${SITE.parking.address})`,
    `문의 ${SITE.phone}`,
  ].join("\n");
}
