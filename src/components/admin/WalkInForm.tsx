import { useState, type FormEvent } from "react";
import { passDurationHours, shiftTime } from "../../lib/format";
import { buttonClass, tintCard } from "../../lib/ui";
import type { Pass, PaymentStatus } from "../../lib/types";

export type WalkInDraft = {
  name: string;
  phone: string;
  pass_type: string;
  people: number;
  start_time: string;
  end_time: string;
  payment_status: PaymentStatus;
};

const minuteFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function nowTime() {
  return minuteFmt.format(new Date());
}

// 이용권 이름에서 기본 종료 시각을 잡는다. 시간권은 3시간, 그 외(종일권 등)는
// 마감까지 쓴다고 보고 넉넉히 잡되 운영자가 고칠 수 있게 둔다.
function defaultEnd(start: string, passName: string) {
  return shiftTime(start, passDurationHours(passName) ?? 8) ?? start;
}

/**
 * 예약 없이 방문한 손님을 한 화면에서 접수한다.
 *
 * 예전에는 예약 화면에서 수기 예약을 만들고 입퇴실 화면으로 옮겨 다시 찾아
 * 도장을 찍어야 했다. 카운터에 손님을 세워 두고 화면을 두 번 오가는 흐름이라
 * 실제로는 그냥 건너뛰게 되고, 그러면 매출에도 인원에도 잡히지 않는다.
 */
export default function WalkInForm({
  busy,
  onCancel,
  onSubmit,
  passes,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (draft: WalkInDraft) => void;
  passes: Pass[];
}) {
  const [start, setStart] = useState(nowTime);
  const [draft, setDraft] = useState({
    name: "",
    phone: "",
    pass_type: "",
    people: 1,
    end_time: "",
    payment_status: "paid" as PaymentStatus,
  });

  const endTime = draft.end_time || (draft.pass_type ? defaultEnd(start, draft.pass_type) : "");
  // 단체·대관처럼 최소 인원이 있는 이용권. 서버 트리거(0043)와 같은 규칙이다.
  const selectedPass = passes.find((pass) => pass.name === draft.pass_type) ?? null;
  const minPeople = Math.max(1, selectedPass?.min_people ?? 1);
  const total = selectedPass ? selectedPass.price * (Number(draft.people) || 1) : 0;

  function pickPass(name: string) {
    // 이용권을 바꾸면 종료 시각 기본값도 따라 바뀐다(직접 고친 값은 유지하지 않는다).
    // 최소 인원이 있는 이용권이면 인원도 함께 올린다.
    const nextMin = Math.max(1, passes.find((pass) => pass.name === name)?.min_people ?? 1);
    setDraft((current) => ({ ...current, pass_type: name, end_time: "", people: Math.max(current.people, nextMin) }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.pass_type || !endTime) return;
    if ((Number(draft.people) || 1) < minPeople) return;
    onSubmit({
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      pass_type: draft.pass_type,
      people: Number(draft.people) || 1,
      start_time: start,
      end_time: endTime,
      payment_status: draft.payment_status,
    });
  }

  return (
    <form className={`${tintCard("yellow")} mb-5 grid gap-4 p-5`} onSubmit={submit}>
      <div>
        <h2 className="text-lg font-black">예약 없이 오신 손님</h2>
        <p className="mt-1 text-xs font-medium leading-5 text-workroom-muted">
          접수하면 오늘 예약이 확정 상태로 만들어지고 입실까지 한 번에 기록됩니다. 연락처가 같은 회원이 있으면 자동으로
          이어 붙여 출근 도장도 쌓입니다. 금액은 이용권의 1인 요금 × 인원으로 계산됩니다.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">
          이름
          <input
            autoFocus
            required
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">
          연락처 (선택)
          <input
            inputMode="numeric"
            placeholder="회원이면 도장이 함께 쌓여요"
            value={draft.phone}
            onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">
          이용권
          <select required value={draft.pass_type} onChange={(event) => pickPass(event.target.value)}>
            <option value="">선택</option>
            {passes.map((pass) => (
              <option key={pass.id} value={pass.name}>
                {pass.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">
          인원
          <input
            max={12}
            min={minPeople}
            required
            type="number"
            value={draft.people}
            onChange={(event) => setDraft((current) => ({ ...current, people: Number(event.target.value) }))}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">
          입실
          <input required type="time" value={start} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">
          종료 예정
          <input
            required
            type="time"
            value={endTime}
            onChange={(event) => setDraft((current) => ({ ...current, end_time: event.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-workroom-muted">
          결제
          <select
            value={draft.payment_status}
            onChange={(event) => setDraft((current) => ({ ...current, payment_status: event.target.value as PaymentStatus }))}
          >
            <option value="paid">현장 결제 완료</option>
            <option value="unpaid">아직 미결제</option>
            <option value="service">서비스 (무료)</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={buttonClass("primary", "md")} disabled={busy} type="submit">
          {busy ? "접수 중…" : total ? `접수하고 입실 처리 · ${total.toLocaleString("ko-KR")}원` : "접수하고 입실 처리"}
        </button>
        <button className={buttonClass("secondary", "md")} disabled={busy} onClick={onCancel} type="button">
          닫기
        </button>
      </div>
    </form>
  );
}
