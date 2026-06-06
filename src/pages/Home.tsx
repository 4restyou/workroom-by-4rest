import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import FeatureCard from "../components/FeatureCard";
import PriceCard from "../components/PriceCard";
import Section from "../components/Section";
import { defaultPasses } from "../lib/defaultPasses";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import type { Pass } from "../lib/types";
import heroImage from "../../assets/logo/mainlogo.png";
import captionImage from "../../assets/logo/caption.png";

const features = [
  {
    title: "개인 작업석",
    body: "혼자 집중하기 좋은 자리. 가능하면 남의 화면이 잘 보이지 않도록 배치합니다.",
    mark: "1",
  },
  {
    title: "공용 테이블",
    body: "가벼운 대화, 협업, 작은 모임을 위한 큰 테이블.",
    mark: "2",
  },
  {
    title: "작은 촬영",
    body: "증명사진, 제품 촬영 등 작은 촬영을 위한 코너를 준비합니다.",
    mark: "3",
  },
  {
    title: "커피 / 프린트",
    body: "작업 중 필요한 커피와 간단한 출력 기능을 준비합니다.",
    mark: "4",
  },
];

const roomNotes = [
  "예약제로 조용하게 운영",
  "개인 작업과 작은 모임 중심",
  "초기 운영 기간에는 확인 연락 후 확정",
];

