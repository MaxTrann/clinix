import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import {
  addMonths,
  formatMonthLabel,
  isInMonth,
  monthGrid,
  monthStartOf,
} from '../../../shared/schedule/month';
import {
  formatWeekdayDate,
  weekdayLabel,
  weekStartOf,
} from '../../../shared/schedule/week';
import {
  addMonthsKeepDay,
  clampDate,
  isDayEnabled,
  isGridKey,
  isMonthEnabled,
  moveDay,
} from './picker-dates';
import {
  CELL_BASE,
  CELL_BORDER,
  CELL_STATE,
  NAV_BUTTON,
  WEEKDAY_HEADER,
} from './picker-styles';

export interface DayPickerProps {
  // Một ngày bất kỳ trong tuần đang xem: hộp mở ở tháng của ngày này và tô cả tuần
  anchor: string;
  today: string;
  // Ô đang là điểm dừng Tab (nhận focus khi hộp mở: `ModalFrame` đọc ref này lúc dựng)
  focusRef: RefObject<HTMLDivElement | null>;
  onPick: (isoDate: string) => void;
}

// Lịch tháng thu nhỏ của chế độ Tuần (doctor UX5, G2): chọn một ngày để nhảy tới tuần chứa ngày đó. Lưới ARIA (`role="grid"`) theo mẫu lịch của APG: MỘT ô là điểm dừng
// Tab (roving tabindex), mũi tên và Home/End/PageUp/PageDown đi trong lưới, Enter hoặc Space chọn. Ô là `div role="gridcell"` chứ không phải `button`, vì
// `useModalDialog` tính mọi `button` chưa `disabled` là điểm dừng Tab (kể cả `tabindex="-1"`) và sẽ làm bẫy Tab thoát khỏi hộp. Tuần bắt đầu thứ Hai như lưới tuần.
export function DayPicker({ anchor, today, focusRef, onPick }: DayPickerProps) {
  // Ngày đang giữ điểm dừng Tab (kẹp vào khoảng của hộp); tháng đang hiện là tháng của ngày này
  const [focusDate, setFocusDate] = useState(() => clampDate(anchor));
  const gridRef = useRef<HTMLDivElement>(null);
  // Chỉ chuyển focus thật khi người dùng vừa bấm phím trong lưới: đổi tháng bằng nút ‹ › không được giành focus của nút
  const moveFocus = useRef(false);
  const captionId = useId();

  const month = monthStartOf(focusDate);
  const { weeks } = useMemo(() => monthGrid(month), [month]);
  const viewedWeek = weekStartOf(anchor);
  const previousEnabled = isMonthEnabled(addMonths(month, -1));
  const nextEnabled = isMonthEnabled(addMonths(month, 1));

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-date="${focusDate}"]`)
      ?.focus();
  }, [focusDate]);

  const pick = (day: string) => {
    if (isDayEnabled(day)) onPick(day);
  };

  const shiftMonth = (delta: 1 | -1) => {
    if (delta === -1 ? !previousEnabled : !nextEnabled) return;
    setFocusDate((value) => clampDate(addMonthsKeepDay(value, delta)));
  };

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Chỉ phím gõ trên một ô ngày (nút ‹ › nằm ngoài lưới)
    const current = (event.target as HTMLElement).dataset.date;
    if (current === undefined) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(current);
      return;
    }
    if (!isGridKey(event.key)) return;
    event.preventDefault();
    const next = moveDay(current, event.key, event.shiftKey);
    if (next === null || next === current) return;
    moveFocus.current = true;
    setFocusDate(next);
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Xem tháng trước"
          aria-disabled={!previousEnabled}
          onClick={() => shiftMonth(-1)}
          className={NAV_BUTTON}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <p
          id={captionId}
          aria-live="polite"
          className="text-sm font-semibold text-gray-900"
        >
          {formatMonthLabel(month)}
        </p>
        <button
          type="button"
          aria-label="Xem tháng sau"
          aria-disabled={!nextEnabled}
          onClick={() => shiftMonth(1)}
          className={NAV_BUTTON}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-labelledby={captionId}
        onKeyDown={handleKeyDown}
        className="mt-1 grid gap-y-1"
      >
        <div role="row" className="grid grid-cols-7">
          {weeks[0].map((day) => (
            <div key={day} role="columnheader" className={WEEKDAY_HEADER}>
              {weekdayLabel(day)}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7">
            {week.map((day) => {
              const enabled = isDayEnabled(day);
              const viewed = weekStartOf(day) === viewedWeek;
              let state: string = CELL_STATE.normal;
              if (!enabled) state = CELL_STATE.disabled;
              else if (viewed) state = CELL_STATE.viewed;
              else if (!isInMonth(day, month)) state = CELL_STATE.outside;
              const border =
                day === today ? CELL_BORDER.today : CELL_BORDER.other;
              return (
                <div
                  key={day}
                  role="gridcell"
                  data-date={day}
                  ref={day === focusDate ? focusRef : undefined}
                  tabIndex={enabled ? (day === focusDate ? 0 : -1) : undefined}
                  aria-label={formatWeekdayDate(day)}
                  aria-selected={viewed}
                  aria-disabled={enabled ? undefined : true}
                  aria-current={day === today ? 'date' : undefined}
                  onClick={() => pick(day)}
                  className={`${CELL_BASE} ${state} ${border}`}
                >
                  {Number(day.slice(8, 10))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
