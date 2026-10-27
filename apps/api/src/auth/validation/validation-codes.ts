import { PASSWORD_ISSUES } from '../password/password-policy.js';

// Mã lỗi ổn định cho dữ liệu đầu vào của tài khoản (PLAN.md mục 5.5). Frontend chọn thông báo theo MÃ, không theo câu chữ.
export const VALIDATION_CODES = {
  INVALID_EMAIL: 'EMAIL_KHONG_HOP_LE',
  INVALID_PHONE: 'SDT_KHONG_HOP_LE',
  INVALID_PASSWORD: PASSWORD_ISSUES.INVALID,
  INVALID_PASSWORD_CHARACTERS: PASSWORD_ISSUES.INVALID_CHARACTERS,
  PASSWORD_CONFIRMATION_MISMATCH: 'XAC_NHAN_KHONG_KHOP',
} as const;

export type ValidationCode =
  (typeof VALIDATION_CODES)[keyof typeof VALIDATION_CODES];
