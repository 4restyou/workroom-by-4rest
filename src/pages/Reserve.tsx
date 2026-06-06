import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Section from "../components/Section";
import { defaultPasses } from "../lib/defaultPasses";
import { todayValue } from "../lib/format";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import type { Pass, ReservationInsert } from "../lib/types";

const emptyForm = {
  pass_type: "",
  date: todayValue(),
  start_time: "10:00",
  end_time: "12:00",
  people: "1",
  name: "",
  phone: "",
  email: "",
  message: "",
};

export default function Reserve() {
  const [passes, setPasses] = useState<Pass[]>(defaultPasses);
  const [form, setForm] = useState(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadPasses() {
      if (!hasSupabaseConfig || !supabase) return;
      const { data, error: passError } = await supabase
        .from("passes")
        .select("id,name,description,price,is_active,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (!passError && data?.length) {
        setPasses(data);
      }
    }

    void loadPasses();
  }, []);

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
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

    const payload: ReservationInsert = {
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

  return (
    <main className="pb-10">
      <Section eyebrow="Reserve" title="먼저 이용권부터 골라주세요">
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="rounded-card border-2 border-workroom-line bg-workroom-surface p-5 shadow-sketch">
            <h2 className="mb-4 text-xl font-black">1. 이용권</h2>
            <div className="grid gap-3">
              {[...passes.map((pass) => pass.name), "기타 문의"].map((passName) => (
                <label
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-card border-2 border-workroom-line px-4 py-3 font-black ${
                    form.pass_type === passName ? "bg-workroom-yellow" : "bg-white"
                  }`}
                  key={passName}
                >
                  <span>{passName}</span>
                  <input
                    checked={form.pass_type === passName}
                    className="h-5 w-5 accent-black"
                    name="pass_type"
                    onChange={() => updateField("pass_type", passName)}
                    type="radio"
                    value={passName}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-card border-2 border-workroom-line bg-workroom-surface p-5 shadow-soft">
            <h2 className="mb-4 text-xl font-black">2. 날짜와 시간</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="예약 날짜">
                <input required type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} />
              </Field>
              <Field label="시작 시간">
                <input required type="time" value={form.start_time} onChange={(event) => updateField("start_time", event.target.value)} />
              </Field>
              <Field label="종료 시간">
                <input required type="time" value={form.end_time} onChange={(event) => updateField("end_time", event.target.value)} />
              </Field>
            </div>
          </div>

          <div className="rounded-card border-2 border-workroom-line bg-workroom-surface p-5 shadow-soft">
            <h2 className="mb-4 text-xl font-black">3. 예약자 정보</h2>
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
          </div>

          {error ? <p className="rounded-card border-2 border-workroom-line bg-red-100 p-4 text-sm font-black">{error}</p> : null}
          {success ? (
            <div className="rounded-card border-2 border-workroom-line bg-workroom-yellow p-5 font-black leading-7 shadow-sketch">
              <p>예약 신청이 접수되었습니다.</p>
              <p>확인 후 연락드릴게요.</p>
              <p className="mt-3 text-sm">
                WORKROOM은 아직 준비 중이거나 초기 운영 중일 수 있어, 예약 확정 전까지는 일정이 조정될 수 있습니다.
              </p>
            </div>
          ) : null}

          <button
            className="rounded-full border-2 border-workroom-line bg-workroom-text px-6 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:bg-workroom-muted"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "보내는 중" : "예약 신청"}
          </button>

          <Link className="text-center text-sm font-black underline" to="/">
            소개 페이지로 돌아가기
          </Link>
        </form>
      </Section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-black">
      <span>{label}</span>
      {children}
    </label>
  );
}
