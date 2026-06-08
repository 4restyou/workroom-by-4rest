import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Section from "../components/Section";
import StatusBadge from "../components/StatusBadge";
import { formatDate, formatPhone, formatPrice, formatTimeRange, statusLabel, todayValue } from "../lib/format";
import { ensureCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import { badge, buttonClass, card, cardFlat, tintCard } from "../lib/ui";
import type { Profile, Reservation, ReservationInquiry } from "../lib/types";

type AccountTab = "reservations" | "profile";

const tabLabels: Record<AccountTab, string> = {
  reservations: "예약현황",
  profile: "회원정보",
};

// Cancellation (and refund) is only allowed before the reservation start time.
function canCancel(reservation: Reservation): boolean {
  const start = new Date(`${reservation.date}T${(reservation.start_time ?? "00:00").slice(0, 5)}:00+09:00`);
  if (Number.isNaN(start.getTime())) return true;
  return Date.now() < start.getTime();
}

export default function Account() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [inquiries, setInquiries] = useState<ReservationInquiry[]>([]);
  const [inquiryDrafts, setInquiryDrafts] = useState<Record<string, string>>({});
  const [inquiryBusy, setInquiryBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ date: "", start_time: "", end_time: "" });
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [editingInquiryId, setEditingInquiryId] = useState<string | null>(null);
  const [inquiryEditDraft, setInquiryEditDraft] = useState("");
  const [activeTab, setActiveTab] = useState<AccountTab>(tabParam === "profile" ? "profile" : "reservations");
  const [form, setForm] = useState({ full_name: "", phone: "", address: "" });
  const [consent, setConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    async function loadAccount() {
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

      try {
        const loadedProfile = await ensureCurrentProfile();
        setProfile(loadedProfile);
        setForm({
          full_name: loadedProfile?.full_name ?? user.user_metadata?.full_name ?? user.user_metadata?.name ?? "",
          phone: loadedProfile?.phone ?? "",
          address: loadedProfile?.address ?? "",
        });
        setConsent(Boolean(loadedProfile?.consented_at));

        const { data, error: reservationsError } = await supabase
          .from("reservations")
          .select("*")
          .eq("profile_id", user.id)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false });

        if (reservationsError) throw reservationsError;
        setReservations((data ?? []) as Reservation[]);

        const { data: inquiryData } = await supabase
          .from("reservation_inquiries")
          .select("*")
          .eq("profile_id", user.id)
          .order("created_at", { ascending: true });
        setInquiries((inquiryData ?? []) as ReservationInquiry[]);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "내정보를 불러오지 못했습니다.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadAccount();
  }, [navigate]);

  useEffect(() => {
    if (tabParam === "profile" || tabParam === "reservations") setActiveTab(tabParam);
  }, [tabParam]);

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function sendInquiry(reservationId: string) {
    if (!supabase || !profile) return;
    const body = (inquiryDrafts[reservationId] ?? "").trim();
    if (!body) return;

    setInquiryBusy(reservationId);
    const { data, error: inquiryError } = await supabase
      .from("reservation_inquiries")
      .insert({ reservation_id: reservationId, profile_id: profile.id, body })
      .select("*")
      .single();
    setInquiryBusy(null);

    if (inquiryError) {
      setError(inquiryError.message);
      return;
    }

    setInquiries((current) => [...current, data as ReservationInquiry]);
    setInquiryDrafts((current) => ({ ...current, [reservationId]: "" }));
  }

  function startEdit(reservation: Reservation) {
    setError("");
    setEditingId(reservation.id);
    setEditDraft({
      date: reservation.date,
      start_time: (reservation.start_time ?? "09:00").slice(0, 5),
      end_time: (reservation.end_time ?? "12:00").slice(0, 5),
    });
  }

  async function saveEdit(reservation: Reservation) {
    if (!supabase) return;
    setError("");
    setActionBusy(reservation.id);
    const patch = { date: editDraft.date, start_time: editDraft.start_time, end_time: editDraft.end_time, status: "pending" as const };
    const { error: editError } = await supabase.from("reservations").update(patch).eq("id", reservation.id);
    setActionBusy(null);
    if (editError) {
      setError(editError.message);
      return;
    }
    setReservations((current) => current.map((item) => (item.id === reservation.id ? { ...item, ...patch } : item)));
    setEditingId(null);
  }

  async function cancelReservation(reservation: Reservation) {
    if (!supabase) return;
    if (!canCancel(reservation)) {
      setError("예약 시간이 지나 취소·환불이 불가합니다.");
      return;
    }
    const wasPaid = reservation.payment_status === "paid";
    const prompt = wasPaid ? "예약을 취소할까요? 결제/환불은 운영자가 확인 후 안내드립니다." : "예약을 취소할까요?";
    if (!window.confirm(prompt)) return;
    setError("");
    setActionBusy(reservation.id);

    const { error: cancelError } = await supabase.from("reservations").update({ status: "canceled" }).eq("id", reservation.id);
    setActionBusy(null);
    if (cancelError) {
      setError(cancelError.message);
      return;
    }
    setReservations((current) => current.map((item) => (item.id === reservation.id ? { ...item, status: "canceled" } : item)));
  }

  async function withdraw() {
    if (!supabase) return;
    if (!window.confirm("정말 탈퇴하시겠어요?\n계정과 개인정보가 삭제되며 되돌릴 수 없습니다.")) return;
    setError("");
    setActionBusy("withdraw");
    const { data, error: deleteError } = await supabase.functions.invoke("delete-account", { body: {} });
    const result = data as { ok?: boolean; message?: string } | null;
    if (deleteError || !result?.ok) {
      setActionBusy(null);
      setError(result?.message ?? "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }

  async function saveInquiryEdit(inquiry: ReservationInquiry) {
    if (!supabase) return;
    const body = inquiryEditDraft.trim();
    if (!body) return;
    setActionBusy(inquiry.id);
    const { error: editError } = await supabase.from("reservation_inquiries").update({ body }).eq("id", inquiry.id);
    setActionBusy(null);
    if (editError) {
      setError(editError.message);
      return;
    }
    setInquiries((current) =>
      current.map((item) => (item.id === inquiry.id ? { ...item, body, edited_at: new Date().toISOString() } : item)),
    );
    setEditingInquiryId(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!supabase || !profile) return;
    if (!form.full_name.trim() || !form.phone.trim()) {
      setError("이름과 연락처는 필수입니다.");
      return;
    }
    if (!consent) {
      setError("개인정보 수집·이용에 동의해 주세요.");
      return;
    }

    setIsSaving(true);
    const nextProfile = {
      ...profile,
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim() || null,
    };

    const { data: savedProfile, error: updateError } = await supabase.rpc("update_my_profile", {
      p_full_name: nextProfile.full_name,
      p_phone: nextProfile.phone,
      p_address: nextProfile.address ?? "",
      p_consent: consent,
    });
    setIsSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    if (!savedProfile) {
      setError("내정보가 저장되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setProfile(savedProfile as Profile);
    setSuccess("내정보를 저장했습니다.");
  }

  return (
    <main className="pb-16">
      <Section eyebrow="My Page" title="내정보" accent="mint">
        {isLoading ? <p className={`${tintCard("yellow")} p-4 font-bold`}>내정보를 불러오는 중입니다.</p> : null}
        {error ? <p className={`mb-4 ${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}

        {!isLoading && profile ? (
          <div>
            <div className={`mb-5 flex flex-wrap gap-2 ${cardFlat} p-2`}>
              {(Object.keys(tabLabels) as AccountTab[]).map((tab) => (
                <button
                  className={`rounded-pill border px-5 py-2.5 text-sm font-bold transition-colors ${
                    activeTab === tab
                      ? "border-workroom-ink bg-workroom-ink text-white"
                      : "border-transparent text-workroom-muted hover:text-workroom-ink"
                  }`}
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  type="button"
                >
                  {tabLabels[tab]}
                </button>
              ))}
            </div>

            {activeTab === "profile" ? (
              <form className={`mx-auto grid max-w-2xl gap-4 ${card} p-5`} onSubmit={handleSubmit}>
                {(!profile.full_name || !profile.phone || !profile.consented_at) && profile.role !== "admin" ? (
                  <p className={`${tintCard("yellow")} p-4 text-sm font-bold leading-6`}>
                    가입을 완료하려면 이름·연락처를 입력하고 개인정보 수집·이용에 동의한 뒤 저장해 주세요.
                  </p>
                ) : null}
                <div>
                  <p className="text-sm font-bold text-workroom-muted">회원</p>
                  <p className="mt-1 text-2xl font-bold">{profile.full_name || "내 정보"}</p>
                </div>
                {profile.role === "admin" ? (
                  <Link className={buttonClass("accent", "md")} to="/admin/reservations">
                    관리자 페이지로 이동
                  </Link>
                ) : null}

                <label className="grid gap-2 text-sm font-bold">
                  <span>
                    이메일
                    <span className="ml-1 inline-block rounded-pill border-2 border-workroom-ink bg-workroom-coral px-2 py-0.5 align-middle text-[10px] font-bold">
                      필수
                    </span>
                  </span>
                  <input disabled value={profile.email} />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  <span>
                    이름
                    <span className="ml-1 inline-block rounded-pill border-2 border-workroom-ink bg-workroom-coral px-2 py-0.5 align-middle text-[10px] font-bold">
                      필수
                    </span>
                  </span>
                  <input required value={form.full_name} onChange={(event) => updateField("full_name", event.target.value)} />
                  <span className="text-xs font-medium text-workroom-muted">예약자 확인을 위해 알아볼 수 있는 본명으로 적어 주세요.</span>
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  <span>
                    연락처
                    <span className="ml-1 inline-block rounded-pill border-2 border-workroom-ink bg-workroom-coral px-2 py-0.5 align-middle text-[10px] font-bold">
                      필수
                    </span>
                  </span>
                  <input
                    required
                    inputMode="numeric"
                    placeholder="010-0000-0000"
                    value={form.phone}
                    onChange={(event) => updateField("phone", formatPhone(event.target.value))}
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  주소
                  <input placeholder="선택 입력" value={form.address} onChange={(event) => updateField("address", event.target.value)} />
                </label>
                <label className={`${tintCard("yellow")} flex items-start gap-3 p-4 text-sm font-bold`}>
                  <input
                    className="mt-0.5 h-5 w-5 shrink-0"
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span className="font-medium leading-6">
                    <span className="font-bold">[필수]</span> 개인정보 수집·이용에 동의합니다. 예약 운영을 위해 이름·연락처·이메일을 수집하며,{" "}
                    <Link className="font-bold underline underline-offset-2" to="/privacy" target="_blank">
                      개인정보처리방침
                    </Link>
                    을 따릅니다.
                  </span>
                </label>
                {success ? <p className={`${tintCard("mint")} p-3 text-sm font-bold`}>{success}</p> : null}
                <button className={buttonClass("primary", "lg")} disabled={isSaving} type="submit">
                  {isSaving ? "저장 중…" : "내정보 저장"}
                </button>

                <div className="mt-2 border-t-2 border-workroom-line pt-4">
                  <p className="text-sm font-bold">회원 탈퇴</p>
                  <p className="mt-1 text-xs font-medium leading-6 text-workroom-muted">
                    탈퇴하면 계정과 개인정보(이름·연락처·이메일)가 삭제되며 되돌릴 수 없습니다. 과거 예약 내역은 익명 처리되어 운영 기록으로만 남습니다.
                  </p>
                  <button
                    className={buttonClass("secondary", "sm", "mt-3")}
                    disabled={actionBusy === "withdraw"}
                    onClick={() => void withdraw()}
                    type="button"
                  >
                    {actionBusy === "withdraw" ? "처리 중…" : "회원 탈퇴"}
                  </button>
                </div>
              </form>
            ) : null}

            {activeTab === "reservations" ? (
              <section className={`${card} p-5`}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">내 예약</h2>
                  <Link className={buttonClass("accent", "sm")} to="/reserve">
                    예약하기
                  </Link>
                </div>
                <div className="mt-4 grid gap-3">
                  {reservations.length ? (
                    reservations.map((reservation) => {
                      const active = reservation.status === "pending" || reservation.status === "confirmed";
                      return (
                        <article className={`${cardFlat} p-4`} key={reservation.id}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold">{reservation.pass_name_snapshot || reservation.pass_type}</p>
                              <p className="mt-1 text-sm font-medium text-workroom-muted">
                                {formatDate(reservation.date)} · {formatTimeRange(reservation.start_time, reservation.end_time)}
                              </p>
                            </div>
                            <StatusBadge status={reservation.status} />
                          </div>
                          <p className="mt-3 text-sm font-medium text-workroom-muted">{statusLabel[reservation.status]}</p>

                          {reservation.payment_status === "refunded" ? (
                            <div className="mt-3">
                              <span className={badge("lilac")}>환불완료</span>
                            </div>
                          ) : null}

                          {reservation.status === "confirmed" && (reservation.price_at_booking ?? 0) > 0 ? (
                            <div className="mt-3">
                              {reservation.payment_status === "paid" ? (
                                <span className={badge("mint")}>결제완료 · {formatPrice(reservation.price_at_booking ?? 0)}</span>
                              ) : (
                                <p className="text-xs font-medium text-workroom-muted">
                                  결제 안내는 확정 후 문자로 보내드립니다.
                                </p>
                              )}
                            </div>
                          ) : null}

                          {active ? (
                            editingId === reservation.id ? (
                              <div className="mt-4 grid gap-3 border-t-2 border-workroom-line pt-4">
                                <p className="text-sm font-bold">시간 수정 (저장하면 다시 확인 대기로 바뀝니다)</p>
                                <div className="grid gap-3 sm:grid-cols-3">
                                  <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                                    날짜
                                    <input
                                      type="date"
                                      min={todayValue()}
                                      value={editDraft.date}
                                      onChange={(event) => setEditDraft((draft) => ({ ...draft, date: event.target.value }))}
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                                    시작
                                    <input
                                      type="time"
                                      value={editDraft.start_time}
                                      onChange={(event) => setEditDraft((draft) => ({ ...draft, start_time: event.target.value }))}
                                    />
                                  </label>
                                  <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                                    종료
                                    <input
                                      type="time"
                                      value={editDraft.end_time}
                                      onChange={(event) => setEditDraft((draft) => ({ ...draft, end_time: event.target.value }))}
                                    />
                                  </label>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    className={buttonClass("primary", "sm")}
                                    disabled={actionBusy === reservation.id}
                                    onClick={() => void saveEdit(reservation)}
                                    type="button"
                                  >
                                    {actionBusy === reservation.id ? "저장 중…" : "변경 신청"}
                                  </button>
                                  <button className={buttonClass("secondary", "sm")} onClick={() => setEditingId(null)} type="button">
                                    닫기
                                  </button>
                                </div>
                              </div>
                            ) : canCancel(reservation) ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button className={buttonClass("secondary", "sm")} onClick={() => startEdit(reservation)} type="button">
                                  시간 수정
                                </button>
                                <button
                                  className={buttonClass("secondary", "sm")}
                                  disabled={actionBusy === reservation.id}
                                  onClick={() => void cancelReservation(reservation)}
                                  type="button"
                                >
                                  {actionBusy === reservation.id
                                    ? "처리 중…"
                                    : reservation.payment_status === "paid"
                                      ? "예약 취소·환불"
                                      : "예약 취소"}
                                </button>
                              </div>
                            ) : (
                              <p className="mt-3 text-xs font-medium text-workroom-muted">
                                예약 시간이 지나 취소·환불이 불가합니다.
                              </p>
                            )
                          ) : null}

                          {reservation.status === "confirmed" ? (
                            <div className="mt-4 border-t-2 border-workroom-line pt-4">
                              <p className="text-sm font-bold">관리자에게 문의</p>
                              {inquiries
                                .filter((inquiry) => inquiry.reservation_id === reservation.id)
                                .map((inquiry) => (
                                  <div className={`${tintCard("mint")} mt-2 p-3`} key={inquiry.id}>
                                    {editingInquiryId === inquiry.id ? (
                                      <div className="grid gap-2">
                                        <textarea rows={2} value={inquiryEditDraft} onChange={(event) => setInquiryEditDraft(event.target.value)} />
                                        <div className="flex flex-wrap gap-2">
                                          <button
                                            className={buttonClass("primary", "sm")}
                                            disabled={actionBusy === inquiry.id || !inquiryEditDraft.trim()}
                                            onClick={() => void saveInquiryEdit(inquiry)}
                                            type="button"
                                          >
                                            저장
                                          </button>
                                          <button className={buttonClass("secondary", "sm")} onClick={() => setEditingInquiryId(null)} type="button">
                                            닫기
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <p className="whitespace-pre-wrap text-sm font-medium leading-6">{inquiry.body}</p>
                                        <p className="mt-1 text-xs font-medium text-workroom-muted">
                                          {formatDate(inquiry.created_at.slice(0, 10))} · 전달됨{inquiry.edited_at ? " · 수정됨" : ""}
                                        </p>
                                        {!inquiry.admin_reply ? (
                                          <button
                                            className="mt-1 text-xs font-bold underline underline-offset-2"
                                            onClick={() => {
                                              setEditingInquiryId(inquiry.id);
                                              setInquiryEditDraft(inquiry.body);
                                            }}
                                            type="button"
                                          >
                                            수정
                                          </button>
                                        ) : null}
                                        {inquiry.admin_reply ? (
                                          <div className="mt-2 rounded-xl border border-workroom-line bg-white p-2.5">
                                            <p className="text-xs font-bold">운영자 답변</p>
                                            <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-6">{inquiry.admin_reply}</p>
                                          </div>
                                        ) : null}
                                      </>
                                    )}
                                  </div>
                                ))}
                              <textarea
                                className="mt-2"
                                rows={2}
                                placeholder="확정된 예약에 대해 궁금한 점을 남겨 주세요."
                                value={inquiryDrafts[reservation.id] ?? ""}
                                onChange={(event) => setInquiryDrafts((current) => ({ ...current, [reservation.id]: event.target.value }))}
                              />
                              <button
                                className={buttonClass("primary", "sm", "mt-2")}
                                disabled={inquiryBusy === reservation.id || !(inquiryDrafts[reservation.id] ?? "").trim()}
                                onClick={() => void sendInquiry(reservation.id)}
                                type="button"
                              >
                                {inquiryBusy === reservation.id ? "보내는 중…" : "문의 보내기"}
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })
                  ) : (
                    <p className={`${cardFlat} px-4 py-3 text-sm font-medium text-workroom-muted`}>아직 예약 내역이 없습니다.</p>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </Section>
    </main>
  );
}
