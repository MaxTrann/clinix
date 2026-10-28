import type { EntityManager } from 'typeorm';
import type { LoaiXacThuc } from '../entities/enums.js';

// Kiểu dùng chung của OtpService (task A2). KichHoatNhanSu thuộc module admin nên không nằm ở đây.
export type OtpLoai = Extract<LoaiXacThuc, 'DangKy' | 'QuenMatKhau'>;

// Dữ liệu của MỘT lần đăng ký, gắn với hàng OTP (Q7, PLAN 5.2). Hàng nào của loại DangKy cũng có đủ ba trường hoặc bị đặt NULL cả ba.
export interface RegistrationData {
  hoTen: string;
  soDienThoai: string;
  matKhauBam: string;
}

// Trạng thái của MỘT hàng OTP, suy ra từ các cột (bảng ở PLAN 5.2), không có cột trạng thái riêng.
export type OtpState =
  | 'DA_DUNG'
  | 'CAN_DANG_KY_LAI' // thu hồi do đặt lại mật khẩu (N3): ba cột dữ liệu đăng ký đã NULL
  | 'BI_THAY_THE' // có hàng cùng tài khoản/loại ĐÃ GỬI THÀNH CÔNG với id lớn hơn
  | 'CHUA_GUI' // chưa gửi hoặc gửi lỗi (da_gui_luc rỗng)
  | 'THU_HOI_SAI' // thu hồi do nhập sai đủ số lần
  | 'HET_HAN'
  | 'DANG_DUNG';

// Mã lỗi nghiệp vụ của OTP (PLAN 5.5)
export type OtpFailureCode =
  | 'OTP_SAI'
  | 'OTP_HET_HAN'
  | 'OTP_HET_LUOT'
  | 'OTP_BI_THAY_THE'
  | 'CAN_DANG_KY_LAI'
  | 'GUI_LAI_QUA_SOM';

// Lý do chi tiết, chỉ để ghi log và test; KHÔNG đưa ra HTTP (nhiều lý do dùng chung một mã để không lộ trạng thái hàng)
export type OtpFailureReason =
  | 'NOT_FOUND'
  | 'WRONG_ACCOUNT'
  | 'WRONG_TYPE'
  | 'USED'
  | 'NOT_SENT'
  | 'WRONG_CODE'
  | 'EXPIRED'
  | 'ATTEMPTS_EXHAUSTED'
  | 'REPLACED'
  | 'REGISTRATION_VOID'
  | 'TOO_SOON'
  | 'HOURLY_LIMIT';

export interface OtpFailure {
  code: OtpFailureCode;
  reason: OtpFailureReason;
  /** Chỉ GUI_LAI_QUA_SOM: số giây phải chờ */
  retryAfterSeconds?: number;
  /** Chỉ khi vừa nhập sai: số lần sai của mã này (kể cả lần này). Không đưa ra HTTP. */
  wrongAttempts?: number;
}

export interface TransactionOptions {
  /** Giao dịch của người gọi; không truyền thì OtpService tự mở một giao dịch riêng. */
  manager?: EntityManager;
}

// Một hàng OTP đã được xác minh đúng
export interface VerifiedOtp {
  maXacThucId: string;
  taiKhoanId: string;
  loai: OtpLoai;
  hetHanLuc: Date;
  /** Dữ liệu lần đăng ký gắn với mã (chỉ DangKy), đọc từ chính hàng OTP đã khoá */
  registration: RegistrationData | null;
}

export interface Recipient {
  email: string;
  /** Họ tên in ở lời chào; thiếu thì chào chung */
  fullName?: string | null;
}

// `trangThaiMa` của đáp ứng đăng nhập chưa xác minh (PLAN 5.3, N2)
export type OtpStatusLabel =
  'ConHan' | 'HetHan' | 'DaThuHoi' | 'ChuaGui' | 'CanDangKyLai';

export interface OtpLatestStatus {
  maXacThucId: string;
  trangThaiMa: OtpStatusLabel;
  hetHanLuc: Date;
}

// --- Đầu vào và kết quả của OtpService. Lỗi nghiệp vụ được TRẢ VỀ (ok: false), không ném: nếu ném bên trong giao dịch thì
// lần đếm nhập sai đã ghi sẽ bị ROLLBACK theo. Dùng toOtpException (otp-errors.ts) để đổi sang AppException khi cần.

export type IssueOtpInput =
  | { taiKhoanId: string; loai: 'QuenMatKhau' }
  | { taiKhoanId: string; loai: 'DangKy'; registration: RegistrationData };

/** `issued` mang mã rõ ở trường riêng (xem IssuedOtp); chỉ OtpService.deliver lấy được. */
export type IssueOtpResult<TIssued> =
  { ok: true; issued: TIssued } | { ok: false; failure: OtpFailure };

export interface DeliveredOtp {
  maXacThucId: string;
  hetHanLuc: Date;
}

export type VerifyOtpInput = {
  loai: OtpLoai;
  otp: string;
  /**
   * Ràng buộc tuỳ chọn: chỉ chấp nhận hàng thuộc đúng tài khoản này, sai thì từ chối NGAY, không khoá, không đếm lần sai
   * (OTP_SAI, WRONG_ACCOUNT). Dùng khi `maXacThucId` (số tuần tự) là thứ duy nhất client gửi: A6 tra tài khoản theo thông tin
   * khó đoán hơn (ví dụ email) rồi truyền vào đây, để người ngoài không duyệt tuần tự id mà đốt lượt nhập của người khác.
   */
  expectedTaiKhoanId?: string;
} & (
  | { maXacThucId: string } // đăng ký: hàng cụ thể
  | { taiKhoanId: string } // quên mật khẩu: hàng đã gửi thành công mới nhất của tài khoản
);

export interface VerifiedContext {
  /** Giao dịch của lần xác minh: ghi tài khoản, benh_nhan, ví… ở đây để cùng commit/rollback với việc đánh dấu đã dùng. */
  manager: EntityManager;
  otp: VerifiedOtp;
  now: Date;
}

export type VerifyOtpResult<T> =
  { ok: true; otp: VerifiedOtp; value: T } | { ok: false; failure: OtpFailure };

export type ConsumeFailureReason =
  | 'NOT_FOUND'
  | 'WRONG_ACCOUNT'
  | 'WRONG_TYPE'
  | 'NOT_SENT'
  | 'USED'
  | 'REVOKED';

export type ConsumeOtpResult =
  { ok: true } | { ok: false; reason: ConsumeFailureReason };
