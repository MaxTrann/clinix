import { Check, Clock, X } from 'lucide-react';
import { DETAIL_TEXT } from './detail-messages';
import { timelineSteps, type StepState } from './detail-timeline-steps';

// Chấm bước: nền `brand` (cyan-600 `#0092b8`, dấu tick trắng 3,62:1 ≥ 3:1 cho thành phần giao diện, đo 12/11/2026). KHÔNG chép màu Figma `#00b8db`: tick trắng
// trên nó chỉ 2,37:1 (ADR 0004). Trạng thái của chấm còn được nói bằng chữ (nhãn bước, "Chưa đến", chữ ẩn "Đã qua", "Hiện tại"), không chỉ bằng màu.
function StepDot({ state }: { state: StepState }) {
  if (state === 'current') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-brand ring-4 ring-cyan-100">
        <span className="size-2 rounded-full bg-white" />
      </span>
    );
  }
  if (state === 'passed') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-brand">
        <Check aria-hidden="true" className="size-3.5 text-white" />
      </span>
    );
  }
  if (state === 'terminal') {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-gray-600">
        <X aria-hidden="true" className="size-3.5 text-white" />
      </span>
    );
  }
  return (
    <span className="flex size-6 items-center justify-center rounded-full border-2 border-gray-200 bg-gray-50">
      <span className="size-1.5 rounded-full bg-gray-300" />
    </span>
  );
}

const LABEL_STYLES: Record<StepState, string> = {
  current: 'font-semibold text-brand-strong',
  passed: 'font-semibold text-gray-900',
  upcoming: 'font-semibold text-gray-600',
  terminal: 'font-semibold text-gray-700',
};

export function DetailTimeline({ status }: { status: string }) {
  const steps = timelineSteps(status);
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-gray-600 uppercase">
        <Clock aria-hidden="true" className="size-4" />
        {DETAIL_TEXT.timelineTitle}
      </h2>
      {status === 'ChoThanhToan' && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-2.5 text-sm text-warning">
          <Clock aria-hidden="true" className="size-4 shrink-0" />
          {DETAIL_TEXT.waitingDeposit}
        </p>
      )}
      <ol aria-label={DETAIL_TEXT.timelineTitle} className="mt-4">
        {steps.map((step, position) => (
          <li
            key={step.label}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className="flex gap-3"
          >
            <span className="flex flex-col items-center">
              <StepDot state={step.state} />
              {position < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className="my-1 w-0.5 flex-1 bg-gray-200"
                />
              )}
            </span>
            <span className="min-w-0 pb-4 text-sm">
              <span className={`block leading-6 ${LABEL_STYLES[step.state]}`}>
                {step.label}
              </span>
              {step.state === 'upcoming' && (
                <span className="block text-xs text-gray-600">
                  {DETAIL_TEXT.upcoming}
                </span>
              )}
              {step.state === 'passed' && (
                <span className="sr-only">{DETAIL_TEXT.passed}</span>
              )}
              {step.state === 'current' && (
                <span className="sr-only">{DETAIL_TEXT.current}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
