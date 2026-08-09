import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Calendar from "../components/Calendar";
import Section from "../components/Section";
import { trackEvent } from "../lib/analytics";
import { defaultPasses } from "../lib/defaultPasses";
import { computeFullDates, peakConcurrentInWindow, toMinutes, type IntervalInput } from "../lib/availability";
import { maxBookingDateValue,
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
import { canPayOnline, canSubscribe, payReservation, subscribeMonthly } from "../lib/portone";
import { hasSupabaseConfig, supabase } from "../lib/supabase";
import { useFeedbackToast } from "../lib/useFeedbackToast";
import { accessEndDate, isLongTermPassName, passUsableDays, readableReservationError } from "../lib/reservations";
import { hoursForDate, openWeekdaysFrom } from "../lib/businessHours";
import { PASS_COLUMNS, RESERVATION_AVAILABILITY_COLUMNS } from "../lib/columns";
import { SITE } from "../lib/site";
import { badge, buttonClass, card, tintCard } from "../lib/ui";
import type { BusinessDateException, BusinessHour, Pass, Profile, Reservation, ReservationInsert } from "../lib/types";

const emptyForm = {
  pass_type: "",
  date: todayValue(),
  start_time: "08:00",
  end_time: "11:00",
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
  group: "시간권" | "종일권" | "주간 / 월권" | "단체·기타";
};

type SubmittedReservation = {
  reservation: Reservation;
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

export default function Reserve() {
  const location = useLocation();
  const [passes, setPasses] = useState<Pass[]>(defaultPasses);
  const [form, setForm] = useState(emptyForm);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPaymentBusy, setIsPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [error, setError] = useState("");
  useFeedbackToast(undefined, error);
  const [success, setSuccess] = useState(false);
  const [submittedReservation, setSubmittedReservation] = useState<SubmittedReservation | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [hoursByWeekday, setHoursByWeekday] = useState<Record<number, BusinessHour>>({});
  const [dateExceptions, setDateExceptions] = useState<Record<string, BusinessDateException>>({});
  const [trap, setTrap] = useState(""); // honeypot: real users never fill this
  const [authChecked, setAuthChecked] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [fullDates, setFullDates] = useState<Set<string>>(new Set());
  const successPanelRef = useRef<HTMLDivElement>(null);
  // 시간대별 잔여 좌석을 미리 계산하기 위해 월간 예약 원본도 들고 있는다.
  const [monthRows, setMonthRows] = useState<IntervalInput[]>([]);
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
        .select(PASS_COLUMNS)
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

  // 날짜 예외(임시 휴무·단축 운영)가 요일 설정을 덮어쓴다 — 판정은 lib/businessHours에 있다.
  const selectedHours = useMemo(
    () => hoursForDate(form.date, hoursByWeekday, dateExceptions),
    [dateExceptions, form.date, hoursByWeekday],
  );
  const selectedDateException = form.date ? dateExceptions[form.date] : undefined;

  const openHHMM = selectedHours?.open_time.slice(0, 5);
  const closeHHMM = selectedHours?.close_time.slice(0, 5);
  // 자정을 넘겨 마감하는 날(예: 08:00–다음 날 01:00)은 종료가 시작보다 이른
  // 표기(01:00 < 08:00)가 정상이다. 단순 비교 검증은 이 경우를 건너뛴다.
  // 휴무 요일을 뺀 영업 요일 — 장기 이용권의 이용 가능 요일 기본값.
  const openWeekdays = useMemo(() => openWeekdaysFrom(hoursByWeekday), [hoursByWeekday]);
  const isOvernightWindow = Boolean(openHHMM && closeHHMM && closeHHMM <= openHHMM);
  const isClosedDay = selectedHours?.is_closed ?? false;
  const selectedDuration = passDurationHours(form.pass_type);
  const selectableStartTimes = useMemo(
    () => selectedDuration ? startTimesForDate(form.date, openHHMM ?? "08:00", closeHHMM ?? "01:00", selectedDuration) : [],
    [closeHHMM, form.date, openHHMM, selectedDuration],
  );
  const reservationEnabled = settings.reservation_enabled !== "false";
  const noticeItems = (
    [
      ["결제", settings.payment_notice || `${SITE.booking.onlinePayment} ${SITE.booking.onsitePayment}`],
      ["취소·환불", settings.cancellation_notice],
      ["연장", settings.extension_notice],
      ["음식·소리", settings.etiquette_notice],
      ["촬영", settings.photo_notice],
      ["릴렉스타임", settings.relax_notice],
      ["프린트", settings.print_notice],
    ] as [string, string | undefined][]
  ).filter((item): item is [string, string] => Boolean(item[1] && item[1].trim()));

  // 완료 시트: Esc로 닫고, 열릴 때 패널로 포커스를 옮긴다.
  useEffect(() => {
    if (!success) return;
    successPanelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSuccess(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [success]);

  const selectedSeatTypeId = passes.find((pass) => pass.name === form.pass_type)?.seat_type_id ?? null;

  // 시작 시간별 잔여 좌석 — 마감된 시간대를 미리 막아, 마지막 단계에서야
  // "잔여 좌석 부족"으로 되돌아가는 일을 없앤다.
  const slotRemaining = useMemo(() => {
    const map = new Map<string, number>();
    const capacity = selectedSeatTypeId ? seatCapacities[selectedSeatTypeId] ?? 0 : 0;
    if (!capacity || !selectedDuration || !form.date) return map;
    for (const time of selectableStartTimes) {
      const start = toMinutes(time);
      const end = start + selectedDuration * 60;
      const peak = peakConcurrentInWindow(monthRows, form.date, start, end);
      map.set(time, Math.max(0, capacity - peak));
    }
    return map;
  }, [form.date, monthRows, seatCapacities, selectableStartTimes, selectedDuration, selectedSeatTypeId]);


  useEffect(() => {
    async function loadAvailability() {
      if (!hasSupabaseConfig || !supabase || !selectedSeatTypeId) {
        setFullDates(new Set());
        setMonthRows([]);
        return;
      }
      const capacity = seatCapacities[selectedSeatTypeId];
      if (!capacity) {
        setFullDates(new Set());
        setMonthRows([]);
        return;
      }
      const monthStart = formatDateInputValue(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1));
      const monthEnd = formatDateInputValue(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0));

      const { data } = await supabase
        .from("reservations")
        .select(RESERVATION_AVAILABILITY_COLUMNS)
        .eq("seat_type_id", selectedSeatTypeId)
        .in("status", ["pending", "confirmed"])
        .gte("date", monthStart)
        .lte("date", monthEnd);

      const rows = (data ?? []) as IntervalInput[];
      setMonthRows(rows);
      setFullDates(computeFullDates(rows, capacity));
    }

    void loadAvailability();
  }, [calendarMonth, selectedSeatTypeId, seatCapacities, success]);

  const today = todayValue();
  const maxBookable = maxBookingDateValue();

  // 선택할 수 없는 이유를 함께 돌려준다 — 회색 처리만 하면 왜 안 되는지 알 수 없다.
  function dateDisabledReason(date: string): string | null {
    if (date < today) return "지난 날짜";
    if (date > maxBookable) return "2개월 이후";
    const exception = dateExceptions[date];
    if (exception?.is_closed) return "휴무일";
    const weekday = new Date(`${date}T00:00:00`).getDay();
    const hours = exception ?? hoursByWeekday[weekday];
    if (!exception && hours?.is_closed) return "휴무일";
    if (selectedDuration) {
      const open = hours?.open_time?.slice(0, 5) ?? "08:00";
      const close = hours?.close_time?.slice(0, 5) ?? "01:00";
      if (!startTimesForDate(date, open, close, selectedDuration).length) return "이용 가능한 시간 없음";
    }
    return fullDates.has(date) ? "예약 마감" : null;
  }

  function isDateDisabled(date: string) {
    return dateDisabledReason(date) !== null;
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
      const open = hours?.open_time?.slice(0, 5) ?? "08:00";
      const close = hours?.close_time?.slice(0, 5) ?? "01:00";
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
      const people = Number(form.people);
      if (!Number.isInteger(people) || people < 1 || people > 12) return "인원은 1명부터 12명까지 입력할 수 있습니다.";
      if (!form.date || form.date < todayValue()) return "오늘 이후 날짜를 선택해 주세요.";
      if (isClosedDay) return "선택하신 날짜는 휴무일입니다. 다른 날짜를 선택해 주세요.";
      if (form.date > maxBookable) return "예약은 오늘부터 2개월 이내 날짜까지만 가능해요.";
      if (!form.start_time || !form.end_time) return "이용 시간을 확인해 주세요.";
      if (selectedDuration && shiftTime(form.start_time, selectedDuration) !== form.end_time)
        return `시간권은 시작 시간부터 ${selectedDuration}시간으로 예약됩니다.`;
      if (form.start_time === form.end_time) return "종료 시간은 시작 시간과 다르게 선택해 주세요.";
      if (!isOvernightWindow && form.start_time > form.end_time) return "종료 시간은 시작 시간보다 늦어야 해요.";
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
      setError("서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요.");
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

    if (form.start_time === form.end_time || (!isOvernightWindow && form.start_time > form.end_time)) {
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
        setError(`선택한 시간대의 잔여 좌석이 부족합니다. 현재 잔여 ${capacity.remaining}석입니다. 다른 시간을 선택해 주세요.`);
        goToStep(2);
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
      // 주간권·월권은 하루가 아니라 기간 이용권이다. 시작일 기준으로 이용 기간을
      // 계산해 넣어야 회원 화면의 이용기간 표시와 출근(입실) 판정이 맞는다.
      ...(isLongTermPassName(form.pass_type)
        ? {
            access_start_date: form.date,
            // 영업일 기준으로 채운다 — 종료일이 휴무일이 되지 않도록.
            access_end_date: accessEndDate(form.date, form.pass_type, openWeekdays),
            access_weekdays: openWeekdays,
          }
        : {}),
    };

    setIsSubmitting(true);
    const { data: createdReservation, error: submitError } = await supabase.from("reservations").insert(payload).select("*").single();
    setIsSubmitting(false);

    if (submitError || !createdReservation) {
      console.error("[reservation] insert failed", { code: submitError?.code, message: submitError?.message ?? "missing inserted row" });
      setError(readableReservationError(submitError ?? { message: "예약 정보를 확인하지 못했습니다." }));
      return;
    }

    setSubmittedReservation({
      reservation: createdReservation as Reservation,
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

  // 월권 정기결제(배치) 등록 — 예약 직후 바로 카드 등록 창을 띄운다.
  async function subscribeSubmittedReservation() {
    if (!submittedReservation) return;
    setPaymentError("");
    setPaymentMessage("");
    setIsPaymentBusy(true);
    try {
      const result = await subscribeMonthly(submittedReservation.reservation);
      if (!result.ok) {
        setPaymentError(result.message);
        return;
      }
      setSubmittedReservation((current) => current ? {
        ...current,
        reservation: { ...current.reservation, payment_status: "paid", status: "confirmed" },
      } : current);
      setPaymentMessage(result.message);
    } finally {
      setIsPaymentBusy(false);
    }
  }

  async function paySubmittedReservation() {
    if (!submittedReservation) return;
    setPaymentError("");
    setPaymentMessage("");
    setIsPaymentBusy(true);
    try {
      const result = await payReservation(submittedReservation.reservation);
      if (!result.ok) {
        setPaymentError(result.message);
        return;
      }
      setSubmittedReservation((current) => current ? {
        ...current,
        reservation: { ...current.reservation, payment_status: "paid", status: "confirmed" },
      } : current);
      setPaymentMessage(result.message);
    } finally {
      setIsPaymentBusy(false);
    }
  }

  const groupedPasses = groupPasses(passes);
  const selectedPassInfo = passes.find((pass) => pass.name === form.pass_type) ?? null;
  const stepLabels = ["이용권", "날짜·시간", "정보·확인"];

  return (
    <main className="pb-28 sm:pb-12">
      <Section eyebrow="Reserve" title="예약" accent="yellow">
        <div className="mb-6 grid gap-3 border-y border-workroom-ink py-4 text-sm font-bold leading-6 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p>회원 전용 예약{SITE.booking.onlinePaymentLive ? " · 온라인 결제 완료 시 예약이 바로 확정됩니다." : " · 신청 후 운영자 확인을 거쳐 확정됩니다."}</p>
            <p className="mt-1 font-medium text-workroom-muted">
              {SITE.booking.onlinePaymentLive
                ? "예약 신청 후 카드 결제 → 자동확정·확정 문자 발송 · 현장 결제와 예외 예약은 관리자 확인 · 예약은 오늘부터 2개월 이내"
                : "예약 신청 후 관리자가 결제 링크를 보내드리거나 현장에서 결제(카드·현금) · 예약은 오늘부터 2개월 이내"}
            </p>
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
            {/* 이메일로 가입한 회원도 여기서 막히지 않도록 다른 경로를 남겨 둔다. */}
            <p className="mt-3 text-sm font-medium">
              <Link className="underline underline-offset-4" to={`/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`}>
                이메일로 로그인 / 회원가입
              </Link>
            </p>
            <p className="mt-4 text-xs font-medium text-workroom-muted">
              <a className="underline underline-offset-4" href="/#pricing">이용권·가격 먼저 보기 →</a>
            </p>
          </div>
        ) : needsProfile ? (
          <div className={`${card} p-6 text-center`}>
            <p className="text-lg font-bold">예약 전 회원정보를 완성해 주세요</p>
            <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
              이름·연락처와 개인정보 수집·이용 동의를 마치면 예약할 수 있어요. 처음 한 번만 입력하면 됩니다.
            </p>
            <Link
              className={buttonClass("primary", "lg", "mt-5 w-full sm:w-auto")}
              to={`/account?tab=profile&next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`}
            >
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
                  maxMonth={startOfMonth(new Date(`${maxBookable}T00:00:00`))}
                  onSelect={(date) => selectDate(date)}
                  onMonthChange={setCalendarMonth}
                  isDisabled={isDateDisabled}
                  disabledReason={dateDisabledReason}
                />
              </div>
              <div className="grid content-start gap-4">
                <label className="grid gap-1 text-sm font-bold">
                  인원
                  <span className="text-xs font-medium text-workroom-muted">잔여 좌석은 인원 기준으로 확인해요.</span>
                  <input min={1} max={12} required type="number" value={form.people} onChange={(event) => updateField("people", event.target.value)} />
                </label>

                {selectedDuration ? (
                  <fieldset className="grid gap-3">
                    <legend className="text-sm font-bold">시작 시간</legend>
                    {selectableStartTimes.length ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {selectableStartTimes.map((time) => {
                          const remaining = slotRemaining.get(time);
                          const people = Number(form.people) || 1;
                          const soldOut = remaining !== undefined && remaining < people;
                          const few = !soldOut && remaining !== undefined && remaining <= 2;
                          return (
                            <button
                              aria-pressed={form.start_time === time}
                              aria-label={soldOut ? `${time} 마감` : remaining !== undefined ? `${time} 잔여 ${remaining}석` : time}
                              className={`grid gap-0.5 rounded-[5px] border px-3 py-2.5 text-sm font-bold ${
                                soldOut
                                  ? "cursor-not-allowed border-workroom-line bg-workroom-background text-workroom-muted line-through"
                                  : form.start_time === time
                                    ? "border-workroom-ink bg-workroom-yellow"
                                    : "border-workroom-line bg-white hover:border-workroom-ink"
                              }`}
                              disabled={soldOut}
                              key={time}
                              onClick={() => updateStartTime(time)}
                              type="button"
                            >
                              <span>{time}</span>
                              {soldOut ? (
                                <span className="text-[10px] font-bold text-workroom-muted">마감</span>
                              ) : few ? (
                                <span className="text-[10px] font-bold text-red-600">{remaining}석 남음</span>
                              ) : null}
                            </button>
                          );
                        })}
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
              </div>
              {/* 온라인 결제 준비 전에는 어느 쪽을 골라도 '운영자 확인 후 결제'로 동일하다.
                  고를 이유가 없는 선택지를 없애고 안내 한 줄로 대체한다. */}
              {!SITE.booking.paymentEnabled ? (
                <div className="grid gap-2">
                  <p className="text-sm font-bold">결제 안내</p>
                  <p className="rounded-card border border-workroom-ink bg-workroom-yellow/50 p-3 text-xs font-bold leading-5">
                    {SITE.booking.paymentTestNotice}
                  </p>
                </div>
              ) : (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-bold">결제 방법</legend>
                {!SITE.booking.onlinePaymentLive ? (
                  <p className="rounded-card border border-workroom-ink bg-workroom-yellow/50 p-3 text-xs font-bold leading-5">
                    {SITE.booking.paymentTestNotice}
                  </p>
                ) : null}
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
                      <span className="block font-bold">신용카드 결제</span>
                      <span className="mt-1 block text-xs font-medium leading-5 text-workroom-muted">
                        {SITE.booking.onlinePaymentOptionHint}
                      </span>
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
                      <span className="block font-bold">현장 결제</span>
                      <span className="mt-1 block text-xs font-medium leading-5 text-workroom-muted">현장 결제(카드·현금)는 운영자가 확인한 뒤 예약을 확정합니다.</span>
                    </span>
                  </label>
                </div>
              </fieldset>
              )}
              <p className="text-xs font-medium leading-5 text-workroom-muted">
                촬영·단체·장기 이용 등 상담이 필요하면 <a className="font-bold underline underline-offset-4" href={`tel:${SITE.phone}`}>{SITE.phone}</a>로 문의해 주세요.
              </p>
              <Field label="요청사항 (선택)">
                <textarea
                  placeholder="방문 목적, 필요한 장비, 궁금한 점 (선택 입력)"
                  rows={5}
                  value={form.message}
                  onChange={(event) => updateField("message", event.target.value)}
                />
              </Field>

              {/* 구매 전 취소·환불 고지. 예전에는 결제가 끝난 뒤 완료 시트에서만
                  볼 수 있어, 결정하는 순간에는 규정을 알 수 없었다. */}
              <div className="rounded-card border border-workroom-line bg-workroom-background p-3">
                <p className="text-xs font-bold">취소·환불 안내</p>
                <p className="mt-1 text-xs font-medium leading-5 text-workroom-muted">{SITE.booking.cancellationSummary}</p>
                <Link className="mt-1 inline-block text-xs font-bold underline underline-offset-4" to="/faq">
                  자세한 이용·환불 규정 보기 →
                </Link>
              </div>
            </div>
          </fieldset>

          {/* Review summary on the final step */}
          {step === 3 ? (
            <div className={`${tintCard("yellow")} p-4`}>
              <p className="text-sm font-bold">예약 요약</p>
              <dl className="mt-3 grid grid-cols-[64px_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="font-bold text-workroom-muted">이용권</dt>
                <dd className="font-bold">{form.pass_type || "-"}</dd>
                {isLongTermPassName(form.pass_type) ? (
                  <>
                    <dt className="font-bold text-workroom-muted">이용 기간</dt>
                    <dd className="font-bold">
                      {form.date ? `${formatDate(form.date)} ~ ${formatDate(accessEndDate(form.date, form.pass_type, openWeekdays))}` : "-"}
                      <span className="ml-1 font-medium text-workroom-muted">(이용 {passUsableDays(form.pass_type, openWeekdays.length)}일)</span>
                    </dd>
                  </>
                ) : (
                  <>
                    <dt className="font-bold text-workroom-muted">날짜</dt>
                    <dd className="font-bold">{form.date ? formatDate(form.date) : "-"}</dd>
                    <dt className="font-bold text-workroom-muted">시간</dt>
                    <dd className="font-bold">
                      {form.start_time} - {form.end_time}
                    </dd>
                  </>
                )}
                <dt className="font-bold text-workroom-muted">금액</dt>
                <dd className="font-bold">
                  {selectedPassInfo?.price ? (
                    <>
                      {formatPrice(selectedPassInfo.price)}
                      <span className="ml-1 font-medium text-workroom-muted">/ 1인</span>
                      {Number(form.people) > 1 ? (
                        <span className="mt-0.5 block text-xs font-medium text-workroom-muted">
                          {form.people}명 · 총 {formatPrice(selectedPassInfo.price * Number(form.people))} · 인원 추가분은 확인 후 안내드려요
                        </span>
                      ) : null}
                    </>
                  ) : (
                    "확인 후 안내"
                  )}
                </dd>
                {SITE.booking.paymentEnabled ? (
                  <>
                    <dt className="font-bold text-workroom-muted">결제</dt>
                    <dd className="font-bold">{form.payment_preference === "online" ? "신용카드 결제" : "현장 결제(문의)"}</dd>
                  </>
                ) : null}
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
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={(event) => { if (event.target === event.currentTarget) setSuccess(false); }}
        >
          <div
            aria-labelledby="reserve-success-title"
            aria-modal="true"
            className={`${card} animate-sheet-up max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-b-none rounded-t-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-card sm:pb-6`}
            ref={successPanelRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-pill bg-workroom-line sm:hidden" />
            <p className="text-2xl font-bold" id="reserve-success-title">
              {submittedReservation?.reservation.payment_status === "paid" ? "예약이 확정되었습니다 🎉" : "예약 신청이 접수되었습니다"}
            </p>
            <p className="mt-2 text-sm font-medium leading-6 text-workroom-muted">
              {submittedReservation?.reservation.payment_status === "paid"
                ? "결제가 완료되어 예약이 바로 확정되었습니다. 확정 문자도 함께 발송됩니다."
                : SITE.booking.onlinePaymentLive && submittedReservation?.paymentPreference === "online" && (submittedReservation.price ?? 0) > 0
                  ? "아래에서 결제하면 예약이 바로 확정됩니다."
                  : "예약 신청이 접수되었습니다. 운영자 확인 후 결제 링크를 보내드리거나 현장에서 결제(카드·현금)로 확정됩니다."}
            </p>

            {submittedReservation ? (
              <div className={`${tintCard("yellow")} mt-5 p-4`}>
                <p className="text-sm font-bold">신청 내용</p>
                <dl className="mt-3 grid grid-cols-[74px_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="font-bold text-workroom-muted">이용권</dt>
                  <dd className="font-bold">{submittedReservation.passName}</dd>
                  {isLongTermPassName(submittedReservation.passName) ? (
                    <>
                      <dt className="font-bold text-workroom-muted">이용 기간</dt>
                      <dd className="font-bold">
                        {formatDate(submittedReservation.date)} ~ {formatDate(accessEndDate(submittedReservation.date, submittedReservation.passName, openWeekdays))}
                        <span className="ml-1 font-medium text-workroom-muted">(이용 {passUsableDays(submittedReservation.passName, openWeekdays.length)}일)</span>
                      </dd>
                    </>
                  ) : (
                    <>
                      <dt className="font-bold text-workroom-muted">날짜</dt>
                      <dd className="font-bold">{formatDate(submittedReservation.date)}</dd>
                      <dt className="font-bold text-workroom-muted">시간</dt>
                      <dd className="font-bold">
                        {submittedReservation.startTime} - {submittedReservation.endTime}
                      </dd>
                    </>
                  )}
                  <dt className="font-bold text-workroom-muted">인원</dt>
                  <dd className="font-bold">{submittedReservation.people}명</dd>
                  <dt className="font-bold text-workroom-muted">예약자</dt>
                  <dd className="font-bold">
                    {submittedReservation.name} · {submittedReservation.phone}
                  </dd>
                  <dt className="font-bold text-workroom-muted">금액</dt>
                  <dd className="font-bold">{submittedReservation.price ? formatPrice(submittedReservation.price) : "확인 후 안내"}</dd>
                  {SITE.booking.paymentEnabled ? (
                    <>
                      <dt className="font-bold text-workroom-muted">결제</dt>
                      <dd className="font-bold">{submittedReservation.paymentPreference === "online" ? "신용카드 결제" : "현장 결제(문의)"}</dd>
                    </>
                  ) : null}
                </dl>
              </div>
            ) : null}

            {paymentMessage ? <p className={`${tintCard("mint")} mt-4 p-3 text-sm font-bold`}>{paymentMessage}</p> : null}
            {paymentError ? <p className={`${tintCard("danger")} mt-4 p-3 text-sm font-bold`}>{paymentError}</p> : null}

            {/* 월권은 정기결제(배치) 창, 그 외는 일반 카드(인증) 결제창으로 바로 갈 수 있게 한다. */}
            {submittedReservation && canSubscribe(submittedReservation.reservation) ? (
              <button
                className={buttonClass("accent", "lg", "mt-6 w-full")}
                disabled={isPaymentBusy}
                onClick={() => void subscribeSubmittedReservation()}
                type="button"
              >
                {isPaymentBusy ? "카드 등록 중…" : `신용카드 정기결제 등록 · 매월 ${formatPrice(submittedReservation.price ?? 0)}`}
              </button>
            ) : null}
            {submittedReservation && canPayOnline(submittedReservation.reservation) ? (
              <button
                className={buttonClass(canSubscribe(submittedReservation.reservation) ? "secondary" : "accent", "lg", "mt-2 w-full")}
                disabled={isPaymentBusy}
                onClick={() => void paySubmittedReservation()}
                type="button"
              >
                {isPaymentBusy ? "결제 진행 중…" : `신용카드로 ${formatPrice(submittedReservation.price ?? 0)} 결제하기`}
              </button>
            ) : null}
            <Link
              className={buttonClass(submittedReservation?.reservation.payment_status === "paid" ? "primary" : "secondary", "lg", "mt-2 w-full")}
              to="/account?tab=reservations"
            >
              {submittedReservation?.reservation.payment_status === "paid" ? "확정된 예약 보기" : "예약현황에서 보기"}
            </Link>
            <button className={buttonClass("secondary", "md", "mt-2 w-full")} onClick={() => setSuccess(false)} type="button">
              닫기
            </button>

            {/* 안내는 접어 둔다 — 펼쳐 두면 다음 행동(예약현황·닫기)이 화면 밖으로 밀린다. */}
            {noticeItems.length ? (
              <details className="mt-5">
                <summary className="cursor-pointer text-sm font-bold">이용 안내 {noticeItems.length}가지</summary>
                <div className="mt-3 grid gap-3">
                  {noticeItems.map(([title, body]) => (
                    <div className={`${tintCard("mint")} p-3`} key={title}>
                      <p className="text-sm font-bold">{title}</p>
                      <p className="mt-1 text-sm font-medium leading-6">{body}</p>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
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
  // 0원 항목은 결제 심사에서 허용되지 않고 예약 흐름에도 맞지 않는다.
  // 촬영·모임·장기 이용 상담은 전화·문자 문의로 안내한다.
  const passOptions: PassOption[] = passes.map((pass) => ({
    ...pass,
    group: getPassGroup(pass.name),
  }));

  return (["시간권", "종일권", "주간 / 월권", "단체·기타"] as const)
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
  return "단체·기타";
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
