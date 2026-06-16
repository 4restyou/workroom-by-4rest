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
  // A long headline gets clamped on the (fixed-ratio) front, so it also needs
  // the expander to be readable in full.
  const longHeadline = (card.headline?.trim().length ?? 0) > 38;
  const hasDetails = Boolean(card.bio || card.link_url || card.contact || card.instagram || longHeadline);

  return (
    <div className="flex flex-col">
      {/* 실제 명함 비율(90×50mm = 9:5), 흰 종이 질감 */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => hasDetails && setOpen((v) => !v)}
        style={{ backgroundImage: `url(${paperTexture})` }}
        className={`relative flex aspect-[9/5] w-full flex-col justify-between overflow-hidden rounded-[12px] border border-workroom-line bg-workroom-surface bg-cover bg-center p-5 text-left shadow-[0_10px_24px_-12px_rgba(20,20,20,0.4)] transition-transform ${
          hasDetails ? "cursor-pointer hover:-translate-y-0.5" : "cursor-default"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className={`inline-flex items-center rounded-pill px-2.5 py-1 text-[11px] font-black text-workroom-ink ${ACCENT_BG[card.accent]}`}>
            {card.category}
          </span>
          <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.18em] text-workroom-line">WORKROOM</span>
        </div>

        <div>
          <div className="min-w-0">
            <h3 className="truncate font-display text-2xl font-bold leading-tight text-workroom-ink">{card.display_name}</h3>
            {subline ? <p className="mt-0.5 truncate text-[13px] font-bold text-workroom-muted">{subline}</p> : null}
            {card.headline ? <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-5 text-workroom-ink/65">{card.headline}</p> : null}
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
                <a className="rounded-pill border border-workroom-ink px-3 py-1 hover:bg-workroom-yellow" href={instaUrl(card.instagram)} rel="noreferrer" target="_blank">
                  @{card.instagram.replace(/^@/, "")}
                </a>
              ) : null}
              {card.link_url ? (
                <a className="rounded-pill border border-workroom-ink px-3 py-1 hover:bg-workroom-yellow" href={card.link_url} rel="noreferrer" target="_blank">
                  홈페이지
                </a>
              ) : null}
              {card.contact ? (
                <span className="rounded-pill border border-workroom-ink px-3 py-1">{card.contact}</span>
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
      const list = shuffle((data ?? []) as MemberCard[]);
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
      <Section eyebrow="Directory" title="멤버 명함첩" accent="mint">
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
            className="w-full rounded-pill border-2 border-workroom-ink bg-workroom-surface px-5 py-3 text-sm font-bold placeholder:text-workroom-muted focus:outline-none focus:ring-2 focus:ring-workroom-yellow"
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
                className={`shrink-0 rounded-pill border-2 px-4 py-1.5 text-xs font-black transition-colors ${
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
          <div className={`${tintCard("mint")} p-8 text-center`}>
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
