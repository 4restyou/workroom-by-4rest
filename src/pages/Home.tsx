import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import FeatureCard from "../components/FeatureCard";
import PriceCard from "../components/PriceCard";
import Section from "../components/Section";
import { defaultPasses } from "../lib/defaultPasses";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import type { Pass } from "../lib/types";

const features = [
  {
    title: "개인 작업석",
    body: "혼자 집중하기 좋은 자유석. 먼저 앉는 순서대로 이용합니다.",
    mark: "1",
  },
  {
    title: "공용 테이블",
    body: "가벼운 대화, 협업, 작은 모임을 위한 자리입니다.",
    mark: "2",
  },
  {
    title: "호리존 촬영",
    body: "상반신 증명사진과 간단 프로필 촬영을 운영자가 직접 진행합니다.",
    mark: "3",
  },
  {
    title: "커피 / 프린트",
    body: "커피는 이용권 기준으로 제공하고, 흑백 프린트는 5장까지 무료입니다.",
    mark: "4",
  },
];

export default function Home() {
  const [passes, setPasses] = useState<Pass[]>(defaultPasses);

  useEffect(() => {
    async function loadPasses() {
      if (!hasSupabaseConfig || !supabase) return;
      const { data, error } = await supabase
        .from("passes")
        .select("id,name,description,price,seat_type_id,is_active,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!error && data?.length) {
        setPasses(data);
      }
    }

    void loadPasses();
  }, []);

  return (
    <main className="pb-24 sm:pb-0">
      <section className="mx-auto max-w-5xl px-4 pb-8 pt-12 sm:py-16">
        <div className="grid gap-8 sm:grid-cols-[1fr_320px] sm:items-end">
          <div>
            <p className="mb-4 inline-flex rounded-full bg-workroom-purple px-3 py-1 text-xs font-black">
              09:00-22:00 예약제 운영
            </p>
            <h1 className="max-w-3xl text-4xl font-black leading-tight sm:text-6xl">
              필요한 시간만큼 머무는 조용한 작업 공간
            </h1>
            <p className="mt-5 max-w-xl text-lg font-medium leading-8 text-workroom-muted sm:text-xl">
              카페보다 조용하고, 사무실보다 느슨하게.
              <br />
              혼자 일하거나 작은 모임을 갖기 좋은 자리입니다.
            </p>
          </div>

          <div className="rounded-card border border-workroom-line bg-white/75 p-5 shadow-soft">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-workroom-muted">Reservation</p>
            <p className="mt-2 text-xl font-black leading-snug">바로 예약하고 시작하기</p>
            <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
              신청 후 전화 또는 문자로 확인 안내를 드립니다.
            </p>
            <Link className="mt-5 block rounded-full bg-workroom-yellow px-8 py-4 text-center text-lg font-bold text-workroom-text shadow-sketch transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-workroom-text/20" to="/reserve">
              예약하기
            </Link>
          </div>
        </div>
      </section>

      <Section id="space" eyebrow="About" title="카페와 사무실 사이, 그쯤">
        <div className="max-w-3xl text-base font-medium leading-8 text-workroom-muted sm:text-lg">
          <p>
            카페는 편하지만 오래 앉아 있으면 조금 눈치가 보이고, 사무실은 집중하기 좋지만
            가끔은 너무 딱딱하고,
            <br />
            집은 편한데 이상하게 일이 잘 안 될 때가 있습니다.
          </p>
          <p className="mt-5">
            WORKROOM은 그 사이 어딘가의 공간을 생각하며 준비하고 있습니다. 슬렁슬렁
            들어와도 되고,
            <br />
            조용히 오래 앉아 있어도 되고, 각자의 일을 각자의 속도로 이어갈 수 있는 곳입니다.
          </p>
        </div>
      </Section>

      <Section eyebrow="Features" title="작업이 너무 커지지 않게">
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </Section>

      <Section id="pricing" eyebrow="Plans / Pricing" title="처음에는 가볍게, 필요하면 오래">
        <div className="grid gap-3">
          {passes.map((pass) => (
            <PriceCard key={pass.id} pass={pass} />
          ))}
        </div>
        <p className="mt-4 rounded-card bg-workroom-mint px-4 py-3 text-sm font-bold">
          기본 단위는 3시간권입니다. 1시간권은 운영하지 않고, 좌석 여유가 있을 때 1시간 단위 연장이 가능합니다.
        </p>
      </Section>

      <section className="mx-auto max-w-5xl px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-card bg-workroom-text p-5 text-white shadow-soft">
            <p className="text-sm font-black text-workroom-yellow">Mood</p>
            <h2 className="mt-2 text-2xl font-black leading-tight">조용하지만 너무 엄숙하지 않게</h2>
          </article>
          <article className="rounded-card bg-workroom-yellow p-5 shadow-soft">
            <p className="text-sm font-black text-workroom-muted">Use</p>
            <h2 className="mt-2 text-2xl font-black leading-tight">작업, 촬영, 작은 대화까지</h2>
          </article>
          <article className="rounded-card bg-workroom-mint p-5 shadow-soft">
            <p className="text-sm font-black text-workroom-muted">Check</p>
            <h2 className="mt-2 text-2xl font-black leading-tight">신청 후 확인 연락으로 확정</h2>
          </article>
        </div>
      </section>

      <Section eyebrow="Guide" title="이용 기준은 가볍게, 분명하게">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["결제", "예약 확정 안내 후 카드 또는 계좌이체로 결제할 수 있습니다."],
            ["취소", "3시간권과 종일권은 예약 시간 전까지 당일 취소가 가능합니다."],
            ["연장", "이용 종료 후 15분까지는 유예되며, 이후 1시간 추가 요금이 적용됩니다."],
            ["소리", "통화는 조용히, 음악과 영상은 반드시 이어폰이나 헤드폰으로 이용합니다."],
            ["음식", "냄새가 적은 간단한 음식과 음료는 가능합니다."],
            ["동반", "함께 이용하는 분은 별도 좌석 예약이 필요합니다."],
          ].map(([title, body]) => (
            <article className="rounded-card border border-workroom-line bg-workroom-surface p-5 shadow-soft" key={title}>
              <h3 className="text-lg font-black">{title}</h3>
              <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">{body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section eyebrow="How to use" title="예약은 길게 말하지 않고">
        <ol className="grid gap-3 sm:grid-cols-4">
          {["원하는 이용권을 선택합니다.", "날짜와 시간을 선택합니다.", "예약 신청을 남깁니다.", "전화 또는 문자 안내 후 확정됩니다."].map((item, index) => (
            <li key={item} className="rounded-card border border-workroom-line bg-workroom-surface p-5 font-black shadow-soft">
              <span className="mb-4 grid h-8 w-8 place-items-center rounded-full bg-workroom-text text-sm text-white">{index + 1}</span>
              {item}
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-card bg-workroom-yellow px-4 py-3 text-sm font-black">
          당일 이용은 좌석이 남아 있을 경우 예약할 수 있습니다.
        </p>
      </Section>

      <Section eyebrow="Location" title="충장로, 금남로5가역 근처">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
          <div className="rounded-card border border-workroom-line bg-workroom-surface p-5 shadow-soft">
            <p className="text-xl font-black">충장로 작업 라운지</p>
            <p className="mt-2 font-medium text-workroom-muted">금남로5가역 도보 약 3-5분</p>
          </div>
          <div className="grid gap-3">
            <a
              className="rounded-full bg-workroom-text px-5 py-4 text-center font-bold text-white shadow-soft transition active:scale-[0.99] hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-workroom-yellow"
              href="https://map.naver.com/p/search/%EA%B4%91%EC%A3%BC%20%EB%8F%99%EA%B5%AC%20%EC%B6%A9%EC%9E%A5%EB%A1%9C"
              rel="noreferrer"
              target="_blank"
            >
              네이버지도에서 보기
            </a>
            <a
              className="rounded-full bg-workroom-yellow px-5 py-4 text-center font-bold shadow-soft transition active:scale-[0.99] hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-workroom-text/20"
              href="https://map.kakao.com/link/search/%EA%B4%91%EC%A3%BC%20%EB%8F%99%EA%B5%AC%20%EC%B6%A9%EC%9E%A5%EB%A1%9C"
              rel="noreferrer"
              target="_blank"
            >
              카카오맵에서 보기
            </a>
          </div>
        </div>
      </Section>

      <section className="mx-auto max-w-5xl px-4 pb-10 pt-4">
        <div className="rounded-card bg-workroom-text p-6 text-white shadow-sketch sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <p className="text-sm font-black text-workroom-yellow">Reservation</p>
            <h2 className="mt-2 text-3xl font-black">슬렁슬렁 들어올 준비가 됐다면</h2>
          </div>
          <Link className="mt-5 block rounded-full bg-white px-6 py-4 text-center font-bold text-workroom-text transition active:scale-[0.99] hover:bg-workroom-yellow sm:mt-0" to="/reserve">
            예약 신청하기
          </Link>
        </div>
      </section>
    </main>
  );
}
