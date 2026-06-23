import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Section from "../components/Section";
import Skeleton from "../components/Skeleton";
import { supabase } from "../lib/supabase";
import { ACCENT_BG, CARD_CATEGORIES } from "../lib/directory";
import { buttonClass, tintCard } from "../lib/ui";
import type { MemberCard } from "../lib/types";
import paperTexture from "../../assets/paper-texture.webp";

const instaUrl = (handle: string) =>
  `https://instagram.com/${handle.replace(/^@/, "").trim()}`;

const DEMO_MEMBER_CARDS: MemberCard[] = [
  {
    id: "demo-card-1",
    profile_id: "demo-profile-1",
    display_name: "김모아",
    category: "브랜딩",
    occupation: "브랜드 디자이너",
    company: "모아 스튜디오",
    headline: "작은 브랜드의 말투와 표정을 만듭니다.",
    bio: "로컬 브랜드의 이름, 로고, 패키지와 웹사이트를 함께 설계해요.",
    link_url: null,
    instagram: null,
    contact: "hello@example.com",
    accent: "yellow",
    is_published: true,
    created_at: "2026-06-10T09:00:00+09:00",
    updated_at: "2026-06-10T09:00:00+09:00",
  },
  {
    id: "demo-card-2",
    profile_id: "demo-profile-2",
    display_name: "이재이",
    category: "개발 · IT",
    occupation: "프론트엔드 개발자",
    company: null,
    headline: "작고 단단한 웹 서비스를 만듭니다.",
    bio: "React와 TypeScript를 주로 사용하고, 좋은 인터랙션에 관심이 많습니다.",
    link_url: null,
    instagram: null,
    contact: null,
    accent: "sky",
    is_published: true,
    created_at: "2026-06-11T09:00:00+09:00",
    updated_at: "2026-06-11T09:00:00+09:00",
  },
  {
    id: "demo-card-3",
    profile_id: "demo-profile-3",
    display_name: "박여름",
    category: "사진 · 영상",
    occupation: "포토그래퍼",
    company: "여름 사진관",
    headline: "사람과 공간의 자연스러운 순간을 기록해요.",
    bio: null,
    link_url: null,
    instagram: null,
    contact: null,
    accent: "yellow",
    is_published: true,
    created_at: "2026-06-12T09:00:00+09:00",
    updated_at: "2026-06-12T09:00:00+09:00",
  },
  {
    id: "demo-card-4",
    profile_id: "demo-profile-4",
    display_name: "정해인",
    category: "글 · 출판",
    occupation: "에디터",
    company: null,
    headline: "읽고 싶은 문장을 고르고 오래 남을 글을 다듬습니다.",
    bio: "인터뷰와 브랜드 콘텐츠를 씁니다.",
    link_url: null,
    instagram: null,
    contact: null,
    accent: "sky",
    is_published: true,
    created_at: "2026-06-13T09:00:00+09:00",
    updated_at: "2026-06-13T09:00:00+09:00",
  },
  {
    id: "demo-card-5",
    profile_id: "demo-profile-5",
    display_name: "오윤",
    category: "마케팅 · 기획",
    occupation: "콘텐츠 기획자",
    company: "느린 파도",
    headline: "복잡한 이야기를 이해하기 쉬운 콘텐츠로 바꿉니다.",
    bio: null,
    link_url: null,
    instagram: null,
    contact: null,
    accent: "yellow",
    is_published: true,
    created_at: "2026-06-14T09:00:00+09:00",
    updated_at: "2026-06-14T09:00:00+09:00",
  },
  {
    id: "demo-card-6",
    profile_id: "demo-profile-6",
    display_name: "최다정",
    category: "일러스트 · 웹툰",
    occupation: "일러스트레이터",
    company: null,
    headline: "일상의 작고 웃긴 장면을 그립니다.",
    bio: "출판과 브랜드 일러스트 작업을 하고 있어요.",
    link_url: null,
    instagram: null,
    contact: null,
    accent: "sky",
    is_published: true,
    created_at: "2026-06-15T09:00:00+09:00",
    updated_at: "2026-06-15T09:00:00+09:00",
  },
];

