import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Calendar from "../components/Calendar";
import Section from "../components/Section";
import { trackEvent } from "../lib/analytics";
import { defaultPasses } from "../lib/defaultPasses";
import { computeFullDates, type IntervalInput } from "../lib/availability";
import { formatDate, formatDateInputValue, formatPhone, formatPrice, reservationWindowForPass, todayValue } from "../lib/format";
import { getCurrentProfile, signInWithGoogle } from "../lib/profiles";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { buttonClass, card, tintCard } from "../lib/ui";
import type { BusinessHour, Pass, Profile, ReservationInsert } from "../lib/types";

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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

type PassOption = Pass & {
  group: "시간권" | "종일권" | "주간 / 월권" | "문의";
};

type SubmittedReservation = {
  passName: string;
  date: string;
  startTime: string;
  endTime: string;
  people: number;
  name: string;
  phone: string;
  price: number | null;
};

const customInquiryPass: PassOption = {
  id: "custom-inquiry",
  name: "기타 문의",
  description: "촬영, 모임, 장기 이용 상담",
  price: 0,
  group: "문의",
};

export default function Reserve() {
  const location = useLocation();
  const [passes, setPasses] = useState<Pass[]>(defaultPasses);
  const [form, setForm] = useState(emptyForm);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submittedReservation, setSubmittedReservation] = useState<SubmittedReservation | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [hoursByWeekday, setHoursByWeekday] = useState<Record<number, BusinessHour>>({});
  const [trap, setTrap] = useState(""); // honeypot: real users never fill this
  const [authChecked, setAuthChecked] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [fullDates, setFullDates] = useState<Set<string>>(new Set());
  const [seatCapacities, setSeatCapacities] = useState<Record<string, number>>({});

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
      if (!hasSupabaseConfig || !supabase) {
        setAuthChecked(true);
        return;
      }
      const loadedProfile = await getCurrentProfile();
      setProfile(loadedProfile);
      if (loadedProfile) {
        setForm((current) => ({
          ...current,
          name: current.name || loadedProfile.full_name || "",
          phone: current.phone || loadedProfile.phone || "",
          email: current.email || loadedProfile.email || "",
        }));
      }
      setAuthChecked(true);
    }

    void loadProfile();
  }, []);

  function loginToReserve() {
    void signInWithGoogle(`${location.pathname}${location.search}`);
  }

  const needsLogin = hasSupabaseConfig && authChecked && !profile;

  useEffect(() => {
    async function loadOperatingInfo() {
      if (!hasSupabaseConfig || !supabase) return;
      const [{ data: settingRows }, { data: hoursData }, { data: seatData }] = await Promise.all([
        supabase.from("space_settings").select("key,value"),
        supabase.from("business_hours").select("*"),
        supabase.from("seat_types").select("id,capacity"),
      ]);
      if (settingRows) {
        setSettings(Object.fromEntries((settingRows as { key: string; value: string }[]).map((row) => [row.key, row.value])));
      }
      if (hoursData) {
        setHoursByWeekday(Object.fromEntries((hoursData as BusinessHour[]).map((hour) => [hour.weekday, hour])));
      }
      if (seatData) {
        setSeatCapacities(Object.fromEntries((seatData as { id: string; capacity: number }[]).map((seat) => [seat.id, seat.capacity])));
      }
    }

    void loadOperatingInfo();
  }, []);

  const selectedHours = useMemo(() => {
    if (!form.date) return undefined;
    const weekday = new Date(`${form.date}T00:00:00`).getDay();
    return hoursByWeekday[weekday];
  }, [form.date, hoursByWeekday]);

  const openHHMM = selectedHours?.open_time.slice(0, 5);
  const closeHHMM = selectedHours?.close_time.slice(0, 5);
  const isClosedDay = selectedHours?.is_closed ?? false;
  const reservationEnabled = settings.reservation_enabled !== "false";
  const noticeItems = (
    [
      ["결제", settings.payment_notice],
      ["취소·환불", settings.cancellation_notice],
      ["연장", settings.extension_notice],
      ["음식·소리", settings.etiquette_notice],
      ["프린트", settings.print_notice],
    ] as [string, string | undefined][]
  ).filter((item): item is [string, string] => Boolean(item[1] && item[1].trim()));

  const selectedSeatTypeId = passes.find((pass) => pass.name === form.pass_type)?.seat_type_id ?? null;

  useEffect(() => {
    async function loadAvailability() {
      if (!hasSupabaseConfig || !supabase || !selectedSeatTypeId) {
        setFullDates(new Set());
        return;
      }
      const capacity = seatCapacities[selectedSeatTypeId];
      if (!capacity) {
        setFullDates(new Set());
        return;
      }
      const monthStart = formatDateInputValue(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1));
      const monthEnd = formatDateInputValue(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0));

      const { data } = await supabase
        .from("reservations")
        .select("date,start_time,end_time,people,status")
        .eq("seat_type_id", selectedSeatTypeId)
        .in("status", ["pending", "confirmed"])
        .gte("date", monthStart)
        .lte("date", monthEnd);

      setFullDates(computeFullDates((data ?? []) as IntervalInput[], capacity));
    }

    void loadAvailability();
  }, [calendarMonth, selectedSeatTypeId, seatCapacities, success]);

  const today = todayValue();

  function isDateDisabled(date: string) {
    if (date < today) return true;
    const weekday = new Date(`${date}T00:00:00`).getDay();
    if (hoursByWeekday[weekday]?.is_closed) return true;
    return fullDates.has(date);
  }

  function isDateFull(date: string) {
    return fullDates.has(date);
  }

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function selectPass(passName: string) {
    setForm((current) => ({ ...current, ...reservationWindowForPass(passName), pass_type: passName }));
    trackEvent("reserve_pass_selected", { pass_type: passName });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess(false);

    if (!supabase) {
      setError("Supabase 환경 변수가 아직 연결되지 않았습니다.");
      return;
    }

    if (!reservationEnabled) {
      setError("현재 예약을 받고 있지 않습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    // Honeypot: a bot filled the hidden field — pretend success, skip the insert.
    if (trap.trim()) {
      setSuccess(true);
      setSubmittedReservation(null);
      setForm({ ...emptyForm, date: todayValue() });
      return;
    }

    if (!form.pass_type || !form.name.trim() || !form.phone.trim()) {
      setError("이용권, 이름, 연락처를 입력해 주세요.");
      return;
    }

    if (form.start_time >= form.end_time) {
      setError("종료 시간은 시작 시간보다 늦어야 합니다.");
      return;
    }

    if (form.date < todayValue()) {
      setError("오늘 이후 날짜로 예약해 주세요.");
      return;
    }

    if (isClosedDay) {
      setError("선택하신 날짜는 휴무일입니다. 다른 날짜를 선택해 주세요.");
      return;
    }

    if (openHHMM && closeHHMM && (form.start_time < openHHMM || form.end_time > closeHHMM)) {
      setError(`운영 시간(${openHHMM} - ${closeHHMM}) 안에서만 예약할 수 있습니다.`);
      return;
    }

    const people = Number(form.people);
    if (!Number.isInteger(people) || people < 1 || people > 12) {
      setError("인원은 1명부터 12명까지 입력할 수 있습니다.");
      return;
    }

    const selectedPass = passes.find((pass) => pass.name === form.pass_type);
    if (selectedPass?.seat_type_id) {
      const { data: capacityRows, error: capacityError } = await supabase.rpc("check_reservation_capacity", {
        p_date: form.date,
        p_start_time: form.start_time,
        p_end_time: form.end_time,
        p_seat_type_id: selectedPass.seat_type_id,
        p_people: people,
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
      people,
      message: form.message.trim(),
      status: "pending",
    };

    setIsSubmitting(true);
    const { error: submitError } = await supabase.from("reservations").insert(payload);
    setIsSubmitting(false);

    if (submitError) {
      setError("예약 신청 중 문제가 생겼습니다. 잠시 후 다시 시도하거나 연락처로 문의해 주세요.");
      return;
    }

    setSubmittedReservation({
      passName: selectedPass?.name ?? form.pass_type,
      date: form.date,
      startTime: form.start_time,
      endTime: form.end_time,
      people,
      name: form.name.trim(),
      phone: form.phone.trim(),
      price: selectedPass?.price ?? null,
    });
    trackEvent("reservation_submitted", {
      pass_type: selectedPass?.name ?? form.pass_type,
      people,
      price: selectedPass?.price ?? null,
      has_message: Boolean(form.message.trim()),
      seat_type_id: selectedPass?.seat_type_id ?? null,
    });
    setSuccess(true);
    setForm({ ...emptyForm, date: todayValue() });
  }

  const groupedPasses = groupPasses(passes);

  return (
    <main className="pb-28 sm:pb-12">
      <Section eyebrow="Reserve" title="예약" accent="yellow">
        <div className={`mb-6 ${tintCard("yellow")} p-4 text-sm font-bold leading-6`}>
          홈페이지 예약을 기준으로 운영합니다. 예약 신청 후 전화 또는 문자로 확인 안내를 드립니다.
          {profile ? <span className="mt-2 block font-medium">로그인된 회원 정보로 예약자 정보를 미리 채웠습니다.</span> : null}
        </div>

        {!reservationEnabled ? (
          <div className={`mb-6 ${tintCard("danger")} p-4 text-sm font-bold`}>
            지금은 예약을 받고 있지 않습니다. 자세한 내용은 운영자에게 문의해 주세요.
          </div>
        ) : null}

        {needsLogin ? (
          <div className={`${card} p-6 text-center`}>
            <p className="text-lg font-black">예약은 회원만 가능합니다</p>
            <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
              구글 계정으로 로그인하면 선택하신 이용권 그대로 바로 예약할 수 있어요.
            </p>
            <button className={buttonClass("primary", "lg", "mt-5 w-full sm:w-auto")} onClick={loginToReserve} type="button">
              구글로 로그인하고 예약하기
            </button>
          </div>
        ) : (
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
            value={trap}
            onChange={(event) => setTrap(event.target.value)}
          />
          <fieldset className={`${card} p-5`}>
            <StepHeading step="1" title="이용권" />
            <div className="grid gap-3">
              {groupedPasses.map((group) => (
                <fieldset className="grid gap-2" key={group.name}>
                  <legend className="mb-1 text-xs font-black text-workroom-muted">{group.name}</legend>
                  {group.items.map((pass) => {
                    const isSelected = form.pass_type === pass.name;
                    return (
                      <label
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-card border-2 px-4 py-3 transition-transform duration-100 active:translate-x-[2px] active:translate-y-[2px] ${
                          isSelected
                            ? "border-workroom-ink bg-workroom-yellow"
                            : "border-workroom-ink bg-white hover:-translate-y-0.5"
                        }`}
                        key={pass.id}
                      >
                        <span className="min-w-0">
                          <span className="block text-base font-bold">{pass.name}</span>
                          <span className="mt-1 block text-xs font-medium text-workroom-muted">
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
                </fieldset>
              ))}
            </div>
          </fieldset>

          <fieldset className={`${card} p-5`}>
            <StepHeading step="2" title="날짜와 시간" />
            {!form.pass_type ? (
              <p className={`mb-4 ${tintCard("yellow")} p-3 text-sm font-bold`}>먼저 이용권을 선택하면 좌석이 남은 날짜만 선택할 수 있어요.</p>
            ) : null}
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid content-start gap-2 text-sm font-bold">
                <span>예약 날짜</span>
                <Calendar
                  month={calendarMonth}
                  selected={form.date}
                  minMonth={startOfMonth(new Date())}
                  onSelect={(date) => updateField("date", date)}
                  onMonthChange={setCalendarMonth}
                  isDisabled={isDateDisabled}
                  isFull={isDateFull}
                />
              </div>
              <div className="grid content-start gap-4">
                <Field label="시작 시간">
                  <input required type="time" min={openHHMM} max={closeHHMM} value={form.start_time} onChange={(event) => updateField("start_time", event.target.value)} />
                </Field>
                <Field label="종료 시간">
                  <input required type="time" min={openHHMM} max={closeHHMM} value={form.end_time} onChange={(event) => updateField("end_time", event.target.value)} />
                </Field>
                <p className="text-xs font-medium leading-5 text-workroom-muted">
                  시간은 이용권에 맞게 자동으로 채워지며, 필요하면 직접 바꿀 수 있어요.
                </p>
                {selectedHours ? (
                  <p className={`text-xs font-bold ${isClosedDay ? "text-red-600" : "text-workroom-muted"}`}>
                    {isClosedDay ? "이 날짜는 휴무일입니다." : `이 날짜 운영 시간 · ${openHHMM} – ${closeHHMM}`}
                  </p>
                ) : null}
              </div>
            </div>
          </fieldset>

          <fieldset className={`${card} p-5`}>
            <StepHeading step="3" title="예약자 정보" />
            <div className="grid gap-4">
              <Field label="이름">
                <input required placeholder="성함 또는 팀명" value={form.name} onChange={(event) => updateField("name", event.target.value)} />
              </Field>
              <Field label="연락처">
                <input
                  required
                  inputMode="numeric"
                  placeholder="010-0000-0000"
                  value={form.phone}
                  onChange={(event) => updateField("phone", formatPhone(event.target.value))}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="이메일">
                  <input placeholder="선택 입력" type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
                </Field>
                <Field label="인원">
                  <input min={1} required type="number" value={form.people} onChange={(event) => updateField("people", event.target.value)} />
                </Field>
              </div>
              <Field label="요청사항 (선택)">
                <textarea
                  placeholder="방문 목적, 필요한 장비, 궁금한 점 (선택 입력)"
                  rows={5}
                  value={form.message}
                  onChange={(event) => updateField("message", event.target.value)}
                />
              </Field>
            </div>
          </fieldset>

          {error ? <p className={`${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}

          <button className={buttonClass("primary", "lg")} disabled={isSubmitting || !reservationEnabled} type="submit">
            {isSubmitting ? "보내는 중…" : reservationEnabled ? "예약 신청 →" : "예약 일시 중지"}
          </button>

          <Link className="text-center text-sm font-bold text-workroom-muted underline underline-offset-4 transition-colors hover:text-workroom-ink" to="/">
            소개 페이지로 돌아가기
          </Link>
        </form>
        )}
      </Section>

      {success ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className={`${card} max-h-[85vh] w-full max-w-lg overflow-y-auto p-6`}>
            <p className="text-2xl font-black">예약 신청이 접수되었습니다 🎉</p>
            <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
              확인 후 전화 또는 문자로 안내드릴게요. 확정 안내를 받기 전까지는 일정이 조정될 수 있습니다.
            </p>

            {submittedReservation ? (
              <div className={`${tintCard("yellow")} mt-5 p-4`}>
                <p className="text-sm font-black">신청 내용</p>
                <dl className="mt-3 grid grid-cols-[74px_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="font-bold text-workroom-muted">이용권</dt>
                  <dd className="font-black">{submittedReservation.passName}</dd>
                  <dt className="font-bold text-workroom-muted">날짜</dt>
                  <dd className="font-black">{formatDate(submittedReservation.date)}</dd>
                  <dt className="font-bold text-workroom-muted">시간</dt>
                  <dd className="font-black">
                    {submittedReservation.startTime} - {submittedReservation.endTime}
                  </dd>
                  <dt className="font-bold text-workroom-muted">인원</dt>
                  <dd className="font-black">{submittedReservation.people}명</dd>
                  <dt className="font-bold text-workroom-muted">예약자</dt>
                  <dd className="font-black">
                    {submittedReservation.name} · {submittedReservation.phone}
                  </dd>
                  <dt className="font-bold text-workroom-muted">금액</dt>
                  <dd className="font-black">{submittedReservation.price ? formatPrice(submittedReservation.price) : "확인 후 안내"}</dd>
                </dl>
              </div>
            ) : null}

            {noticeItems.length ? (
              <div className="mt-5 grid gap-3">
                <p className="text-sm font-black">이용 전 꼭 확인해 주세요</p>
                {noticeItems.map(([title, body]) => (
                  <div className={`${tintCard("mint")} p-3`} key={title}>
                    <p className="text-sm font-bold">{title}</p>
                    <p className="mt-1 text-sm font-medium leading-6">{body}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <button className={buttonClass("primary", "lg", "mt-6 w-full")} onClick={() => setSuccess(false)} type="button">
              확인했어요
            </button>
          </div>
        </div>
      ) : null}
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

function groupPasses(passes: Pass[]) {
  const passOptions: PassOption[] = [
    ...passes.map((pass) => ({
      ...pass,
      group: getPassGroup(pass.name),
    })),
    customInquiryPass,
  ];

  return (["시간권", "종일권", "주간 / 월권", "문의"] as const)
    .map((name) => ({
      name,
      items: passOptions.filter((pass) => pass.group === name),
    }))
    .filter((group) => group.items.length > 0);
}

function getPassGroup(passName: string): PassOption["group"] {
  if (passName.includes("시간")) return "시간권";
  if (passName.includes("종일")) return "종일권";
  if (passName.includes("주간") || passName.includes("월권")) return "주간 / 월권";
  return "문의";
}
