import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Section from "../components/Section";
import Skeleton from "../components/Skeleton";
import { supabase } from "../lib/supabase";
import { ACCENT_BG, CARD_CATEGORIES } from "../lib/directory";
import { buttonClass, tintCard } from "../lib/ui";
import type { MemberCard } from "../lib/types";

const instaUrl = (handle: string) =>
  `https://instagram.com/${handle.replace(/^@/, "").trim()}`;

function CardView({ card }: { card: MemberCard }) {
  return (
    <article
      className={`flex flex-col gap-2 rounded-card border-2 border-workroom-ink p-5 shadow-hard ${ACCENT_BG[card.accent]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-black leading-tight">{card.display_name}</h3>
          {card.occupation ? (
            <p className="mt-0.5 truncate text-sm font-bold text-workroom-ink/70">{card.occupation}</p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-pill border border-workroom-ink bg-workroom-surface px-2.5 py-1 text-[11px] font-black">
          {card.category}
        </span>
      </div>

      {card.headline ? <p className="text-sm font-bold leading-6">{card.headline}</p> : null}
      {card.bio ? <p className="whitespace-pre-line text-sm font-medium leading-6 text-workroom-ink/80">{card.bio}</p> : null}

      {(card.instagram || card.link_url || card.contact) && (
        <div className="mt-1 flex flex-wrap gap-2 border-t border-workroom-ink/15 pt-3 text-xs font-bold">
          {card.instagram ? (
            <a className="rounded-pill border border-workroom-ink bg-workroom-surface px-3 py-1 hover:bg-white" href={instaUrl(card.instagram)} rel="noreferrer" target="_blank">
              @{card.instagram.replace(/^@/, "")}
            </a>
          ) : null}
          {card.link_url ? (
            <a className="rounded-pill border border-workroom-ink bg-workroom-surface px-3 py-1 hover:bg-white" href={card.link_url} rel="noreferrer" target="_blank">
              링크
            </a>
          ) : null}
          {card.contact ? (
            <span className="rounded-pill border border-workroom-ink bg-workroom-surface px-3 py-1">{card.contact}</span>
          ) : null}
        </div>
      )}
    </article>
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
        .eq("is_published", true)
        .order("updated_at", { ascending: false });
      if (loadError) {
        setError("명함을 불러오지 못했어요.");
        setIsLoading(false);
        return;
      }
      const list = (data ?? []) as MemberCard[];
      setCards(list);
      if (uid) setHasCard(list.some((c) => c.profile_id === uid));
      setIsLoading(false);
    }
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (category !== "전체" && c.category !== category) return false;
      if (!q) return true;
      return [c.display_name, c.occupation, c.category, c.headline, c.bio]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(q));
    });
  }, [cards, query, category]);

  return (
    <main className="pb-16">
      <Section eyebrow="Directory" title="멤버 명함첩" accent="mint">
        <p className="mb-5 max-w-2xl text-sm font-medium leading-6 text-workroom-muted">
          워크룸을 함께 쓰는 사람들. 이름·업종·카테고리로 찾아보고, 내 명함도 올려보세요.
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
        <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
          {["전체", ...CARD_CATEGORIES].map((c) => {
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
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
        ) : filtered.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        <p className="mt-6 text-xs font-medium leading-6 text-workroom-muted">
          명함은 본인이 직접 등록·수정·삭제할 수 있어요. 공개로 설정한 명함만 이 목록에 표시됩니다.
        </p>
      </Section>
    </main>
  );
}
