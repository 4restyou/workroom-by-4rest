import { useState, type FormEvent } from "react";
import { todayValue } from "../../lib/format";
import { paymentStatusLabels, paymentStatusOptions } from "../../lib/adminReservations";
import { buttonClass, tintCard } from "../../lib/ui";
import { supabase } from "../../lib/supabase";
import type { PaymentStatus, Pass, ReservationInsert } from "../../lib/types";

// 같은 연락처를 가진 회원을 찾는다(숫자만 비교). 없으면 null.
async function findProfileIdByPhone(phone: string): Promise<string | null> {
  if (!supabase) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  const { data } = await supabase.from("profiles").select("id,phone").eq("role", "user").limit(200);
  const match = (data ?? []).find((row) => (row.phone ?? "").replace(/\D/g, "") === digits);
  return match?.id ?? null;
}

export default function ManualReservationForm({ passes, onSubmit }: { passes: Pass[]; onSubmit: (payload: ReservationInsert) => void }) {
  const [draft, setDraft] = useState({
    name: "",
    phone: "",
    email: "",
    pass_type: "",
    date: todayValue(),
    start_time: "08:00",
    end_time: "11:00",
    people: 1,
    message: "",
    status: "confirmed" as "pending" | "confirmed",
    payment_preference: "onsite" as "online" | "onsite",
    payment_status: "unpaid" as PaymentStatus,
  });

  const selectedPass = passes.find((item) => item.name === draft.pass_type) ?? null;
  const minPeople = Math.max(1, selectedPass?.min_people ?? 1);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.phone.trim() || !draft.pass_type) return;
    if ((Number(draft.people) || 1) < minPeople) return;
    const pass = passes.find((item) => item.name === draft.pass_type);
    // 전화·워크인 예약도 회원과 연결해 둔다. 연결이 없으면 입퇴실 화면에서
    // 입실 버튼이 나오지 않아(출석은 회원 단위로 기록된다) 하루 종일
    // '미입실'로 남는다. 번호가 같은 회원이 있으면 자동으로 이어 붙인다.
    const linkedProfileId = await findProfileIdByPhone(draft.phone.trim());
    onSubmit({
      profile_id: linkedProfileId,
      pass_id: pass?.id ?? null,
      pass_name_snapshot: pass?.name ?? draft.pass_type,
      // 금액은 서버 트리거가 1인 요금 x 인원으로 확정한다(0043). 여기서 보내는 값은 무시된다.
      price_at_booking: pass ? pass.price * (Number(draft.people) || 1) : null,
      seat_type_id: pass?.seat_type_id ?? null,
      payment_preference: draft.payment_preference,
      payment_method: draft.payment_status === "service" ? "서비스" : draft.payment_preference === "onsite" ? "현장결제" : null,
      payment_status: draft.payment_status,
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim() || null,
      pass_type: draft.pass_type,
      date: draft.date,
      start_time: draft.start_time,
      end_time: draft.end_time,
      people: Number(draft.people),
      message: draft.message.trim(),
      status: draft.status,
    });
  }

  return (
    <form className={`${tintCard("sky")} mb-5 grid gap-4 p-5`} onSubmit={submit}>
      <div>
        <h2 className="text-lg font-black">관리자 예약 등록</h2>
        <p className="mt-1 text-xs font-medium text-workroom-muted">전화 예약이나 현장 방문 예약을 등록합니다.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">이름
          <input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">연락처
          <input required value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">이메일
          <input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">이용권
          <select required value={draft.pass_type} onChange={(event) => {
            const nextMin = Math.max(1, passes.find((item) => item.name === event.target.value)?.min_people ?? 1);
            setDraft((current) => ({ ...current, pass_type: event.target.value, people: Math.max(current.people, nextMin) }));
          }}>
            <option value="">선택</option>
            {passes.map((pass) => <option key={pass.id} value={pass.name}>{pass.name}</option>)}
            <option value="기타 문의">기타 문의</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">날짜
          <input required type="date" value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">시작
          <input required type="time" value={draft.start_time} onChange={(event) => setDraft((current) => ({ ...current, start_time: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">종료
          <input required type="time" value={draft.end_time} onChange={(event) => setDraft((current) => ({ ...current, end_time: event.target.value }))} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">인원
          <input min={minPeople} max={12} required type="number" value={draft.people} onChange={(event) => setDraft((current) => ({ ...current, people: Number(event.target.value) }))} />
          {/* 금액은 서버가 1인 요금 x 인원으로 정한다(0043). 등록 전에 총액을 보여 준다. */}
          <span className="text-[11px] font-medium text-workroom-muted">
            {selectedPass ? `1인 ${selectedPass.price.toLocaleString("ko-KR")}원 × ${draft.people}명 = ${(selectedPass.price * (Number(draft.people) || 1)).toLocaleString("ko-KR")}원` : "이용권을 선택하면 금액이 계산됩니다."}
            {minPeople > 1 ? ` · ${minPeople}명 이상` : ""}
          </span>
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">예약 상태
          <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as "pending" | "confirmed" }))}>
            <option value="confirmed">확정</option>
            <option value="pending">확인 대기</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">결제 선택
          <select value={draft.payment_preference} onChange={(event) => setDraft((current) => ({ ...current, payment_preference: event.target.value as "online" | "onsite" }))}>
            <option value="onsite">방문 결제</option>
            <option value="online">온라인 결제</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">결제 상태
          <select value={draft.payment_status} onChange={(event) => setDraft((current) => ({ ...current, payment_status: event.target.value as PaymentStatus }))}>
            {paymentStatusOptions.filter((option) => option !== "refunded").map((option) => (
              <option key={option} value={option}>{paymentStatusLabels[option]}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-xs font-bold text-workroom-muted">고객 요청사항
        <textarea rows={2} value={draft.message} onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))} />
      </label>
      <button className={buttonClass("primary", "md", "w-full sm:w-auto sm:justify-self-start")} type="submit">예약 등록</button>
    </form>
  );
}
