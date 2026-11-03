import { CircleAlert } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';

// Mảnh giao diện của các biểu mẫu xác thực (F2, F3, F4).
export const ALERT_BOX =
  'flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft p-3 text-sm text-danger-strong';

export function FormAlert({
  alertRef,
  children,
}: {
  alertRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div ref={alertRef} role="alert" tabIndex={-1} className={ALERT_BOX}>
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
