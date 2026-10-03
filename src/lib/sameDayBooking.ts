// 같은 날 이미 잡힌 예약과 부딪히는지 본다.
//
// 지금까지는 '완전히 같은 예약'(같은 이용권·날짜·시작시간)만 막혔다. 그래서
// 13시~16시를 잡은 사람이 15시~18시를 또 잡아도 통과했고, 실제로 겹치는
// 예약이 자주 생겼다. 손님은 두 건을 낸 줄 모르고, 좌석은 두 칸이 나간다.
//
// 세 가지를 구분한다.
//   겹침     — 시간이 실제로 물린다. 막는다(서버도 막는다).
//   같은 날  — 안 겹치지만 그날 이미 예약이 있다. 묻고 진행한다.
//   이용권   — 그날 쓸 수 있는 장기 이용권이 이미 있다. 알려 준다.

export type ExistingBooking = {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  pass_type: string;
  pass_name_snapshot: string | null;
  access_start_date?: string | null;
  access_end_date?: string | null;
};

export type BookingSlot = {
  date: string;
  start_time: string;
  end_time: string;
};

export type SameDayCheck = {
  /** 시간이 물리는 예약. 있으면 진행하면 안 된다. */
  overlapping: ExistingBooking[];
  /** 안 겹치지만 같은 날 잡혀 있는 예약. */
  sameDay: ExistingBooking[];
  /** 그날 이미 쓸 수 있는 장기 이용권. */
  covering: ExistingBooking[];
};

const ACTIVE = new Set(["pending", "confirmed"]);

function minutes(value: string | null): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(":");
  const total = Number(hour) * 60 + Number(minute ?? 0);
  return Number.isFinite(total) ? total : null;
}

/** 자정을 넘기는 예약(끝 시간이 시작보다 작거나 같다)은 다음 날로 이어 센다. */
function window(start: string | null, end: string | null): [number, number] | null {
  const from = minutes(start);
  let to = minutes(end);
  if (from === null || to === null) return null;
  if (to <= from) to += 24 * 60;
  return [from, to];
}

export function isLongTerm(booking: { access_start_date?: string | null; access_end_date?: string | null }): boolean {
  return Boolean(booking.access_start_date && booking.access_end_date);
}

export function checkSameDay(existing: readonly ExistingBooking[], slot: BookingSlot): SameDayCheck {
  const next = window(slot.start_time, slot.end_time);
  const overlapping: ExistingBooking[] = [];
  const sameDay: ExistingBooking[] = [];
  const covering: ExistingBooking[] = [];

  for (const booking of existing) {
    if (!ACTIVE.has(booking.status ?? "")) continue;

    if (isLongTerm(booking)) {
      // 장기 이용권은 기간으로 본다. 그날이 기간 안이면 따로 예약할 필요가 없다.
      const start = booking.access_start_date as string;
      const end = booking.access_end_date as string;
      if (slot.date >= start && slot.date <= end) covering.push(booking);
      continue;
    }

    if (booking.date !== slot.date) continue;

    const current = window(booking.start_time, booking.end_time);
    // 시간을 모르는 예약(문의 상품 등)은 겹침을 판단할 수 없다. 같은 날로만 센다.
    if (!next || !current) {
      sameDay.push(booking);
      continue;
    }

    // 끝나는 시각과 시작하는 시각이 같은 건 겹치는 게 아니다(연장이 그렇다).
    const overlaps = next[0] < current[1] && next[1] > current[0];
    if (overlaps) overlapping.push(booking);
    else sameDay.push(booking);
  }

  return { overlapping, sameDay, covering };
}

export function bookingLabel(booking: ExistingBooking): string {
  const name = booking.pass_name_snapshot || booking.pass_type;
  const start = (booking.start_time ?? "").slice(0, 5);
  const end = (booking.end_time ?? "").slice(0, 5);
  return start && end ? `${name} ${start}-${end}` : name;
}
