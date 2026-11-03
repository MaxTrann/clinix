import { errorMessageFor } from '../../../shared/api/error-message';
import { ApiError, RequestAbortedError } from '../../../shared/api/errors';
import {
  isPlausibleEmail,
  isValidFullName,
  isValidPhone,
} from '../validation/account-policy';
import { checkPassword } from '../validation/password-policy';
import type { RegisterInput } from './register-service';

// Câu chữ theo PLAN auth mục 5.5, chọn theo `maLoi` và `loi[].ma`; KHÔNG dùng `thongBao` của API.
export const PASSWORD_RULE_MESSAGE =
  'Mật khẩu từ 8 đến 64 ký tự, gồm ít nhất một chữ số và một ký tự đặc biệt (ví dụ ! @ # $ % .).';
export const INVALID_DATA_MESSAGE = 'Dữ liệu không hợp lệ.';
export const SYSTEM_MESSAGE = 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.';
const ORIGIN_MESSAGE = 'Yêu cầu không đến từ trang web được phép.';
export const TOO_SOON_MESSAGE = 'Vui lòng thử lại sau.';
export const MAIL_FAILED_MESSAGE =
  'Không gửi được email. Vui lòng thử lại sau ít phút.';
const EMAIL_TAKEN_MESSAGE = 'Email này đã được sử dụng. Vui lòng đăng nhập.';

export const FIELD_MESSAGES: Record<string, string> = {
  HO_TEN_KHONG_HOP_LE:
    'Họ tên phải có ít nhất một chữ cái, tối đa 100 ký tự và không chứa ký tự điều khiển.',
  EMAIL_KHONG_HOP_LE: 'Email không hợp lệ.',
  SDT_KHONG_HOP_LE: 'Số điện thoại phải 10 số, bắt đầu bằng 0.',
  MAT_KHAU_KHONG_HOP_LE: PASSWORD_RULE_MESSAGE,
  MAT_KHAU_KY_TU_KHONG_HOP_LE:
    'Mật khẩu chỉ được dùng chữ không dấu, chữ số, dấu câu/ký hiệu và dấu cách.',
  XAC_NHAN_KHONG_KHOP: 'Mật khẩu xác nhận không khớp.',
};

// Thứ tự ô trên biểu mẫu: focus nhảy tới ô lỗi đầu tiên
export const REGISTER_FIELDS = [
  'hoTen',
  'email',
  'soDienThoai',
  'matKhau',
  'xacNhan',
] as const;
export type RegisterField = (typeof REGISTER_FIELDS)[number];
export type RegisterFieldErrors = Partial<Record<RegisterField, string>>;

