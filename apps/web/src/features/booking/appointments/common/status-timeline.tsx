import { Check, Clock, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { DetailCard } from './detail-card';
import {
  buildStatusSteps,
  STATUS_STEP_TEXT,
  type StatusStep,
  type StepState,
  type UnknownStatusMode,
} from './status-steps';

// Chấm của một bước, MỘT kiểu cho Bác sĩ, Bệnh nhân và Quản trị viên (booking F13; Đại chọn "bám Figma" 18/11/2026). Cỡ 26,25 px (`size-7` trên gốc 15 px) như Figma `458:304`, `420:332`.
// Màu theo token và thang chuẩn của ADR 0004, KHÔNG chép màu Figma lệch tương phản: bước đã qua `success` (green-700, tích trắng 4,95:1; Figma `#00bc7d` chỉ 2,47:1), bước đang ở `brand`
// (cyan-600, tâm trắng 3,62:1 ≥ 3:1 cho thành phần giao diện; Figma `#00b8db` chỉ 2,37:1) kèm vòng ngoài 4 px `cyan-100` (Figma `#cefafe`). Ý nghĩa của chấm còn nằm ở chữ (nhãn bước, "Chưa đến",
// chữ ẩn "Đã qua", "Hiện tại"), không chỉ ở màu; chấm chỉ trang trí nên `aria-hidden`.
const DOT = 'flex size-7 items-center justify-center rounded-full';

function StepDot({ state }: { state: StepState }) {
  switch (state) {
    case 'passed':
      return (
        <span aria-hidden="true" className={`${DOT} bg-success`}>
          <Check className="size-3.5 text-white" />
        </span>
      );
    case 'current':
      return (
        <span
          aria-hidden="true"
          className={`${DOT} bg-brand ring-4 ring-cyan-100`}
        >
          <span className="size-2.5 rounded-full bg-white" />
        </span>
      );
    case 'terminal':
      return (
        <span aria-hidden="true" className={`${DOT} bg-gray-600`}>
          <X className="size-3.5 text-white" />
        </span>
      );
    case 'upcoming':
      return (
        <span
          aria-hidden="true"
          className={`${DOT} border-2 border-gray-200 bg-gray-50`}
        >
          <span className="size-2 rounded-full bg-gray-300" />
        </span>
      );
  }
}

// Nhãn bước: đã qua `success`, đang ở `brand-strong` (5,28:1 trên trắng), chưa tới `gray-600` (7,56:1; Figma `#99a1af` chỉ 2,6:1), kết thúc `gray-700`
const LABEL_STYLES: Record<StepState, string> = {
  passed: 'text-success',
  current: 'text-brand-strong',
  upcoming: 'text-gray-600',
  terminal: 'text-gray-700',
};

// Dòng phụ của bước: LUÔN chiếm đúng một dòng (`min-h-4` = 15 px = một dòng `text-xs`) nên mọi hàng cao bằng nhau và các đoạn nối đều nhau (UI-05, F12). Bước chưa tới: "Chưa đến".
// Bước đã qua, đang ở, kết thúc: `note` nếu có, nếu không là CHỖ CHỪA trống. `note` là chỗ cắm cho mốc thời gian thật của booking B19 (issue #551): B19 chỉ truyền `notes`, không đổi bố cục.
// `note` của bước chưa tới bị bỏ qua (mốc chỉ có khi bước đã đạt). `min-h-4` thay vì `h-4` để chữ dài xuống dòng không bị cắt.
function StepNote({
  step,
  note,
}: {
  step: StatusStep;
  note: string | undefined;
}) {
  if (step.state === 'upcoming') {
    return (
      <span className="block text-xs text-gray-600">
        {STATUS_STEP_TEXT.upcoming}
      </span>
    );
  }
  if (note !== undefined && note !== '') {
    return (
      <span
        data-testid="timeline-note"
        className="block min-h-4 text-xs text-gray-600"
      >
        {note}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      data-testid="timeline-reserved-line"
      className="block min-h-4"
    />
  );
}

// Thanh trạng thái của chi tiết lịch hẹn (booking F13), dùng chung cho Bác sĩ ("Trạng thái ca khám", Figma `458:2`), Bệnh nhân ("Trạng thái lịch hẹn", `420:2`) và Quản trị viên (ngoài Figma `512:2`, Đại duyệt).
//  - `unknown`: cách xử lý mã trạng thái lạ, bắt buộc chọn (xem `status-steps.ts`).
//  - `notes`: dòng phụ theo mã bước (B19 sẽ truyền giờ thật vào đây).
//  - `footer`: chỗ cắm dưới danh sách (Bác sĩ đặt hàng "Ngày đặt lịch" ở đó).
//  - `pendingRole`: `role` của dải chờ thanh toán. Chỉ Bác sĩ truyền `'status'` (như F11); trang Quản trị viên đã có `ActionNotice` `role="status"` nên không được thêm vùng `status` thứ hai.
// `ol` là danh sách có thứ tự để trình đọc màn hình đọc đúng thứ tự các bước; bước hiện tại có `aria-current="step"`.
export function StatusTimeline(props: {
  trangThai: string;
  title: string;
  unknown: UnknownStatusMode;
  notes?: Partial<Record<string, string>>;
  footer?: ReactNode;
  pendingRole?: 'status';
}) {
  const timeline = buildStatusSteps(props.trangThai, props.unknown);
  return (
    <DetailCard icon={Clock} title={props.title}>
      <div className="px-5 py-4">
        {timeline?.pendingPayment === true && (
          <p
            role={props.pendingRole}
            className="mb-4 flex items-center gap-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-2.5 text-sm text-warning"
          >
            <Clock aria-hidden="true" className="size-4 shrink-0" />
            {STATUS_STEP_TEXT.pendingPayment}
          </p>
        )}
        {timeline !== null && (
          <ol aria-label={props.title}>
            {timeline.steps.map((step, position) => (
              <li
                key={step.code}
                aria-current={step.state === 'current' ? 'step' : undefined}
                className="flex gap-3"
              >
                <span className="flex flex-col items-center">
                  <StepDot state={step.state} />
                  {position < timeline.steps.length - 1 && (
                    <span
                      aria-hidden="true"
                      data-testid="timeline-connector"
                      className="my-1 w-0.5 flex-1 bg-gray-200"
                    />
                  )}
                </span>
                <span className="min-w-0 pb-4 text-sm">
                  <span
                    className={`block leading-6 font-semibold ${LABEL_STYLES[step.state]}`}
                  >
                    {step.label}
                  </span>
                  <StepNote step={step} note={props.notes?.[step.code]} />
                  {step.state === 'passed' && (
                    <span className="sr-only">{STATUS_STEP_TEXT.passed}</span>
                  )}
                  {step.state === 'current' && (
                    <span className="sr-only">{STATUS_STEP_TEXT.current}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
        {props.footer}
      </div>
    </DetailCard>
  );
}
