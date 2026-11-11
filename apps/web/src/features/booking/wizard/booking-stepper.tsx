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
// Token màu (ADR 0004), không chép màu Figma: chữ và nền có chữ trắng dùng `brand-strong`
const CIRCLE_CLASS: Record<StepState, string> = {
  done: 'bg-brand-strong text-white',
  current: 'border-2 border-brand-strong bg-white text-brand-strong',
  upcoming: 'bg-gray-100 text-gray-600',
};
const LABEL_CLASS: Record<StepState, string> = {
  done: 'text-brand-strong',
  current: 'font-medium text-gray-900',
  upcoming: 'text-gray-600',
};

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
        className={`relative z-10 flex size-9 items-center justify-center rounded-full text-sm font-medium ${CIRCLE_CLASS[state]}`}
      >
        {state === 'done' ? <Check className="size-4" /> : step}
      </span>
      <span className={`mt-2 text-center text-xs ${LABEL_CLASS[state]}`}>
        <span className="sr-only">Bước {step}: </span>
        {label}
        <span className="sr-only">, {STATE_TEXT[state]}</span>
      </span>
    </>
  );
}

// Thanh bước của luồng đặt lịch (Figma `StepIndicator`): sáu mục theo thứ tự, mục hiện tại có `aria-current="step"`.
export function BookingStepper({ current, links = {} }: BookingStepperProps) {
  return (
    <nav aria-label="Các bước đặt lịch">
      <ol className="flex w-full items-start">
        {WIZARD_STEPS.map(({ number, label }) => {
          const state = stateOf(number, current);
          const href = state === 'done' ? links[number] : undefined;
          return (
            <li
              key={number}
              aria-current={state === 'current' ? 'step' : undefined}
              className="relative flex min-w-0 flex-1 flex-col items-center"
            >
              {/* Đường nối với bước trước: đậm khi đã tới bước này */}
              {number > 1 && (
                <span
                  aria-hidden="true"
                  className={`absolute top-[17px] right-1/2 h-0.5 w-full ${number <= current ? 'bg-brand-strong' : 'bg-gray-200'}`}
                />
              )}
              {href === undefined ? (
                <div className="flex flex-col items-center">
                  <StepBody step={number} label={label} state={state} />
                </div>
              ) : (
                <Link
                  to={href}
                  aria-label={`Quay lại bước ${number}: ${label}`}
                  className="flex flex-col items-center rounded-lg"
                >
                  <StepBody step={number} label={label} state={state} />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
