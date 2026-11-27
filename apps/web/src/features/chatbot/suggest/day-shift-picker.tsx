import { useId } from 'react';
import { SHIFT_CODES } from '../api/chatbot-types';
import { todayVn } from '../../../shared/schedule/week';
import { CHATBOT_TEXT } from '../widget/chatbot-text';
import { dayChipLabel, suggestWindow } from './suggest-dates';
import { CHIP_CLASS, CHIP_ON_CLASS } from './suggest-styles';
import type { UseSuggestion } from './use-suggestion';

const TEXT = CHATBOT_TEXT.suggest;

// Dải 7 ngày (từ HÔM NAY theo giờ Việt Nam, không theo múi giờ trình duyệt) và ba nút ca (Sáng, Chiều, Tối). Chọn lại ô đang chọn thì bỏ chọn.
// Mỗi thay đổi là ĐÚNG một lời gọi (`useSuggestion`). Tính ngày lúc vẽ, không lưu: thẻ để mở qua nửa đêm tự sang ngày mới ở lần vẽ kế.
export function DayShiftPicker({ suggestion }: { suggestion: UseSuggestion }) {
  const { selection, toggleDay, toggleShift } = suggestion;
  const dayGroupId = useId();
  const shiftGroupId = useId();
  const now = new Date();
  const today = todayVn(now);

  return (
    <div className="mt-3">
      <p id={dayGroupId} className="font-medium">
        {TEXT.dayGroup}
      </p>
      <div
        role="group"
        aria-labelledby={dayGroupId}
        className="mt-1 flex flex-wrap gap-1.5"
      >
        {suggestWindow(now).map((isoDate) => (
          <button
            key={isoDate}
            type="button"
            aria-pressed={selection.ngay === isoDate}
            onClick={() => toggleDay(isoDate)}
            className={selection.ngay === isoDate ? CHIP_ON_CLASS : CHIP_CLASS}
          >
            {dayChipLabel(isoDate, today)}
          </button>
        ))}
      </div>
      <p id={shiftGroupId} className="mt-2 font-medium">
        {TEXT.shiftGroup}
      </p>
      <div
        role="group"
        aria-labelledby={shiftGroupId}
        className="mt-1 flex flex-wrap gap-1.5"
      >
        {SHIFT_CODES.map((ca) => (
          <button
            key={ca}
            type="button"
            aria-pressed={selection.ca === ca}
            onClick={() => toggleShift(ca)}
            className={selection.ca === ca ? CHIP_ON_CLASS : CHIP_CLASS}
          >
            {TEXT.shifts[ca]}
          </button>
        ))}
      </div>
    </div>
  );
}
