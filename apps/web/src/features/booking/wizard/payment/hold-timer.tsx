import { useId } from 'react';
import { formatHoldTime, holdLevel, type HoldLevel } from './hold-countdown';
import { PAYMENT_TEXT } from './payment-messages';

// Màu theo token (ADR 0004): nền `brand-soft` bình thường; từ 60 giây trở xuống nền `warning-soft` (chữ `warning` 4,85:1 trên nền đó). Màu chỉ là phụ: từ 60 giây có CHỮ "Sắp hết thời gian giữ chỗ"
// cạnh số (không chỉ màu). `ended` không vẽ ở đây (trang chuyển sang thông báo hết hạn); giữ khoá cho đủ kiểu.
const TONE: Record<HoldLevel, string> = {
  plenty: 'border-cyan-200 bg-brand-soft',
  within5: 'border-cyan-200 bg-brand-soft',
  within1: 'border-warning-line bg-warning-soft',
  ended: 'border-warning-line bg-warning-soft',
};

// Thẻ đồng hồ "Thời gian giữ chỗ còn lại" (booking F6; Figma `452:2`: "mm:ss" ở đầu cột trái). `role="timer"` KHÔNG đọc từng giây (mặc định của `timer` là `aria-live="off"`); câu cho trình đọc màn hình
// ở mốc 5 phút, 1 phút, hết giờ do vùng `aria-live="polite"` ở `payment-panel.tsx`. `tabular-nums`: mọi chữ số cùng bề rộng nên ô không nhảy bề rộng khi số đổi (đo ở trình duyệt, T3).
export function HoldTimer({ remaining }: { remaining: number }) {
  const labelId = useId();
  const level = holdLevel(remaining);
  return (
    <section className={`rounded-2xl border p-5 text-center ${TONE[level]}`}>
      <p id={labelId} className="text-sm font-medium text-gray-700">
        {PAYMENT_TEXT.timerLabel}
      </p>
      <p
        role="timer"
        aria-labelledby={labelId}
        className="pt-1 text-4xl font-bold text-gray-900 tabular-nums"
      >
        {formatHoldTime(remaining)}
      </p>
      {level === 'within1' && (
        <p className="pt-1 text-sm font-semibold text-warning">
          {PAYMENT_TEXT.hurry}
        </p>
      )}
    </section>
  );
}
