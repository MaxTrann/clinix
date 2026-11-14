import { Check, Clock, X } from 'lucide-react';
import { formatVietnamDate } from '../../common/appointment-format';
import { buildTimeline, type StepTone } from './timeline-steps';
import { DETAIL_TEXT } from './detail-messages';

// Màu theo token và thang chuẩn của ADR 0004, KHÔNG chép màu Figma: nhãn bước đang ở dùng `brand-strong` (5,28:1 trên trắng), bước đã qua `success`, bước chưa tới và chữ phụ `gray-600`.
const LABEL_TONE: Record<StepTone, string> = {
  done: 'text-success',
  current: 'text-brand-strong',
  upcoming: 'text-gray-600',
  ended: 'text-gray-900',
};

// Chấm của một bước (Figma: tròn xanh lá có dấu tích khi đã qua, tròn cyan khi đang ở, xám khi chưa tới, xám có dấu X khi huỷ). Chỉ trang trí (`aria-hidden`): ý nghĩa nằm ở chữ nhãn và chữ phụ.
function Dot({ tone }: { tone: StepTone }) {
  if (tone === 'done') {
    return (
      <span
        aria-hidden="true"
        className="flex size-[1.625rem] items-center justify-center rounded-full bg-success text-white"
      >
        <Check className="size-3.5" />
      </span>
    );
  }
  if (tone === 'current') {
    return (
      <span
        aria-hidden="true"
        className="flex size-[1.625rem] items-center justify-center rounded-full border-2 border-brand-strong bg-white"
      >
        <span className="size-2.5 rounded-full bg-brand-strong" />
      </span>
    );
  }
  if (tone === 'ended') {
    return (
      <span
        aria-hidden="true"
        className="flex size-[1.625rem] items-center justify-center rounded-full bg-gray-600 text-white"
      >
        <X className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-[1.625rem] items-center justify-center rounded-full border border-gray-200 bg-gray-50"
    >
      <span className="size-1.5 rounded-full bg-gray-300" />
    </span>
  );
}

// Thẻ "Trạng thái ca khám" (Figma `458:2`): các bước theo `trangThai` THẬT (`buildTimeline`) và hàng "Ngày đặt lịch" (`ngayDat`, ngày Việt Nam). Mã trạng thái lạ: không vẽ bước nào, chỉ còn hàng ngày đặt.
// Danh sách có thứ tự (`ol`) để trình đọc màn hình đọc được thứ tự các bước; trạng thái hiện tại nằm trong chữ nhãn và chữ phụ.
export function StatusTimeline(props: { trangThai: string; ngayDat: string }) {
  const timeline = buildTimeline(props.trangThai);
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <h2 className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-900">
        <Clock aria-hidden="true" className="size-4 text-gray-600" />
        {DETAIL_TEXT.sections.timeline}
      </h2>
      <div className="px-5 py-4">
        {timeline?.pendingPayment === true && (
          <p
            role="status"
            className="mb-3 flex items-center gap-2 rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning"
          >
            <Clock aria-hidden="true" className="size-4 shrink-0" />
            {DETAIL_TEXT.pendingPayment}
          </p>
        )}
        {timeline !== null && (
          <ol>
            {timeline.steps.map((step, index) => (
              <li key={step.state} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <Dot tone={step.tone} />
                  {index < timeline.steps.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="my-1 w-0.5 flex-1 bg-gray-200"
                    />
                  )}
                </div>
                <div className="pb-4">
                  <p
                    className={`text-sm font-semibold ${LABEL_TONE[step.tone]}`}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-gray-600">
                    {step.tone === 'upcoming'
                      ? DETAIL_TEXT.stepUpcoming
                      : DETAIL_TEXT.stepNotRecorded}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3 text-sm">
          <span className="text-gray-600">{DETAIL_TEXT.bookedOn}</span>
          <span className="font-medium text-gray-900">
            {formatVietnamDate(props.ngayDat)}
          </span>
        </div>
      </div>
    </section>
  );
}
