// Mã lỗi và giới hạn của phân công ca (PLAN doctor 5.3, 5.14). Mã của luật giờ ca nằm ở scheduling/scheduling.constants.ts.
export const SHIFT_ERROR_CODES = {
  ALREADY_ASSIGNED: 'CA_DA_PHAN_CONG',
  DOCTOR_NOT_ASSIGNABLE: 'BAC_SI_KHONG_PHAN_CONG_DUOC',
  TOO_MANY_SHIFTS: 'QUA_NHIEU_CA',
  INVALID_DATE_RANGE: 'KHOANG_NGAY_KHONG_HOP_LE',
} as const;

/** Mã của MỘT trường trong loi[] (DTO). */
export const SHIFT_FIELD_ERRORS = {
  DOCTORS: 'BAC_SI_KHONG_HOP_LE',
  DATE: 'NGAY_KHONG_HOP_LE',
  WEEKDAY: 'THU_KHONG_HOP_LE',
  SHIFT: 'CA_KHONG_HOP_LE',
} as const;

/** Giới hạn của DTO (PLAN 5.3 bước 1). */
export const MAX_DOCTORS_PER_RULE = 20;

/** Số vi phạm tối đa trả trong `viPham[]` (PLAN 5.3 bước 4). */
export const MAX_VIOLATIONS_LISTED = 50;

/** Hai ca được phân công; `CaToi` không bao giờ tồn tại (Q6, quy tắc 44). */
export const ASSIGNABLE_SHIFTS = ['CaSang', 'CaChieu'] as const;
export type AssignableShift = (typeof ASSIGNABLE_SHIFTS)[number];
