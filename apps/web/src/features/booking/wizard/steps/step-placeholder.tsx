import { WIZARD_STEPS, type StepNumber } from '../wizard-steps';

// THÂN TẠM của khung F3: chỉ nhãn bước (chữ Figma), một câu báo chưa có nội dung và một chỗ trống có `data-testid` để test tìm.
// Không tiêu đề tự đặt, không gọi API. F4 đến F7 thay file `*-step.tsx` của mình bằng nội dung thật; file này sẽ hết người dùng thì xoá.
export function StepPlaceholder({
  step,
  reference,
}: {
  step: StepNumber;
  reference?: string;
}) {
  const label = WIZARD_STEPS[step - 1].label;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="font-medium text-gray-900">{label}</p>
      <p className="mt-1 text-sm text-gray-600">
        Nội dung bước này sẽ được bổ sung.
      </p>
      <div
        data-testid={`booking-step-${step}-body`}
        data-reference={reference}
      />
    </section>
  );
}
