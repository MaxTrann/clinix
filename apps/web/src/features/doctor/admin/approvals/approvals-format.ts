import { SHIFT_LABELS } from '../../../../shared/schedule/shift-labels';
import { formatDate } from '../../../../shared/schedule/week';
import type { AdminLeaveItem } from '../../api/admin-leave-api';
import { REJECT_REASON_MAX } from '../../api/admin-leave-api';
import { LEAVE_KIND_LABELS, formatVnDateTime } from '../../leave/leave-format';

/** "Ca chiều ngày 29/10/2026" hoặc "Cả ngày 26/10/2026 – 27/10/2026" (cột Thời gian, Figma `582:2`). */
export function formatLeaveTime(item: AdminLeaveItem): string {
  if (item.hinhThuc === 'TheoCa' && item.ca !== null)
    return `${SHIFT_LABELS[item.ca]} ngày ${formatDate(item.tuNgay)}`;
  const days =
    item.tuNgay === item.denNgay
      ? formatDate(item.tuNgay)
      : `${formatDate(item.tuNgay)} – ${formatDate(item.denNgay)}`;
  return `Cả ngày ${days}`;
}

export function formatLeaveKindLabel(item: AdminLeaveItem): string {
  return LEAVE_KIND_LABELS[item.hinhThuc];
}

/** "18/10/2026" theo giờ Việt Nam từ thời điểm ISO UTC (cột Ngày gửi). */
export function formatSentDate(iso: string): string {
  return formatVnDateTime(iso).split(' ')[1] ?? '';
}

/** Số điểm mã của lý do sau khi cắt khoảng trắng: một emoji là 1, khớp cách server đếm (Q27c). */
export function rejectReasonLength(value: string): number {
  return Array.from(value.normalize('NFC').trim()).length;
}

const CONTROL_CHARACTER = /\p{Cc}/u;

export type RejectReasonProblem = 'empty' | 'tooLong' | 'control';

/** `null` = hợp lệ. Server vẫn là nơi quyết định cuối (LY_DO_TU_CHOI_KHONG_HOP_LE). */
export function checkRejectReason(value: string): RejectReasonProblem | null {
  const length = rejectReasonLength(value);
  if (length === 0) return 'empty';
  if (length > REJECT_REASON_MAX) return 'tooLong';
  if (CONTROL_CHARACTER.test(value.normalize('NFC').trim())) return 'control';
  return null;
}
