import { REQUEST_STATUS_LABELS } from './request-text';
import type { RequestStatus } from './request-types';

// Màu chip theo token của ADR 0004 (cùng nhóm với chip trạng thái lịch hẹn ở `common/status-chip.tsx`), KHÔNG chép màu Figma: Chờ duyệt cam, Đã duyệt xanh lá, Từ chối đỏ. LUÔN có chữ (chấm màu chỉ là
// trang trí, `aria-hidden`), không chỉ dựa vào màu.
const STYLES: Record<RequestStatus, string> = {
  ChoDuyet: 'border-warning-line bg-warning-soft text-warning',
  DaDuyet: 'border-success-line bg-success-soft text-success',
  TuChoi: 'border-danger-line bg-danger-soft text-danger-strong',
};

export function RequestStatusChip({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}