export default function Home() {
  const [passes, setPasses] = useState<Pass[]>(defaultPasses);

  useEffect(() => {
    async function loadPasses() {
      if (!hasSupabaseConfig || !supabase) return;
      const { data, error } = await supabase
        .from("passes")
        .select("id,name,description,price,is_active,sort_order")
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
      <section className="mx-auto grid max-w-5xl gap-6 px-4 pb-8 pt-8 sm:grid-cols-[1.05fr_0.95fr] sm:items-center sm:py-14">
        <div className="rounded-card border-2 border-workroom-line bg-workroom-surface p-5 shadow-sketch sm:p-8">
          <p className="mb-3 inline-flex rounded-full border-2 border-workroom-line bg-workroom-purple px-3 py-1 text-xs font-black">
            Chungjang-ro work lounge
          </p>
          <h1 className="text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl">
            WORKROOM
            <span className="mt-2 block text-2xl sm:text-4xl">by 4REST</span>
          </h1>
          <p className="mt-5 text-2xl font-black leading-tight">Out of office, Into Workroom.</p>
          <p className="mt-5 text-xl font-black leading-snug">
            카페보다 조용하고,
            <br />
            사무실보다 느슨한
            <br />
            충장로의 작은 작업 라운지.
          </p>
          <ul className="mt-6 grid gap-2 text-sm font-black sm:grid-cols-3">
            {roomNotes.map((note) => (
              <li className="rounded-full border-2 border-workroom-line bg-white px-3 py-2 text-center" key={note}>
                {note}
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link className="rounded-full border-2 border-workroom-line bg-workroom-text px-6 py-4 text-center font-black text-white" to="/reserve">
              예약하기
            </Link>
            <Link className="rounded-full border-2 border-workroom-line bg-white px-6 py-4 text-center font-black" to="/login">
              회원가입
            </Link>
            <a className="rounded-full border-2 border-workroom-line bg-workroom-yellow px-6 py-4 text-center font-black" href="#space">
              공간 소개 보기
            </a>
          </div>
        </div>

        <figure className="relative overflow-hidden rounded-card border-2 border-workroom-line bg-workroom-surface shadow-sketch">
          <img className="aspect-[4/5] w-full object-contain p-5 sm:aspect-[5/6] sm:p-8" src={heroImage} alt="WORKROOM by 4REST 로고 이미지" />
          <figcaption className="absolute bottom-4 left-4 right-4 rounded-card border-2 border-workroom-line bg-workroom-yellow px-4 py-3 text-sm font-black">
            슬렁슬렁 들어와도 되는, 오래 앉아도 되는 자리.
          </figcaption>
        </figure>
      </section>

      <Section id="space" eyebrow="About" title="카페와 사무실 사이, 그쯤">
        <div className="rounded-card border-2 border-workroom-line bg-workroom-surface p-5 text-base font-semibold leading-8 shadow-soft sm:p-7 sm:text-lg">
          <p>
            카페는 편하지만 오래 앉아 있으면 조금 눈치가 보이고, 사무실은 집중하기 좋지만
            가끔은 너무 딱딱하고, 집은 편한데 이상하게 일이 잘 안 될 때가 있습니다.
          </p>
          <p className="mt-5">
            WORKROOM은 그 사이 어딘가의 공간을 생각하며 준비하고 있습니다. 슬렁슬렁
            들어와도 되고, 조용히 오래 앉아 있어도 되고, 각자의 일을 각자의 속도로 이어갈 수
            있는 곳입니다.
          </p>
        </div>
      </Section>

      <Section eyebrow="Features" title="작업이 너무 커지지 않게">
        <div className="mb-5 rounded-card border-2 border-workroom-line bg-workroom-surface p-4 shadow-soft">
          <img className="mx-auto h-auto max-h-20 w-full object-contain" src={captionImage} alt="Out of office, Into Workroom." />
        </div>
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
        <p className="mt-4 rounded-card border-2 border-workroom-line bg-workroom-purple px-4 py-3 text-sm font-black">
          가격은 초기 운영 기준입니다. 운영 방식에 따라 조금씩 다듬어질 수 있습니다.
        </p>
      </Section>

      <section className="mx-auto max-w-5xl px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-card border-2 border-workroom-line bg-workroom-text p-5 text-white shadow-sketch">
            <p className="text-sm font-black text-workroom-yellow">Mood</p>
            <h2 className="mt-2 text-2xl font-black leading-tight">조용하지만 너무 엄숙하지 않게</h2>
          </article>
          <article className="rounded-card border-2 border-workroom-line bg-workroom-yellow p-5 shadow-sketch">
            <p className="text-sm font-black text-workroom-muted">Use</p>
            <h2 className="mt-2 text-2xl font-black leading-tight">작업, 촬영, 작은 대화까지</h2>
          </article>
          <article className="rounded-card border-2 border-workroom-line bg-workroom-purple p-5 shadow-sketch">
            <p className="text-sm font-black text-workroom-muted">Check</p>
            <h2 className="mt-2 text-2xl font-black leading-tight">신청 후 확인 연락으로 확정</h2>
          </article>
        </div>
      </section>

      <Section eyebrow="How to use" title="예약은 길게 말하지 않고">
        <ol className="grid gap-3 sm:grid-cols-4">
          {["원하는 이용권을 선택합니다.", "날짜와 시간을 선택합니다.", "예약 신청을 남깁니다.", "확인 후 예약이 확정됩니다."].map((item, index) => (
            <li key={item} className="rounded-card border-2 border-workroom-line bg-workroom-surface p-5 font-black">
              <span className="mb-4 grid h-8 w-8 place-items-center rounded-full bg-workroom-text text-sm text-white">{index + 1}</span>
              {item}
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-card border-2 border-workroom-line bg-workroom-yellow px-4 py-3 text-sm font-black">
          초기 운영 기간에는 예약 신청 후 확인 연락을 드립니다. 결제는 계좌이체 또는 현장결제로 진행됩니다.
        </p>
      </Section>

      <Section eyebrow="Location" title="충장로에 준비 중입니다">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
          <div className="rounded-card border-2 border-workroom-line bg-workroom-surface p-5 shadow-sketch">
            <p className="text-xl font-black">광주광역시 동구 충장로</p>
            <p className="mt-2 font-semibold text-workroom-muted">금남로5가역 도보 약 3-5분</p>
          </div>
          <div className="grid gap-3">
            <a
              className="rounded-full border-2 border-workroom-line bg-workroom-text px-5 py-4 text-center font-black text-white"
              href="https://map.naver.com/p/search/%EA%B4%91%EC%A3%BC%20%EB%8F%99%EA%B5%AC%20%EC%B6%A9%EC%9E%A5%EB%A1%9C"
              rel="noreferrer"
              target="_blank"
            >
              네이버지도에서 보기
            </a>
            <a
              className="rounded-full border-2 border-workroom-line bg-workroom-yellow px-5 py-4 text-center font-black"
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
        <div className="rounded-card border-2 border-workroom-line bg-workroom-text p-6 text-white shadow-sketch sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <p className="text-sm font-black text-workroom-yellow">Reservation</p>
            <h2 className="mt-2 text-3xl font-black">슬렁슬렁 들어올 준비가 됐다면</h2>
          </div>
          <Link className="mt-5 block rounded-full border-2 border-white bg-white px-6 py-4 text-center font-black text-workroom-text sm:mt-0" to="/reserve">
            예약 신청하기
          </Link>
        </div>
      </section>
    </main>
  );
}
