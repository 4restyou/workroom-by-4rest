import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import Skeleton from "../components/Skeleton";
import { supabase } from "../lib/supabase";
import { ACCENT_BG, ACCENT_LABEL, ACCENTS, CARD_CATEGORIES } from "../lib/directory";
import { buttonClass, card, tintCard } from "../lib/ui";
import type { CardAccent, MemberCard } from "../lib/types";

type Form = {
  display_name: string;
  category: string;
  occupation: string;
  headline: string;
  bio: string;
  link_url: string;
  instagram: string;
  contact: string;
  accent: CardAccent;
  is_published: boolean;
};

const EMPTY: Form = {
  display_name: "",
  category: "기타",
  occupation: "",
  headline: "",
  bio: "",
  link_url: "",
  instagram: "",
  contact: "",
  accent: "yellow",
  is_published: true,
};

const fieldClass =
  "w-full rounded-card border-2 border-workroom-ink bg-workroom-surface px-4 py-3 text-sm font-bold placeholder:font-medium placeholder:text-workroom-muted focus:outline-none focus:ring-2 focus:ring-workroom-yellow";
const labelClass = "block text-sm font-black";

export default function DirectoryEdit() {
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(EMPTY);
  const [existing, setExisting] = useState<MemberCard | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setError("Supabase 환경 변수가 아직 연결되지 않았습니다.");
        setIsLoading(false);
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        navigate("/login", { replace: true });
        return;
      }
      setUid(user.id);

      const [{ data: cardRow }, { data: profile }] = await Promise.all([
        supabase.from("member_cards").select("*").eq("profile_id", user.id).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      ]);

      if (cardRow) {
        const c = cardRow as MemberCard;
        setExisting(c);
        setForm({
          display_name: c.display_name,
          category: c.category,
          occupation: c.occupation ?? "",
          headline: c.headline ?? "",
          bio: c.bio ?? "",
          link_url: c.link_url ?? "",
          instagram: c.instagram ?? "",
          contact: c.contact ?? "",
          accent: c.accent,
          is_published: c.is_published,
        });
      } else {
        setForm((f) => ({ ...f, display_name: (profile as { full_name: string | null } | null)?.full_name ?? "" }));
      }
      setIsLoading(false);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!supabase || !uid) return;
    if (!form.display_name.trim()) {
      setError("표시할 이름을 입력해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    const payload = {
      profile_id: uid,
      display_name: form.display_name.trim(),
      category: form.category.trim() || "기타",
      occupation: form.occupation.trim() || null,
      headline: form.headline.trim() || null,
      bio: form.bio.trim() || null,
      link_url: form.link_url.trim() || null,
      instagram: form.instagram.trim().replace(/^@/, "") || null,
      contact: form.contact.trim() || null,
      accent: form.accent,
      is_published: form.is_published,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await supabase
      .from("member_cards")
      .upsert(payload, { onConflict: "profile_id" });
    setBusy(false);
    if (saveError) {
      setError("저장에 실패했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    setDone(true);
    navigate("/directory");
  }

  async function remove() {
    if (!supabase || !existing) return;
    if (!window.confirm("내 명함을 삭제할까요? 되돌릴 수 없어요.")) return;
    setBusy(true);
    const { error: delError } = await supabase.from("member_cards").delete().eq("id", existing.id);
    setBusy(false);
    if (delError) {
      setError("삭제에 실패했어요.");
      return;
    }
    navigate("/directory");
  }

  return (
    <main className="pb-16">
      <Section eyebrow="My Card" title={existing ? "내 명함 수정" : "내 명함 등록"} accent="yellow">
        {isLoading ? (
          <div className="grid gap-4" aria-busy="true">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-28" />
          </div>
        ) : (
          <div className="grid gap-5">
            {error ? <p className={`${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}

            {/* 미리보기 */}
            <div className={`rounded-card border-2 border-workroom-ink p-5 shadow-hard ${ACCENT_BG[form.accent]}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black">{form.display_name || "이름"}</h3>
                  {form.occupation ? <p className="mt-0.5 truncate text-sm font-bold text-workroom-ink/70">{form.occupation}</p> : null}
                </div>
                <span className="shrink-0 rounded-pill border border-workroom-ink bg-workroom-surface px-2.5 py-1 text-[11px] font-black">
                  {form.category}
                </span>
              </div>
              {form.headline ? <p className="mt-2 text-sm font-bold">{form.headline}</p> : null}
              {form.bio ? <p className="mt-1 whitespace-pre-line text-sm font-medium text-workroom-ink/80">{form.bio}</p> : null}
            </div>

            <div className="grid gap-1.5">
              <label className={labelClass} htmlFor="display_name">이름 / 활동명 *</label>
              <input id="display_name" className={fieldClass} value={form.display_name} onChange={(e) => update("display_name", e.target.value)} placeholder="예: 김작가" />
            </div>

            <div className="grid gap-1.5">
              <label className={labelClass} htmlFor="category">카테고리</label>
              <input
                id="category"
                className={fieldClass}
                list="card-category-options"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                maxLength={20}
                placeholder="목록에서 고르거나 직접 입력하세요"
              />
              <datalist id="card-category-options">
                {CARD_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="text-xs font-medium text-workroom-muted">제시된 카테고리를 골라도 되고, 원하는 분류를 직접 입력해도 돼요.</p>
            </div>

            <div className="grid gap-1.5">
              <label className={labelClass} htmlFor="occupation">업종 / 직함</label>
              <input id="occupation" className={fieldClass} value={form.occupation} onChange={(e) => update("occupation", e.target.value)} placeholder="예: 브랜드 디자이너, 프리랜서 작가" />
            </div>

            <div className="grid gap-1.5">
              <label className={labelClass} htmlFor="headline">한 줄 소개</label>
              <input id="headline" className={fieldClass} value={form.headline} onChange={(e) => update("headline", e.target.value)} maxLength={60} placeholder="나를 한 줄로 표현한다면?" />
            </div>

            <div className="grid gap-1.5">
              <label className={labelClass} htmlFor="bio">소개</label>
              <textarea id="bio" className={`${fieldClass} min-h-[96px] resize-y`} value={form.bio} onChange={(e) => update("bio", e.target.value)} maxLength={400} placeholder="어떤 일을 하는지, 어떤 협업을 찾는지 자유롭게 적어주세요." />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="instagram">인스타그램</label>
                <input id="instagram" className={fieldClass} value={form.instagram} onChange={(e) => update("instagram", e.target.value)} placeholder="@handle" />
              </div>
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="link_url">링크</label>
                <input id="link_url" className={fieldClass} value={form.link_url} onChange={(e) => update("link_url", e.target.value)} placeholder="https://" />
              </div>
              <div className="grid gap-1.5">
                <label className={labelClass} htmlFor="contact">연락처 / 이메일</label>
                <input id="contact" className={fieldClass} value={form.contact} onChange={(e) => update("contact", e.target.value)} placeholder="공개해도 괜찮은 연락처" />
              </div>
            </div>

            <div className="grid gap-1.5">
              <span className={labelClass}>명함 색상</span>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => update("accent", a)}
                    aria-label={ACCENT_LABEL[a]}
                    aria-pressed={form.accent === a}
                    className={`h-10 w-10 rounded-full border-2 ${ACCENT_BG[a]} ${
                      form.accent === a ? "border-workroom-ink ring-2 ring-workroom-ink ring-offset-2" : "border-workroom-ink/30"
                    }`}
                  />
                ))}
              </div>
            </div>

            <label className={`${card} flex cursor-pointer items-center justify-between gap-3 p-4`}>
              <span>
                <span className="block text-sm font-black">명함첩에 공개</span>
                <span className="block text-xs font-medium text-workroom-muted">끄면 나만 볼 수 있어요.</span>
              </span>
              <input type="checkbox" className="h-5 w-5 accent-workroom-ink" checked={form.is_published} onChange={(e) => update("is_published", e.target.checked)} />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button className={buttonClass("primary", "md")} disabled={busy || done} onClick={() => void save()} type="button">
                {busy ? "저장 중…" : existing ? "수정 저장" : "명함 등록"}
              </button>
              <Link className="text-sm font-bold text-workroom-muted underline underline-offset-4 hover:text-workroom-ink" to="/directory">
                명함첩으로
              </Link>
              {existing ? (
                <button className="ml-auto text-sm font-bold text-workroom-muted underline underline-offset-4 hover:text-workroom-ink" disabled={busy} onClick={() => void remove()} type="button">
                  명함 삭제
                </button>
              ) : null}
            </div>
          </div>
        )}
      </Section>
    </main>
  );
}
