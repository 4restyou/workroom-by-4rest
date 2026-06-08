import { Link } from "react-router-dom";
import Section from "../components/Section";
import { card } from "../lib/ui";

const articles: { title: string; body: string[] }[] = [
  {
    title: "제1조 (목적)",
    body: [
      "이 약관은 WORKROOM by 4REST(이하 “공간”)가 제공하는 작업 공간 예약 및 이용에 관한 서비스(이하 “서비스”)의 이용 조건과 절차, 공간과 이용자의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.",
    ],
  },
  {
    title: "제2조 (정의)",
    body: [
      "“이용자”란 본 약관에 따라 서비스를 이용하는 회원을 말합니다.",
      "“회원”이란 구글 계정으로 로그인하여 서비스를 이용하는 자를 말합니다.",
      "“예약”이란 이용자가 원하는 이용권·날짜·시간을 선택하여 공간 이용을 신청하는 것을 말합니다.",
    ],
  },
  {
    title: "제3조 (약관의 효력 및 변경)",
    body: [
      "이 약관은 서비스 화면에 게시함으로써 효력이 발생합니다.",
      "공간은 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 적용일자와 변경 사유를 명시하여 사전에 공지합니다.",
    ],
  },
  {
    title: "제4조 (이용계약의 성립)",
    body: [
      "이용계약은 이용자가 구글 계정으로 로그인하여 회원이 되고, 본 약관에 동의함으로써 성립합니다.",
      "예약은 회원만 신청할 수 있으며, 예약 신청 후 공간의 전화 또는 문자 확인을 통해 확정됩니다.",
    ],
  },
  {
    title: "제5조 (예약 및 결제)",
    body: [
      "이용자는 서비스에 안내된 이용권과 가격에 따라 예약을 신청합니다.",
      "결제는 예약 확정 안내 후 카드 또는 계좌이체 등 공간이 정한 방법으로 진행합니다.",
      "좌석 정원 등으로 예약이 어려운 경우 예약이 제한될 수 있습니다.",
    ],
  },
  {
    title: "제6조 (취소 및 환불)",
    body: [
      "취소 및 환불은 서비스에 게시된 안내와 관련 법령에 따릅니다.",
      "3시간권과 종일권은 예약 시간 전까지 당일 취소가 가능하며, 예약 시간이 지난 뒤에는 취소 및 환불이 어려울 수 있습니다.",
      "구체적인 취소·환불 기준은 운영 안내 문구를 따릅니다.",
    ],
  },
  {
    title: "제7조 (이용자의 의무)",
    body: [
      "이용자는 다른 이용자의 작업에 방해가 되지 않도록 정숙을 유지하고, 통화·음악·영상 이용 시 공간의 안내를 준수해야 합니다.",
      "이용자는 공간의 시설과 비품을 선량한 관리자의 주의로 이용해야 하며, 고의 또는 과실로 손해를 입힌 경우 이를 배상할 책임이 있습니다.",
    ],
  },
  {
    title: "제8조 (서비스의 변경 및 중단)",
    body: [
      "공간은 운영상·기술상 필요에 따라 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며, 이 경우 가능한 범위에서 사전에 공지합니다.",
    ],
  },
  {
    title: "제9조 (면책)",
    body: [
      "천재지변, 정전, 통신 장애 등 불가항력으로 인해 서비스를 제공할 수 없는 경우 공간은 책임을 지지 않습니다.",
      "이용자가 본인의 부주의로 분실하거나 손상된 개인 물품에 대해서 공간은 책임을 지지 않습니다.",
    ],
  },
  {
    title: "부칙",
    body: ["이 약관은 게시한 날부터 시행합니다."],
  },
];

export default function Terms() {
  return (
    <main className="pb-16">
      <Section eyebrow="Legal" title="이용약관" accent="lilac">
        <div className={`${card} grid gap-6 p-6`}>
          {articles.map((article) => (
            <section key={article.title}>
              <h2 className="text-lg font-bold">{article.title}</h2>
              <div className="mt-2 grid gap-1.5">
                {article.body.map((line, index) => (
                  <p className="text-sm font-medium leading-7 text-workroom-muted" key={index}>
                    {line}
                  </p>
                ))}
              </div>
            </section>
          ))}
          <p className="text-xs font-medium leading-6 text-workroom-muted">
            본 약관은 일반적인 기준으로 작성된 예시이며, 실제 운영 정책에 맞게 운영자가 수정해 사용할 수 있습니다.
          </p>
        </div>
        <Link className="mt-6 inline-block text-sm font-bold text-workroom-muted underline underline-offset-4 transition-colors hover:text-workroom-ink" to="/">
          홈으로 돌아가기
        </Link>
      </Section>
    </main>
  );
}
