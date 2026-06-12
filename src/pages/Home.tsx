import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import FeatureCard, { type FeatureIcon } from "../components/FeatureCard";
import PriceCard from "../components/PriceCard";
import Section from "../components/Section";
import { defaultPasses } from "../lib/defaultPasses";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { badge, buttonClass, card, tintCard, type TintColor } from "../lib/ui";
import type { Pass } from "../lib/types";
import heroImage from "../../assets/workroom-hero.webp";
import { SITE } from "../lib/site";

const { address: ADDRESS, naverMapUrl: NAVER_MAP_URL, kakaoMapUrl: KAKAO_MAP_URL } = SITE;

const features: { title: string; body: string; icon: FeatureIcon; accent: TintColor }[] = [
  {
    title: "개인 작업석",
    body: "혼자 집중하기 좋은 자유석. 먼저 앉는 순서대로 이용합니다.",
    icon: "seat",
    accent: "mint",
  },
  {
    title: "공용 테이블",
    body: "가벼운 대화, 협업, 작은 모임을 위한 자리입니다.",
    icon: "table",
    accent: "lilac",
  },
  {
    title: "호리존 촬영",
    body: "상반신 증명사진과 간단 프로필 촬영을 운영자가 직접 진행합니다.",
    icon: "camera",
    accent: "sky",
  },
  {
    title: "커피 / 프린트",
    body: "커피는 이용권 기준으로 제공하고, 흑백 프린트는 5장까지 무료입니다.",
    icon: "coffee",
    accent: "coral",
  },
];

const guideItems: [string, string][] = [
  ["결제", "예약 확정 안내 후 카드 또는 계좌이체로 결제할 수 있습니다."],
  ["취소", "3시간권과 종일권은 예약 시간 전까지 당일 취소가 가능합니다."],
  ["연장", "이용 종료 후 15분까지는 유예되며, 이후 1시간 추가 요금이 적용됩니다."],
  ["소리", "통화는 조용히, 음악과 영상은 반드시 이어폰이나 헤드폰으로 이용합니다."],
  ["음식", "냄새가 적은 간단한 음식과 음료는 가능합니다."],
  ["동반", "함께 이용하는 분은 별도 좌석 예약이 필요합니다."],
];

const fitItems = [
  "노트북 작업, 공부, 글쓰기처럼 조용히 오래 앉아 있는 일",
  "상반신 증명사진, 간단 프로필, 작은 제품 촬영",
  "2-5명이 나누는 짧은 회의나 가벼운 협업",
];

