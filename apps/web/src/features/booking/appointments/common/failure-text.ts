import {
  appointmentStateLabel,
  isAppointmentState,
} from './appointment-status';

// Hai câu lỗi dùng chung của hộp huỷ Bệnh nhân (booking F2, `patient/detail/detail-messages.ts`) và các thao tác của Lễ tân (F9): chuyển lên `common/` NGUYÊN VĂN để hai nơi
// không chép lại. Chữ lấy từ PLAN 5.14.
export const BUSY_MESSAGE =
  'Hệ thống đang xử lý nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít giây.';

const CANNOT_CANCEL = 'Lịch hẹn này hiện không thể hủy.';
const ALREADY_CANCELLED = 'Lịch hẹn này đã được hủy.';

// `chiTiet` của 409 `LICH_HEN_KHONG_CHO_HUY` là `{ trangThai }` (B10). Vắng, sai hình hay mã lạ ⇒ câu chung, không lộ mã thô.
export function notCancellableMessage(chiTiet: unknown): string {
  const state =
    typeof chiTiet === 'object' && chiTiet !== null
      ? (chiTiet as { trangThai?: unknown }).trangThai
      : undefined;
  if (state === 'DaHuy') return ALREADY_CANCELLED;
  if (typeof state === 'string' && isAppointmentState(state)) {
    return `Lịch hẹn đang ở trạng thái ${appointmentStateLabel(state)} nên không thể hủy.`;
  }
  return CANNOT_CANCEL;
}

// Câu của hộp huỷ khi xem trước nói lịch không huỷ được: cùng chữ với trường hợp "không rõ trạng thái"
export const cannotCancelMessage = () => CANNOT_CANCEL;
