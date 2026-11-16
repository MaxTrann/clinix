import { useId, useState } from 'react';
import { dayLabel } from './branch-schedule-format';
import {
  canApplyQuick,
  describeDays,
  type QuickApplyInput,
  type QuickPeriod,
} from './quick-apply';
import { TimeInput24 } from './time-input-24';
import styles from './branches.module.css';

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const WEEKDAYS = [1, 2, 3, 4, 5];

interface QuickApplyPanelProps {
  disabled?: boolean;
  onApply: (input: QuickApplyInput) => void;
}

// Panel "Áp dụng nhanh" của form Thêm chi nhánh (admin PR2 mục 6.4): chọn buổi, giờ và các ngày rồi ghi một lần vào lịch tuần.
// Không có frame Figma `[ĐỒNG BỘ TL]`; dùng token và khoảng cách của thẻ lịch. Panel KHÔNG gửi gì lên API: nó chỉ sửa bản nháp
// lịch (vẫn 7 dòng, sau đó sửa từng ngày được); logic áp dụng ở `quick-apply.ts`.
export function QuickApplyPanel({
  disabled = false,
  onApply,
}: QuickApplyPanelProps) {
  const id = useId();
  const [period, setPeriod] = useState<QuickPeriod>('morning');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [days, setDays] = useState<number[]>([]);
  // Thông báo cũ biến mất khi người dùng sửa lại panel, để không báo sai trạng thái
  const [message, setMessage] = useState('');

  const input: QuickApplyInput = { period, start, end, days };

  function changeDays(next: number[]) {
    setDays(next);
    setMessage('');
  }

  function toggleDay(day: number, checked: boolean) {
    changeDays(
      checked
        ? [...days, day].sort((a, b) => a - b)
        : days.filter((item) => item !== day),
    );
  }

  function apply() {
    if (!canApplyQuick(input)) return;
    onApply(input);
    setMessage(`Đã áp dụng cho ${describeDays(days)}`);
  }

  return (
    <fieldset className={styles.quickApply}>
      <legend className={styles.quickLegend}>Áp dụng nhanh</legend>

      <div className={styles.quickRow}>
        <div className={styles.quickPeriods}>
          {(
            [
              ['morning', 'Sáng'],
              ['afternoon', 'Chiều'],
            ] as const
          ).map(([value, label]) => (
            <label className={styles.periodToggle} key={value}>
              <input
                className={styles.radio}
                type="radio"
                name={`${id}-period`}
                checked={period === value}
                disabled={disabled}
                onChange={() => {
                  setPeriod(value);
                  setMessage('');
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className={styles.timeRange}>
          <TimeInput24
            aria-label="Áp dụng nhanh giờ bắt đầu"
            value={start}
            disabled={disabled}
            onChange={(value) => {
              setStart(value);
              setMessage('');
            }}
          />
          <span aria-hidden="true">–</span>
          <TimeInput24
            aria-label="Áp dụng nhanh giờ kết thúc"
            value={end}
            disabled={disabled}
            onChange={(value) => {
              setEnd(value);
              setMessage('');
            }}
          />
        </div>
      </div>

      <div className={styles.quickRow}>
        <div className={styles.dayPicks}>
          {ALL_DAYS.map((day) => (
            <label className={styles.dayPick} key={day}>
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={days.includes(day)}
                disabled={disabled}
                onChange={(event) =>
                  toggleDay(day, event.currentTarget.checked)
                }
              />
              {dayLabel(day)}
            </label>
          ))}
        </div>
        <button
          type="button"
          className={`${styles.cancelButton} ${styles.compactButton}`}
          disabled={disabled}
          onClick={() => changeDays(ALL_DAYS)}
        >
          Tất cả
        </button>
        <button
          type="button"
          className={`${styles.cancelButton} ${styles.compactButton}`}
          disabled={disabled}
          onClick={() => changeDays(WEEKDAYS)}
        >
          T2–T6
        </button>
      </div>

      <div className={styles.quickRow}>
        <button
          type="button"
          className={`${styles.cancelButton} ${styles.compactButton} ${styles.quickApplyButton}`}
          disabled={disabled || !canApplyQuick(input)}
          aria-describedby={`${id}-help`}
          onClick={apply}
        >
          Áp dụng
        </button>
        <p className={styles.quickHelp} id={`${id}-help`}>
          Nhập giờ hợp lệ (24 giờ), giờ kết thúc sau giờ bắt đầu và chọn ít nhất
          một ngày.
        </p>
      </div>
      {/* Vùng báo luôn có trong DOM từ đầu (rỗng) để trình đọc màn hình đọc được lần đổi nội dung đầu tiên */}
      <p className={styles.quickMessage} aria-live="polite">
        {message}
      </p>
    </fieldset>
  );
}