const cautionItems = [
  "큰 소리의 모임, 파티, 장시간 통화 중심 이용",
  "강한 냄새가 나는 음식이나 주변을 많이 어지럽히는 작업",
  "사전 협의 없는 상업 촬영, 장비 반입이 큰 촬영",
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

  async function shareLocation() {
    const shareData = {
      title: "WORKROOM by 4REST",
      text: `WORKROOM by 4REST · ${ADDRESS}`,
      url: NAVER_MAP_URL,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user dismissed the share sheet
      }
    } else {
      window.open(NAVER_MAP_URL, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <main className="pb-28 sm:pb-0">
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pb-8 pt-12 sm:pb-14 sm:pt-20">
        <div className="grid items-center gap-8 sm:grid-cols-[1.05fr_0.95fr] sm:gap-12">
          <div className="animate-pop-in">
            <span className={badge("yellow")}>09:00–22:00 · 예약제 운영</span>
            <h1 className="mt-4 text-4xl font-black leading-[1.5] tracking-tight sm:text-6xl">
              필요한 시간만큼
              <br />
              머무는 <span className="hero-mark rounded-[3px] px-2 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">조용한</span>
              <br />
              작업 공간
            </h1>
            <p className="mt-5 max-w-xl text-lg font-medium leading-8 text-workroom-muted">
              카페보다 조용하고, 사무실보다 느슨하게.
              <br />
              혼자 일하거나 작은 모임을 갖기 좋은 자리입니다.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link className={buttonClass("accent", "lg", "w-full sm:w-auto")} to="/reserve">
                예약하기 →
              </Link>
              <a className={buttonClass("secondary", "lg", "w-full sm:w-auto")} href="#pricing">
                이용권 보기
              </a>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-card border border-workroom-line">
              <img
                className="aspect-[4/3] w-full object-cover"
                src={heroImage}
                alt="WORKROOM 작업 공간"
                loading="eager"
              />
            </div>
            <div className="absolute -bottom-3 left-2 rotate-[-4deg]">
              <span className={badge("mint", "text-sm")}>충장로 · 금남로5가역</span>
            </div>
            <div className="absolute right-2 -top-3 rotate-[5deg]">
              <span className={badge("lilac", "text-sm")}>3시간권 12,000원~</span>
            </div>
          </div>
        </div>
      </section>

      <Section id="space" eyebrow="About" title="카페와 사무실 사이, 그쯤" accent="mint">
        <div className="max-w-3xl border-l-2 border-workroom-ink pl-5 text-lg font-medium leading-9 text-workroom-muted sm:pl-7 sm:text-xl">
          <p>
            카페는 편하지만 오래 앉아 있으면 조금 눈치가 보이고, 사무실은 집중하기 좋지만 가끔은 너무 딱딱하고, 집은 편한데 이상하게 일이 잘 안 될 때가 있습니다.
          </p>
          <p className="mt-6">
            WORKROOM은 그 사이 어딘가의 공간을 생각하며 준비하고 있습니다. 슬렁슬렁 들어와도 되고, 조용히 오래 앉아 있어도 되고, 각자의 일을 각자의 속도로 이어갈 수 있는 곳입니다.
          </p>
        </div>
      </Section>

      <Section eyebrow="Features" title="작업이 너무 커지지 않게" accent="lilac">
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </Section>

      <Section id="pricing" eyebrow="Plans / Pricing" title="처음에는 가볍게, 필요하면 오래" accent="yellow">
        <div className="grid gap-3">
          {passes.map((pass) => (
            <PriceCard key={pass.id} pass={pass} />
          ))}
        </div>
        <p className={`${tintCard("mint")} mt-4 px-4 py-3 text-sm font-bold`}>
          기본 단위는 3시간권입니다. 1시간권은 운영하지 않고, 좌석 여유가 있을 때 1시간 단위 연장이 가능합니다.
        </p>
      </Section>

      <Section eyebrow="Guide" title="이용 기준은 가볍게, 분명하게" accent="sky">
        <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {guideItems.map(([title, body]) => (
            <div className="border-t-2 border-workroom-ink pt-3" key={title}>
              <dt className="text-base font-bold">{title}</dt>
              <dd className="mt-1.5 text-sm font-medium leading-6 text-workroom-muted">{body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section eyebrow="Fit check" title="이런 이용이면 잘 맞아요" accent="lilac">
        <div className="grid gap-4 sm:grid-cols-2">
          <article className={`${tintCard("mint")} p-5`}>
            <h3 className="text-xl font-bold">좋아요</h3>
            <ul className="mt-4 grid gap-3">
              {fitItems.map((item) => (
                <li className="flex gap-3 text-sm font-bold leading-6" key={item}>
                  <span aria-hidden>✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className={`${tintCard("yellow")} p-5`}>
            <h3 className="text-xl font-bold">먼저 물어봐 주세요</h3>
            <ul className="mt-4 grid gap-3">
              {cautionItems.map((item) => (
                <li className="flex gap-3 text-sm font-bold leading-6" key={item}>
                  <span aria-hidden>!</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
        <Link className={buttonClass("secondary", "md", "mt-4 w-full sm:w-auto")} to="/faq">
          이용안내 더 보기
        </Link>
      </Section>

      <Section eyebrow="How to use" title="예약은 길게 말하지 않고" accent="coral">
        <ol className="grid gap-3 sm:grid-cols-4">
          {["원하는 이용권을 선택합니다.", "날짜와 시간을 선택합니다.", "예약 신청을 남깁니다.", "전화 또는 문자 안내 후 확정됩니다."].map(
            (item, index) => (
              <li key={item} className={`${card} p-5 font-medium`}>
                <span className="mb-4 grid h-9 w-9 place-items-center rounded-pill border border-workroom-line bg-workroom-yellow text-sm font-bold">
                  {index + 1}
                </span>
                {item}
              </li>
            ),
          )}
        </ol>
        <p className={`${tintCard("yellow")} mt-4 px-4 py-3 text-sm font-bold`}>
          당일 이용은 좌석이 남아 있을 경우 예약할 수 있습니다.
        </p>
      </Section>

      <Section eyebrow="Location" title="충장로, 금남로5가역 근처" accent="mint">
        <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
          <div className={`${card} p-5`}>
            <p className="text-xl font-bold">WORKROOM by 4REST</p>
            <p className="mt-1 font-medium text-workroom-muted">{ADDRESS}</p>
            <dl className="mt-5 grid gap-4">
              <div>
                <dt className="text-sm font-bold">🚇 지하철</dt>
                <dd className="mt-1 text-sm font-medium leading-6 text-workroom-muted">
                  광주 1호선 <b className="font-bold text-workroom-ink">금남로5가역 1번 출구</b>에서 도보 약 3–5분.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-bold">🚌 버스</dt>
                <dd className="mt-1 text-sm font-medium leading-6 text-workroom-muted">
                  ‘금남로5가역’ 정류장 하차. 경유 노선이 많아 출발지에서 지도 길찾기로 확인하는 게 가장 정확해요.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-bold">🅿️ 주차</dt>
                <dd className="mt-1 text-sm font-medium leading-6 text-workroom-muted">
                  전용 주차장은 없습니다. 인근 <b className="font-bold text-workroom-ink">{SITE.parking.name}</b>({SITE.parking.address},
                  24시간)을 이용해 주세요. 30분 700원 · 1시간 1,400원 · 2시간 2,800원 · 4시간 5,600원 · 1일 8,000원. 월 정기주차도 가능합니다.
                </dd>
              </div>
            </dl>
          </div>
          <div className="grid gap-3 sm:content-start">
            <button className={buttonClass("mint", "lg")} onClick={() => void shareLocation()} type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
              </svg>
              위치 공유하기
            </button>
            <a className={buttonClass("primary", "lg")} href={NAVER_MAP_URL} rel="noreferrer" target="_blank">
              네이버지도에서 보기
            </a>
            <a className={buttonClass("accent", "lg")} href={KAKAO_MAP_URL} rel="noreferrer" target="_blank">
              카카오맵에서 보기
            </a>
          </div>
        </div>
      </Section>

      <section className="mx-auto max-w-5xl px-4 pb-12 pt-4">
        <div className={`${tintCard("ink")} p-6 sm:flex sm:items-center sm:justify-between sm:gap-6`}>
          <div>
            <p className="text-sm font-black text-workroom-yellow">Reservation</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">슬렁슬렁 들어올 준비가 됐다면</h2>
          </div>
          <Link className={buttonClass("accent", "lg", "mt-5 w-full sm:mt-0 sm:w-auto")} to="/reserve">
            예약 신청하기 →
          </Link>
        </div>
      </section>
    </main>
  );
}
