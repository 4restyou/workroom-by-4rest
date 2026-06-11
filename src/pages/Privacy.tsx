import { Link } from "react-router-dom";
import Section from "../components/Section";
import { SITE } from "../lib/site";
import { card } from "../lib/ui";

const sections: { title: string; body: string[] }[] = [
  {
    title: "1. 수집하는 개인정보 항목",
    body: [
      "회원가입 및 예약 과정에서 다음의 개인정보를 수집합니다.",
      "· 필수: 이름, 연락처, 이메일",
      "· 선택: 주소, 예약 시 요청사항",
      "· 구글 로그인 시 구글 계정으로부터 이름과 이메일을 전달받습니다.",
      "· 출근부(QR 출근)에서 매장 위치 제한이 켜져 있는 경우, 출근 확인을 위해 현재 위치를 일시적으로 확인할 수 있으며 별도로 저장하지 않습니다.",
    ],
  },
  {
    title: "2. 개인정보의 수집 및 이용 목적",
    body: [
      "· 예약 접수 및 확인, 이용 안내(전화·문자) 등 서비스 제공",
      "· 회원 식별 및 관리",
      "· 문의 응대 및 공지사항 전달",
    ],
  },
  {
    title: "3. 보유 및 이용 기간",
    body: [
      "원칙적으로 개인정보의 수집·이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.",
      "다만 관련 법령에 따라 보존할 필요가 있는 경우 해당 기간 동안 보관합니다.",
      "회원 탈퇴 시 보유 정보는 관련 법령에서 정한 기간을 제외하고 파기합니다.",
    ],
  },
  {
    title: "4. 개인정보의 제3자 제공",
    body: ["공간은 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만 법령에 근거가 있거나 이용자의 동의가 있는 경우에 한합니다."],
  },
  {
    title: "5. 개인정보 처리의 위탁",
    body: [
      "서비스 운영을 위해 필요한 범위에서 인증 및 데이터 저장 등의 업무를 외부 클라우드 인프라(예: Supabase)에 위탁할 수 있습니다.",
      "위탁 시 개인정보가 안전하게 관리되도록 필요한 사항을 규정하고 관리·감독합니다.",
    ],
  },
  {
    title: "6. 이용자의 권리",
    body: [
      "이용자는 언제든지 자신의 개인정보에 대해 열람·정정·삭제·처리정지를 요청할 수 있습니다.",
      "내정보 페이지에서 직접 회원 정보를 수정할 수 있으며, 그 밖의 요청은 아래 문의처로 연락해 주시기 바랍니다.",
    ],
  },
  {
    title: "7. 개인정보의 파기",
    body: ["보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 복구할 수 없는 방법으로 안전하게 파기합니다."],
  },
  {
    title: "8. 개인정보 보호 책임 및 문의처",
    body: ["개인정보 관련 문의는 아래 연락처로 해주시기 바랍니다.", `· 연락처: ${SITE.phone}`, `· 운영: ${SITE.name} (${SITE.address})`],
  },
  {
    title: "시행일",
    body: ["본 방침은 게시한 날부터 시행합니다."],
  },
];

export default function Privacy() {
  return (
    <main className="pb-16">
      <Section eyebrow="Legal" title="개인정보처리방침" accent="sky">
        <div className={`${card} grid gap-6 p-6`}>
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-bold">{section.title}</h2>
              <div className="mt-2 grid gap-1.5">
                {section.body.map((line, index) => (
                  <p className="text-sm font-medium leading-7 text-workroom-muted" key={index}>
                    {line}
                  </p>
                ))}
              </div>
            </section>
          ))}
          <p className="text-xs font-medium leading-6 text-workroom-muted">
            본 방침은 일반적인 기준으로 작성된 예시이며, 실제 운영 정책에 맞게 운영자가 수정해 사용할 수 있습니다.
          </p>
        </div>
        <Link className="mt-6 inline-block text-sm font-bold text-workroom-muted underline underline-offset-4 transition-colors hover:text-workroom-ink" to="/">
          홈으로 돌아가기
        </Link>
      </Section>
    </main>
  );
}
