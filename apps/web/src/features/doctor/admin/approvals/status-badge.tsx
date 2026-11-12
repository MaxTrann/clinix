import type { LeaveStatus } from '../../api/leave-api';
import { LEAVE_STATUS_LABELS } from '../../leave/leave-format';

const STATUS_STYLES: Record<LeaveStatus, string> = {
  ChoDuyet: 'border-warning-line bg-warning-soft text-warning',
  DaDuyet: 'border-success-line bg-success-soft text-success',
  TuChoi: 'border-danger-line bg-danger-soft text-danger-strong',
};

// Chip trạng thái của yêu cầu (Figma `582:2`): chữ luôn kèm nhãn, không chỉ dựa vào màu
export function StatusBadge({ status }: { status: LeaveStatus }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_STYLES[status]}`}
    >
      {LEAVE_STATUS_LABELS[status]}
    </span>
  );
}
