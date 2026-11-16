import { Star } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { RATING_MAX_STARS, RATING_MIN_STARS } from '../api/patient-exam-types';
import { starName } from './rating-text';
import { starIconClass } from './star-icon-class';

const STARS = Array.from(
  { length: RATING_MAX_STARS - RATING_MIN_STARS + 1 },
  (_, index) => RATING_MIN_STARS + index,
);

// Ô chọn số sao theo mẫu WAI-ARIA radio group (doctor-exam F6; WDG-02, WDG-15; Figma `423:2`): `radiogroup` có tên (nhãn "Số sao"), năm `radio` tên "1 sao" … "5 sao". Chỉ MỘT ô nằm trong thứ tự Tab (ô đang chọn, chưa chọn thì ô đầu: `tabIndex`
// xoay vòng); mũi tên (← ↑ ↓ →, có vòng) đổi số sao VÀ chuyển tiêu điểm theo, Home và End về 1 và 5; chuột và chạm bấm thẳng vào sao. Sao từ 1 tới số đã chọn là sao đặc. `autoFocus` đưa tiêu điểm vào ô trong Tab khi form vừa mở.
export function StarInput({
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
  disabled,
  autoFocus,
}: {
  value: number | null;
  onChange: (stars: number) => void;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tabStop = value ?? RATING_MIN_STARS;

  function move(next: number) {
    onChange(next);
    buttons.current[next - RATING_MIN_STARS]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = current === RATING_MAX_STARS ? RATING_MIN_STARS : current + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = current === RATING_MIN_STARS ? RATING_MAX_STARS : current - 1;
        break;
      case 'Home':
        next = RATING_MIN_STARS;
        break;
      case 'End':
        next = RATING_MAX_STARS;
        break;
      default:
        return;
    }
    event.preventDefault();
    move(next);
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid ? true : undefined}
      aria-required="true"
      className="flex items-center gap-0.5"
    >
      {STARS.map((stars) => (
        <button
          key={stars}
          ref={(element) => {
            buttons.current[stars - RATING_MIN_STARS] = element;
          }}
          type="button"
          role="radio"
          aria-checked={value === stars}
          aria-label={starName(stars)}
          tabIndex={stars === tabStop ? 0 : -1}
          disabled={disabled}
          autoFocus={autoFocus && stars === tabStop}
          onClick={() => onChange(stars)}
          onKeyDown={(event) => onKeyDown(event, stars)}
          className="flex size-9 items-center justify-center rounded-[9.375px] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Star
            aria-hidden="true"
            className={starIconClass(value !== null && stars <= value)}
          />
        </button>
      ))}
    </div>
  );
}
