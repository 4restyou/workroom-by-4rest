import { Link } from "react-router-dom";
import Section from "../components/Section";
import { SITE } from "../lib/site";
import { buttonClass, card, tintCard } from "../lib/ui";

type Qa = { q: string; a: string[] };
type Group = { title: string; items: Qa[] };

const groups: Group[] = [
  {
    title: "예약",
    items: [
      {
        q: "예약은 어떻게 하나요?",
        a: [
          "홈페이지에서 구글 계정으로 로그인한 뒤, ‘예약하기’에서 이용권·날짜·시간을 선택해 신청합니다.",
          "예약은 회원만 신청할 수 있으며, 신청 후 접수 문자가 발송됩니다. 운영자가 확인하면 확정 문자를 보내드립니다.",
        ],
      },
      {
        q: "예약을 수정하거나 취소할 수 있나요?",
        a: [
          "‘예약현황’에서 직접 시간 수정과 취소가 가능합니다.",
          "시간을 수정하면 다시 확인 대기 상태가 되며, 운영자에게 변경 요청 문자가 전달됩니다.",
          "취소는 예약 시작 시간 전까지만 가능합니다. 예약 시간이 지난 뒤에는 취소·환불이 어렵습니다.",
        ],
      },
    ],
  },
  {
    title: "결제 · 환불",
    items: [
      {
        q: "결제는 어떻게 하나요?",
        a: [
          "월권(자유석·지정석)은 결제 링크 결제가 기본입니다. 예약 확정 시 보내드리는 링크로 결제하시면 정상 확정되며, 현장 결제도 가능합니다.",
          "시간권·주간권은 방문 시 현장 결제가 가능하며, 원하시면 결제 링크로도 결제하실 수 있습니다.",
          "이용권 종류와 가격은 ‘예약하기’ 페이지에서 확인할 수 있습니다.",
        ],
      },
      {
        q: "환불 규정이 어떻게 되나요?",
        a: [
          "예약 시작 시간 전까지는 취소·환불이 가능합니다.",
          "예약 시작 시간이 지난 뒤에는 환불이 어렵습니다.",
          "자세한 내용은 예약 시 안내되는 문구와 이용약관을 따릅니다.",
        ],
      },
    ],
  },
  {
    title: "이용 안내",
    items: [
      {
        q: "운영 시간이 어떻게 되나요?",
        a: [`운영 시간은 ${SITE.hoursLabel} 입니다. 예약제로 운영합니다.`],
      },
      {
        q: "어떤 공간인가요?",
        a: [
          "카페보다 조용하고 사무실보다 느슨한, 집중하기 좋은 작업 공간입니다.",
          "다른 이용자에게 방해가 되지 않도록 정숙을 유지해 주세요. 통화·음악·영상은 공간 안내를 따라 이용해 주세요.",
        ],
      },
    ],
  },
  {
    title: "위치 · 주차",
    items: [
      {
        q: "위치가 어디인가요?",
        a: [`${SITE.address}.`, "지하철 금남로5가역 1번 출구에서 가장 가깝습니다."],
      },
      {
        q: "주차할 수 있나요?",
        a: [
          `인근 ${SITE.parking.name}(${SITE.parking.address})을 이용할 수 있습니다.`,
          "공영주차장 1일 주차요금은 8,000원이며, 월정기 주차도 가능합니다.",
        ],
      },
    ],
  },
];

export default function Faq() {
  return (
    <main className="pb-16">
      <Section eyebrow="Guide" title="이용안내 · 자주 묻는 질문" accent="sky">
        <div className="grid gap-6">
          {groups.map((group) => (
            <div className={`${card} grid gap-5 p-6`} key={group.title}>
              <h2 className="text-lg font-black">{group.title}</h2>
              {group.items.map((item) => (
                <section key={item.q}>
                  <h3 className="font-black">Q. {item.q}</h3>
                  <div className="mt-2 grid gap-1.5">
                    {item.a.map((line, index) => (
                      <p className="text-sm font-medium leading-7 text-workroom-muted" key={index}>
                        {line}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ))}

          <div className={`${tintCard("yellow")} flex flex-wrap items-center justify-between gap-4 p-6`}>
            <div>
              <p className="font-black">더 궁금한 점이 있으신가요?</p>
              <a className="mt-1 inline-block text-sm font-bold underline underline-offset-2" href={`tel:${SITE.phone}`}>
                {SITE.phone}
              </a>
            </div>
            <Link className={buttonClass("accent", "md")} to="/reserve">
              예약하기
            </Link>
          </div>
        </div>

        <Link
          className="mt-6 inline-block text-sm font-bold text-workroom-muted underline underline-offset-4 transition-colors hover:text-workroom-ink"
          to="/"
        >
          홈으로 돌아가기
        </Link>
      </Section>
    </main>
  );
}
