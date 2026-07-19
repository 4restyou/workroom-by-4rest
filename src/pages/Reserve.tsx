import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Calendar from "../components/Calendar";
import Section from "../components/Section";
import { trackEvent } from "../lib/analytics";
import { defaultPasses } from "../lib/defaultPasses";
import { computeFullDates, type IntervalInput } from "../lib/availability";
import {
  formatDate,
  formatDateInputValue,
  formatPhone,
  formatPrice,
  operatingTimeSlots,
  passDurationHours,
  reservationWindowForPass,
  shiftTime,
  todayValue,
} from "../lib/format";
import { getCurrentProfile, signInWithGoogle } from "../lib/profiles";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { SITE } from "../lib/site";
import { badge, buttonClass, card, tintCard } from "../lib/ui";
import type { BusinessDateException, BusinessHour, Pass, Profile, ReservationInsert } from "../lib/types";

const emptyForm = {
  pass_type: "",
  date: todayValue(),
  start_time: "09:00",
  end_time: "12:00",
  people: "1",
  name: "",
  phone: "",
  email: "",
  payment_preference: "online" as "online" | "onsite",
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
  paymentPreference: "online" | "onsite";
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
  const [dateExceptions, setDateExceptions] = useState<Record<string, BusinessDateException>>({});
  const [trap, setTrap] = useState(""); // honeypot: real users never fill this
  const [authChecked, setAuthChecked] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [fullDates, setFullDates] = useState<Set<string>>(new Set());
  const [seatCapacities, setSeatCapacities] = useState<Record<string, number>>({});
  const [step, setStep] = useState(1); // wizard: 1 이용권 · 2 날짜·시간 · 3 정보·확인

  useEffect(() => {
    const selectedPass = new URLSearchParams(location.search).get("pass");
    if (!selectedPass) return;
    const window = reservationWindowForPass(selectedPass);
    setForm((current) => ({ ...current, ...window, pass_type: selectedPass }));
    setCalendarMonth(startOfMonth(new Date(`${window.date}T00:00:00`)));
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
  // Logged in, but the profile isn't complete (name, phone, privacy consent).
  const needsProfile = Boolean(profile) && (!profile?.full_name || !profile?.phone || !profile?.consented_at);

  useEffect(() => {
    async function loadOperatingInfo() {
      if (!hasSupabaseConfig || !supabase) return;
      const [{ data: settingRows }, { data: hoursData }, { data: exceptionData }, { data: seatData }] = await Promise.all([
        supabase.from("space_settings").select("key,value"),
        supabase.from("business_hours").select("*"),
        supabase.from("business_date_exceptions").select("date,open_time,close_time,is_closed,note"),
        supabase.from("seat_types").select("id,capacity"),
      ]);
      if (settingRows) {
        setSettings(Object.fromEntries((settingRows as { key: string; value: string }[]).map((row) => [row.key, row.value])));
      }
      if (hoursData) {
        setHoursByWeekday(Object.fromEntries((hoursData as BusinessHour[]).map((hour) => [hour.weekday, hour])));
      }
      if (exceptionData) {
        setDateExceptions(Object.fromEntries((exceptionData as BusinessDateException[]).map((exception) => [exception.date, exception])));
      }
      if (seatData) {
        setSeatCapacities(Object.fromEntries((seatData as { id: string; capacity: number }[]).map((seat) => [seat.id, seat.capacity])));
      }
    }

    void loadOperatingInfo();
  }, []);

  const selectedHours = useMemo(() => {
    if (!form.date) return undefined;
    if (dateExceptions[form.date]) return dateExceptions[form.date];
    const weekday = new Date(`${form.date}T00:00:00`).getDay();
    return hoursByWeekday[weekday];
  }, [dateExceptions, form.date, hoursByWeekday]);
  const selectedDateException = form.date ? dateExceptions[form.date] : undefined;

  const openHHMM = selectedHours?.open_time.slice(0, 5);
  const closeHHMM = selectedHours?.close_time.slice(0, 5);
  const isClosedDay = selectedHours?.is_closed ?? false;
  const selectedDuration = passDurationHours(form.pass_type);
  const selectableStartTimes = useMemo(
    () => selectedDuration ? startTimesForDate(form.date, openHHMM ?? "09:00", closeHHMM ?? "22:00", selectedDuration) : [],
    [closeHHMM, form.date, openHHMM, selectedDuration],
  );
  const reservationEnabled = settings.reservation_enabled !== "false";
  const noticeItems = (
    [
      ["결제", settings.payment_notice || `${SITE.booking.onlinePayment} ${SITE.booking.onsitePayment}`],
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
    const exception = dateExceptions[date];
    if (exception?.is_closed) return true;
    const weekday = new Date(`${date}T00:00:00`).getDay();
    const hours = exception ?? hoursByWeekday[weekday];
    if (!exception && hours?.is_closed) return true;
    if (selectedDuration) {
      const open = hours?.open_time?.slice(0, 5) ?? "09:00";
      const close = hours?.close_time?.slice(0, 5) ?? "22:00";
      if (!startTimesForDate(date, open, close, selectedDuration).length) return true;
    }
    return fullDates.has(date);
  }

  function isDateFull(date: string) {
    return fullDates.has(date);
  }

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateStartTime(value: string) {
    if (!selectedDuration) {
      updateField("start_time", value);
      return;
    }
    const end = shiftTime(value, selectedDuration);
    setForm((current) => ({ ...current, start_time: value, end_time: end ?? "" }));
    setError("");
  }

  useEffect(() => {
    if (!selectedDuration || !selectableStartTimes.length) return;
    const start = selectableStartTimes.includes(form.start_time) ? form.start_time : selectableStartTimes[0];
    const end = shiftTime(start, selectedDuration) ?? "";
    if (start !== form.start_time || end !== form.end_time) {
      setForm((current) => ({ ...current, start_time: start, end_time: end }));
    }
  }, [form.end_time, form.start_time, selectableStartTimes, selectedDuration]);

  // Picking a future date: the "current time" default no longer makes sense, so
  // start at that day's opening time while keeping the same booking duration.
  function selectDate(date: string) {
    setForm((current) => {
      const weekday = new Date(`${date}T00:00:00`).getDay();
      const hours = dateExceptions[date] ?? hoursByWeekday[weekday];
      const open = hours?.open_time?.slice(0, 5) ?? "09:00";
      const close = hours?.close_time?.slice(0, 5) ?? "22:00";
      const duration = passDurationHours(current.pass_type);
      if (duration) {
        const start = startTimesForDate(date, open, close, duration)[0] ?? open;
        return { ...current, date, start_time: start, end_time: shiftTime(start, duration) ?? "" };
      }
      return { ...current, date, start_time: open, end_time: close };
    });
  }

  function selectPass(passName: string) {
    const window = reservationWindowForPass(passName);
    setForm((current) => ({ ...current, ...window, pass_type: passName }));
    setCalendarMonth(startOfMonth(new Date(`${window.date}T00:00:00`)));
    trackEvent("reserve_pass_selected", { pass_type: passName });
  }

  // Validate the step the user is currently on before letting them advance.
  function currentStepError(): string {
    if (step === 1) {
      if (!form.pass_type) return "이용권을 먼저 선택해 주세요.";
    }
    if (step === 2) {
      if (!form.date || form.date < todayValue()) return "오늘 이후 날짜를 선택해 주세요.";
      if (isClosedDay) return "선택하신 날짜는 휴무일입니다. 다른 날짜를 선택해 주세요.";
      if (!form.start_time || !form.end_time) return "이용 시간을 확인해 주세요.";
      if (selectedDuration && shiftTime(form.start_time, selectedDuration) !== form.end_time)
        return `시간권은 시작 시간부터 ${selectedDuration}시간으로 예약됩니다.`;
      if (form.start_time >= form.end_time) return "종료 시간은 시작 시간보다 늦어야 해요.";
      if (selectedDuration && !selectableStartTimes.includes(form.start_time))
        return "선택한 날짜에 이용 가능한 시작 시간이 없습니다.";
      if (!selectedDuration && openHHMM && closeHHMM && !isWithinOperatingHours(form.start_time, form.end_time, openHHMM, closeHHMM))
        return `운영 시간(${openHHMM} - ${closeHHMM}) 안에서만 예약할 수 있어요.`;
    }
    return "";
  }

  function goToStep(target: number) {
    setError("");
    setStep(Math.min(3, Math.max(1, target)));
    if (typeof window !== "undefined") {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    }
  }

  function goNext() {
    const stepError = currentStepError();
    if (stepError) {
      setError(stepError);
      return;
    }
    goToStep(step + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // On earlier steps the form submit (e.g. Enter key) just advances.
    if (step < 3) {
      goNext();
      return;
    }
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

    if (!form.start_time || !form.end_time) {
      setError("이용 시간을 확인해 주세요.");
      return;
    }

    if (selectedDuration && shiftTime(form.start_time, selectedDuration) !== form.end_time) {
      setError(`시간권은 시작 시간부터 ${selectedDuration}시간으로 예약됩니다.`);
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

    if (selectedDuration && !selectableStartTimes.includes(form.start_time)) {
      setError("선택한 날짜에 이용 가능한 시작 시간이 없습니다.");
      return;
    }

    if (!selectedDuration && openHHMM && closeHHMM && !isWithinOperatingHours(form.start_time, form.end_time, openHHMM, closeHHMM)) {
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
      payment_preference: form.payment_preference,
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
      console.error("[reservation] insert failed", { code: submitError.code, message: submitError.message });
      setError(readableReservationError(submitError));
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
      paymentPreference: form.payment_preference,
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
    setStep(1);
  }

  const groupedPasses = groupPasses(passes);
  const selectedPassInfo = passes.find((pass) => pass.name === form.pass_type) ?? null;
  const stepLabels = ["이용권", "날짜·시간", "정보·확인"];

  return (
    <main className="pb-28 sm:pb-12">
      <Section eyebrow="Reserve" title="예약" accent="yellow">
        <div className="mb-6 grid gap-3 border-y border-workroom-ink py-4 text-sm font-bold leading-6 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p>회원 전용 예약 · 예약 신청 후 확인 문자를 보내드립니다.</p>
            <p className="mt-1 font-medium text-workroom-muted">온라인 결제 링크는 예약 확인 후 별도 발송 · 링크 수신 후 2시간 이내 결제 · 현장 결제는 방문 시 진행</p>
            {profile ? <span className="mt-2 block font-medium">로그인된 회원 정보로 예약자 정보를 미리 채웠습니다.</span> : null}
          </div>
          <span className={badge("yellow")}>MEMBER ONLY</span>
        </div>

        {!reservationEnabled ? (
          <div className={`mb-6 ${tintCard("danger")} p-4 text-sm font-bold`}>
            지금은 예약을 받고 있지 않습니다. 자세한 내용은 운영자에게 문의해 주세요.
          </div>
        ) : null}

        {needsLogin ? (
          <div className={`${card} p-6 text-center`}>
            <p className="text-lg font-bold">예약은 회원만 가능합니다</p>
            <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
              구글 계정으로 로그인하면 선택하신 이용권 그대로 바로 예약할 수 있어요.
            </p>
            <button className={buttonClass("primary", "lg", "mt-5 w-full sm:w-auto")} onClick={loginToReserve} type="button">
              구글로 로그인하고 예약하기
            </button>
          </div>
        ) : needsProfile ? (
          <div className={`${card} p-6 text-center`}>
            <p className="text-lg font-bold">예약 전 회원정보를 완성해 주세요</p>
            <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
              이름·연락처와 개인정보 수집·이용 동의를 마치면 예약할 수 있어요. 처음 한 번만 입력하면 됩니다.
            </p>
            <Link className={buttonClass("primary", "lg", "mt-5 w-full sm:w-auto")} to="/account?tab=profile">
              회원정보 입력하러 가기
            </Link>
          </div>
        ) : (
        <form className="grid gap-5" onSubmit={handleSubmit} noValidate>
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

          {/* Progress */}
          <ol className="grid grid-cols-3 gap-2">
            {stepLabels.map((label, index) => {
              const n = index + 1;
              const reached = step >= n;
              return (
                <li className="grid gap-1.5" key={label}>
                  <span className={`h-1.5 rounded-pill transition-colors ${reached ? "bg-workroom-ink" : "bg-workroom-line"}`} />
                  <span className={`text-[11px] font-bold ${step === n ? "text-workroom-ink" : "text-workroom-muted"}`}>
                    {n}. {label}
                  </span>
                </li>
              );
            })}
          </ol>

          <fieldset className={`${card} p-5 ${step === 1 ? "" : "hidden"}`}>
            <StepHeading step="1" title="이용권" />
            <div className="grid gap-3">
              {groupedPasses.map((group) => (
                <fieldset className="grid gap-2" key={group.name}>
                  <legend className="mb-1 text-xs font-bold text-workroom-muted">{group.name}</legend>
                  {group.items.map((pass) => {
                    const isSelected = form.pass_type === pass.name;
                    return (
                      <label
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-card border px-4 py-3 transition-colors duration-100 ${
                          isSelected
                            ? "border-workroom-ink bg-workroom-yellow"
                            : "border-workroom-line bg-white hover:border-workroom-ink"
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

          <fieldset className={`${card} p-5 ${step === 2 ? "" : "hidden"}`}>
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
                  onSelect={(date) => selectDate(date)}
                  onMonthChange={setCalendarMonth}
                  isDisabled={isDateDisabled}
                  isFull={isDateFull}
                />
              </div>
              <div className="grid content-start gap-4">
                {selectedDuration ? (
                  <fieldset className="grid gap-3">
                    <legend className="text-sm font-bold">시작 시간</legend>
                    {selectableStartTimes.length ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {selectableStartTimes.map((time) => (
                          <button
                            aria-pressed={form.start_time === time}
                            className={`rounded-[5px] border px-3 py-3 text-sm font-bold ${
                              form.start_time === time ? "border-workroom-ink bg-workroom-yellow" : "border-workroom-line bg-white hover:border-workroom-ink"
                            }`}
                            key={time}
                            onClick={() => updateStartTime(time)}
                            type="button"
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className={`${tintCard("danger")} p-3 text-sm font-bold`}>이 날짜에는 예약 가능한 3시간 구간이 없습니다.</p>
                    )}
                    <div className={`${tintCard("mint")} flex items-center justify-between gap-3 p-4`}>
                      <span className="text-sm font-bold">이용 시간</span>
                      <strong className="text-base tabular-nums">
                        {form.start_time} – {form.end_time}{form.end_time <= form.start_time ? " (다음 날)" : ""}
                      </strong>
                    </div>
                  </fieldset>
                ) : (
                  <>
                    <Field label="시작 시간">
                      <input required type="time" min={openHHMM} value={form.start_time} onChange={(event) => updateField("start_time", event.target.value)} />
                    </Field>
                    <Field label="종료 시간">
                      <input required type="time" value={form.end_time} onChange={(event) => updateField("end_time", event.target.value)} />
                    </Field>
                  </>
                )}
                <p className="text-xs font-medium leading-5 text-workroom-muted">
                  {selectedDuration
                    ? `시작 시간을 선택하면 종료 시간은 ${selectedDuration}시간 뒤로 자동 설정됩니다.`
                    : "시간은 이용권과 운영 시간에 맞게 자동으로 채워집니다."}
                </p>
                {selectedHours ? (
                  <p className={`text-xs font-bold ${isClosedDay ? "text-red-600" : "text-workroom-muted"}`}>
                    {isClosedDay ? `이 날짜는 휴무일입니다.${selectedDateException?.note ? ` ${selectedDateException.note}` : ""}` : `이 날짜 운영 시간 · ${openHHMM} – ${closeHHMM}${closeHHMM && openHHMM && closeHHMM <= openHHMM ? " (다음 날)" : ""}${selectedDateException?.note ? ` · ${selectedDateException.note}` : ""}`}
                  </p>
                ) : null}
              </div>
            </div>
          </fieldset>

          <fieldset className={`${card} p-5 ${step === 3 ? "" : "hidden"}`}>
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
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-bold">결제 방법</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-card border p-4 ${
                      form.payment_preference === "online" ? "border-workroom-ink bg-workroom-yellow" : "border-workroom-line bg-white"
                    }`}
                  >
                    <input
                      checked={form.payment_preference === "online"}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-black"
                      name="payment_preference"
                      onChange={() => updateField("payment_preference", "online")}
                      type="radio"
                    />
                    <span>
                      <span className="block font-bold">온라인 결제</span>
                      <span className="mt-1 block text-xs font-medium leading-5 text-workroom-muted">예약 확인 후 문자로 결제 링크를 보내드립니다.</span>
                    </span>
                  </label>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-card border p-4 ${
                      form.payment_preference === "onsite" ? "border-workroom-ink bg-workroom-yellow" : "border-workroom-line bg-white"
                    }`}
                  >
                    <input
                      checked={form.payment_preference === "onsite"}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-black"
                      name="payment_preference"
                      onChange={() => updateField("payment_preference", "onsite")}
                      type="radio"
                    />
                    <span>
                      <span className="block font-bold">방문 결제</span>
                      <span className="mt-1 block text-xs font-medium leading-5 text-workroom-muted">방문할 때 현장에서 바로 결제합니다.</span>
                    </span>
                  </label>
                </div>
              </fieldset>
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

          {/* Review summary on the final step */}
          {step === 3 ? (
            <div className={`${tintCard("yellow")} p-4`}>
              <p className="text-sm font-bold">예약 요약</p>
              <dl className="mt-3 grid grid-cols-[64px_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="font-bold text-workroom-muted">이용권</dt>
                <dd className="font-bold">{form.pass_type || "-"}</dd>
                <dt className="font-bold text-workroom-muted">날짜</dt>
                <dd className="font-bold">{form.date ? formatDate(form.date) : "-"}</dd>
                <dt className="font-bold text-workroom-muted">시간</dt>
                <dd className="font-bold">
                  {form.start_time} - {form.end_time}
                </dd>
                <dt className="font-bold text-workroom-muted">금액</dt>
                <dd className="font-bold">{selectedPassInfo?.price ? formatPrice(selectedPassInfo.price) : "확인 후 안내"}</dd>
                <dt className="font-bold text-workroom-muted">결제</dt>
                <dd className="font-bold">{form.payment_preference === "online" ? "온라인 결제 링크" : "방문 결제"}</dd>
              </dl>
            </div>
          ) : null}

          {error ? <p className={`${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}

          {/* Sticky action bar (mobile) / inline (desktop) */}
          <div className="sticky bottom-0 z-20 -mx-4 border-t-2 border-workroom-ink bg-workroom-background/95 px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:pt-1">
            <div className="mx-auto flex max-w-5xl gap-3">
              {step > 1 ? (
                <button className={buttonClass("secondary", "lg", "flex-1 sm:flex-none sm:px-8")} onClick={() => goToStep(step - 1)} type="button">
                  이전
                </button>
              ) : (
                <Link className={buttonClass("secondary", "lg", "flex-1 sm:flex-none sm:px-8")} to="/">
                  그만두기
                </Link>
              )}
              {step < 3 ? (
                <button className={buttonClass("accent", "lg", "flex-[2]")} onClick={goNext} type="button">
                  다음 →
                </button>
              ) : (
                <button className={buttonClass("primary", "lg", "flex-[2]")} disabled={isSubmitting || !reservationEnabled} type="submit">
                  {isSubmitting ? "보내는 중…" : reservationEnabled ? "예약 신청 →" : "예약 일시 중지"}
                </button>
              )}
            </div>
          </div>
        </form>
        )}
      </Section>

      {success ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div
            className={`${card} animate-sheet-up max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-b-none rounded-t-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-card sm:pb-6`}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-pill bg-workroom-line sm:hidden" />
            <p className="text-2xl font-bold">예약 신청이 접수되었습니다 🎉</p>
            <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
              확인 후 전화 또는 문자로 안내드릴게요. 확정 안내를 받기 전까지는 일정이 조정될 수 있습니다.
            </p>

            {submittedReservation ? (
              <div className={`${tintCard("yellow")} mt-5 p-4`}>
                <p className="text-sm font-bold">신청 내용</p>
                <dl className="mt-3 grid grid-cols-[74px_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="font-bold text-workroom-muted">이용권</dt>
                  <dd className="font-bold">{submittedReservation.passName}</dd>
                  <dt className="font-bold text-workroom-muted">날짜</dt>
                  <dd className="font-bold">{formatDate(submittedReservation.date)}</dd>
                  <dt className="font-bold text-workroom-muted">시간</dt>
                  <dd className="font-bold">
                    {submittedReservation.startTime} - {submittedReservation.endTime}
                  </dd>
                  <dt className="font-bold text-workroom-muted">인원</dt>
                  <dd className="font-bold">{submittedReservation.people}명</dd>
                  <dt className="font-bold text-workroom-muted">예약자</dt>
                  <dd className="font-bold">
                    {submittedReservation.name} · {submittedReservation.phone}
                  </dd>
                  <dt className="font-bold text-workroom-muted">금액</dt>
                  <dd className="font-bold">{submittedReservation.price ? formatPrice(submittedReservation.price) : "확인 후 안내"}</dd>
                  <dt className="font-bold text-workroom-muted">결제</dt>
                  <dd className="font-bold">{submittedReservation.paymentPreference === "online" ? "온라인 결제 링크" : "방문 결제"}</dd>
                </dl>
              </div>
            ) : null}

            {noticeItems.length ? (
              <div className="mt-5 grid gap-3">
                <p className="text-sm font-bold">이용 전 꼭 확인해 주세요</p>
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
      <span className="grid h-8 w-8 place-items-center rounded-pill border border-workroom-line bg-workroom-yellow text-sm font-bold">
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

function readableReservationError(error: { code?: string; message?: string }) {
  const message = error.message?.trim() ?? "";
  const customerFacingMessage = ["예약", "운영 시간", "휴무일", "좌석", "종료 시간"].some((word) => message.includes(word));
  if (customerFacingMessage) return message;
  if (error.code === "42501") return "로그인 정보가 만료되었습니다. 다시 로그인한 뒤 예약해 주세요.";
  return "예약 신청 중 문제가 생겼습니다. 입력 내용을 다시 확인하거나 잠시 후 다시 시도해 주세요.";
}

function startTimesForDate(date: string, open: string, close: string, durationHours: number) {
  let earliestMinute: number | undefined;
  if (date === todayValue()) {
    const now = new Date();
    const openMinute = Number(open.slice(0, 2)) * 60 + Number(open.slice(3, 5));
    const nowMinute = now.getHours() * 60 + now.getMinutes() + (now.getSeconds() > 0 ? 1 : 0);
    earliestMinute = nowMinute < openMinute ? openMinute : Math.ceil(nowMinute / 60) * 60;
  }
  return operatingTimeSlots(open, close, durationHours, earliestMinute);
}

function isWithinOperatingHours(start: string, end: string, open: string, close: string) {
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const openMinute = minutes(open);
  let closeMinute = minutes(close);
  const startMinute = minutes(start);
  let endMinute = minutes(end);
  if (closeMinute <= openMinute) closeMinute += 24 * 60;
  if (endMinute <= startMinute) endMinute += 24 * 60;
  return startMinute >= openMinute && endMinute <= closeMinute;
}
