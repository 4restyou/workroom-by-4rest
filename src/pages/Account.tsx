import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import StatusBadge from "../components/StatusBadge";
import { formatDate, formatTimeRange, statusLabel } from "../lib/format";
import { ensureCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import type { Profile, Reservation, ReservationNotification } from "../lib/types";

type AccountTab = "profile" | "reservations" | "notifications";

const tabLabels: Record<AccountTab, string> = {
  profile: "회원정보",
  reservations: "예약현황",
  notifications: "알림",
};

export default function Account() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dbNotifications, setDbNotifications] = useState<ReservationNotification[]>([]);
  const [activeTab, setActiveTab] = useState<AccountTab>("profile");
  const [form, setForm] = useState({ full_name: "", phone: "", address: "" });
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

        const [{ data, error: reservationsError }, { data: notificationData, error: notificationError }] = await Promise.all([
          supabase
            .from("reservations")
            .select("*")
            .eq("profile_id", user.id)
            .order("date", { ascending: false })
            .order("created_at", { ascending: false }),
          supabase
            .from("reservation_notifications")
            .select("*")
            .eq("profile_id", user.id)
            .order("created_at", { ascending: false }),
        ]);

        if (reservationsError) throw reservationsError;
        if (notificationError) throw notificationError;
        setReservations((data ?? []) as Reservation[]);
        setDbNotifications((notificationData ?? []) as ReservationNotification[]);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "내정보를 불러오지 못했습니다.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadAccount();
  }, [navigate]);

  const notifications = useMemo(() => {
    const items: string[] = [];
    if (!profile?.phone) items.push("연락처를 입력하면 예약 신청 때 자동으로 채워집니다.");
    if (profile?.membership_status === "pending") items.push("회원 상태 확인이 필요합니다.");
    if (profile?.membership_status === "approved") items.push("회원 정보가 활성화되어 있습니다.");
    if (profile?.membership_status === "rejected") items.push("회원 상태가 보류되었습니다. 공간 운영자에게 문의해 주세요.");

    reservations.slice(0, 5).forEach((reservation) => {
      if (reservation.status === "confirmed") {
        items.push(`${formatDate(reservation.date)} ${formatTimeRange(reservation.start_time, reservation.end_time)} 예약이 확정되었습니다.`);
      }
      if (reservation.status === "canceled") {
        items.push(`${formatDate(reservation.date)} 예약이 취소 처리되었습니다.`);
      }
      if (reservation.status === "no_show") {
        items.push(`${formatDate(reservation.date)} 예약이 노쇼 처리되었습니다.`);
      }
    });

    dbNotifications.forEach((notification) => {
      items.push(`${notification.title} ${notification.body}`);
    });

    return items;
  }, [dbNotifications, profile, reservations]);

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
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

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }

  return (
    <main className="pb-12">
      <Section eyebrow="My Page" title="내정보">
        {isLoading ? <p className="rounded-card border border-workroom-line bg-workroom-yellow p-4 font-black">내정보를 불러오는 중입니다.</p> : null}
        {error ? <p className="mb-4 rounded-card border border-workroom-line bg-red-100 p-4 text-sm font-black">{error}</p> : null}

        {!isLoading && profile ? (
          <div>
            <div className="mb-5 flex flex-wrap gap-2 rounded-card bg-white/70 p-2 shadow-soft">
              {(Object.keys(tabLabels) as AccountTab[]).map((tab) => (
                <button
                  className={`rounded-full px-5 py-3 text-sm font-black ${activeTab === tab ? "bg-workroom-yellow text-workroom-text" : "text-workroom-muted"}`}
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  type="button"
                >
                  {tabLabels[tab]}
                  {tab === "notifications" && notifications.length ? ` ${notifications.length}` : ""}
                </button>
              ))}
            </div>

            {activeTab === "profile" ? (
              <form className="mx-auto grid max-w-2xl gap-4 rounded-card border border-workroom-line bg-workroom-surface p-5 shadow-sketch" onSubmit={handleSubmit}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-workroom-muted">회원 상태</p>
                    <p className="mt-1 text-2xl font-black">
                      {profile.membership_status === "approved" ? "이용 가능" : profile.membership_status === "rejected" ? "보류" : "확인 필요"}
                    </p>
                  </div>
                  <button className="rounded-full border border-workroom-line bg-white px-4 py-2 text-sm font-black" onClick={signOut} type="button">
                    로그아웃
                  </button>
                </div>
                {profile.role === "admin" ? (
                  <Link className="rounded-full border border-workroom-line bg-workroom-yellow px-5 py-3 text-center font-black" to="/admin/reservations">
                    관리자 페이지로 이동
                  </Link>
                ) : null}

                <label className="grid gap-2 text-sm font-black">
                  이메일
                  <input disabled value={profile.email} />
                </label>
                <label className="grid gap-2 text-sm font-black">
                  이름
                  <input required value={form.full_name} onChange={(event) => updateField("full_name", event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-black">
                  연락처
                  <input required placeholder="010-0000-0000" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-black">
                  주소
                  <input placeholder="선택 입력" value={form.address} onChange={(event) => updateField("address", event.target.value)} />
                </label>
                {success ? <p className="rounded-card border border-workroom-line bg-workroom-yellow p-3 text-sm font-black">{success}</p> : null}
                <button className="rounded-full border border-workroom-line bg-workroom-text px-5 py-4 font-black text-white" disabled={isSaving} type="submit">
                  {isSaving ? "저장 중" : "내정보 저장"}
                </button>
              </form>
            ) : null}

            {activeTab === "notifications" ? (
              <section className="rounded-card border border-workroom-line bg-workroom-surface p-5 shadow-soft">
                <h2 className="text-xl font-black">알림</h2>
                <div className="mt-4 grid gap-2">
                  {notifications.length ? (
                    notifications.map((notification, index) => (
                      <p className="rounded-card border border-workroom-line bg-workroom-yellow px-4 py-3 text-sm font-black" key={`${notification}-${index}`}>
                        {notification}
                      </p>
                    ))
                  ) : (
                    <p className="rounded-card border border-workroom-line bg-white px-4 py-3 text-sm font-black">새 알림이 없습니다.</p>
                  )}
                </div>
              </section>
            ) : null}

            {activeTab === "reservations" ? (
              <section className="rounded-card border border-workroom-line bg-workroom-surface p-5 shadow-soft">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black">내 예약</h2>
                  <Link className="rounded-full border border-workroom-line bg-workroom-yellow px-4 py-2 text-sm font-black" to="/reserve">
                    예약하기
                  </Link>
                </div>
                <div className="mt-4 grid gap-3">
                  {reservations.length ? (
                    reservations.map((reservation) => (
                      <article className="rounded-card border border-workroom-line bg-white p-4" key={reservation.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black">{reservation.pass_name_snapshot || reservation.pass_type}</p>
                            <p className="mt-1 text-sm font-bold text-workroom-muted">
                              {formatDate(reservation.date)} · {formatTimeRange(reservation.start_time, reservation.end_time)}
                            </p>
                          </div>
                          <StatusBadge status={reservation.status} />
                        </div>
                        <p className="mt-3 text-sm font-bold text-workroom-muted">{statusLabel[reservation.status]}</p>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-card border border-workroom-line bg-white px-4 py-3 text-sm font-black">아직 예약 내역이 없습니다.</p>
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
