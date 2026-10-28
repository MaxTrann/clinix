import {
  OTP_RESEND_MIN_INTERVAL_MS,
  OTP_TTL_MS,
  UNVERIFIED_ACCOUNT_TTL_MS,
} from '../auth.constants.js';
import type { TaiKhoan } from '../entities/tai-khoan.entity.js';

// Quy tắc đăng ký dưới dạng HÀM THUẦN (không DB, không đồng hồ thật): kiểm bằng đồng hồ truyền vào, và là nơi DUY NHẤT định nghĩa
// "tài khoản nào đăng ký lại được / xoá được" để RegisterService và job dọn (A7) không lệch nhau.
export type AccountFacts = Pick<
  TaiKhoan,
  'loaiTaiKhoan' | 'daXacMinhEmail' | 'trangThai' | 'thoiDiemTao'
>;

/**
 * Email này còn "đăng ký mở" (PLAN 5.2 nhánh 3–4): thuộc Bệnh nhân CHƯA xác minh và ĐANG hoạt động. Mọi trường hợp khác (đã xác minh, nhân sự
 * kể cả chờ kích hoạt, hoặc Bệnh nhân chưa xác minh nhưng bị admin ngưng hoạt động có chủ ý) là EMAIL_DA_DUNG.
 */
export function isOpenRegistration(account: AccountFacts): boolean {
  return (
    account.loaiTaiKhoan === 'BenhNhan' &&
    !account.daXacMinhEmail &&
    account.trangThai === 'DangHoatDong'
  );
}

/** Tài khoản mở đã sống từ 24 giờ trở lên kể từ lúc tạo (nửa mở: đúng 24:00:00 là hết) ⇒ được xoá (lười ở A5, job ở A7). */
export function isExpiredUnverifiedPatient(
  account: AccountFacts,
  now: Date,
): boolean {
  return (
    isOpenRegistration(account) &&
    now.getTime() >= account.thoiDiemTao.getTime() + UNVERIFIED_ACCOUNT_TTL_MS
  );
}

/**
 * Thời điểm sớm nhất được cấp mã mới sau mã vừa tạo: tao_luc + 60 giây. OtpService chỉ trả hạn mã (= tao_luc + 10 phút) nên suy ngược
 * bằng hai hằng chung, để không sửa OtpService và không thể lệch với quy tắc giới hạn gửi lại của nó.
 */
export function resendAvailableAt(expiresAt: Date): Date {
  return new Date(
    expiresAt.getTime() - OTP_TTL_MS + OTP_RESEND_MIN_INTERVAL_MS,
  );
}
