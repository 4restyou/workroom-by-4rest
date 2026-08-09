// 지금 공간에 몇 명이 있는지 세는 한 가지 기준.
//
// 예전에는 화면마다 다르게 셌다. 오늘 운영 대시보드는 예약의 people 합계만 더해서
// 워크인(예약 없이 찍은 도장)을 통째로 빠뜨렸고, 입퇴실 화면은 출석 '행' 수를 세서
// 4명 단체 예약을 1명으로 봤다. 같은 시각에 두 화면이 다른 숫자를 보여 줬다.
//
// 기준: 퇴실하지 않은 오늘 출석 기록마다
//   - 예약에 연결돼 있으면 그 예약의 인원수
//   - 연결돼 있지 않으면(워크인) 1명

export type OpenAttendanceRow = { reservation_id: string | null };

export function currentOccupancy(
  openAttendance: readonly OpenAttendanceRow[],
  peopleByReservation: ReadonlyMap<string, number>,
): number {
  return openAttendance.reduce((sum, row) => {
    const people = row.reservation_id ? peopleByReservation.get(row.reservation_id) : undefined;
    // 예약을 아직 못 불러왔거나 삭제된 예약이면 최소 1명으로 본다(0명으로 사라지지 않게).
    return sum + Math.max(1, people ?? 1);
  }, 0);
}

export function peopleByReservationId(
  reservations: readonly { id: string; people: number }[],
): Map<string, number> {
  return new Map(reservations.map((reservation) => [reservation.id, reservation.people]));
}
