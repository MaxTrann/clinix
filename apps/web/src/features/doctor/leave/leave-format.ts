import { SHIFT_LABELS } from '../../../shared/schedule/shift-labels';
import { formatDate, formatDayMonth } from '../../../shared/schedule/week';
import type { LeaveKind, LeaveRequest, LeaveStatus } from '../api/leave-api';

export const LEAVE_KIND_LABELS: Record<LeaveKind, string> = {
  CaNgay: 'Cả ngày',
  TheoCa: 'Theo ca',
};

// Nhãn trạng thái của YÊU CẦU (khác nhãn trạng thái của Ô lịch: "Nghỉ đã duyệt" ở ô, "Đã duyệt" ở yêu cầu)
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  ChoDuyet: 'Chờ duyệt',
  DaDuyet: 'Đã duyệt',
  TuChoi: 'Từ chối',
};

export const LEAVE_STATUS_ORDER: readonly LeaveStatus[] = [
  'ChoDuyet',
  'DaDuyet',
  'TuChoi',
];

/** "26/10" hoặc "26/10 – 28/10" (dòng lịch sử, Figma `470:2`). */
export function formatLeaveDaysShort(request: LeaveRequest): string {
  return request.tuNgay === request.denNgay
    ? formatDayMonth(request.tuNgay)
    : `${formatDayMonth(request.tuNgay)} – ${formatDayMonth(request.denNgay)}`;
}

/** "26/10/2026" hoặc "26/10/2026 – 28/10/2026" (hộp chi tiết, Figma `471:2`). */
export function formatLeaveDays(request: LeaveRequest): string {
  return request.tuNgay === request.denNgay
    ? formatDate(request.tuNgay)
    : `${formatDate(request.tuNgay)} – ${formatDate(request.denNgay)}`;
}

/** "Theo ca · Ca sáng" hoặc "Cả ngày" (dòng lịch sử). */
export function formatLeaveKind(request: LeaveRequest): string {
  return request.hinhThuc === 'TheoCa' && request.ca !== null
    ? `${LEAVE_KIND_LABELS.TheoCa} · ${SHIFT_LABELS[request.ca]}`
    : LEAVE_KIND_LABELS[request.hinhThuc];
}

const VN_DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** "07:06:06 18/10/2026" theo giờ Việt Nam từ thời điểm ISO UTC (Figma `471:2`). */
export function formatVnDateTime(iso: string): string {
  const parts = Object.fromEntries(
    VN_DATE_TIME.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${parts.hour}:${parts.minute}:${parts.second} ${parts.day}/${parts.month}/${parts.year}`;
}
