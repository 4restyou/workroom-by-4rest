import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Section from "../components/Section";
import { buttonClass, card, cardFlat, tintCard } from "../lib/ui";
import { getCurrentProfile } from "../lib/profiles";
import { supabase } from "../lib/supabase";
import type { BusinessHour, Pass, SeatType, SpaceSetting } from "../lib/types";

const settingKeys = [
  "reservation_notice",
  "payment_notice",
  "cancellation_notice",
  "extension_notice",
  "etiquette_notice",
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
  print_notice: "프린트 안내 문구",
  location_notice: "위치 안내 문구",
  reservation_enabled: "예약 가능 여부(true/false)",
};

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export default function AdminSettings() {
  const navigate = useNavigate();
  const [seatTypes, setSeatTypes] = useState<SeatType[]>([]);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([]);
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

    const [seatResult, passResult, hourResult, settingResult] = await Promise.all([
      supabase.from("seat_types").select("*").order("sort_order", { ascending: true }),
      supabase.from("passes").select("id,name,description,price,seat_type_id,is_active,sort_order").order("sort_order", { ascending: true }),
      supabase.from("business_hours").select("*").order("weekday", { ascending: true }),
      supabase.from("space_settings").select("*"),
    ]);

    setIsLoading(false);

    const firstError = seatResult.error ?? passResult.error ?? hourResult.error ?? settingResult.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }

    setSeatTypes((seatResult.data ?? []) as SeatType[]);
    setPasses((passResult.data ?? []) as Pass[]);
    setBusinessHours((hourResult.data ?? []) as BusinessHour[]);
    setSettings(Object.fromEntries(((settingResult.data ?? []) as SpaceSetting[]).map((setting) => [setting.key, setting.value])));
  }

  async function saveAll() {
    if (!supabase) return;
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
        settingKeys.map((key) => ({
          key,
          value: settings[key] ?? "",
        })),
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

  return (
    <main className="pb-12">
      <Section accent="ink" eyebrow="Admin" title="운영 설정">
        <div className="mb-5 flex flex-wrap gap-3">
          <button className={buttonClass("accent", "md")} disabled={isSaving} onClick={saveAll} type="button">
            {isSaving ? "저장 중" : "전체 저장"}
          </button>
          <button className={buttonClass("secondary", "md")} onClick={loadSettings} type="button">
            새로고침
          </button>
          <Link className={buttonClass("secondary", "md")} to="/admin/reservations">
            예약관리
          </Link>
        </div>

        {isLoading ? <p className={`${tintCard("yellow")} p-4 font-bold`}>운영 설정을 불러오는 중입니다.</p> : null}
        {error ? <p className={`mb-4 ${tintCard("danger")} p-4 text-sm font-bold`}>{error}</p> : null}
        {success ? <p className={`mb-4 ${tintCard("mint")} p-4 text-sm font-bold`}>{success}</p> : null}

        <div className="grid gap-5">
          <section className={`${card} p-5`}>
            <h2 className="text-xl font-black">좌석 유형</h2>
            <div className="mt-4 grid gap-3">
              {seatTypes.map((seatType, index) => (
                <div className={`grid gap-3 ${cardFlat} p-4 sm:grid-cols-[1fr_120px_110px_100px]`} key={seatType.id}>
                  <input value={seatType.name} onChange={(event) => updateSeatType(index, "name", event.target.value)} />
                  <input min={0} type="number" value={seatType.capacity} onChange={(event) => updateSeatType(index, "capacity", Number(event.target.value))} />
                  <input min={0} type="number" value={seatType.sort_order} onChange={(event) => updateSeatType(index, "sort_order", Number(event.target.value))} />
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input checked={seatType.is_active} className="h-5 w-5" type="checkbox" onChange={(event) => updateSeatType(index, "is_active", event.target.checked)} />
                    노출
                  </label>
                </div>
              ))}
            </div>
            <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_auto]" onSubmit={addSeatType}>
              <input placeholder="새 좌석 유형" value={newSeatName} onChange={(event) => setNewSeatName(event.target.value)} />
              <input min={0} type="number" value={newSeatCapacity} onChange={(event) => setNewSeatCapacity(event.target.value)} />
              <button className={buttonClass("primary", "md")} type="submit">
                좌석 추가
              </button>
            </form>
          </section>

          <section className={`${card} p-5`}>
            <h2 className="text-xl font-black">이용권 / 가격</h2>
            <div className="mt-4 grid gap-3">
              {passes.map((pass, index) => (
                <div className={`grid gap-3 ${cardFlat} p-4 lg:grid-cols-[1fr_1.3fr_130px_150px_90px_90px]`} key={pass.id}>
                  <input value={pass.name} onChange={(event) => updatePass(index, "name", event.target.value)} />
                  <input value={pass.description ?? ""} onChange={(event) => updatePass(index, "description", event.target.value)} />
                  <input min={0} type="number" value={pass.price} onChange={(event) => updatePass(index, "price", Number(event.target.value))} />
                  <select value={pass.seat_type_id ?? ""} onChange={(event) => updatePass(index, "seat_type_id", event.target.value || null)}>
                    <option value="">좌석 미지정</option>
                    {seatTypes.map((seatType) => (
                      <option key={seatType.id} value={seatType.id}>
                        {seatType.name}
                      </option>
                    ))}
                  </select>
                  <input min={0} type="number" value={pass.sort_order ?? 0} onChange={(event) => updatePass(index, "sort_order", Number(event.target.value))} />
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input checked={pass.is_active ?? true} className="h-5 w-5" type="checkbox" onChange={(event) => updatePass(index, "is_active", event.target.checked)} />
                    노출
                  </label>
                </div>
              ))}
            </div>
            <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_180px_auto]" onSubmit={addPass}>
              <input placeholder="새 이용권 이름" value={newPassName} onChange={(event) => setNewPassName(event.target.value)} />
              <input min={0} type="number" value={newPassPrice} onChange={(event) => setNewPassPrice(event.target.value)} />
              <select value={newPassSeatTypeId} onChange={(event) => setNewPassSeatTypeId(event.target.value)}>
                <option value="">좌석 미지정</option>
                {seatTypes.map((seatType) => (
                  <option key={seatType.id} value={seatType.id}>
                    {seatType.name}
                  </option>
                ))}
              </select>
              <button className={buttonClass("primary", "md")} type="submit">
                이용권 추가
              </button>
            </form>
          </section>

          <section className={`${card} p-5`}>
            <h2 className="text-xl font-black">운영 시간</h2>
            <div className="mt-4 grid gap-3">
              {businessHours.map((hour, index) => (
                <div className={`grid gap-3 ${cardFlat} p-4 sm:grid-cols-[80px_1fr_1fr_110px]`} key={hour.id}>
                  <p className="self-center font-black">{weekdayLabels[hour.weekday]}</p>
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
            <h2 className="text-xl font-black">운영 안내</h2>
            <div className="mt-4 grid gap-4">
              {settingKeys.map((key) => (
                <label className="grid gap-2 text-sm font-black" key={key}>
                  {settingLabels[key]}
                  <textarea rows={key === "reservation_enabled" ? 1 : 3} value={settings[key] ?? ""} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))} />
                </label>
              ))}
            </div>
          </section>
        </div>
      </Section>
    </main>
  );

  function updateSeatType<K extends keyof SeatType>(index: number, key: K, value: SeatType[K]) {
    setSeatTypes((current) => current.map((seatType, itemIndex) => (itemIndex === index ? { ...seatType, [key]: value } : seatType)));
  }

  function updatePass<K extends keyof Pass>(index: number, key: K, value: Pass[K]) {
    setPasses((current) => current.map((pass, itemIndex) => (itemIndex === index ? { ...pass, [key]: value } : pass)));
  }

  function updateBusinessHour<K extends keyof BusinessHour>(index: number, key: K, value: BusinessHour[K]) {
    setBusinessHours((current) => current.map((hour, itemIndex) => (itemIndex === index ? { ...hour, [key]: value } : hour)));
  }
}
