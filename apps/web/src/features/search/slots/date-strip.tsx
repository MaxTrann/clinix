import { DATE_STRIP_LABEL, TODAY_LABEL } from './slot-text';
import {
  dateAccessibleName,
  dateLabel,
  monthLabel,
  shortWeekday,
} from './slot-dates';

interface DateStripProps {
  // 7 ngày liên tiếp `YYYY-MM-DD` (hôm nay đến hôm nay + 6), từ `slotWindow`
  dates: readonly string[];
  value: string;
  today: string;
  onChange: (date: string) => void;
  // Chú thích dưới dải ở chi tiết chuyên khoa (Figma 259:2: "Đang xem lịch Hôm nay 18/10")
  showViewing?: boolean;
}

// Thẻ ngày theo Figma 446:165: cao 67,5, bo 13,375, khe 7,5; nhãn 10 (Hôm nay hoặc T2…CN), số 16,875 đậm, tháng 10 (Th11).
// Chữ trắng trên nền cyan-600 chỉ ≈ 3,7:1 nên thẻ chọn dùng `brand-strong` (cyan-700, 5,28:1; ADR 0004).
const TILE =
  'flex h-[67.5px] min-w-0 flex-col items-center justify-center rounded-[13.375px] border';
const TILE_IDLE =
  'border-gray-200 bg-white text-gray-700 hover:border-cyan-300';
const TILE_SELECTED = 'border-brand-strong bg-brand-strong text-white';

// Dải "Ngày khám": nút thường `aria-pressed` (Tab/Enter/Space), không `radiogroup`. Từ 640 px lưới 7 cột; hẹp hơn thì cuộn NGANG trong khung dải
// (mỗi thẻ ≥ 76 px) để cả trang không bị cuộn ngang.
export function DateStrip({
  dates,
  value,
  today,
  onChange,
  showViewing = false,
}: DateStripProps) {
  return (
    <div>
      <p
        id="slot-date-label"
        className="text-sm font-medium leading-[18.75px] text-gray-700"
      >
        {DATE_STRIP_LABEL}
      </p>
      {/* Ở < 640 px khung cuộn ngang cắt viền focus nằm ngoài thẻ (đo Chromium 375 px: viền 1,6 + cách 1,6): đệm `p-1` trong khung cho viền chỗ, lề âm `-m-1` bù để thẻ giữ nguyên vị trí */}
      <div className="mt-1.5">
        <div
          role="group"
          aria-labelledby="slot-date-label"
          className="-m-1 flex gap-2 overflow-x-auto p-1 [scrollbar-width:thin] sm:m-0 sm:grid sm:grid-cols-7 sm:overflow-visible sm:p-0"
        >
          {dates.map((date) => {
            const selected = date === value;
            const sub = selected ? 'text-white' : 'text-gray-500';
            return (
              <button
                key={date}
                type="button"
                aria-pressed={selected}
                aria-label={dateAccessibleName(date, today)}
                onClick={() => onChange(date)}
                className={`${TILE} ${selected ? TILE_SELECTED : TILE_IDLE} w-[76px] shrink-0 sm:w-auto`}
              >
                <span
                  className={`text-[10px] font-medium leading-[10px] ${sub}`}
                >
                  {date === today ? TODAY_LABEL : shortWeekday(date)}
                </span>
                <span className="text-[16.875px] font-bold leading-[21.094px]">
                  {Number(date.slice(8))}
                </span>
                <span
                  className={`text-[10px] font-medium leading-[10px] ${sub}`}
                >
                  {monthLabel(date)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {showViewing && (
        <p className="mt-2 text-xs text-gray-500">
          Đang xem lịch {dateLabel(value, today)}
        </p>
      )}
    </div>
  );
}
