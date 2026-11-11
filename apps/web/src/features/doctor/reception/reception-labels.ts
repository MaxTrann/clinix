import { ApiError } from '../../../shared/api/errors';
import { errorMessageFor } from '../../../shared/api/error-message';
import type { ReceptionLeaveState } from '../api/reception-api';

// Trạng thái ô của Lễ tân (Figma `486:2`): "Làm việc", "Nghỉ phép" (nghỉ đã duyệt), "Chờ duyệt". Lễ tân không thấy yêu cầu bị từ chối (Q16).
export type ReceptionStatus = 'LamViec' | ReceptionLeaveState;

export const RECEPTION_STATUS_LABELS: Record<ReceptionStatus, string> = {
  LamViec: 'Làm việc',
  DaDuyet: 'Nghỉ phép',
  ChoDuyet: 'Chờ duyệt',
};

export const RECEPTION_STATUS_ORDER: readonly ReceptionStatus[] = [
  'LamViec',
  'DaDuyet',
  'ChoDuyet',
];

export const NO_SCHEDULE_LABEL = 'Không có lịch';

export function receptionStatusOf(
  nghiPhep: ReceptionLeaveState | null,
): ReceptionStatus {
  return nghiPhep ?? 'LamViec';
}

export const READ_ONLY_NOTE =
  'Trang này chỉ để xem. Lễ tân không thể chỉnh sửa lịch làm việc bác sĩ.';

export const FORBIDDEN_MESSAGE = 'Bạn không có quyền xem lịch của bác sĩ này.';
export const NOT_FOUND_MESSAGE = 'Không tìm thấy dữ liệu.';

export interface ReceptionFailure {
  message: string;
  // 403/404 do bác sĩ ngoài phạm vi hoặc không có: thử lại vô ích, người dùng phải đổi bộ lọc
  retryable: boolean;
}

/** Câu hiển thị cho lỗi tải lưới. Chọn theo `maLoi`, không dùng `thongBao` của server; ngoài phạm vi và không tồn tại KHÔNG phân biệt được (A2). */
export function describeReceptionError(error: unknown): ReceptionFailure {
  if (error instanceof ApiError) {
    if (error.maLoi === 'KHONG_DU_QUYEN')
      return { message: FORBIDDEN_MESSAGE, retryable: false };
    if (error.maLoi === 'KHONG_TIM_THAY')
      return { message: NOT_FOUND_MESSAGE, retryable: false };
  }
  return { message: errorMessageFor(error), retryable: true };
}