// Fisher–Yates: visitors see a fresh ordering each visit rather than newest-first.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function CardView({ card }: { card: MemberCard }) {
  const [open, setOpen] = useState(false);
  const subline = [card.occupation, card.company].filter(Boolean).join(" · ");
  // Headline shows as a single line on the (fixed-height) front; longer ones
  // are read in full via the expander.
  const longHeadline = (card.headline?.trim().length ?? 0) > 20;
  const hasDetails = Boolean(card.bio || card.link_url || card.contact || card.instagram || longHeadline);

  return (
    <div className="flex flex-col">
      {/* 실제 명함 비율(90×50mm = 9:5), 흰 종이 질감 */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => hasDetails && setOpen((v) => !v)}
        style={{ backgroundImage: `url(${paperTexture})` }}
        className={`relative flex h-[180px] w-full flex-col justify-between gap-3 overflow-hidden rounded-[6px] border border-workroom-line bg-workroom-surface bg-cover bg-center p-5 text-left transition-[transform,background-color,border-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workroom-ink focus-visible:ring-offset-2 hover:border-workroom-ink sm:h-[188px] ${
          hasDetails ? "cursor-pointer hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]" : "cursor-default"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className={`inline-flex items-center rounded-[4px] px-2.5 py-1 text-[11px] font-black text-workroom-ink ${ACCENT_BG[card.accent]}`}>
            {card.category}
          </span>
          <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.18em] text-workroom-line">WORKROOM</span>
        </div>

        <div>
          <div className="min-w-0">
            <h3 className="truncate font-display text-2xl font-bold leading-tight text-workroom-ink">{card.display_name}</h3>
            {subline ? <p className="mt-0.5 truncate text-[13px] font-bold text-workroom-muted">{subline}</p> : null}
            {card.headline ? <p className="mt-1.5 truncate text-xs font-medium leading-5 text-workroom-ink/65">{card.headline}</p> : null}
          </div>
          {hasDetails ? (
            <div className="mt-2 text-center text-[10px] font-black text-workroom-muted">{open ? "접기 ▲" : "자세히 ▾"}</div>
          ) : null}
        </div>
      </button>

      {/* 펼치면 보이는 상세: 한 줄 소개 전문 + 소개 + 연락 */}
      {hasDetails && open ? (
        <div className="mt-2 animate-pop-in rounded-card border border-workroom-line bg-workroom-surface p-4">
          {card.headline ? <p className="text-sm font-bold leading-6 text-workroom-ink">{card.headline}</p> : null}
          {card.bio ? (
            <p className={`whitespace-pre-line text-sm font-medium leading-6 text-workroom-ink/80 ${card.headline ? "mt-1.5" : ""}`}>{card.bio}</p>
          ) : null}
          {(card.instagram || card.link_url || card.contact) && (
            <div className={`flex flex-wrap gap-2 text-xs font-bold ${card.headline || card.bio ? "mt-3 border-t border-workroom-line pt-3" : ""}`}>
              {card.instagram ? (
                <a className="rounded-[4px] border border-workroom-ink px-3 py-1 hover:bg-workroom-yellow" href={instaUrl(card.instagram)} rel="noreferrer" target="_blank">
                  @{card.instagram.replace(/^@/, "")}
                </a>
              ) : null}
              {card.link_url ? (
                <a className="rounded-[4px] border border-workroom-ink px-3 py-1 hover:bg-workroom-yellow" href={card.link_url} rel="noreferrer" target="_blank">
                  홈페이지
                </a>
              ) : null}
              {card.contact ? (
                <span className="rounded-[4px] border border-workroom-ink px-3 py-1">{card.contact}</span>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function Directory() {
  const [cards, setCards] = useState<MemberCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("전체");
  const [signedIn, setSignedIn] = useState(false);
  const [hasCard, setHasCard] = useState(false);

  // Scroll-aware fade on the category row: only fades the side that has more
  // chips to reveal, so the edge reads as "scroll for more" not "cut off".
  const chipRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  function syncFade() {
    const el = chipRef.current;
    if (!el) return;
    setFade({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }

  useEffect(() => {
    async function load() {
      if (!supabase) {
        if (import.meta.env.DEV) {
          setCards(shuffle(DEMO_MEMBER_CARDS));
          setIsLoading(false);
          return;
        }
        setError("Supabase 환경 변수가 아직 연결되지 않았습니다.");
        setIsLoading(false);
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id ?? null;
      setSignedIn(Boolean(uid));

      const { data, error: loadError } = await supabase
        .from("member_cards")
        .select("*")
        .eq("is_published", true);
      if (loadError) {
        setError("명함을 불러오지 못했어요.");
        setIsLoading(false);
        return;
      }
      const loaded = (data ?? []) as MemberCard[];
      const list = shuffle(import.meta.env.DEV && !loaded.length ? DEMO_MEMBER_CARDS : loaded);
      setCards(list);
      if (uid) setHasCard(list.some((c) => c.profile_id === uid));
      setIsLoading(false);
    }
    void load();
  }, []);

  // Preset categories first, then any custom ones members typed in.
  const categories = useMemo(() => {
    const extras = cards
      .map((c) => c.category)
      .filter((c) => c && !CARD_CATEGORIES.includes(c as (typeof CARD_CATEGORIES)[number]));
    return ["전체", ...CARD_CATEGORIES, ...Array.from(new Set(extras))];
  }, [cards]);

  useEffect(() => {
    syncFade();
    window.addEventListener("resize", syncFade);
    return () => window.removeEventListener("resize", syncFade);
  }, [categories]);

  const maskImage = useMemo(() => {
    const left = fade.left ? "transparent 0, #000 1.75rem" : "#000 0";
    const right = fade.right ? "#000 calc(100% - 1.75rem), transparent 100%" : "#000 100%";
    return `linear-gradient(to right, ${left}, ${right})`;
  }, [fade]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (category !== "전체" && c.category !== category) return false;
      if (!q) return true;
      return [c.display_name, c.occupation, c.company, c.category, c.headline, c.bio]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(q));
    });
  }, [cards, query, category]);

  return (
    <main className="pb-16">
      <Section eyebrow="Directory" title="멤버 명함첩" accent="sky">
        <p className="max-w-2xl text-sm font-medium leading-6 text-workroom-muted">
          워크룸을 함께 쓰는 사람들. 이름·업종·카테고리로 찾아보고, 내 명함도 올려보세요.
        </p>
        <p className="mb-5 mt-1 max-w-2xl text-xs font-medium leading-6 text-workroom-muted">
          명함은 본인이 직접 등록·수정·삭제할 수 있어요. 공개로 설정한 명함만 이 목록에 표시됩니다.
        </p>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Link className={buttonClass("primary", "sm")} to="/directory/edit">
            {hasCard ? "내 명함 수정" : signedIn ? "내 명함 등록" : "로그인하고 명함 등록"}
          </Link>
          <span className="text-sm font-bold text-workroom-muted">
            {isLoading ? "" : `총 ${cards.length}명`}
          </span>
        </div>

        {/* 검색 */}
        <div className="relative mb-3">
          <input
            className="w-full rounded-[6px] border border-workroom-ink bg-workroom-surface px-5 py-3 text-sm font-bold placeholder:text-workroom-muted focus:outline-none focus:ring-2 focus:ring-workroom-yellow"
            placeholder="이름 · 업종 · 키워드로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            aria-label="명함 검색"
          />
        </div>

        {/* 카테고리 필터 */}
        <div
          ref={chipRef}
          onScroll={syncFade}
          style={{ maskImage, WebkitMaskImage: maskImage }}
          className="no-scrollbar mb-6 flex gap-2 overflow-x-auto px-0.5 pb-1"
        >
          {categories.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`shrink-0 rounded-[4px] border px-4 py-1.5 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workroom-yellow focus-visible:ring-offset-2 ${
                  active
                    ? "border-workroom-ink bg-workroom-ink text-white"
                    : "border-workroom-ink bg-workroom-surface text-workroom-ink hover:bg-workroom-yellow"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>

        {error ? <p className={`mb-4 ${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            <Skeleton className="aspect-[9/5]" />
            <Skeleton className="aspect-[9/5]" />
            <Skeleton className="aspect-[9/5]" />
          </div>
        ) : filtered.length ? (
          <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((card) => (
              <CardView card={card} key={card.id} />
            ))}
          </div>
        ) : (
          <div className={`${tintCard("sky")} p-8 text-center`}>
            <p className="font-black">
              {cards.length ? "조건에 맞는 명함이 없어요." : "아직 등록된 명함이 없어요."}
            </p>
            <p className="mt-1 text-sm font-medium text-workroom-ink/70">
              {cards.length ? "검색어나 카테고리를 바꿔보세요." : "첫 명함의 주인공이 되어보세요!"}
            </p>
            {!cards.length ? (
              <Link className={`${buttonClass("primary", "sm")} mt-4`} to="/directory/edit">
                {signedIn ? "내 명함 등록" : "로그인하고 등록"}
              </Link>
            ) : null}
          </div>
        )}
      </Section>
    </main>
  );
}
