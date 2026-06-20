import { formatDateInputValue } from "../lib/format";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type CalendarProps = {
  month: Date; // any date within the month to display
  selected: string; // YYYY-MM-DD
  minMonth: Date; // can't navigate before this month
  onSelect: (date: string) => void;
  onMonthChange: (month: Date) => void;
  isDisabled: (date: string) => boolean;
  isFull?: (date: string) => boolean;
};

export default function Calendar({ month, selected, minMonth, onSelect, onMonthChange, isDisabled, isFull }: CalendarProps) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const startWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);

  const canPrev = year > minMonth.getFullYear() || (year === minMonth.getFullYear() && monthIndex > minMonth.getMonth());

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
          className="grid h-9 w-9 place-items-center rounded-[5px] border border-workroom-line bg-white text-sm font-bold disabled:text-workroom-line"
          aria-label="이전 달"
        >
          ‹
        </button>
        <p className="text-sm font-bold">
          {year}년 {monthIndex + 1}월
        </p>
        <button
          type="button"
          onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
          className="grid h-9 w-9 place-items-center rounded-[5px] border border-workroom-line bg-white text-sm font-bold"
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
          const full = Boolean(isFull?.(dateStr));
          const isSelected = selected === dateStr;

          return (
            <button
              key={dateStr}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(dateStr)}
              className={`relative grid h-11 place-items-center rounded-[5px] border text-sm font-bold transition ${
                isSelected
                  ? "border-workroom-ink bg-workroom-yellow"
                  : disabled
                    ? "cursor-not-allowed border-transparent text-workroom-line"
                    : "border-workroom-line bg-white hover:border-workroom-ink hover:bg-workroom-sky"
              }`}
            >
              {day}
              {full && !isSelected ? (
                <span className="absolute bottom-0.5 text-[8px] font-black leading-none text-red-500">마감</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
