import type { ReactNode } from 'react';

// Hộp thông báo dùng chung của các thành phần payment ở web (tách ở F4 cho thanh toán cọc F3 và hộp thu tiền F4, không chép). `success` là `status` (đọc lịch sự),
// `danger` và `warning` là `alert`. Màu theo token (ADR 0004). `className` chỉ cho khoảng cách và bo góc theo từng frame Figma.
export type PaymentNoticeTone = 'danger' | 'warning' | 'success';

const TONE_CLASSES: Record<PaymentNoticeTone, string> = {
  danger: 'border-danger-line bg-danger-soft text-danger-strong',
  warning: 'border-warning-line bg-warning-soft text-warning',
  success: 'border-success-line bg-success-soft text-success',
};

export function PaymentNotice({
  tone,
  className,
  children,
}: {
  tone: PaymentNoticeTone;
  className: string;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'success' ? 'status' : 'alert'}
      className={`border px-[15px] py-[11.25px] text-[13px] leading-[19.5px] ${className} ${TONE_CLASSES[tone]}`}
    >
      {children}
    </div>
  );
}
