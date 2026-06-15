import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import Skeleton from "../components/Skeleton";
import { supabase } from "../lib/supabase";
import { ACCENT_BG, ACCENT_LABEL, ACCENTS } from "../lib/directory";
import { buttonClass, tintCard } from "../lib/ui";
import type { BoardPost, CardAccent } from "../lib/types";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

// Stable pseudo-random tilt per note so the corkboard feels hand-pinned but
// doesn't reshuffle on every render.
function tilt(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const angles = ["-rotate-2", "-rotate-1", "rotate-0", "rotate-1", "rotate-2"];
  return angles[Math.abs(h) % angles.length];
}

function Note({
  post,
  canManage,
  isAdmin,
  onDelete,
  onTogglePin,
  onToggleHide,
}: {
  post: BoardPost;
  canManage: boolean;
  isAdmin: boolean;
  onDelete: (p: BoardPost) => void;
  onTogglePin: (p: BoardPost) => void;
  onToggleHide: (p: BoardPost) => void;
}) {
  const isNotice = post.kind === "notice";
  return (
    <li
      className={`relative flex break-inside-avoid flex-col gap-2 rounded-[4px] border-2 border-workroom-ink p-4 shadow-hard transition-transform hover:rotate-0 ${ACCENT_BG[post.color]} ${tilt(post.id)}`}
    >
      {/* 압정 */}
      <span aria-hidden className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-workroom-ink bg-workroom-surface shadow-hard-sm" />
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-pill border border-workroom-ink px-2 py-0.5 text-[10px] font-black ${isNotice ? "bg-workroom-ink text-white" : "bg-workroom-surface"}`}>
          {isNotice ? "공지" : "한마디"}
        </span>
        {post.is_pinned ? <span aria-label="고정됨" className="text-xs">📌</span> : null}
      </div>
      <p className="whitespace-pre-line break-words text-sm font-bold leading-6">{post.body}</p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] font-bold text-workroom-ink/60">
        <span className="truncate">{post.author_name}</span>
        <span className="shrink-0">{formatDate(post.created_at)}</span>
      </div>
      {(canManage || isAdmin) && (
        <div className="flex flex-wrap gap-2 border-t border-workroom-ink/15 pt-2 text-[11px] font-black">
          {isAdmin ? (
            <>
              <button type="button" className="underline underline-offset-2" onClick={() => onTogglePin(post)}>
                {post.is_pinned ? "고정해제" : "고정"}
              </button>
              <button type="button" className="underline underline-offset-2" onClick={() => onToggleHide(post)}>
                {post.is_hidden ? "다시표시" : "숨기기"}
              </button>
            </>
          ) : null}
          {canManage ? (
            <button type="button" className="ml-auto text-workroom-ink/70 underline underline-offset-2" onClick={() => onDelete(post)}>
              삭제
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}

export default function Board() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authorName, setAuthorName] = useState("");

  // compose
  const [body, setBody] = useState("");
  const [color, setColor] = useState<CardAccent>("yellow");
  const [asNotice, setAsNotice] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!supabase) {
      setError("Supabase 환경 변수가 아직 연결되지 않았습니다.");
      setIsLoading(false);
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user ?? null;
    setUid(user?.id ?? null);
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
      const p = profile as { full_name: string | null; role: string } | null;
      setIsAdmin(p?.role === "admin");
      setAuthorName(p?.full_name ?? "회원");
    }
    const { data, error: loadError } = await supabase
      .from("board_posts")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (loadError) {
      setError("메모를 불러오지 못했어요.");
      setIsLoading(false);
      return;
    }
    setPosts((data ?? []) as BoardPost[]);
    setIsLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit() {
    if (!supabase || !uid) {
      navigate("/login");
      return;
    }
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    const kind = isAdmin && asNotice ? "notice" : "message";
    const { error: insertError } = await supabase.from("board_posts").insert({
      profile_id: uid,
      author_name: isAdmin && asNotice ? "운영자" : authorName || "회원",
      kind,
      body: body.trim(),
      color,
      is_pinned: isAdmin && asNotice,
    });
    setBusy(false);
    if (insertError) {
      setError("등록에 실패했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    setBody("");
    setAsNotice(false);
    await load();
  }

  async function removePost(post: BoardPost) {
    if (!supabase) return;
    if (!window.confirm("이 메모를 삭제할까요?")) return;
    await supabase.from("board_posts").delete().eq("id", post.id);
    await load();
  }

  async function togglePin(post: BoardPost) {
    if (!supabase) return;
    await supabase.from("board_posts").update({ is_pinned: !post.is_pinned }).eq("id", post.id);
    await load();
  }

  async function toggleHide(post: BoardPost) {
    if (!supabase) return;
    await supabase.from("board_posts").update({ is_hidden: !post.is_hidden }).eq("id", post.id);
    await load();
  }

  const visible = useMemo(() => posts.filter((p) => !p.is_hidden || isAdmin), [posts, isAdmin]);

  return (
    <main className="pb-16">
      <Section eyebrow="Board" title="메모판" accent="coral">
        <p className="mb-5 max-w-2xl text-sm font-medium leading-6 text-workroom-muted">
          운영자 공지와 회원들의 한마디가 붙는 공간이에요. 하고 싶은 말, 바라는 점을 포스트잇처럼 남겨주세요.
        </p>

        {error ? <p className={`mb-4 ${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}

        {/* 작성 */}
        <div className="mb-8 rounded-card border-2 border-workroom-ink bg-workroom-surface p-4 shadow-hard">
          {uid ? (
            <div className="grid gap-3">
              <textarea
                className="min-h-[80px] w-full resize-y rounded-card border-2 border-workroom-ink bg-workroom-background px-4 py-3 text-sm font-bold placeholder:font-medium placeholder:text-workroom-muted focus:outline-none focus:ring-2 focus:ring-workroom-yellow"
                placeholder="하고 싶은 말을 남겨보세요"
                value={body}
                maxLength={300}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  {ACCENTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      aria-label={ACCENT_LABEL[a]}
                      aria-pressed={color === a}
                      onClick={() => setColor(a)}
                      className={`h-7 w-7 rounded-full border-2 ${ACCENT_BG[a]} ${color === a ? "border-workroom-ink ring-2 ring-workroom-ink ring-offset-2" : "border-workroom-ink/30"}`}
                    />
                  ))}
                </div>
                {isAdmin ? (
                  <label className="flex items-center gap-2 text-sm font-black">
                    <input type="checkbox" className="h-4 w-4 accent-workroom-ink" checked={asNotice} onChange={(e) => setAsNotice(e.target.checked)} />
                    공지로 등록(상단 고정)
                  </label>
                ) : null}
                <button className={`${buttonClass("primary", "sm")} ml-auto`} disabled={busy || !body.trim()} onClick={() => void submit()} type="button">
                  {busy ? "등록 중…" : "붙이기"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-bold text-workroom-muted">로그인하면 메모를 남길 수 있어요.</p>
              <Link className={buttonClass("primary", "sm")} to="/login">로그인</Link>
            </div>
          )}
        </div>

        {/* 코르크보드 */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : visible.length ? (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((post) => (
              <Note
                key={post.id}
                post={post}
                isAdmin={isAdmin}
                canManage={isAdmin || post.profile_id === uid}
                onDelete={(p) => void removePost(p)}
                onTogglePin={(p) => void togglePin(p)}
                onToggleHide={(p) => void toggleHide(p)}
              />
            ))}
          </ul>
        ) : (
          <div className={`${tintCard("coral")} p-8 text-center`}>
            <p className="font-black">아직 붙은 메모가 없어요.</p>
            <p className="mt-1 text-sm font-medium text-workroom-ink/70">첫 메모를 남겨보세요!</p>
          </div>
        )}
      </Section>
    </main>
  );
}
