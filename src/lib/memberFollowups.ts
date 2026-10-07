import { kstDate } from "./datetime";
import { isLongTermReservation } from "./reservations";
import type { Reservation } from "./types";

// '처리할 일'에 올리는 회원 관련 알림.
//
// 예전에는 마지막 방문이 30일을 넘은 회원을 전부, 일주일마다 다시 띄웠다.
// 이용이 끝나 멀어진 회원은 한 번 확인하면 할 일이 없는데도 날마다 숫자만 바뀌어
// 계속 떠 있었다. 이제 둘로 나눈다.
//
//   이용권은 있는데 안 오는 회원  — 돈을 내고 못 쓰는 중이라 챙길 일이 있다.
//                                   확인해도 일주일 뒤 여전하면 다시 알린다.
//   이용이 끝나고 멀어진 회원      — 한 번만 알린다. 확인하면 다시 방문하기
//                                   전까지는 뜨지 않는다. 예약이 잡혀 있으면 아예 뺀다.

export const IDLE_PASS_DAYS = 7;
export const DORMANT_DAYS = 30;
/** '한 번만'을 숨김 기간으로 표현한다(사실상 영구). 다시 오면 키가 바뀌어 새로 뜬다. */
export const ONCE = 36500;

export type MemberFollowup = {
  key: string;
  profileId: string;
  title: string;
  detail: string;
  snoozeDays: number;
};

type Member = { id: string; full_name: string | null };
type Visit = { profile_id: string | null; check_in_at: string };

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function isLive(reservation: Reservation) {
  return reservation.status !== "canceled" && reservation.status !== "no_show" && !reservation.deleted_at;
}

export function memberFollowups(today: string, members: Member[], visits: Visit[], reservations: Reservation[]): MemberFollowup[] {
  const lastVisit = new Map<string, string>();
  for (const visit of visits) {
    if (!visit.profile_id) continue;
    const day = kstDate(visit.check_in_at);
    const seen = lastVisit.get(visit.profile_id);
    if (!seen || day > seen) lastVisit.set(visit.profile_id, day);
  }

  const items: MemberFollowup[] = [];
  for (const member of members) {
    const name = member.full_name || "이름 미입력";
    const mine = reservations.filter((reservation) => reservation.profile_id === member.id && isLive(reservation));
    const last = lastVisit.get(member.id);

    // 1) 기간권이 오늘 유효한데 안 오는 회원.
    const activePass = mine.find((reservation) => {
      if (!isLongTermReservation(reservation) || reservation.status !== "confirmed") return false;
      const start = reservation.access_start_date ?? reservation.date;
      const end = reservation.access_end_date ?? reservation.date;
      return start <= today && today <= end;
    });
    if (activePass) {
      const start = activePass.access_start_date ?? activePass.date;
      // 이용권 시작 이후 방문만 센다. 시작 전 방문은 이번 이용권과 무관하다.
      const since = last && last >= start ? last : start;
      const days = daysBetween(since, today);
      if (days >= IDLE_PASS_DAYS) {
        const passName = activePass.pass_name_snapshot || activePass.pass_type;
        items.push({
          key: `idle-pass-${activePass.id}`,
          profileId: member.id,
          title: `${name} · ${passName} 이용 중인데 ${days}일째 방문 없음`,
          detail: last && last >= start ? `마지막 방문 ${last} · 이용권은 ${activePass.access_end_date ?? ""}까지` : `이용권 시작 후 한 번도 오지 않았습니다 · ${activePass.access_end_date ?? ""}까지`,
          snoozeDays: IDLE_PASS_DAYS,
        });
      }
      continue;
    }

    // 2) 이용이 끝나고 멀어진 회원. 예약이 잡혀 있으면 곧 오므로 뺀다.
    if (!last) continue;
    if (mine.some((reservation) => reservation.date >= today)) continue;
    const days = daysBetween(last, today);
    if (days < DORMANT_DAYS) continue;
    items.push({
      // 마지막 방문일을 키에 넣는다 — 확인하면 영영 숨고, 다시 왔다가 또 멀어지면 새로 뜬다.
      key: `dormant-${member.id}-${last}`,
      profileId: member.id,
      title: `${name} · ${days}일째 방문 없음`,
      detail: `마지막 방문 ${last} · 예정된 예약 없음. 확인하면 다시 방문하기 전까지 뜨지 않습니다.`,
      snoozeDays: ONCE,
    });
  }

  // 돈을 내고 못 쓰는 회원이 먼저, 그 안에서는 오래된 순.
  return items.sort((a, b) => Number(b.key.startsWith("idle-pass")) - Number(a.key.startsWith("idle-pass")));
}
