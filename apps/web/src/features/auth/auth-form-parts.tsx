import { CircleAlert, CircleCheck } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';

// Mảnh giao diện của các biểu mẫu xác thực (F2, F3, F4).
export const ALERT_BOX =
  'flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft p-3 text-sm text-danger-strong';
// Hộp cảnh báo vàng (frame `644:2` của quên mật khẩu): amber-700 trên amber-50 đạt 4,85:1
export const WARNING_BOX =
  'flex items-start gap-2 rounded-xl border border-warning-line bg-warning-soft p-3 text-sm text-warning';

export function FormAlert({
  alertRef,
  children,
  tone = 'danger',
}: {
  alertRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  tone?: 'danger' | 'warning';
}) {
  return (
    <div
      ref={alertRef}
      role="alert"
      tabIndex={-1}
      className={tone === 'warning' ? WARNING_BOX : ALERT_BOX}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function FieldError({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <p id={id} className="mt-1 text-xs text-danger">
      {children}
    </p>
  );
}

// Nút dạng liên kết của khung thành công (frame `649:2`, `652:2`)
export const PRIMARY_LINK =
  'inline-flex items-center gap-2 rounded-xl bg-brand-strong px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-cyan-800';

// Khung thành công của F2 (`649:2`) và F4 (`652:2`): biểu tượng, câu chính, rồi phần riêng của từng màn
export function SuccessPanel({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="py-4 text-center">
      <span className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-green-100">
        <CircleCheck className="size-8 text-success" aria-hidden="true" />
      </span>
      <p className="mb-2 font-medium text-gray-700">{heading}</p>
      {children}
    </div>
  );
}
