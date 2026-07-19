// Seat availability helpers, shared by the reserve calendar and unit tests.
// Mirrors the server-side capacity check (before_reservation_insert trigger):
// a day is "full" for a seat type when the peak number of people booked at the
// same instant reaches the seat capacity.

export type IntervalInput = {
  date: string;
  start_time: string | null;
  end_time: string | null;
  people: number | null;
  status?: string;
};

const ACTIVE_STATUSES = new Set(["pending", "confirmed"]);

export function toMinutes(time: string): number {
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

// Peak number of people booked at the same instant during a day.
export function peakConcurrent(intervals: { start: number; end: number; people: number }[]): number {
  const events: { at: number; delta: number }[] = [];
  for (const item of intervals) {
    events.push({ at: item.start, delta: item.people });
    events.push({ at: item.end, delta: -item.people });
  }
  // At the same minute, releases (-) are applied before adds (+) so an
  // ending booking frees its seat for one starting at that exact minute.
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  for (const event of events) {
    current += event.delta;
    if (current > peak) peak = current;
  }
  return peak;
}

// Given the active reservations for a seat type, return the set of dates whose
// peak concurrent occupancy reaches capacity (i.e. no room for one more).
export function computeFullDates(rows: IntervalInput[], capacity: number): Set<string> {
  const byDate = new Map<string, { start: number; end: number; people: number }[]>();
  for (const row of rows) {
    if (row.status && !ACTIVE_STATUSES.has(row.status)) continue;
    if (!row.start_time || !row.end_time) continue;
    const list = byDate.get(row.date) ?? [];
    const start = toMinutes(row.start_time);
    let end = toMinutes(row.end_time);
    if (end <= start) end += 24 * 60;
    list.push({ start, end, people: row.people ?? 1 });
    byDate.set(row.date, list);
  }

  const full = new Set<string>();
  byDate.forEach((intervals, date) => {
    if (capacity > 0 && peakConcurrent(intervals) >= capacity) full.add(date);
  });
  return full;
}
