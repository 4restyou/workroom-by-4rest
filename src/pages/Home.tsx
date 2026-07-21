import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import FeatureCard, { type FeatureIcon } from "../components/FeatureCard";
import { AlertIcon, BusIcon, CheckIcon, IdCardIcon, ParkingIcon, PinIcon, SubwayIcon } from "../components/icons";
import MemberDashboard from "../components/MemberDashboard";
import PriceCard from "../components/PriceCard";
import Section from "../components/Section";
import { defaultPasses } from "../lib/defaultPasses";
import { getCurrentProfile } from "../lib/profiles";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { badge, buttonClass, card, pressable, tintCard, type TintColor } from "../lib/ui";
import type { Pass } from "../lib/types";
import { SITE } from "../lib/site";

const { address: ADDRESS, naverMapUrl: NAVER_MAP_URL, kakaoMapUrl: KAKAO_MAP_URL } = SITE;

const features: { title: string; body: string; icon: FeatureIcon; accent: TintColor }[] = [
  {
    title: "개인 작업석",
    body: "혼자 앉아 작업하기 좋은 자리입니다. 자유석으로 운영합니다.",
    icon: "seat",
    accent: "yellow",
  },
  {
    title: "공용 테이블",
    body: "짧은 회의나 작은 모임에 사용할 수 있는 테이블입니다.",
    icon: "table",
    accent: "sky",
  },
  {
    title: "호리존 촬영",
    body: "상반신 증명사진과 간단한 프로필 촬영이 가능하며, 호리존 사용 시 관리자에게 문의해 주세요.",
    icon: "camera",
    accent: "yellow",
  },
  {
    title: "커피 / 프린트",
    body: "이용권에 따라 커피가 제공되고, 흑백 프린트는 5장까지 무료입니다.",
    icon: "coffee",
    accent: "sky",
  },
];

const guideItems: [string, string][] = [
  ["결제", "온라인 예약은 신청 후 카드 결제가 완료되면 바로 확정됩니다. 현장 결제와 별도 확인이 필요한 예약은 운영자가 확인합니다."],
  ["취소", "예약 시작 시간 전까지 예약현황에서 직접 취소할 수 있습니다."],
  ["예약 기간", "예약은 이용일 기준 오늘부터 최대 2개월 이내까지 가능합니다."],
  ["연장", "이용 종료 후 15분까지는 유예되며, 이후 1시간 추가 요금이 적용됩니다."],
  ["소리", "통화는 조용히, 음악과 영상은 반드시 이어폰이나 헤드폰으로 이용합니다."],
  ["음식", "냄새가 적은 간단한 음식과 음료는 가능합니다. (샌드위치, 음료 등)"],
  ["증명사진", "상반신 증명사진 촬영은 유료로 이용할 수 있습니다."],
  ["릴렉스타임", "오후 5시 30분부터 7시까지는 릴렉스타임으로, 메인 음악 소리가 평소보다 커질 수 있습니다."],
  ["동반", "함께 이용하는 분은 별도 좌석 예약이 필요합니다."],
];

const fitItems = [
  "노트북 작업, 공부, 글쓰기처럼 조용한 시간이 필요한 경우",
  "상반신 증명사진, 간단한 프로필 사진, 작은 제품 촬영",
  "2~4명이 하는 짧은 회의나 가벼운 협업",
];

const cautionItems = [
  "큰 소리가 나는 모임, 파티, 장시간 통화",
  "냄새가 강한 음식이나 공간을 많이 어지럽히는 작업",
  "사전 협의 없는 상업 촬영, 장비 반입이 큰 촬영",
];

const heroPhotos = [
  {
    src: "/images/workroom/hero.webp",
    title: "창가 작업석",
    body: "밝은 창가 쪽에 마련된 작업 자리입니다.",
  },
  {
    src: "/images/workroom/lounge.webp",
    title: "쉼공간",
    body: "잠깐 쉬거나 이야기를 나눌 수 있는 공간입니다.",
  },
  {
    src: "/images/workroom/desk-window.webp",
    title: "창가 단독석",
    body: "혼자 집중해서 머물기 좋은 자리입니다.",
  },
  {
    src: "/images/workroom/shelf.webp",
    title: "공간 한쪽",
    body: "책과 조명, 소품을 두어 편하게 정리한 공간입니다.",
  },
  {
    src: "/images/workroom/table.webp",
    title: "다인석",
    body: "작은 모임이나 협업에 사용할 수 있는 테이블입니다.",
  },
  {
    src: "/images/workroom/night.webp",
    title: "야간 전경",
    body: "저녁에도 차분하게 이용할 수 있습니다.",
  },
];

