import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Section from "../components/Section";
import { defaultPasses } from "../lib/defaultPasses";
import { formatPrice, reservationWindowForPass, todayValue } from "../lib/format";
import { getCurrentProfile } from "../lib/profiles";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { buttonClass, card, tintCard } from "../lib/ui";
import type { Pass, Profile, ReservationInsert } from "../lib/types";

const emptyForm = {
  pass_type: "",
  date: todayValue(),
  start_time: "09:00",
  end_time: "12:00",
  people: "1",
  name: "",
  phone: "",
  email: "",
  message: "",
};

export default function Reserve() {
  const location = useLocation();
  const [passes, setPasses] = useState<Pass[]>(defaultPasses);
  const [form, setForm] = useState(emptyForm);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const selectedPass = new URLSearchParams(location.search).get("pass");
    if (!selectedPass) return;
    setForm((current) => ({ ...current, ...reservationWindowForPass(selectedPass), pass_type: selectedPass }));
  }, [location.search]);

  useEffect(() => {
    async function loadPasses() {
      if (!hasSupabaseConfig || !supabase) return;
      const { data, error: passError } = await supabase
        .from("passes")
        .select("id,name,description,price,seat_type_id,is_active,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!passError && data?.length) {
        setPasses(data);
      }
    }

    void loadPasses();
  }, []);

  useEffect(() => {
    async function loadProfile() {
      if (!hasSupabaseConfig || !supabase) return;
      const loadedProfile = await getCurrentProfile();
      if (!loadedProfile) return;
      setProfile(loadedProfile);
      setForm((current) => ({
        ...current,
        name: current.name || loadedProfile.full_name || "",
        phone: current.phone || loadedProfile.phone || "",
        email: current.email || loadedProfile.email || "",
      }));
    }

    void loadProfile();
  }, []);

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function selectPass(passName: string) {
    setForm((current) => ({ ...current, ...reservationWindowForPass(passName), pass_type: passName }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess(false);

    if (!supabase) {
      setError("Supabase 환경 변수가 아직 연결되지 않았습니다.");
      return;
    }

    if (!form.pass_type || !form.name.trim() || !form.phone.trim() || !form.message.trim()) {
      setError("이용권, 이름, 연락처, 요청사항을 입력해 주세요.");
      return;
    }

    if (form.start_time >= form.end_time) {
      setError("종료 시간은 시작 시간보다 늦어야 합니다.");
      return;
    }

    const selectedPass = passes.find((pass) => pass.name === form.pass_type);
    if (selectedPass?.seat_type_id) {
      const { data: capacityRows, error: capacityError } = await supabase.rpc("check_reservation_capacity", {
        p_date: form.date,
        p_start_time: form.start_time,
        p_end_time: form.end_time,
        p_seat_type_id: selectedPass.seat_type_id,
        p_people: Number(form.people),
      });

      if (capacityError) {
        setError(capacityError.message);
        return;
      }

      const capacity = capacityRows?.[0];
      if (capacity && !capacity.available) {
        setError(`선택한 시간대의 잔여 좌석이 부족합니다. 현재 잔여 ${capacity.remaining}석입니다.`);
        return;
      }
    }

    const payload: ReservationInsert = {
      profile_id: profile?.id ?? null,
      pass_id: selectedPass?.id ?? null,
      pass_name_snapshot: selectedPass?.name ?? form.pass_type,
      price_at_booking: selectedPass?.price ?? null,
      seat_type_id: selectedPass?.seat_type_id ?? null,
      payment_method: null,
      payment_status: "unpaid",
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      pass_type: form.pass_type,
      date: form.date,
      start_time: form.start_time,
      end_time: form.end_time,
      people: Number(form.people),
      message: form.message.trim(),
      status: "pending",
    };

    setIsSubmitting(true);
    const { error: submitError } = await supabase.from("reservations").insert(payload);
    setIsSubmitting(false);

    if (submitError) {
      setError(submitError.message);
      return;
    }

    setSuccess(true);
    setForm({ ...emptyForm, date: todayValue() });
  }

  const passOptions = [
    ...passes,
    { id: "custom-inquiry", name: "기타 문의", description: "촬영, 모임, 장기 이용 상담", price: 0 },
  ];

  return (
    <main className="pb-28 sm:pb-12">
      <Section eyebrow="Reserve" title="예약" accent="yellow">
        <div className={`mb-6 ${tintCard("yellow")} p-4 text-sm font-bold leading-6`}>
          홈페이지 예약을 기준으로 운영합니다. 예약 신청 후 전화 또는 문자로 확인 안내를 드립니다.
          {profile ? <span className="mt-2 block font-medium">로그인된 회원 정보로 예약자 정보를 미리 채웠습니다.</span> : null}
        </div>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <fieldset className={`${card} p-5`}>
            <StepHeading step="1" title="이용권" />
            <div className="grid gap-3">
              {passOptions.map((pass) => {
                const isSelected = form.pass_type === pass.name;
                return (
                  <label
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-card border-2 px-4 py-3 transition-transform duration-100 active:translate-x-[2px] active:translate-y-[2px] ${
                      isSelected
                        ? "border-workroom-ink bg-workroom-yellow shadow-hard"
                        : "border-workroom-ink bg-white hover:-translate-y-0.5 hover:shadow-hard"
                    }`}
                    key={pass.id}
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-bold">{pass.name}</span>
                      <span className="mt-1 block text-xs font-normal text-workroom-muted">
                        {pass.description}
                        {pass.price ? ` · ${formatPrice(pass.price)}` : ""}
                      </span>
                    </span>
                    <input
                      checked={isSelected}
                      className="h-5 w-5 shrink-0 accent-black"
                      name="pass_type"
                      onChange={() => selectPass(pass.name)}
                      type="radio"
                      value={pass.name}
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className={`${card} p-5`}>
            <StepHeading step="2" title="날짜와 시간" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="예약 날짜">
                <input required min={todayValue()} type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} />
              </Field>
              <Field label="시작 시간">
                <input required type="time" value={form.start_time} onChange={(event) => updateField("start_time", event.target.value)} />
              </Field>
              <Field label="종료 시간">
                <input required type="time" value={form.end_time} onChange={(event) => updateField("end_time", event.target.value)} />
              </Field>
            </div>
          </fieldset>

          <fieldset className={`${card} p-5`}>
            <StepHeading step="3" title="예약자 정보" />
            <div className="grid gap-4">
              <Field label="이름">
                <input required placeholder="성함 또는 팀명" value={form.name} onChange={(event) => updateField("name", event.target.value)} />
              </Field>
              <Field label="연락처">
                <input required placeholder="010-0000-0000" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="이메일">
                  <input placeholder="선택 입력" type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
                </Field>
                <Field label="인원">
                  <input min={1} required type="number" value={form.people} onChange={(event) => updateField("people", event.target.value)} />
                </Field>
              </div>
              <Field label="요청사항">
                <textarea
                  required
                  placeholder="방문 목적, 필요한 장비, 궁금한 점"
                  rows={5}
                  value={form.message}
                  onChange={(event) => updateField("message", event.target.value)}
                />
              </Field>
            </div>
          </fieldset>

          {error ? <p className={`${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}
          {success ? (
            <div className={`${tintCard("mint")} p-5 font-bold leading-7`}>
              <p className="text-lg font-black">예약 신청이 접수되었습니다. 🎉</p>
              <p className="mt-1">확인 후 연락드릴게요.</p>
              <p className="mt-3 text-sm font-medium">확정 안내를 받기 전까지는 일정이 조정될 수 있습니다.</p>
            </div>
          ) : null}

          <button className={buttonClass("primary", "lg")} disabled={isSubmitting} type="submit">
            {isSubmitting ? "보내는 중…" : "예약 신청 →"}
          </button>

          <Link className="text-center text-sm font-bold text-workroom-muted underline underline-offset-4 transition-colors hover:text-workroom-ink" to="/">
            소개 페이지로 돌아가기
          </Link>
        </form>
      </Section>
    </main>
  );
}

function StepHeading({ step, title }: { step: string; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-pill border-2 border-workroom-ink bg-workroom-yellow text-sm font-black">
        {step}
      </span>
      <h2 className="text-xl font-bold">{title}</h2>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold">
      <span>{label}</span>
      {children}
    </label>
  );
}
