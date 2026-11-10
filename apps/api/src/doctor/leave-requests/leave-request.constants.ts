import { CA_DA_KET_THUC } from '../../scheduling/scheduling.constants.js';

// Mã lỗi và giới hạn của việc tạo yêu cầu nghỉ phép (PLAN doctor 5.7, 5.14; Q19, Q21, Q24, Q25).
export const LEAVE_ERROR_CODES = {
  PAST_DATE: 'NGAY_NGHI_DA_QUA',
  RANGE_TOO_LONG: 'KHOANG_NGHI_QUA_DAI',
  TOO_FAR: 'NGHI_QUA_XA',
  OUTSIDE_SCHEDULE: 'NGHI_NGOAI_LICH_LAM_VIEC',
  DUPLICATE: 'YEU_CAU_NGHI_TRUNG',
  TOO_MANY_PENDING: 'QUA_NHIEU_YEU_CAU_CHO_DUYET',
  // Dùng lại mã của luật giờ ca (scheduling.constants.ts): cùng ý nghĩa, cùng câu chữ ở 5.14.
  SHIFT_ENDED: CA_DA_KET_THUC,
} as const;

/** Mã của MỘT trường trong loi[] (PLAN 5.7 bước 1, 5.14). */
export const LEAVE_FIELD_ERRORS = {
  KIND: 'HINH_THUC_KHONG_HOP_LE',
  DATE: 'NGAY_KHONG_HOP_LE',
  // [đề xuất] PLAN chỉ ghi "tuNgay ≤ denNgay" mà không đặt mã: dùng mã sẵn có của phân công ca.
  DATE_ORDER: 'KHOANG_NGAY_KHONG_HOP_LE',
  SHIFT_REQUIRED: 'CA_BAT_BUOC',
  SHIFT_INVALID: 'CA_KHONG_HOP_LE',
  SHIFT_NOT_ALLOWED: 'CA_KHONG_DUOC_CHON',
  SINGLE_DAY_ONLY: 'NGHI_THEO_CA_CHI_MOT_NGAY',
  REASON_REQUIRED: 'LY_DO_BAT_BUOC',
  REASON_INVALID: 'LY_DO_KHONG_HOP_LE',
} as const;

// Các số dưới đây là [đề xuất] đã được Đại duyệt 08/11/2026 (Q19, Q25); đổi ở đây là đổi cho cả hệ thống.
/** Một yêu cầu nghỉ tối đa 31 ngày liên tiếp (tính cả hai đầu). */
export const MAX_LEAVE_DAYS = 31;
/** `denNgay` không quá hôm nay + 90 ngày. */
export const MAX_LEAVE_DAYS_AHEAD = 90;
/** Số yêu cầu `ChoDuyet` cùng lúc của một bác sĩ (chống spam). */
export const MAX_PENDING_REQUESTS = 5;
export const REASON_MIN_LENGTH = 2;
export const REASON_MAX_LENGTH = 500;