export default function Home() {
  const [passes, setPasses] = useState<Pass[]>(defaultPasses);
  const [viewerRole, setViewerRole] = useState<"guest" | "user" | "admin" | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const photoScrollerRef = useRef<HTMLDivElement>(null);
  // Carousel coordination: while we drive a smooth scroll ourselves, onScroll
  // must not "correct" the index mid-flight (that fight made auto-advance snap
  // back and flicker). User interaction also pauses the autoplay timer.
  const programmaticUntil = useRef(0);
  const scrollIdleTimer = useRef<number | null>(null);
  const autoplayPaused = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadViewerRole() {
      if (!supabase) {
        setViewerRole("guest");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        setViewerRole("guest");
        return;
      }
      const profile = await getCurrentProfile();
      if (!active) return;
      setViewerRole(profile?.role === "admin" ? "admin" : "user");
    }

    void loadViewerRole();
    if (!supabase) {
      return () => {
        active = false;
      };
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadViewerRole();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

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

  // Autoplay. Keyed on activePhoto so any change (auto, dot, arrow, swipe)
  // restarts the 4.5s countdown — no jarring jump right after a manual move.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      if (autoplayPaused.current) return;
      setActivePhoto((current) => (current + 1) % heroPhotos.length);
    }, 4500);
    return () => window.clearInterval(interval);
  }, [activePhoto]);

  useEffect(() => {
    const scroller = photoScrollerRef.current;
    if (!scroller) return;
    const target = activePhoto * scroller.clientWidth;
    if (Math.abs(scroller.scrollLeft - target) < 2) return;
    programmaticUntil.current = Date.now() + 800;
    scroller.scrollTo({
      left: target,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [activePhoto]);

  function handlePhotoScroll() {
    // Ignore the scroll events produced by our own smooth scroll.
    if (Date.now() < programmaticUntil.current) return;
    // Manual swipe: update the index only once scrolling has settled, so the
    // snap animation isn't interrupted halfway.
    if (scrollIdleTimer.current) window.clearTimeout(scrollIdleTimer.current);
    scrollIdleTimer.current = window.setTimeout(() => {
      const scroller = photoScrollerRef.current;
      if (!scroller) return;
      const nextIndex = Math.round(scroller.scrollLeft / scroller.clientWidth);
      setActivePhoto((current) => (nextIndex !== current ? nextIndex : current));
    }, 90);
  }

  function stepPhoto(delta: number) {
    setActivePhoto((current) => (current + delta + heroPhotos.length) % heroPhotos.length);
  }

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
      {/* Signed-in members get a "today" dashboard in place of the marketing
          hero; visitors (and the initial unknown state) see the hero. */}
      {viewerRole === "admin" ? (
        <Navigate replace to="/admin/dashboard" />
      ) : viewerRole === "user" ? (
        <MemberDashboard />
      ) : (
        <section className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pb-16 sm:pt-16">
          <div className="grid gap-8 border-b border-workroom-ink pb-8 sm:grid-cols-12 sm:gap-10 sm:pb-12">
            <div className="animate-pop-in sm:col-span-6 sm:self-center">
              <span className={badge("yellow")}>MEMBER RESERVATION · 회원 예약</span>
              <h1 className="mt-5 font-display text-[2.7rem] font-bold leading-[1.25] tracking-[-0.045em] sm:text-[4.25rem]">
                필요한 시간만큼,
                <br />
                조용히 머무는
                <br />
                작업 공간
              </h1>
              <p className="mt-6 max-w-lg text-base font-medium leading-7 text-workroom-muted sm:text-lg sm:leading-8">
                충장로에 있는 예약제 작업 공간입니다. 혼자 작업하거나, 작은 모임을 할 때 이용할 수 있어요.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link className={buttonClass("accent", "lg", "w-full sm:w-auto")} to="/reserve">
                  예약 신청하기 <span aria-hidden>→</span>
                </Link>
                <a className={buttonClass("secondary", "lg", "w-full sm:w-auto")} href="#pricing">
                  이용권 보기
                </a>
              </div>
            </div>

            <div className="sm:col-span-6">
              <div className="overflow-hidden border border-workroom-ink bg-workroom-surface">
                <div
                  className="group relative"
                  onMouseEnter={() => {
                    autoplayPaused.current = true;
                  }}
                  onMouseLeave={() => {
                    autoplayPaused.current = false;
                  }}
                  onTouchStart={() => {
                    autoplayPaused.current = true;
                  }}
                  onTouchEnd={() => {
                    autoplayPaused.current = false;
                  }}
                >
                  <div
                    aria-label="WORKROOM 공간 사진"
                    className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
                    onScroll={handlePhotoScroll}
                    ref={photoScrollerRef}
                  >
                    {heroPhotos.map((photo) => (
                      <img
                        alt={`WORKROOM ${photo.title}`}
                        className="aspect-[4/3] w-full shrink-0 snap-center object-cover"
                        draggable={false}
                        key={photo.src}
                        src={photo.src}
                      />
                    ))}
                  </div>

                  <button
                    aria-label="이전 사진"
                    className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-workroom-ink bg-workroom-surface/90 text-workroom-ink transition-[transform,opacity] duration-150 ease-out hover:scale-105 active:scale-95 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    onClick={() => stepPhoto(-1)}
                    type="button"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <button
                    aria-label="다음 사진"
                    className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-workroom-ink bg-workroom-surface/90 text-workroom-ink transition-[transform,opacity] duration-150 ease-out hover:scale-105 active:scale-95 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    onClick={() => stepPhoto(1)}
                    type="button"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>

                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-pill border border-workroom-ink bg-workroom-surface/90 px-2 py-1">
                    {heroPhotos.map((photo, index) => (
                      <button
                        aria-label={`${photo.title} 사진 보기`}
                        className={`h-2.5 rounded-pill border border-workroom-ink transition-all ${
                          activePhoto === index ? "w-7 bg-workroom-yellow" : "w-2.5 bg-workroom-surface"
                        }`}
                        key={photo.src}
                        onClick={() => setActivePhoto(index)}
                        type="button"
                      />
                    ))}
                  </div>
                </div>
                <div className="border-t border-workroom-ink p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.12em] text-workroom-muted">Chungjang-ro workroom</p>
                      <p className="mt-1 text-xl font-bold">{heroPhotos[activePhoto].title}</p>
                      <p className="mt-1 text-sm font-medium leading-6 text-workroom-muted">{heroPhotos[activePhoto].body}</p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-workroom-muted">
                      {activePhoto + 1}/{heroPhotos.length}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-3 divide-x divide-workroom-line border-b border-workroom-ink py-4 text-center sm:text-left">
            <div className="px-3 first:pl-0 sm:flex sm:items-baseline sm:gap-2">
              <dt className="text-[10px] font-bold uppercase tracking-widest text-workroom-muted">Hours</dt>
              <dd className="mt-1 text-xs font-bold sm:text-sm">{SITE.hoursLabel}</dd>
            </div>
            <div className="px-3 sm:flex sm:items-baseline sm:gap-2">
              <dt className="text-[10px] font-bold uppercase tracking-widest text-workroom-muted">Location</dt>
              <dd className="mt-1 text-xs font-bold leading-5 sm:text-sm">{SITE.address}</dd>
            </div>
            <div className="px-3 pr-0 sm:flex sm:items-baseline sm:gap-2">
              <dt className="text-[10px] font-bold uppercase tracking-widest text-workroom-muted">Booking</dt>
              <dd className="mt-1 text-xs font-bold sm:text-sm">회원 예약제</dd>
            </div>
          </dl>
        </section>
      )}

      <Section id="space" eyebrow="About" title="조용히 머물 수 있는 작업 공간" accent="mint">
        <div className="max-w-3xl border-l-2 border-workroom-ink pl-5 text-lg font-medium leading-9 text-workroom-muted sm:pl-7 sm:text-xl">
          <p>
            WORKROOM은 예약제로 운영하는 작은 작업 공간입니다. 노트북 작업, 공부, 글쓰기처럼 조용한 시간이 필요할 때 이용하기 좋습니다.
          </p>
          <p className="mt-6">
            혼자 머물 수 있는 자리와 함께 앉을 수 있는 테이블이 있고, 간단한 촬영이나 프린트도 이용할 수 있습니다.
          </p>
        </div>
      </Section>

      <Section eyebrow="Features" title="이용할 수 있는 것" accent="lilac">
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </Section>

      <Section id="pricing" eyebrow="Plans / Pricing" title="이용권 안내" accent="yellow">
        <div className="grid gap-3">
          {passes.map((pass) => (
            <PriceCard key={pass.id} pass={pass} />
          ))}
        </div>
        <p className={`${tintCard("mint")} mt-4 px-4 py-3 text-sm font-bold`}>
          기본 단위는 3시간권입니다. 1시간권은 운영하지 않고, 좌석 여유가 있을 때 1시간 단위 연장이 가능합니다.
        </p>
        <div className="mt-4 grid gap-px overflow-hidden rounded-card border border-workroom-ink bg-workroom-ink sm:grid-cols-2">
          <div className="bg-workroom-surface p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-workroom-muted">Online payment</p>
            <p className="mt-2 text-sm font-bold leading-6">{SITE.booking.onlinePayment}</p>
          </div>
          <div className="bg-workroom-surface p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-workroom-muted">On-site payment</p>
            <p className="mt-2 text-sm font-bold leading-6">{SITE.booking.onsitePayment}</p>
          </div>
        </div>
      </Section>

      <Section eyebrow="Guide" title="이용 전 확인해 주세요" accent="sky">
        <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {guideItems.map(([title, body]) => (
            <div className="border-t-2 border-workroom-ink pt-3" key={title}>
              <dt className="text-base font-bold">{title}</dt>
              <dd className="mt-1.5 text-sm font-medium leading-6 text-workroom-muted">{body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section eyebrow="Use cases" title="이런 경우에 이용하기 좋아요" accent="lilac">
        <div className="grid gap-4 sm:grid-cols-2">
          <article className={`${tintCard("mint")} p-5`}>
            <h3 className="text-xl font-bold">추천하는 이용</h3>
            <ul className="mt-4 grid gap-3">
              {fitItems.map((item) => (
                <li className="flex gap-2.5 text-sm font-bold leading-6" key={item}>
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className={`${tintCard("yellow")} p-5`}>
            <h3 className="text-xl font-bold">예약 전 문의가 필요한 이용</h3>
            <ul className="mt-4 grid gap-3">
              {cautionItems.map((item) => (
                <li className="flex gap-2.5 text-sm font-bold leading-6" key={item}>
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
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

      <Section eyebrow="How to use" title="예약 방법" accent="coral">
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

      <Section eyebrow="Location" title="충장로5가, 금남로5가역 근처" accent="mint">
        <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
          <div className={`${card} p-5`}>
            <p className="text-xl font-bold">WORKROOM by 4REST</p>
            <p className="mt-1 font-medium text-workroom-muted">{ADDRESS}</p>
            <dl className="mt-5 grid gap-4">
              <div>
                <dt className="flex items-center gap-1.5 text-sm font-bold"><SubwayIcon className="h-4 w-4" /> 지하철</dt>
                <dd className="mt-1 text-sm font-medium leading-6 text-workroom-muted">
                  광주 1호선 <b className="font-bold text-workroom-ink">금남로5가역 1번 출구</b>에서 도보 약 3–5분.
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-sm font-bold"><BusIcon className="h-4 w-4" /> 버스</dt>
                <dd className="mt-1 text-sm font-medium leading-6 text-workroom-muted">
                  ‘금남로5가역’ 정류장 하차. 경유 노선이 많아 출발지에서 지도 길찾기로 확인하는 게 가장 정확해요.
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-sm font-bold"><ParkingIcon className="h-4 w-4" /> 주차</dt>
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

      <Section eyebrow="Community" title="멤버 공간" accent="lilac">
        <div className="grid gap-4 sm:grid-cols-2">
          <Link className={`${tintCard("mint")} ${pressable} group flex flex-col gap-2 p-6`} to="/directory">
            <IdCardIcon className="h-7 w-7" />
            <h3 className="text-xl font-bold">멤버 명함첩</h3>
            <p className="text-sm font-medium leading-6 text-workroom-ink/75">
              워크룸을 이용하는 사람들의 명함을 볼 수 있습니다. 로그인 후 내 명함도 등록할 수 있어요.
            </p>
            <span className="mt-1 text-sm font-black underline underline-offset-4">명함첩 열기 →</span>
          </Link>
          <Link className={`${tintCard("coral")} ${pressable} group flex flex-col gap-2 p-6`} to="/board">
            <PinIcon className="h-7 w-7" />
            <h3 className="text-xl font-bold">메모판</h3>
            <p className="text-sm font-medium leading-6 text-workroom-ink/75">
              운영자 공지와 회원 메모를 확인하는 공간입니다. 로그인 후 메모를 남길 수 있어요.
            </p>
            <span className="mt-1 text-sm font-black underline underline-offset-4">메모판 열기 →</span>
          </Link>
        </div>
      </Section>

      <section className="mx-auto max-w-5xl px-4 pb-12 pt-4">
        <div className={`${tintCard("ink")} p-6 sm:flex sm:items-center sm:justify-between sm:gap-6`}>
          <div>
            <p className="text-sm font-black text-workroom-yellow">Reservation</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">방문 전 예약을 남겨주세요</h2>
          </div>
          <Link className={buttonClass("accent", "lg", "mt-5 w-full sm:mt-0 sm:w-auto")} to="/reserve">
            예약 신청하기 →
          </Link>
        </div>
      </section>
    </main>
  );
}
