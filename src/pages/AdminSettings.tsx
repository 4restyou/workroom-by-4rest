import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import AdminPage, { AdminFeedback, AdminTabs } from "../components/AdminPage";
import MoneyInput from "../components/MoneyInput";
import { todayValue } from "../lib/format";
import { buttonClass, card, cardFlat, tintCard } from "../lib/ui";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import type { BusinessDateException, BusinessHour, Pass, SeatType, SpaceSetting } from "../lib/types";

const settingKeys = [
  "reservation_notice",
  "payment_notice",
  "cancellation_notice",
  "extension_notice",
  "etiquette_notice",
  "photo_notice",
  "relax_notice",
  "print_notice",
  "location_notice",
  "reservation_enabled",
] as const;
const settingLabels: Record<(typeof settingKeys)[number], string> = {
  reservation_notice: "예약 안내 문구",
  payment_notice: "결제 안내 문구",
  cancellation_notice: "취소/환불 안내 문구",
  extension_notice: "연장 안내 문구",
  etiquette_notice: "음식/통화/소리 안내 문구",
  photo_notice: "촬영 안내 문구",
  relax_notice: "릴렉스타임 안내 문구",
  print_notice: "프린트 안내 문구",
  location_notice: "위치 안내 문구",
  reservation_enabled: "예약 받기",
};

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];
type SettingsTab = "operation" | "products" | "guidance" | "checkin";

function settingsSnapshot(seats: SeatType[], passRows: Pass[], hours: BusinessHour[], values: Record<string, string>) {
  return JSON.stringify({ seats, passRows, hours, values });
}

