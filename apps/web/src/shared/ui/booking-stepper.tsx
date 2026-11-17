import { Check } from 'lucide-react';
import { Link } from 'react-router';
import { WIZARD_STEPS, type StepNumber } from './wizard-steps';

// Đường dẫn "Quay lại bước N" của các bước đã qua. Bước đã qua mà không có đường dẫn thì chỉ hiện "đã hoàn thành" (không bấm được):
// Figma `453:2` (Hoàn tất) không có nút quay lại nào, và ở Bước 4 chưa đủ id để dựng liên kết về Bước 2, 3 (PLAN 5.13, TRACKING 3.22 (k)).
export type StepLinks = Partial<Record<StepNumber, string>>;

interface BookingStepperProps {
  current: StepNumber;
  links?: StepLinks;
}

type StepState = 'done' | 'current' | 'upcoming';

const STATE_TEXT: Record<StepState, string> = {
  done: 'đã hoàn thành',
  current: 'đang thực hiện',
  upcoming: 'chưa thực hiện',
};

// Hình học theo Figma `StepIndicator` (`444:67`, `446:67`; search UI PR-B, Đại chọn 17/11/2026), gốc `html` 15 px:
// vòng 33,75 px (`size-9`); ô vòng và nhãn rộng 75 px; năm mục đầu chia đều (147 px khi khung 810 px), mục cuối 75 px;
// nhãn 13 px dòng 16,25 px; đường nối dày 1,875 px, hở 9,375 px mỗi bên vòng. Đã qua: nền vòng nhãn và đường nối đậm; chưa tới: xám.
// Màu theo token (ADR 0004): chữ và nền có chữ trắng dùng `brand-strong` (không chép `#0092b8`); đường nối là nền trang trí nên dùng `brand`;
// vành 4 px `#cefafe` và nhãn đang chọn `#005f78` là cyan-100 và cyan-800 của thang chuẩn. Vành là BÓNG trang trí (như Figma), không phải `ring-*`:
// FG-05 (`styles/focus-hygiene.test.ts`) cấm mọi `ring-*` để viền focus chỉ có một nguồn.
const CIRCLE_CLASS: Record<StepState, string> = {
  done: 'bg-brand-strong text-white',
  current:
    'border-[1.6px] border-brand-strong bg-white text-brand-strong shadow-[0_0_0_4px_var(--color-cyan-100)]',
  upcoming: 'bg-gray-100 text-gray-600',
};
const LABEL_CLASS: Record<StepState, string> = {
  done: 'text-brand-strong',
  current: 'font-semibold text-cyan-800',
  upcoming: 'text-gray-600',
};
// Ô vòng + nhãn: 75 px, co lại khi mục hẹp hơn (màn hình nhỏ) để nhãn xuống dòng thay vì tràn sang mục bên cạnh
const BOX_CLASS = 'flex w-[75px] min-w-0 shrink flex-col items-center';
const LAST_STEP = WIZARD_STEPS[WIZARD_STEPS.length - 1].number;

function stateOf(step: StepNumber, current: StepNumber): StepState {
  if (step < current) return 'done';
  return step === current ? 'current' : 'upcoming';
}

function StepBody({
  step,
  label,
  state,
}: {
  step: StepNumber;
  label: string;
  state: StepState;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${CIRCLE_CLASS[state]}`}
      >
        {state === 'done' ? <Check className="size-4" /> : step}
      </span>
      <span
        className={`mt-2 w-full text-center text-[13px] leading-[16.25px] ${LABEL_CLASS[state]}`}
      >
        <span className="sr-only">Bước {step}: </span>
        {label}
        <span className="sr-only">, {STATE_TEXT[state]}</span>
      </span>
    </>
  );
}

// Thanh bước của luồng đặt lịch (Figma `StepIndicator`): sáu mục theo thứ tự, mục hiện tại có `aria-current="step"`.
// Dùng chung cho Bước 1 đến 3 (`features/search`) và Bước 4 đến 6 (`features/booking`), nên nằm ở `shared/ui` (T3).
export function BookingStepper({ current, links = {} }: BookingStepperProps) {
  return (
    <nav aria-label="Các bước đặt lịch">
      <ol className="flex w-full items-start">
        {WIZARD_STEPS.map(({ number, label }) => {
          const state = stateOf(number, current);
          const href = state === 'done' ? links[number] : undefined;
          const last = number === LAST_STEP;
          return (
            <li
              key={number}
              aria-current={state === 'current' ? 'step' : undefined}
              className={
                last
                  ? 'flex w-[75px] shrink-0 items-start'
                  : 'relative flex min-w-px flex-[147_0_0] items-start'
              }
            >
              {href === undefined ? (
                <div className={BOX_CLASS}>
                  <StepBody step={number} label={label} state={state} />
                </div>
              ) : (
                <Link
                  to={href}
                  aria-label={`Quay lại bước ${number}: ${label}`}
                  className={`${BOX_CLASS} rounded-lg`}
                >
                  <StepBody step={number} label={label} state={state} />
                </Link>
              )}
              {/* Đường nối sang bước sau: dài bằng khoảng trống + 11,25 px mỗi đầu (94,5 px khi khung 810 px), đậm khi bước này đã qua */}
              {!last && (
                <span
                  aria-hidden="true"
                  className="relative h-[18.875px] min-w-px flex-[72_0_0]"
                >
                  <span
                    className={`absolute top-[17px] right-[-11.25px] left-[-11.25px] h-[1.875px] ${state === 'done' ? 'bg-brand' : 'bg-gray-200'}`}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
