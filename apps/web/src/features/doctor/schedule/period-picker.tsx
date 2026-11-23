import { ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';
import { ModalFrame } from '../components/modal-frame';
import { DayPicker } from './day-picker';
import { MonthPicker } from './month-picker';

export interface PeriodPickerProps {
  mode: 'week' | 'month';
  // Nhãn kỳ đang xem: "Tuần 16/11 – 22/11/2026" hoặc "Tháng 11 năm 2026"
  label: string;
  // Một ngày bất kỳ trong kỳ đang xem (ngày neo của trang)
  anchor: string;
  // Hôm nay theo giờ Việt Nam (`YYYY-MM-DD`)
  today: string;
  // Tuần: ngày đã bấm (`weekStartOf` ra tuần chứa ngày đó); Tháng: ngày 1 của tháng đã bấm
  onPick: (isoDate: string) => void;
}

// Nhãn kỳ của thanh công cụ lịch Bác sĩ, bấm được để mở hộp chọn nhanh (doctor UX5, G2): chế độ Tuần là lịch tháng thu nhỏ, chế độ Tháng là lưới 12 tháng kèm chuyển năm.
// Hộp dùng lại `ModalFrame` (hộp thoại modal: bẫy Tab, Esc, bấm nền đóng, nền `inert`, trả focus về nút nhãn). Chọn xong thì đóng và báo `onPick`.
export function PeriodPicker({
  mode,
  label,
  anchor,
  today,
  onPick,
}: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Ô đang là điểm dừng Tab của lưới: nhận focus khi hộp mở
  const focusRef = useRef<HTMLDivElement>(null);
  const noun = mode === 'week' ? 'tuần' : 'tháng';

  const pick = (isoDate: string) => {
    setOpen(false);
    onPick(isoDate);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}, mở hộp chọn ${noun}`}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 min-w-36 items-center justify-center gap-1.5 px-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100"
      >
        <span>{label}</span>
        <ChevronDown aria-hidden="true" className="size-4 text-gray-600" />
      </button>
      {open && (
        <ModalFrame
          title={mode === 'week' ? 'Chọn tuần' : 'Chọn tháng'}
          initialFocusRef={focusRef}
          returnFocusRef={triggerRef}
          onClose={() => setOpen(false)}
          showCloseIcon
        >
          <div className="min-h-0 overflow-y-auto px-3 pt-2 pb-4">
            {mode === 'week' ? (
              <DayPicker
                anchor={anchor}
                today={today}
                focusRef={focusRef}
                onPick={pick}
              />
            ) : (
              <MonthPicker
                anchor={anchor}
                today={today}
                focusRef={focusRef}
                onPick={pick}
              />
            )}
          </div>
        </ModalFrame>
      )}
    </>
  );
}