export type RegisterFailure =
  | { kind: 'fields'; fields: RegisterFieldErrors }
  | { kind: 'message'; message: string }
  | { kind: 'emailTaken'; message: string }
  | { kind: 'tooSoon'; seconds: number }
  | { kind: 'mailFailed'; maXacThucId: string; coTheGuiLaiLuc: string }
  | { kind: 'ignored' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRegisterField(truong: string): truong is RegisterField {
  return (REGISTER_FIELDS as readonly string[]).includes(truong);
}

function waitSeconds(chiTiet: unknown): number | null {
  const seconds = isRecord(chiTiet) ? chiTiet.soGiayCho : null;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? seconds
    : null;
}

// `chiTiet` của 503 GUI_MAIL_LOI: tài khoản đã lưu, id là hàng gửi lỗi
function mailFailureDetail(
  chiTiet: unknown,
): { maXacThucId: string; coTheGuiLaiLuc: string } | null {
  if (
    isRecord(chiTiet) &&
    typeof chiTiet.maXacThucId === 'string' &&
    chiTiet.maXacThucId !== '' &&
    typeof chiTiet.coTheGuiLaiLuc === 'string'
  ) {
    return {
      maXacThucId: chiTiet.maXacThucId,
      coTheGuiLaiLuc: chiTiet.coTheGuiLaiLuc,
    };
  }
  return null;
}

export type DeliveryFailure =
  | { kind: 'tooSoon'; seconds: number }
  | { kind: 'mailFailed'; maXacThucId: string; coTheGuiLaiLuc: string }
  | { kind: 'message'; message: string };

// 429 GUI_LAI_QUA_SOM: đếm theo `soGiayCho`; thiếu số thì chỉ còn câu. Dùng chung cho đăng ký (F2) và quên mật khẩu (F4).
export function describeTooSoon(
  error: ApiError,
): { kind: 'tooSoon'; seconds: number } | { kind: 'message'; message: string } {
  const seconds = waitSeconds(error.chiTiet);
  return seconds === null
    ? { kind: 'message', message: TOO_SOON_MESSAGE }
    : { kind: 'tooSoon', seconds };
}

// Dùng chung cho `POST /auth/register` và `/resend-otp`: hai mã có cùng dạng `chiTiet`
export function describeDelivery(error: ApiError): DeliveryFailure {
  if (error.maLoi === 'GUI_LAI_QUA_SOM') return describeTooSoon(error);
  const detail = mailFailureDetail(error.chiTiet);
  return detail
    ? { kind: 'mailFailed', ...detail }
    : { kind: 'message', message: MAIL_FAILED_MESSAGE };
}

function describeFields(error: ApiError): RegisterFailure {
  const fields: RegisterFieldErrors = {};
  for (const { truong, ma } of error.loi ?? []) {
    if (isRegisterField(truong)) {
      fields[truong] ??= FIELD_MESSAGES[ma] ?? INVALID_DATA_MESSAGE;
    }
  }
  if (Object.keys(fields).length === 0) {
    return { kind: 'message', message: INVALID_DATA_MESSAGE };
  }
  return { kind: 'fields', fields };
}

export function describeRegisterError(error: unknown): RegisterFailure {
  if (error instanceof RequestAbortedError) return { kind: 'ignored' };
  if (!(error instanceof ApiError)) {
    return { kind: 'message', message: errorMessageFor(error) };
  }

  switch (error.maLoi) {
    case 'DU_LIEU_KHONG_HOP_LE':
      return describeFields(error);
    case 'EMAIL_DA_DUNG':
      return { kind: 'emailTaken', message: EMAIL_TAKEN_MESSAGE };
    case 'GUI_LAI_QUA_SOM':
    case 'GUI_MAIL_LOI':
      return describeDelivery(error);
    case 'LOI_HE_THONG':
      return { kind: 'message', message: SYSTEM_MESSAGE };
    case 'ORIGIN_KHONG_HOP_LE':
      return { kind: 'message', message: ORIGIN_MESSAGE };
  }
  return { kind: 'message', message: errorMessageFor(error) };
}

// Câu "Vui lòng nhập …" theo frame `641:2`
export function validateRegisterForm(
  values: RegisterInput,
): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {};
  if (values.hoTen.trim() === '') {
    errors.hoTen = 'Vui lòng nhập họ và tên.';
  } else if (!isValidFullName(values.hoTen)) {
    errors.hoTen = FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE;
  }

  if (values.email.trim() === '') {
    errors.email = 'Vui lòng nhập email.';
  } else if (!isPlausibleEmail(values.email)) {
    errors.email = FIELD_MESSAGES.EMAIL_KHONG_HOP_LE;
  }

  if (!isValidPhone(values.soDienThoai)) {
    errors.soDienThoai = FIELD_MESSAGES.SDT_KHONG_HOP_LE;
  }

  const passwordIssue = checkPassword(values.matKhau);
  if (passwordIssue) errors.matKhau = FIELD_MESSAGES[passwordIssue];

  if (values.xacNhan !== values.matKhau) {
    errors.xacNhan = FIELD_MESSAGES.XAC_NHAN_KHONG_KHOP;
  }
  return errors;
}
