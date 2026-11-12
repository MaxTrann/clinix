// Mã lỗi và giới hạn của duyệt/từ chối yêu cầu nghỉ phép (PLAN doctor 5.8, 5.14; Q27, Q31).
export const APPROVAL_ERROR_CODES = {
  /** Yêu cầu không còn `ChoDuyet` (Admin khác xử lý trước, hoặc bấm lại): người thua nhận 409 (Q31). */
  ALREADY_HANDLED: 'YEU_CAU_DA_XU_LY',
  /** Lý do từ chối thiếu, quá dài hoặc có ký tự điều khiển (Q27c). */
  REJECT_REASON_INVALID: 'LY_DO_TU_CHOI_KHONG_HOP_LE',
  /** Duyệt yêu cầu có ngày kết thúc đã qua (trước hôm nay): chỉ còn Từ chối được (Q30). */
  EXPIRED: 'YEU_CAU_NGHI_DA_QUA_HAN',
} as const;

/** Số lịch hẹn tối đa trả kèm trong chi tiết yêu cầu nghỉ (hộp xác nhận Duyệt, D13); `tong` vẫn là tổng thật, `conNua` báo còn lịch chưa liệt kê. `[đề xuất]` */
export const AFFECTED_PREVIEW_LIMIT = 20;

// Chạy lại huỷ lịch hẹn sau khi duyệt (B16; PLAN doctor 5.8, Q29): sweeper và nút "Xử lý lại" dùng cùng `LeaveCancellationRunner`.
export const LEAVE_SWEEPER_JOB_NAME = 'doctor-leave-cancellation-sweeper';
/** Mỗi 5 phút, lệch giây 40 để không trùng nhịp với job hết hạn giữ chỗ của booking (giây 20). `[đề xuất]` */
export const LEAVE_SWEEPER_CRON = '40 */5 * * * *';
/** Số yêu cầu `DaDuyet` mỗi lô và số lô tối đa mỗi lượt (Q29): lượt sau quét tiếp phần còn lại. */
export const LEAVE_SWEEPER_BATCH_SIZE = 50;
export const LEAVE_SWEEPER_MAX_BATCHES = 5;

/** Lý do từ chối 1–255 điểm mã (Q27c). Không có cột riêng: lý do chỉ vào nhật ký và thông báo cho Bác sĩ. */
export const REJECT_REASON_MIN_LENGTH = 1;
export const REJECT_REASON_MAX_LENGTH = 255;
