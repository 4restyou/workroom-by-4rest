import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { matchesQuery } from "../../lib/customer";
import { supabase } from "../../lib/supabase";

type Hit =
  | { kind: "member"; id: string; name: string; phone: string | null; detail: string }
  | { kind: "reservation"; id: string; name: string; phone: string | null; detail: string };

/**
 * 관리자 화면 어디서든 손님을 찾는 검색창.
 *
 * 예전에는 "회원 탭에서 찾을지 예약 탭에서 찾을지"를 먼저 정해야 했다. 전화가
 * 걸려왔을 때 그 판단을 하는 것 자체가 부담이라, 이름이든 번호 일부든 한 곳에
 * 넣으면 회원과 (회원 연결이 없는) 예약을 함께 찾아 준다.
 */
export default function AdminSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 바깥을 누르면 닫는다.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); return; }
    if (!supabase) return;

    let alive = true;
    setBusy(true);
    // 입력이 멈춘 뒤에 조회한다(글자마다 두 번씩 왕복하지 않도록).
    const timer = window.setTimeout(async () => {
      const client = supabase;
      if (!client) return;
      const digits = q.replace(/\D/g, "");
      const like = `%${q}%`;
      const phoneLike = digits ? `,phone.ilike.%${digits}%` : "";

      const [members, reservations] = await Promise.all([
        client.from("profiles").select("id,full_name,phone,email").eq("role", "user").or(`full_name.ilike.${like},email.ilike.${like}${phoneLike}`).limit(6),
        // 회원 연결이 없는 전화·워크인 예약은 프로필로 찾을 수 없다.
        client.from("reservations").select("id,name,phone,date,pass_type,pass_name_snapshot,profile_id").is("profile_id", null).is("deleted_at", null).or(`name.ilike.${like}${phoneLike}`).order("date", { ascending: false }).limit(4),
      ]);
      if (!alive) return;

      const memberHits: Hit[] = (members.data ?? [])
        .filter((row) => matchesQuery(q, { name: row.full_name, phone: row.phone, email: row.email }))
        .map((row) => ({ kind: "member", id: row.id, name: row.full_name || "이름 미입력", phone: row.phone, detail: row.email ?? "" }));

      const reservationHits: Hit[] = (reservations.data ?? [])
        .filter((row) => matchesQuery(q, { name: row.name, phone: row.phone }))
        .map((row) => ({ kind: "reservation", id: row.id, name: row.name, phone: row.phone, detail: `${row.date} · ${row.pass_name_snapshot || row.pass_type} (회원 연결 없음)` }));

      setHits([...memberHits, ...reservationHits]);
      setBusy(false);
      setOpen(true);
    }, 220);

    return () => { alive = false; window.clearTimeout(timer); };
  }, [query]);

  function go(hit: Hit) {
    setOpen(false);
    setQuery("");
    navigate(hit.kind === "member" ? `/admin/customer/${hit.id}` : `/admin/reservations?reservation=${hit.id}`);
  }

  return (
    <div className="relative w-full sm:w-72" ref={boxRef}>
      <input
        aria-label="손님 검색"
        className="!min-h-[42px]"
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => { if (hits.length) setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
          if (event.key === "Enter" && hits.length === 1) go(hits[0]);
        }}
        placeholder="이름 · 연락처로 손님 찾기"
        ref={inputRef}
        value={query}
      />

      {open && query.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-80 overflow-y-auto border border-workroom-ink bg-white shadow-hard-sm">
          {busy ? <p className="px-3 py-3 text-sm font-medium text-workroom-muted">찾는 중…</p> : null}
          {!busy && !hits.length ? <p className="px-3 py-3 text-sm font-medium text-workroom-muted">일치하는 손님이 없습니다.</p> : null}
          {hits.map((hit) => (
            <button
              className="flex w-full items-center justify-between gap-3 border-b border-workroom-line px-3 py-2.5 text-left last:border-b-0 hover:bg-workroom-background"
              key={`${hit.kind}-${hit.id}`}
              onClick={() => go(hit)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{hit.name}</span>
                <span className="block truncate text-xs font-medium text-workroom-muted">{hit.phone ?? ""}{hit.detail ? ` · ${hit.detail}` : ""}</span>
              </span>
              <span className="shrink-0 text-xs font-bold text-workroom-muted">{hit.kind === "member" ? "회원" : "예약"}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
