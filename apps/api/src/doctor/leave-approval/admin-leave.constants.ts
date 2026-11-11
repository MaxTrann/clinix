// Mã lỗi và giới hạn của duyệt/từ chối yêu cầu nghỉ phép (PLAN doctor 5.8, 5.14; Q27, Q31).
export const APPROVAL_ERROR_CODES = {
  /** Yêu cầu không còn `ChoDuyet` (Admin khác xử lý trước, hoặc bấm lại): người thua nhận 409 (Q31). */
  ALREADY_HANDLED: 'YEU_CAU_DA_XU_LY',
  /** Lý do từ chối thiếu, quá dài hoặc có ký tự điều khiển (Q27c). */
  REJECT_REASON_INVALID: 'LY_DO_TU_CHOI_KHONG_HOP_LE',
} as const;

/** Lý do từ chối 1–255 điểm mã (Q27c). Không có cột riêng: lý do chỉ vào nhật ký và thông báo cho Bác sĩ. */
export const REJECT_REASON_MIN_LENGTH = 1;
export const REJECT_REASON_MAX_LENGTH = 255;
