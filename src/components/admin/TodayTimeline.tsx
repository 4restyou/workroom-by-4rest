import { Link } from "react-router-dom";
import { formatTimeRange } from "../../lib/format";
import { isLongTermReservation } from "../../lib/reservations";
import { axisRange, axisTicks, packLanes, percentOf, toSpan, type TimelineItem } from "../../lib/timeline";
import { badge } from "../../lib/ui";
import type { Reservation } from "../../lib/types";

type VisitState = { label: string; tone: "yellow" | "sky" | "ink" | "danger" };

type Props = {
  /** 오늘 이용하는 예약(시간권 + 장기 이용권). */
  reservations: readonly Reservation[];
  /** 예약별 오늘 출석 기록 — 이용 중/퇴실 판정에 쓴다. */
  stateOf: (reservation: Reservation) => VisitState;
  /** 지금 시각(운영 시작 기준 분). 축을 벗어나면 표시선을 그리지 않는다. */
  nowMinute: number;
  openTime: string | null;
  closeTime: string | null;
};

const TONE_CLASS: Record<VisitState["tone"], string> = {
  ink: "border-workroom-ink bg-workroom-ink text-white",
  yellow: "border-workroom-ink bg-workroom-yellow text-workroom-ink",
  danger: "border-red-500 bg-workroom-danger text-workroom-ink",
  sky: "border-workroom-line bg-workroom-sky text-workroom-ink",
};

/**
 * 오늘 일정을 시간축 위에 그린다.
 *
 * 목록으로는 "몇 시가 비어 있는지"와 "언제 몰리는지"가 보이지 않는다. 줄 수가 곧
 * 그 시각의 동시 예약 수라, 한눈에 밀도를 볼 수 있다.
 */
export default function TodayTimeline({ closeTime, nowMinute, openTime, reservations, stateOf }: Props) {
  const axis = axisRange(openTime, closeTime);
  const ticks = axisTicks(axis);

  const timed: TimelineItem<Reservation>[] = [];
  const allDay: Reservation[] = [];
  for (const reservation of reservations) {
    if (isLongTermReservation(reservation)) {
      allDay.push(reservation);
      continue;
    }
    const span = toSpan(reservation.start_time, reservation.end_time, axis);
    if (span) timed.push({ item: reservation, ...span });
    else allDay.push(reservation);
  }

  const lanes = packLanes(timed);
  const nowInAxis = nowMinute >= axis.open && nowMinute <= axis.close;

  return (
    <div className="border border-workroom-line bg-white p-3 sm:p-4">
      {/* 눈금 */}
      <div className="relative mb-1.5 h-4">
        {ticks.map((tick) => (
          <span
            className="absolute -translate-x-1/2 text-[10px] font-bold tabular-nums text-workroom-muted"
            key={tick.minute}
            style={{ left: `${percentOf(tick.minute, axis)}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>

      <div className="relative">
        {/* 세로 눈금선 */}
        {ticks.map((tick) => (
          <span
            aria-hidden
            className="absolute top-0 bottom-0 w-px bg-workroom-line/70"
            key={tick.minute}
            style={{ left: `${percentOf(tick.minute, axis)}%` }}
          />
        ))}

        {/* 현재 시각 */}
        {nowInAxis ? (
          <span
            aria-hidden
            className="absolute top-0 bottom-0 z-10 w-[2px] bg-red-500"
            style={{ left: `${percentOf(nowMinute, axis)}%` }}
          />
        ) : null}

        {lanes.length ? (
          <div className="grid gap-1.5">
            {lanes.map((lane, index) => (
              <div className="relative h-11" key={index}>
                {lane.map(({ endMin, item, startMin }) => {
                  const state = stateOf(item);
                  const left = percentOf(startMin, axis);
                  const width = percentOf(endMin, axis) - left;
                  return (
                    <Link
                      className={`absolute inset-y-0 flex items-center overflow-hidden rounded-[5px] border px-2 text-xs font-bold transition hover:opacity-90 ${TONE_CLASS[state.tone]}`}
                      key={item.id}
                      style={{ left: `${left}%`, width: `${Math.max(width, 4)}%` }}
                      title={`${item.name} · ${formatTimeRange(item.start_time, item.end_time)} · ${item.people}명 · ${state.label}`}
                      to={item.profile_id ? `/admin/customer/${item.profile_id}` : `/admin/reservations?reservation=${item.id}`}
                    >
                      <span className="truncate">{item.name}</span>
                      <span className="ml-1 shrink-0 opacity-80">{item.people}명</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm font-medium text-workroom-muted">시간대가 정해진 예약이 없습니다.</p>
        )}
      </div>

      {allDay.length ? (
        <div className="mt-3 border-t border-workroom-line pt-3">
          <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-workroom-muted">종일 · 장기 이용</p>
          <div className="flex flex-wrap gap-1.5">
            {allDay.map((reservation) => {
              const state = stateOf(reservation);
              return (
                <Link
                  className={`inline-flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1.5 text-xs font-bold ${TONE_CLASS[state.tone]}`}
                  key={reservation.id}
                  to={reservation.profile_id ? `/admin/customer/${reservation.profile_id}` : `/admin/reservations?reservation=${reservation.id}`}
                >
                  {reservation.name}
                  <span className="opacity-80">{reservation.people}명</span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-workroom-line pt-2.5 text-[11px] font-bold text-workroom-muted">
        <span className={badge("ink")}>이용 중</span>
        <span className={badge("sky")}>입실 전</span>
        <span className={badge("yellow")}>확인 대기</span>
        <span className={badge("danger")}>미입실</span>
        <span className="text-red-500">│ 현재 시각</span>
      </div>
    </div>
  );
}
