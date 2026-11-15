import { SHIFT_LABELS } from '../../../../shared/schedule/shift-labels';
import { formatDate } from '../../../../shared/schedule/week';
import type {
  AdminLeaveItem,
  CancellationResult,
} from '../../api/admin-leave-api';
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

/** "14:30 29/10/2026" (giờ Việt Nam) từ thời điểm ISO UTC: giờ hẹn trong bảng lịch bị ảnh hưởng. */
export function formatAppointmentTime(iso: string): string {
  const [time = '', date = ''] = formatVnDateTime(iso).split(' ');
  return `${time.slice(0, 5)} ${date}`;
}

/** "200.000 ₫" từ chuỗi decimal của server ("200000.00"); "—" khi chưa đặt cọc. */
export function formatDeposit(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
}

/** Số lịch ở cột "Lịch hẹn bị ảnh hưởng"; `null` (yêu cầu bị từ chối, không ảnh hưởng ai) thì để trống. */
export function formatAffectedCount(item: AdminLeaveItem): string | null {
  return item.soLichHenBiAnhHuong === null
    ? null
    : `${item.soLichHenBiAnhHuong} lịch`;
}

export type ApprovalBannerTone = 'success' | 'warning';

/** Câu và màu của banner sau khi Duyệt hoặc Xử lý lại (WA-11): xanh chỉ khi huỷ xong hết, còn lại vàng. */
export function describeCancellation(result: CancellationResult): {
  tone: ApprovalBannerTone;
  message: string;
} {
  const parts = [`Đã hủy ${result.daHuy} lịch hẹn.`];
  if (result.khongHuyDuoc.length > 0)
    parts.push(
      `${result.khongHuyDuoc.length} lịch không hủy được (${result.khongHuyDuoc.map((a) => a.maLichHen).join(', ')}).`,
    );
  if (!result.hoanTat)
    parts.push('Việc hủy lịch hẹn chưa xong, hãy bấm "Xử lý lại".');
  const clean = result.hoanTat && result.khongHuyDuoc.length === 0;
  return {
    tone: clean ? 'success' : 'warning',
    message: `Đã duyệt nghỉ phép. ${parts.join(' ')}`,
  };
}
