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
  monthStartOf,
} from '../../../shared/schedule/month';
import {
  clampMonth,
  isGridKey,
  isMonthEnabled,
  moveMonth,
  monthsOfYear,
} from './picker-dates';
import {
  CELL_BORDER,
  CELL_STATE,
  MONTH_CELL_BASE,
  NAV_BUTTON,
} from './picker-styles';

export interface MonthPickerProps {
  // Một ngày bất kỳ trong tháng đang xem: hộp mở ở năm của ngày này
  anchor: string;
  today: string;
  // Ô đang là điểm dừng Tab (nhận focus khi hộp mở: `ModalFrame` đọc ref này lúc dựng)
  focusRef: RefObject<HTMLDivElement | null>;
  // Đầu tháng được chọn (`YYYY-MM-01`)
  onPick: (monthStart: string) => void;
}

const ROW_SIZE = 3;

// Lưới 12 tháng của chế độ Tháng (doctor UX5, G2), kèm chuyển năm. Cùng mẫu với `DayPicker`: `role="grid"`, một điểm dừng Tab, ô là `div role="gridcell"`.
// ← → ±1 tháng, ↑ ↓ ±3 (một hàng), Home/End = tháng 1/tháng 12, PageUp/PageDown = năm trước/sau.
export function MonthPicker({
  anchor,
  today,
  focusRef,
  onPick,
}: MonthPickerProps) {
  const [focusMonth, setFocusMonth] = useState(() =>
    clampMonth(monthStartOf(anchor)),
  );
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const captionId = useId();

  const year = focusMonth.slice(0, 4);
  const rows = useMemo(() => {
    const months = monthsOfYear(Number(year));
    return Array.from({ length: months.length / ROW_SIZE }, (_, row) =>
      months.slice(row * ROW_SIZE, (row + 1) * ROW_SIZE),
    );
  }, [year]);
  const viewedMonth = monthStartOf(anchor);
  const currentMonth = monthStartOf(today);
  const previousEnabled = isMonthEnabled(addMonths(focusMonth, -12));
  const nextEnabled = isMonthEnabled(addMonths(focusMonth, 12));

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-month="${focusMonth}"]`)
      ?.focus();
  }, [focusMonth]);

  const pick = (monthStart: string) => {
    if (isMonthEnabled(monthStart)) onPick(monthStart);
  };

  const shiftYear = (delta: 1 | -1) => {
    if (delta === -1 ? !previousEnabled : !nextEnabled) return;
    setFocusMonth((value) => clampMonth(addMonths(value, delta * 12)));
  };

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = (event.target as HTMLElement).dataset.month;
    if (current === undefined) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(current);
      return;
    }
    if (!isGridKey(event.key)) return;
    event.preventDefault();
    const next = moveMonth(current, event.key);
    if (next === null || next === current) return;
    moveFocus.current = true;
    setFocusMonth(next);
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Xem năm trước"
          aria-disabled={!previousEnabled}
          onClick={() => shiftYear(-1)}
          className={NAV_BUTTON}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <p
          id={captionId}
          aria-live="polite"
          className="text-sm font-semibold text-gray-900"
        >
          Năm {Number(year)}
        </p>
        <button
          type="button"
          aria-label="Xem năm sau"
          aria-disabled={!nextEnabled}
          onClick={() => shiftYear(1)}
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
        {rows.map((row) => (
          <div key={row[0]} role="row" className="grid grid-cols-3 gap-x-1">
            {row.map((monthStart) => {
              const enabled = isMonthEnabled(monthStart);
              const viewed = monthStart === viewedMonth;
              let state: string = CELL_STATE.normal;
              if (!enabled) state = CELL_STATE.disabled;
              else if (viewed) state = CELL_STATE.viewed;
              const border =
                monthStart === currentMonth
                  ? CELL_BORDER.today
                  : CELL_BORDER.other;
              return (
                <div
                  key={monthStart}
                  role="gridcell"
                  data-month={monthStart}
                  ref={monthStart === focusMonth ? focusRef : undefined}
                  tabIndex={
                    enabled ? (monthStart === focusMonth ? 0 : -1) : undefined
                  }
                  aria-label={formatMonthLabel(monthStart)}
                  aria-selected={viewed}
                  aria-disabled={enabled ? undefined : true}
                  aria-current={
                    monthStart === currentMonth ? 'date' : undefined
                  }
                  onClick={() => pick(monthStart)}
                  className={`${MONTH_CELL_BASE} ${state} ${border}`}
                >
                  Tháng {Number(monthStart.slice(5, 7))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
