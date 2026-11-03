import {
  GENERIC_ERROR_MESSAGE,
  errorMessageFor,
} from '../../../shared/api/error-message';
import { ApiError, RequestAbortedError } from '../../../shared/api/errors';
import {
  FIELD_MESSAGES,
  INVALID_DATA_MESSAGE,
  SYSTEM_MESSAGE,
  describeTooSoon,
} from '../register/register-errors';
import { describeVerifyError } from '../verify/verify-errors';

// Câu chữ theo PLAN auth mục 5.5, chọn theo `maLoi` và `loi[].ma`; KHÔNG dùng `thongBao` của API.
export const NOT_REGISTERED_MESSAGE = 'Email chưa đăng ký.';
// Câu riêng của khung Quên mật khẩu, frame `644:2` (D1)
export const PENDING_ACTIVATION_MESSAGE =
  'Tài khoản nhân sự này chưa kích hoạt và không thể dùng quên mật khẩu. Hãy dùng link kích hoạt trong email đầu tiên hoặc liên hệ quản trị viên.';
export const TOKEN_EXPIRED_MESSAGE =
  'Yêu cầu đặt lại mật khẩu đã hết hiệu lực. Vui lòng nhập email để nhận mã mới.';
// [đề xuất] D9, D10
export const OLD_CODE_HINT =
  'Nếu còn mã trong thư trước, bạn có thể nhập mã đó.';
export const RESENT_MESSAGE =
  'Đã gửi mã mới. Mã trong thư trước không còn dùng được, vui lòng dùng thư mới nhất.';
// Khung Hoàn tất: N7 và N3 (N3 là [đề xuất])
export const SUSPENDED_DONE_MESSAGE =
  'Mật khẩu đã được đặt lại. Tài khoản của bạn hiện đang ngừng hoạt động nên chưa thể đăng nhập. Vui lòng liên hệ bộ phận hỗ trợ.';
export const REREGISTER_DONE_MESSAGE =
  'Mật khẩu đã được đặt lại. Tài khoản chưa xác minh email; vui lòng đăng ký lại bằng email này để nhận mã OTP mới.';

export type Failure =
  | { kind: 'message'; message: string }
  | { kind: 'ignored' }
  // Phải quay về bước 1 (kèm câu): email không còn, tài khoản chưa kích hoạt, token hết hiệu lực
  | { kind: 'backToEmail'; message: string };

// Lỗi của bước 1 và của Gửi lại mã (CÙNG một hàm ở API)
export type CodeRequestFailure =
  | Failure
  | { kind: 'tooSoon'; seconds: number }
  // `chiTiet` của A11 CHỈ có `coTheGuiLaiLuc` (không có `maXacThucId` như đăng ký)
  | { kind: 'mailFailed'; coTheGuiLaiLuc: string | null }
  | { kind: 'emailField'; message: string };

export type CodeFailure =
  | Failure
  // Mã sai: nhập lại
  | { kind: 'wrongCode'; message: string }
  // Mã không dùng được nữa: chỉ còn Gửi lại mã
  | { kind: 'deadCode'; message: string };

export interface PasswordFieldErrors {
  matKhauMoi?: string;
  xacNhan?: string;
}

export type ResetFailure =
  Failure | { kind: 'fields'; fields: PasswordFieldErrors };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describeOther(error: unknown): Failure {
  if (error instanceof RequestAbortedError) return { kind: 'ignored' };
  if (error instanceof ApiError && error.maLoi === 'LOI_HE_THONG') {
    return { kind: 'message', message: SYSTEM_MESSAGE };
  }
  return { kind: 'message', message: errorMessageFor(error) };
}

// Hai mã từ chối theo tư cách tài khoản: bước 1, Gửi lại mã và bước 3 trả CÙNG thân (A11, A12)
function refusal(error: ApiError): Failure | null {
  if (error.maLoi === 'EMAIL_CHUA_DANG_KY') {
    return { kind: 'backToEmail', message: NOT_REGISTERED_MESSAGE };
  }
  if (error.maLoi === 'TAI_KHOAN_CHUA_KICH_HOAT') {
    return { kind: 'backToEmail', message: PENDING_ACTIVATION_MESSAGE };
  }
  return null;
}

export function describeCodeRequestError(error: unknown): CodeRequestFailure {
  if (!(error instanceof ApiError)) return describeOther(error);
  switch (error.maLoi) {
    case 'GUI_LAI_QUA_SOM':
      return describeTooSoon(error);
    case 'GUI_MAIL_LOI': {
      const at = isRecord(error.chiTiet) ? error.chiTiet.coTheGuiLaiLuc : null;
      return {
        kind: 'mailFailed',
        coTheGuiLaiLuc: typeof at === 'string' && at !== '' ? at : null,
      };
    }
    case 'DU_LIEU_KHONG_HOP_LE': {
      const emailIssue = error.loi?.find(({ truong }) => truong === 'email');
      return emailIssue
        ? {
            kind: 'emailField',
            message: FIELD_MESSAGES[emailIssue.ma] ?? INVALID_DATA_MESSAGE,
          }
        : { kind: 'message', message: INVALID_DATA_MESSAGE };
    }
  }
  return refusal(error) ?? describeOther(error);
}

// Dùng nguyên bảng câu của F2 cho OTP_SAI, OTP_HET_HAN, OTP_HET_LUOT, DU_LIEU_KHONG_HOP_LE, LOI_HE_THONG
export function describeCodeError(error: unknown): CodeFailure {
  const failure = describeVerifyError(error);
  switch (failure.kind) {
    case 'ignored':
    case 'wrongCode':
    case 'deadCode':
    case 'message':
      return failure;
    // `verify-otp` của quên mật khẩu không trả hai loại này; nếu có thì chỉ hiện câu
    case 'reregister':
    case 'suspended':
      return { kind: 'message', message: failure.message };
    // `describeVerifyError` không bao giờ trả `tooSoon`, `mailFailed` (chỉ của gửi lại); giữ để kiểu đủ nhánh
    default:
      return { kind: 'message', message: GENERIC_ERROR_MESSAGE };
  }
}

export function describeResetError(error: unknown): ResetFailure {
  if (!(error instanceof ApiError)) return describeOther(error);
  if (error.maLoi === 'RESET_TOKEN_HET_HIEU_LUC') {
    return { kind: 'backToEmail', message: TOKEN_EXPIRED_MESSAGE };
  }
  if (error.maLoi === 'DU_LIEU_KHONG_HOP_LE') {
    const fields: PasswordFieldErrors = {};
    for (const { truong, ma } of error.loi ?? []) {
      if (truong === 'matKhauMoi' || truong === 'xacNhan') {
        fields[truong] ??= FIELD_MESSAGES[ma] ?? INVALID_DATA_MESSAGE;
      }
    }
    return Object.keys(fields).length > 0
      ? { kind: 'fields', fields }
      : { kind: 'message', message: INVALID_DATA_MESSAGE };
  }
  return refusal(error) ?? describeOther(error);
}
