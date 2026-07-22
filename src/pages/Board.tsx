import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import Skeleton from "../components/Skeleton";
import { supabase } from "../lib/supabase";
import { ACCENT_BG, ACCENT_LABEL, ACCENTS } from "../lib/directory";
import { PinIcon } from "../components/icons";
import { buttonClass, tintCard } from "../lib/ui";
import type { BoardPost, CardAccent } from "../lib/types";

const DEMO_BOARD_POSTS: BoardPost[] = [
  {
    id: "demo-post-1",
    profile_id: null,
    author_name: "운영자",
    kind: "notice",
    body: "WORKROOM은 08:00–다음 날 01:00 예약제로 운영합니다. 서로의 집중을 위해 통화는 짧고 조용하게 부탁드려요.",
    color: "yellow",
    is_pinned: true,
    is_hidden: false,
    parent_id: null,
    created_at: "2026-06-18T10:00:00+09:00",
  },
  {
    id: "demo-post-2",
    profile_id: "demo-profile-1",
    author_name: "모아",
    kind: "message",
    body: "오전 햇빛이 좋아서 작업이 술술 됐어요. 다음에는 종일권으로 올게요!",
    color: "sky",
    is_pinned: false,
    is_hidden: false,
    parent_id: null,
    created_at: "2026-06-19T11:30:00+09:00",
  },
  {
    id: "demo-post-3",
    profile_id: "demo-profile-2",
    author_name: "재이",
    kind: "message",
    body: "혹시 금요일 오후에 프론트엔드 스터디 같이 하실 분 있나요?",
    color: "yellow",
    is_pinned: false,
    is_hidden: false,
    parent_id: null,
    created_at: "2026-06-19T15:10:00+09:00",
  },
  {
    id: "demo-post-4",
    profile_id: "demo-profile-3",
    author_name: "여름",
    kind: "message",
    body: "프린터 사용법 알려주셔서 감사합니다 :) 결과물 잘 챙겨갑니다.",
    color: "sky",
    is_pinned: false,
    is_hidden: false,
    parent_id: null,
    created_at: "2026-06-20T09:20:00+09:00",
  },
  {
    id: "demo-post-5",
    profile_id: "demo-profile-4",
    author_name: "해인",
    kind: "message",
    body: "오늘 읽은 책: 일의 감각. 창가 자리에서 세 챕터 읽었어요.",
    color: "yellow",
    is_pinned: false,
    is_hidden: false,
    parent_id: null,
    created_at: "2026-06-20T13:45:00+09:00",
  },
  {
    id: "demo-reply-1",
    profile_id: "demo-profile-4",
    author_name: "해인",
    kind: "message",
    body: "저도 금요일 좋아요! 몇 시쯤 생각하세요?",
    color: "sky",
    is_pinned: false,
    is_hidden: false,
    parent_id: "demo-post-3",
    created_at: "2026-06-19T18:00:00+09:00",
  },
  {
    id: "demo-post-6",
    profile_id: "demo-profile-5",
    author_name: "윤",
    kind: "message",
    body: "충장로에서 조용히 노트북 할 곳을 찾았는데 딱 좋네요.",
    color: "sky",
    is_pinned: false,
    is_hidden: false,
    parent_id: null,
    created_at: "2026-06-20T17:05:00+09:00",
  },
];

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
  replies,
  uid,
  canManage,
  canEdit,
  canReply,
  isAdmin,
  onDelete,
  onTogglePin,
  onToggleHide,
  onSave,
  onReply,
}: {
  post: BoardPost;
  replies: BoardPost[];
  uid: string | null;
  canManage: boolean;
  canEdit: boolean;
  canReply: boolean;
  isAdmin: boolean;
  onDelete: (p: BoardPost) => void;
  onTogglePin: (p: BoardPost) => void;
  onToggleHide: (p: BoardPost) => void;
  onSave: (p: BoardPost, body: string, color: CardAccent) => void | Promise<void>;
  onReply: (parent: BoardPost, body: string) => void | Promise<void>;
}) {
  const isNotice = post.kind === "notice";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [draftColor, setDraftColor] = useState<CardAccent>(post.color);
  const [saving, setSaving] = useState(false);
  // 긴 메모는 열 흐름을 끊고 전체 폭(1단)으로 넓게 붙인다 — 세로로 길어지는 대신
  // 가로로 풀어써서 읽기 편하게. (모바일 2단 → 긴 글은 1단)
  const isLong = post.body.length > 140 || post.body.split("\n").length > 5;
  // 답글(이어붙이는 메모)
  const [replying, setReplying] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);

  async function sendReply() {
    if (!replyDraft.trim()) return;
    setReplyBusy(true);
    await onReply(post, replyDraft.trim());
    setReplyBusy(false);
    setReplyDraft("");
    setReplying(false);
  }

  async function save() {
    if (!draft.trim()) return;
    setSaving(true);
    await onSave(post, draft.trim(), draftColor);
    setSaving(false);
    setEditing(false);
  }
  function cancel() {
    setDraft(post.body);
    setDraftColor(post.color);
    setEditing(false);
  }

  const actionBtn =
    "rounded px-2 py-1 underline underline-offset-2 hover:bg-workroom-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workroom-ink";

  return (
    <li
      className={`relative mb-5 mt-2 flex break-inside-avoid flex-col gap-2 rounded-[4px] border border-workroom-ink p-4 transition-transform hover:rotate-0 ${ACCENT_BG[editing ? draftColor : post.color]} ${isLong ? "[column-span:all] rotate-0" : tilt(post.id)}`}
    >
      {/* 압정 */}
      <span aria-hidden className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border border-workroom-ink bg-workroom-surface" />
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-[4px] border border-workroom-ink px-2 py-0.5 text-[10px] font-black ${isNotice ? "bg-workroom-ink text-white" : "bg-workroom-surface"}`}>
          {isNotice ? "공지" : "한마디"}
        </span>
        {post.is_pinned ? <PinIcon className="h-3.5 w-3.5" aria-label="고정됨" /> : null}
      </div>

      {editing ? (
        <div className="grid gap-2">
          <textarea
            className="min-h-[84px] w-full resize-y rounded-[6px] border border-workroom-ink bg-workroom-surface px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-workroom-ink"
            aria-label="메모 수정"
            value={draft}
            maxLength={300}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex items-center gap-1.5">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                aria-label={ACCENT_LABEL[a]}
                aria-pressed={draftColor === a}
                onClick={() => setDraftColor(a)}
                className={`h-6 w-6 rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workroom-ink focus-visible:ring-offset-2 ${ACCENT_BG[a]} ${draftColor === a ? "border-workroom-ink ring-2 ring-workroom-ink ring-offset-2" : "border-workroom-ink/30"}`}
              />
            ))}
            <span className="ml-auto text-[10px] font-bold text-workroom-ink/60">{draft.length}/300</span>
          </div>
          <div className="flex items-center gap-1 pt-0.5 text-[11px] font-black">
            <button type="button" className={actionBtn} disabled={saving || !draft.trim()} onClick={() => void save()}>
              {saving ? "저장 중…" : "저장"}
            </button>
            <button type="button" className={actionBtn} onClick={cancel}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="whitespace-pre-line break-words text-sm font-bold leading-6">{post.body}</p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-[11px] font-bold text-workroom-ink/60">
            <span className="truncate">{post.author_name}</span>
            <span className="shrink-0">{formatDate(post.created_at)}</span>
          </div>

          {/* 이어붙인 답글: 본 메모 아래 살짝 겹쳐 붙은 작은 쪽지들 */}
          {replies.length ? (
            <ul className="grid gap-1.5 border-t border-dashed border-workroom-ink/30 pt-2">
              {replies.map((reply) => (
                <li className="rounded-[4px] border border-workroom-ink/40 bg-workroom-surface/90 px-2.5 py-2" key={reply.id}>
                  <p className="whitespace-pre-line break-words text-[13px] font-bold leading-5">{reply.body}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-bold text-workroom-ink/55">
                    <span className="truncate">↳ {reply.author_name} · {formatDate(reply.created_at)}</span>
                    {isAdmin || (!!uid && reply.profile_id === uid) ? (
                      <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => onDelete(reply)}>
                        삭제
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {replying ? (
            <div className="grid gap-1.5 border-t border-dashed border-workroom-ink/30 pt-2">
              <textarea
                className="min-h-[56px] w-full resize-y rounded-[4px] border border-workroom-ink bg-workroom-surface px-2.5 py-2 text-[13px] font-bold focus:outline-none focus:ring-2 focus:ring-workroom-ink"
                aria-label="답글 내용"
                placeholder="이어서 한마디 붙이기"
                value={replyDraft}
                maxLength={200}
                onChange={(e) => setReplyDraft(e.target.value)}
              />
              <div className="flex items-center gap-1 text-[11px] font-black">
                <button type="button" className={actionBtn} disabled={replyBusy || !replyDraft.trim()} onClick={() => void sendReply()}>
                  {replyBusy ? "붙이는 중…" : "붙이기"}
                </button>
                <button type="button" className={actionBtn} onClick={() => { setReplying(false); setReplyDraft(""); }}>
                  취소
                </button>
                <span className="ml-auto text-[10px] font-bold text-workroom-ink/60">{replyDraft.length}/200</span>
              </div>
            </div>
          ) : null}

          {(canManage || canReply) && (
            <div className="-mb-1 flex flex-wrap items-center gap-1 border-t border-workroom-ink/15 pt-1.5 text-[11px] font-black">
              {canReply && !replying ? (
                <button type="button" className={actionBtn} onClick={() => setReplying(true)}>
                  답글
                </button>
              ) : null}
              {isAdmin ? (
                <>
                  <button type="button" className={actionBtn} onClick={() => onTogglePin(post)}>
                    {post.is_pinned ? "고정해제" : "고정"}
                  </button>
                  <button type="button" className={actionBtn} onClick={() => onToggleHide(post)}>
                    {post.is_hidden ? "다시표시" : "숨기기"}
                  </button>
                </>
              ) : null}
              {canEdit ? (
                <button type="button" className={actionBtn} onClick={() => setEditing(true)}>
                  수정
                </button>
              ) : null}
              {canManage ? (
                <button type="button" className={`${actionBtn} ml-auto text-workroom-ink/70`} onClick={() => onDelete(post)}>
                  삭제
                </button>
              ) : null}
            </div>
          )}
        </>
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
      if (import.meta.env.DEV) {
        setPosts(DEMO_BOARD_POSTS);
        setIsLoading(false);
        return;
      }
      setError("서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요.");
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
    const loaded = (data ?? []) as BoardPost[];
    setPosts(import.meta.env.DEV && !loaded.length ? DEMO_BOARD_POSTS : loaded);
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

  async function replyTo(parent: BoardPost, replyBody: string) {
    if (!supabase || !uid) {
      navigate("/login");
      return;
    }
    const { error: insertError } = await supabase.from("board_posts").insert({
      profile_id: uid,
      author_name: authorName || "회원",
      kind: "message",
      body: replyBody,
      color: parent.color,
      parent_id: parent.id,
    });
    if (insertError) {
      setError("답글 등록에 실패했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    setError("");
    await load();
  }

  async function removePost(post: BoardPost) {
    if (!supabase) return;
    if (!window.confirm(post.parent_id ? "이 답글을 삭제할까요?" : "이 메모를 삭제할까요?")) return;
    await supabase.from("board_posts").delete().eq("id", post.id);
    await load();
  }

  async function savePost(post: BoardPost, nextBody: string, nextColor: CardAccent) {
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from("board_posts")
      .update({ body: nextBody, color: nextColor })
      .eq("id", post.id);
    if (updateError) {
      setError("수정에 실패했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
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
  // 본 메모와 답글 분리. 답글은 부모 카드 안에 이어붙여 보여준다.
  const topLevel = useMemo(() => visible.filter((p) => !p.parent_id), [visible]);
  const repliesByParent = useMemo(() => {
    const map = new Map<string, BoardPost[]>();
    visible
      .filter((p) => p.parent_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .forEach((p) => {
        const list = map.get(p.parent_id as string) ?? [];
        list.push(p);
        map.set(p.parent_id as string, list);
      });
    return map;
  }, [visible]);

  return (
    <main className="pb-16">
      <Section eyebrow="Board" title="메모판" accent="yellow">
        <p className="mb-5 max-w-2xl text-sm font-medium leading-6 text-workroom-muted">
          운영자 공지와 회원 메모를 확인하는 공간입니다. 로그인 후 메모를 남길 수 있습니다.
        </p>

        {error ? <p className={`mb-4 ${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}

        {/* 작성 */}
        <div className="mb-8 rounded-card border border-workroom-ink bg-workroom-surface p-4">
          {uid ? (
            <div className="grid gap-3">
              <textarea
                className="min-h-[80px] w-full resize-y rounded-[6px] border border-workroom-ink bg-workroom-background px-4 py-3 text-sm font-bold placeholder:font-medium placeholder:text-workroom-muted focus:outline-none focus:ring-2 focus:ring-workroom-yellow"
                placeholder="하고 싶은 말을 남겨보세요"
                aria-label="메모 내용"
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
                      className={`h-7 w-7 rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workroom-ink focus-visible:ring-offset-2 ${ACCENT_BG[a]} ${color === a ? "border-workroom-ink ring-2 ring-workroom-ink ring-offset-2" : "border-workroom-ink/30"}`}
                    />
                  ))}
                </div>
                {isAdmin ? (
                  <label className="flex items-center gap-2 text-sm font-black">
                    <input type="checkbox" className="h-4 w-4 accent-workroom-ink" checked={asNotice} onChange={(e) => setAsNotice(e.target.checked)} />
                    공지로 등록(상단 고정)
                  </label>
                ) : null}
                <span className="ml-auto text-xs font-bold text-workroom-muted">{body.length}/300</span>
                <button className={buttonClass("primary", "sm")} disabled={busy || !body.trim()} onClick={() => void submit()} type="button">
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
        ) : topLevel.length ? (
          <ul className="columns-2 gap-4 sm:columns-3 lg:columns-4">
            {topLevel.map((post) => (
              <Note
                key={post.id}
                post={post}
                replies={repliesByParent.get(post.id) ?? []}
                uid={uid}
                isAdmin={isAdmin}
                canManage={isAdmin || post.profile_id === uid}
                canEdit={!!uid && post.profile_id === uid}
                canReply={!!uid}
                onDelete={(p) => void removePost(p)}
                onTogglePin={(p) => void togglePin(p)}
                onToggleHide={(p) => void toggleHide(p)}
                onSave={(p, b, c) => void savePost(p, b, c)}
                onReply={(parent, b) => replyTo(parent, b)}
              />
            ))}
          </ul>
        ) : (
          <div className={`${tintCard("yellow")} p-8 text-center`}>
            <p className="font-black">아직 붙은 메모가 없어요.</p>
            <p className="mt-1 text-sm font-medium text-workroom-ink/70">첫 메모를 남겨보세요!</p>
          </div>
        )}
      </Section>
    </main>
  );
}
