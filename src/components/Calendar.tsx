import { formatDateInputValue } from "../lib/format";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type CalendarProps = {
  month: Date; // any date within the month to display
  selected: string; // YYYY-MM-DD
  minMonth: Date; // can't navigate before this month
  maxMonth?: Date; // can't navigate past this month (booking window limit)
  onSelect: (date: string) => void;
  onMonthChange: (month: Date) => void;
  isDisabled: (date: string) => boolean;
  // 비활성 사유(휴무일·예약 마감·2개월 이후 등)를 라벨/툴팁으로 노출한다.
  disabledReason?: (date: string) => string | null;
};

export default function Calendar({ month, selected, minMonth, maxMonth, onSelect, onMonthChange, isDisabled, disabledReason }: CalendarProps) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const startWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);

  const canPrev = year > minMonth.getFullYear() || (year === minMonth.getFullYear() && monthIndex > minMonth.getMonth());
  const canNext =
    !maxMonth || year < maxMonth.getFullYear() || (year === maxMonth.getFullYear() && monthIndex < maxMonth.getMonth());

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
          className="grid h-9 w-9 place-items-center rounded-[5px] border border-workroom-line bg-white touch:h-11 touch:w-11 text-sm font-bold disabled:border-transparent disabled:bg-workroom-background disabled:text-workroom-muted"
          aria-label="이전 달"
        >
          ‹
        </button>
        <p className="text-sm font-bold">
          {year}년 {monthIndex + 1}월
        </p>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
          className="grid h-9 w-9 place-items-center rounded-[5px] border border-workroom-line bg-white touch:h-11 touch:w-11 text-sm font-bold disabled:border-transparent disabled:bg-workroom-background disabled:text-workroom-muted"
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((label, index) => (
          <div
            key={label}
            className={`py-1 text-xs font-bold ${index === 0 ? "text-red-500" : index === 6 ? "text-blue-500" : "text-workroom-muted"}`}
          >
            {label}
          </div>
        ))}

        {cells.map((day, index) => {
          if (day === null) return <div key={`blank-${index}`} />;
          const dateStr = formatDateInputValue(new Date(year, monthIndex, day));
          const disabled = isDisabled(dateStr);
          const reason = disabled ? disabledReason?.(dateStr) ?? null : null;
          const isSelected = selected === dateStr;

          return (
            <button
              key={dateStr}
              type="button"
              aria-label={`${monthIndex + 1}월 ${day}일${reason ? ` · ${reason}` : ""}`}
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => onSelect(dateStr)}
              title={reason ?? undefined}
              className={`relative grid h-11 place-items-center rounded-[5px] border text-sm font-bold transition ${
                isSelected
                  ? "border-workroom-ink bg-workroom-yellow"
                  : disabled
                    // 예전에는 text-workroom-line(#C8C2B7)이라 배경 대비가 1.7:1밖에
                    // 안 돼 날짜 숫자가 거의 보이지 않았다. 눌리지 않는다는 신호는
                    // 배경과 테두리로 주고, 글자는 읽을 수 있게 둔다.
                    ? "cursor-not-allowed border-transparent bg-workroom-background text-workroom-muted"
                    : "border-workroom-line bg-white hover:border-workroom-ink hover:bg-workroom-sky"
              }`}
            >
              {day}
              {reason === "예약 마감" && !isSelected ? (
                <span className="absolute bottom-0.5 text-[9px] font-black leading-none text-red-600">마감</span>
              ) : reason === "휴무일" && !isSelected ? (
                <span className="absolute bottom-0.5 text-[9px] font-black leading-none text-workroom-muted">휴무</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