export default function AdminSettings() {
  const navigate = useNavigate();
  const qrRef = useRef<HTMLDivElement>(null);
  const [locationMsg, setLocationMsg] = useState("");
  const [seatTypes, setSeatTypes] = useState<SeatType[]>([]);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([]);
  const [dateExceptions, setDateExceptions] = useState<BusinessDateException[]>([]);
  const [newException, setNewException] = useState<BusinessDateException>({
    date: todayValue(),
    open_time: "08:00",
    close_time: "01:00",
    is_closed: true,
    note: "",
  });
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [newSeatName, setNewSeatName] = useState("");
  const [newSeatCapacity, setNewSeatCapacity] = useState("1");
  const [newPassName, setNewPassName] = useState("");
  const [newPassPrice, setNewPassPrice] = useState("0");
  const [newPassSeatTypeId, setNewPassSeatTypeId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tab, setTab] = useState<SettingsTab>("operation");
  const [savedSnapshot, setSavedSnapshot] = useState("");

  useEffect(() => {
    async function checkAndLoad() {
      if (!supabase) {
        setError("Supabase 환경 변수가 아직 연결되지 않았습니다.");
        setIsLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate("/admin", { replace: true });
        return;
      }

      const profile = await getCurrentProfile();
      if (profile?.role !== "admin") {
        navigate("/account", { replace: true });
        return;
      }

      await loadSettings();
    }

    void checkAndLoad();
  }, [navigate]);

  async function loadSettings() {
    if (!supabase) return;
    setIsLoading(true);
    setError("");

    const [seatResult, passResult, hourResult, exceptionResult, settingResult] = await Promise.all([
      supabase.from("seat_types").select("*").order("sort_order", { ascending: true }),
      supabase.from("passes").select("id,name,description,price,seat_type_id,is_active,sort_order").order("sort_order", { ascending: true }),
      supabase.from("business_hours").select("*").order("weekday", { ascending: true }),
      supabase.from("business_date_exceptions").select("*").gte("date", todayValue()).order("date", { ascending: true }).limit(100),
      supabase.from("space_settings").select("*"),
    ]);

    setIsLoading(false);

    const firstError = seatResult.error ?? passResult.error ?? hourResult.error ?? exceptionResult.error ?? settingResult.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }

    const nextSeats = (seatResult.data ?? []) as SeatType[];
    const nextPasses = (passResult.data ?? []) as Pass[];
    const nextHours = (hourResult.data ?? []) as BusinessHour[];
    const nextSettings = Object.fromEntries(((settingResult.data ?? []) as SpaceSetting[]).map((setting) => [setting.key, setting.value]));
    setSeatTypes(nextSeats);
    setPasses(nextPasses);
    setBusinessHours(nextHours);
    setDateExceptions((exceptionResult.data ?? []) as BusinessDateException[]);
    setSettings(nextSettings);
    setSavedSnapshot(settingsSnapshot(nextSeats, nextPasses, nextHours, nextSettings));
  }

  async function saveAll() {
    if (!supabase) return;
    if (!window.confirm("좌석·이용권·운영시간 설정을 저장할까요?\n가격과 노출 여부 변경은 즉시 예약 화면에 반영됩니다.")) return;
    setIsSaving(true);
    setError("");
    setSuccess("");

    const [seatResult, passResult, hourResult, settingResult] = await Promise.all([
      supabase.from("seat_types").upsert(
        seatTypes.map((seatType) => ({
          id: seatType.id,
          name: seatType.name.trim(),
          capacity: Number(seatType.capacity),
          is_active: seatType.is_active,
          sort_order: Number(seatType.sort_order),
        })),
      ),
      supabase.from("passes").upsert(
        passes.map((pass) => ({
          id: pass.id,
          name: pass.name.trim(),
          description: pass.description ?? "",
          price: Number(pass.price),
          seat_type_id: pass.seat_type_id || null,
          is_active: pass.is_active ?? true,
          sort_order: Number(pass.sort_order ?? 0),
        })),
      ),
      supabase.from("business_hours").upsert(
        businessHours.map((hour) => ({
          id: hour.id,
          weekday: hour.weekday,
          open_time: hour.open_time,
          close_time: hour.close_time,
          is_closed: hour.is_closed,
        })),
        { onConflict: "weekday" },
      ),
      supabase.from("space_settings").upsert(
        [
          ...settingKeys.map((key) => ({ key, value: settings[key] ?? "" })),
          { key: "attendance_stamp_goal", value: settings["attendance_stamp_goal"] ?? "10" },
          { key: "attendance_reward_label", value: settings["attendance_reward_label"] ?? "" },
          { key: "attendance_lat", value: settings["attendance_lat"] ?? "" },
          { key: "attendance_lng", value: settings["attendance_lng"] ?? "" },
          { key: "attendance_radius_m", value: settings["attendance_radius_m"] ?? "150" },
        ],
        { onConflict: "key" },
      ),
    ]);

    setIsSaving(false);

    const firstError = seatResult.error ?? passResult.error ?? hourResult.error ?? settingResult.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }

    setSuccess("운영 설정을 저장했습니다.");
    await loadSettings();
  }

  async function addSeatType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !newSeatName.trim()) return;

    const { error: insertError } = await supabase.from("seat_types").insert({
      name: newSeatName.trim(),
      capacity: Number(newSeatCapacity),
      sort_order: seatTypes.length + 1,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewSeatName("");
    setNewSeatCapacity("1");
    await loadSettings();
  }

  async function addPass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !newPassName.trim()) return;

    const { error: insertError } = await supabase.from("passes").insert({
      name: newPassName.trim(),
      description: "새 이용권",
      price: Number(newPassPrice),
      seat_type_id: newPassSeatTypeId || null,
      sort_order: passes.length + 1,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewPassName("");
    setNewPassPrice("0");
    setNewPassSeatTypeId("");
    await loadSettings();
  }

  async function deleteSeatType(id: string, name: string) {
    if (!supabase) return;
    if (!window.confirm(`'${name}' 좌석 유형을 삭제할까요? 연결된 이용권은 좌석 미지정으로 바뀝니다.`)) return;
    const { error: deleteError } = await supabase.from("seat_types").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await loadSettings();
  }

  async function deletePass(id: string, name: string) {
    if (!supabase) return;
    if (!window.confirm(`'${name}' 이용권을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.`)) return;
    const { error: deleteError } = await supabase.from("passes").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await loadSettings();
  }

  async function saveDateException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !newException.date) return;
    setError("");
    const { error: upsertError } = await supabase.from("business_date_exceptions").upsert({
      date: newException.date,
      open_time: newException.open_time,
      close_time: newException.close_time,
      is_closed: newException.is_closed,
      note: newException.note?.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "date" });
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setSuccess(`${newException.date} 예외 일정을 저장했습니다.`);
    await loadSettings();
  }

  async function deleteDateException(date: string) {
    if (!supabase || !window.confirm(`${date} 예외 일정을 삭제하고 정기 운영시간을 적용할까요?`)) return;
    const { error: deleteError } = await supabase.from("business_date_exceptions").delete().eq("date", date);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setDateExceptions((current) => current.filter((item) => item.date !== date));
    setSuccess("예외 일정을 삭제했습니다.");
  }

  const hasChanges = Boolean(savedSnapshot && savedSnapshot !== settingsSnapshot(seatTypes, passes, businessHours, settings));

  return (
    <AdminPage
      actions={<><Link className={buttonClass("secondary", "md")} to="/admin/stats">매출·통계</Link><button className={buttonClass(hasChanges ? "accent" : "secondary", "md")} disabled={isSaving || !hasChanges} onClick={saveAll} type="button">{isSaving ? "저장 중" : "변경사항 저장"}</button></>}
      description="자주 바꾸는 운영시간과 휴무일, 가격, 안내, 출석 설정을 나누어 관리합니다."
      title="설정"
    >
      <div className="admin-compact">

        {isLoading ? <p className={`${tintCard("yellow")} p-4 font-bold`}>운영 설정을 불러오는 중입니다.</p> : null}
        <AdminFeedback error={error} success={success} />

        <div className="mb-5 border-y border-workroom-line bg-white px-3 pt-1">
          <AdminTabs items={[{ value: "operation", label: "운영시간·휴무" }, { value: "products", label: "좌석·이용권" }, { value: "guidance", label: "예약·안내" }, { value: "checkin", label: "출석·QR" }]} onChange={setTab} value={tab} />
        </div>

        <div className="grid gap-5">
          {tab === "products" ? <>
          <section className={`${card} p-5`}>
            <h2 className="text-xl font-bold">좌석 유형</h2>
            <p className="mt-1 text-sm font-medium text-workroom-muted">
              예약 정원 계산에 사용합니다. 화살표로 예약 화면의 표시 순서를 바꿀 수 있습니다.
            </p>
            <div className="mt-4 grid gap-3">
              {seatTypes.map((seatType, index) => (
                <div className={`grid gap-3 ${cardFlat} p-4 sm:grid-cols-[1fr_110px_110px_auto_auto] sm:items-end`} key={seatType.id}>
                  <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                    좌석 이름
                    <input value={seatType.name} onChange={(event) => updateSeatType(index, "name", event.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                    정원(명)
                    <input min={0} type="number" value={seatType.capacity} onChange={(event) => updateSeatType(index, "capacity", Number(event.target.value))} />
                  </label>
                  <div className="grid gap-1"><span className="text-xs font-bold text-workroom-muted">순서</span><div className="flex gap-1"><button aria-label="위로" className={buttonClass("secondary", "sm", "!px-3 sm:h-[42px]")} disabled={index === 0} onClick={() => moveSeat(index, -1)} type="button">↑</button><button aria-label="아래로" className={buttonClass("secondary", "sm", "!px-3 sm:h-[42px]")} disabled={index === seatTypes.length - 1} onClick={() => moveSeat(index, 1)} type="button">↓</button></div></div>
                  <label className="flex items-center gap-2 text-sm font-bold sm:h-12">
                    <input checked={seatType.is_active} className="h-5 w-5" type="checkbox" onChange={(event) => updateSeatType(index, "is_active", event.target.checked)} />
                    노출
                  </label>
                  <button className={buttonClass("secondary", "sm", "sm:h-12")} onClick={() => void deleteSeatType(seatType.id, seatType.name)} type="button">
                    삭제
                  </button>
                </div>
              ))}
            </div>
            <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end" onSubmit={addSeatType}>
              <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                새 좌석 이름
                <input placeholder="예: 단독석" value={newSeatName} onChange={(event) => setNewSeatName(event.target.value)} />
              </label>
              <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                정원(명)
                <input min={0} type="number" value={newSeatCapacity} onChange={(event) => setNewSeatCapacity(event.target.value)} />
              </label>
              <button className={buttonClass("primary", "md", "sm:h-12")} type="submit">
                좌석 추가
              </button>
            </form>
          </section>
          <section className={`${card} p-5`}>
            <h2 className="text-xl font-bold">이용권 / 가격</h2>
            <p className="mt-1 text-sm font-medium text-workroom-muted">
              이름, 설명, 가격과 연결 좌석을 관리합니다. 화살표로 예약 화면의 표시 순서를 바꿀 수 있습니다.
            </p>
            <div className="mt-4 grid gap-3">
              {passes.map((pass, index) => (
                <div className={`grid gap-3 ${cardFlat} p-4 lg:grid-cols-[1fr_1.3fr_120px_140px_80px_auto_auto] lg:items-end`} key={pass.id}>
                  <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                    이용권 이름
                    <input value={pass.name} onChange={(event) => updatePass(index, "name", event.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                    설명
                    <input value={pass.description ?? ""} onChange={(event) => updatePass(index, "description", event.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                    가격(원)
                    <MoneyInput value={pass.price} onChange={(value) => updatePass(index, "price", value)} />
                  </label>
                  <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                    좌석
                    <select value={pass.seat_type_id ?? ""} onChange={(event) => updatePass(index, "seat_type_id", event.target.value || null)}>
                      <option value="">좌석 미지정</option>
                      {seatTypes.map((seatType) => (
                        <option key={seatType.id} value={seatType.id}>
                          {seatType.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-1"><span className="text-xs font-bold text-workroom-muted">순서</span><div className="flex gap-1"><button aria-label="위로" className={buttonClass("secondary", "sm", "!px-3 lg:h-[42px]")} disabled={index === 0} onClick={() => movePass(index, -1)} type="button">↑</button><button aria-label="아래로" className={buttonClass("secondary", "sm", "!px-3 lg:h-[42px]")} disabled={index === passes.length - 1} onClick={() => movePass(index, 1)} type="button">↓</button></div></div>
                  <label className="flex items-center gap-2 text-sm font-bold lg:h-12">
                    <input checked={pass.is_active ?? true} className="h-5 w-5" type="checkbox" onChange={(event) => updatePass(index, "is_active", event.target.checked)} />
                    노출
                  </label>
                  <button className={buttonClass("secondary", "sm", "lg:h-12")} onClick={() => void deletePass(pass.id, pass.name)} type="button">
                    삭제
                  </button>
                </div>
              ))}
            </div>
            <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_180px_auto] sm:items-end" onSubmit={addPass}>
              <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                새 이용권 이름
                <input placeholder="예: 3시간권" value={newPassName} onChange={(event) => setNewPassName(event.target.value)} />
              </label>
              <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                가격(원)
                <MoneyInput value={Number(newPassPrice) || 0} onChange={(value) => setNewPassPrice(String(value))} />
              </label>
              <label className="grid gap-1 text-xs font-bold text-workroom-muted">
                좌석
                <select value={newPassSeatTypeId} onChange={(event) => setNewPassSeatTypeId(event.target.value)}>
                  <option value="">좌석 미지정</option>
                  {seatTypes.map((seatType) => (
                    <option key={seatType.id} value={seatType.id}>
                      {seatType.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className={buttonClass("primary", "md", "sm:h-12")} type="submit">
                이용권 추가
              </button>
            </form>
          </section>
          </> : null}

          {tab === "operation" ? <>
          <section className={`${card} p-5`}>
            <h2 className="text-xl font-bold">운영 시간</h2>
            <div className="mt-4 grid gap-3">
              {businessHours.map((hour, index) => (
                <div className={`grid gap-3 ${cardFlat} p-4 sm:grid-cols-[80px_1fr_1fr_110px]`} key={hour.id}>
                  <p className="self-center font-bold">{weekdayLabels[hour.weekday]}</p>
                  <input type="time" value={hour.open_time.slice(0, 5)} onChange={(event) => updateBusinessHour(index, "open_time", event.target.value)} />
                  <input type="time" value={hour.close_time.slice(0, 5)} onChange={(event) => updateBusinessHour(index, "close_time", event.target.value)} />
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input checked={hour.is_closed} className="h-5 w-5" type="checkbox" onChange={(event) => updateBusinessHour(index, "is_closed", event.target.checked)} />
                    휴무
                  </label>
                </div>
              ))}
            </div>
          </section>
          <section className={`${card} p-5`}>
            <h2 className="text-xl font-bold">특정일 휴무 · 단축영업</h2>
            <p className="mt-1 text-sm font-medium text-workroom-muted">공휴일이나 임시 휴무처럼 정기 운영시간과 다른 날짜만 등록합니다. 등록 즉시 예약 달력과 서버 검증에 적용됩니다.</p>
            <form className={`mt-4 grid gap-3 ${cardFlat} p-4 lg:grid-cols-[160px_120px_120px_100px_1fr_auto] lg:items-end`} onSubmit={saveDateException}>
              <label className="grid gap-1 text-xs font-bold text-workroom-muted">날짜<input required type="date" value={newException.date} onChange={(event) => setNewException((current) => ({ ...current, date: event.target.value }))} /></label>
              <label className="grid gap-1 text-xs font-bold text-workroom-muted">시작<input disabled={newException.is_closed} required={!newException.is_closed} type="time" value={newException.open_time.slice(0, 5)} onChange={(event) => setNewException((current) => ({ ...current, open_time: event.target.value }))} /></label>
              <label className="grid gap-1 text-xs font-bold text-workroom-muted">종료<input disabled={newException.is_closed} required={!newException.is_closed} type="time" value={newException.close_time.slice(0, 5)} onChange={(event) => setNewException((current) => ({ ...current, close_time: event.target.value }))} /></label>
              <label className="flex h-12 items-center gap-2 text-sm font-bold"><input checked={newException.is_closed} className="h-5 w-5" type="checkbox" onChange={(event) => setNewException((current) => ({ ...current, is_closed: event.target.checked }))} />휴무</label>
              <label className="grid gap-1 text-xs font-bold text-workroom-muted">메모<input placeholder="예: 공사, 공휴일" value={newException.note ?? ""} onChange={(event) => setNewException((current) => ({ ...current, note: event.target.value }))} /></label>
              <button className={buttonClass("primary", "md", "lg:h-12")} type="submit">저장</button>
            </form>
            <div className="mt-3 grid gap-2">
              {dateExceptions.map((exception) => (
                <div className={`${cardFlat} flex flex-wrap items-center justify-between gap-3 p-4`} key={exception.date}>
                  <div>
                    <p className="font-black">{exception.date} · {exception.is_closed ? "휴무" : `${exception.open_time.slice(0, 5)}–${exception.close_time.slice(0, 5)}`}</p>
                    {exception.note ? <p className="mt-1 text-xs font-medium text-workroom-muted">{exception.note}</p> : null}
                  </div>
                  <div className="flex gap-2">
                    <button className={buttonClass("secondary", "sm")} onClick={() => setNewException(exception)} type="button">수정</button>
                    <button className={buttonClass("secondary", "sm")} onClick={() => void deleteDateException(exception.date)} type="button">삭제</button>
                  </div>
                </div>
              ))}
              {!dateExceptions.length ? <p className={`${cardFlat} p-4 text-sm text-workroom-muted`}>등록된 예정 예외 일정이 없습니다.</p> : null}
            </div>
          </section>
          </> : null}

          {tab === "guidance" ? (
          <section className={`${card} p-5`}>
            <h2 className="text-xl font-bold">운영 안내</h2>
            <div className="mt-4 grid gap-4">
              <label className={`flex items-center justify-between gap-3 ${cardFlat} p-4`}>
                <span className="text-sm font-bold">
                  예약 받기
                  <span className="mt-1 block text-xs font-medium text-workroom-muted">끄면 예약 페이지에서 신청을 받지 않습니다.</span>
                </span>
                <input
                  type="checkbox"
                  className="h-6 w-6 shrink-0 accent-black"
                  checked={settings["reservation_enabled"] !== "false"}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, reservation_enabled: event.target.checked ? "true" : "false" }))
                  }
                />
              </label>
              {settingKeys
                .filter((key) => key !== "reservation_enabled")
                .map((key) => (
                  <label className="grid gap-2 text-sm font-bold" key={key}>
                    {settingLabels[key]}
                    <textarea rows={3} value={settings[key] ?? ""} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))} />
                  </label>
                ))}
            </div>
          </section>
          ) : null}

          {tab === "checkin" ? (
          <section className={`${card} p-5`}>
            <h2 className="text-xl font-bold">출근부 (QR 출근)</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold">
                스탬프 목표 (칸 수)
                <input
                  type="number"
                  min={1}
                  value={settings["attendance_stamp_goal"] ?? "10"}
                  onChange={(event) => setSettings((current) => ({ ...current, attendance_stamp_goal: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                보상 문구 (카드 완성 시)
                <input
                  placeholder="예: 음료 1잔 무료"
                  value={settings["attendance_reward_label"] ?? ""}
                  onChange={(event) => setSettings((current) => ({ ...current, attendance_reward_label: event.target.value }))}
                />
              </label>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
              <div ref={qrRef} className="w-fit rounded-card border border-workroom-ink bg-white p-3">
                {settings["attendance_qr_token"] ? (
                  <QRCodeSVG value={`${window.location.origin}/checkin?t=${settings["attendance_qr_token"]}`} size={150} marginSize={2} />
                ) : (
                  <p className="grid h-[150px] w-[150px] place-items-center text-sm font-bold text-workroom-muted">토큰 없음</p>
                )}
              </div>
              <div className="grid gap-2">
                <p className="text-sm font-medium leading-6 text-workroom-muted">
                  이 QR을 출력해 매장에 붙이세요. 회원이 스캔하면 출근 도장이 찍혀요. (오늘 확정 예약자만 출근 가능)
                </p>
                <div className="flex flex-wrap gap-2">
                  <button className={buttonClass("accent", "sm")} disabled={!settings["attendance_qr_token"]} onClick={downloadQrSvg} type="button">
                    SVG로 저장
                  </button>
                  <button className={buttonClass("secondary", "sm")} onClick={() => void regenerateToken()} type="button">
                    QR 재발급
                  </button>
                </div>
                <p className="text-xs font-medium text-workroom-muted">SVG는 벡터라 크게 인쇄해도 안 깨져요. 재발급하면 기존 QR은 무효가 됩니다. (목표·보상은 ‘변경사항 저장’으로 적용)</p>
              </div>
            </div>

            <div className="mt-6 border-t-2 border-workroom-line pt-5">
              <p className="text-sm font-black">위치 제한 (선택)</p>
              <p className="mt-1 text-xs font-medium leading-6 text-workroom-muted">
                매장 좌표를 설정하면 그 반경 안에서만 출근할 수 있어요. 비워두면 위치 제한 없이 QR만 사용해요. 위치는 출근 확인에만 쓰고 저장하지 않아요.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="grid gap-2 text-sm font-bold">
                  위도(lat)
                  <input
                    value={settings["attendance_lat"] ?? ""}
                    onChange={(event) => setSettings((current) => ({ ...current, attendance_lat: event.target.value }))}
                    placeholder="예: 35.1487"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  경도(lng)
                  <input
                    value={settings["attendance_lng"] ?? ""}
                    onChange={(event) => setSettings((current) => ({ ...current, attendance_lng: event.target.value }))}
                    placeholder="예: 126.9156"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  허용 반경(m)
                  <input
                    type="number"
                    min={20}
                    value={settings["attendance_radius_m"] ?? "150"}
                    onChange={(event) => setSettings((current) => ({ ...current, attendance_radius_m: event.target.value }))}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className={buttonClass("secondary", "sm")} onClick={captureLocation} type="button">
                  현재 위치로 설정
                </button>
                <button
                  className={buttonClass("secondary", "sm")}
                  onClick={() => setSettings((current) => ({ ...current, attendance_lat: "", attendance_lng: "" }))}
                  type="button"
                >
                  위치 제한 끄기
                </button>
              </div>
              {locationMsg ? <p className="mt-2 text-xs font-bold text-workroom-muted">{locationMsg}</p> : null}
              <p className="mt-2 text-xs font-medium text-workroom-muted">‘현재 위치로 설정’은 매장에서 눌러주세요. 설정 후 ‘변경사항 저장’을 눌러야 적용돼요.</p>
            </div>
          </section>
          ) : null}
        </div>
        {hasChanges ? <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-20 mt-5 flex items-center justify-between gap-3 border border-workroom-ink bg-workroom-yellow px-4 py-3 sm:bottom-4"><p className="text-sm font-semibold">저장하지 않은 변경사항이 있습니다.</p><button className={buttonClass("primary", "sm")} disabled={isSaving} onClick={saveAll} type="button">저장</button></div> : null}
      </div>
    </AdminPage>
  );

  function downloadQrSvg() {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${source}`], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "workroom-checkin-qr.svg";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function captureLocation() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationMsg("이 기기에서 위치를 가져올 수 없어요.");
      return;
    }
    setLocationMsg("위치 확인 중…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSettings((current) => ({
          ...current,
          attendance_lat: position.coords.latitude.toFixed(6),
          attendance_lng: position.coords.longitude.toFixed(6),
        }));
        setLocationMsg("현재 위치를 입력했어요. ‘변경사항 저장’을 눌러 적용하세요.");
      },
      () => setLocationMsg("위치 권한이 거부됐어요."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function regenerateToken() {
    if (!supabase) return;
    if (!window.confirm("QR 토큰을 재생성할까요?\n매장에 붙어 있는 기존 QR은 즉시 사용할 수 없게 되며, 새 QR로 교체해야 합니다.")) return;
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error: tokenError } = await supabase.from("space_settings").upsert({ key: "attendance_qr_token", value: token }, { onConflict: "key" });
    if (tokenError) {
      setError(tokenError.message);
      return;
    }
    setSettings((current) => ({ ...current, attendance_qr_token: token }));
  }

  function updateSeatType<K extends keyof SeatType>(index: number, key: K, value: SeatType[K]) {
    setSeatTypes((current) => current.map((seatType, itemIndex) => (itemIndex === index ? { ...seatType, [key]: value } : seatType)));
  }

  function updatePass<K extends keyof Pass>(index: number, key: K, value: Pass[K]) {
    setPasses((current) => current.map((pass, itemIndex) => (itemIndex === index ? { ...pass, [key]: value } : pass)));
  }

  function updateBusinessHour<K extends keyof BusinessHour>(index: number, key: K, value: BusinessHour[K]) {
    setBusinessHours((current) => current.map((hour, itemIndex) => (itemIndex === index ? { ...hour, [key]: value } : hour)));
  }

  function moveSeat(index: number, direction: -1 | 1) {
    setSeatTypes((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, itemIndex) => ({ ...item, sort_order: itemIndex + 1 }));
    });
  }

  function movePass(index: number, direction: -1 | 1) {
    setPasses((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, itemIndex) => ({ ...item, sort_order: itemIndex + 1 }));
    });
  }
}
