import { errorMessageFor } from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { ChangePasswordNotSentError } from '../auth-session';
import type { ChangePasswordInput } from '../auth-session';
import {
  FIELD_MESSAGES,
  INVALID_DATA_MESSAGE,
  SYSTEM_MESSAGE,
} from '../register/register-errors';
import { PASSWORD_MAX_LENGTH } from '../validation/password-policy';
import { validateNewPassword } from '../validation/new-password';

// Câu chữ theo PLAN auth mục 5.5, chọn theo `maLoi` và `loi[].ma`; KHÔNG dùng `thongBao` của API. Câu nào chưa duyệt là [đề xuất].
export const CURRENT_REQUIRED_MESSAGE = 'Vui lòng nhập mật khẩu hiện tại.';
export const WRONG_CURRENT_MESSAGE = 'Mật khẩu hiện tại không đúng.';
export const CHANGED_MESSAGE =
  'Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.';
export const UNKNOWN_RESULT_MESSAGE =
  'Không rõ mật khẩu đã được đổi hay chưa. Nếu sau này bị yêu cầu đăng nhập lại, hãy thử mật khẩu mới trước.';
export const NOT_SENT_MESSAGE = 'Chưa gửi được yêu cầu. Vui lòng thử lại.';

// Thứ tự ô trên biểu mẫu: focus nhảy tới ô lỗi đầu tiên
export const CHANGE_PASSWORD_FIELDS = [
  'matKhauCu',
  'matKhauMoi',
  'xacNhan',
] as const;
export type ChangePasswordField = (typeof CHANGE_PASSWORD_FIELDS)[number];
export type ChangePasswordFieldErrors = Partial<
  Record<ChangePasswordField, string>
>;

export type ChangePasswordFailure =
  | { kind: 'fields'; fields: ChangePasswordFieldErrors }
  // Chắc chắn chưa đổi (hoặc 500, xem F5-J): giữ dữ liệu để thử lại
  | { kind: 'message'; message: string }
  // Không biết máy chủ đã đổi hay chưa: xoá ô, KHÔNG tự thử lại
  | { kind: 'unknown'; message: string }
  | { kind: 'ignored' };

// Kiểm trước khi gửi. Mật khẩu hiện tại chỉ chặn khi chắc chắn sai (như ô mật khẩu của đăng nhập): chính sách mới không áp cho mật khẩu cũ
export function validateChangePassword(
  values: ChangePasswordInput,
): ChangePasswordFieldErrors {
  const errors: ChangePasswordFieldErrors = validateNewPassword(
    values.matKhauMoi,
    values.xacNhan,
  );
  if (values.matKhauCu === '') {
    errors.matKhauCu = CURRENT_REQUIRED_MESSAGE;
  } else if (values.matKhauCu.length > PASSWORD_MAX_LENGTH) {
    // Không mật khẩu nào dài hơn 64 ký tự khớp được
    errors.matKhauCu = WRONG_CURRENT_MESSAGE;
  }
  return errors;
}

// `matKhauCu` của API chỉ có lỗi "không thể là mật khẩu của ai" nên cùng câu với MAT_KHAU_CU_SAI
function fieldMessage(truong: ChangePasswordField, ma: string): string {
  if (truong === 'matKhauCu') return WRONG_CURRENT_MESSAGE;
  return FIELD_MESSAGES[ma] ?? INVALID_DATA_MESSAGE;
}

function isChangePasswordField(truong: string): truong is ChangePasswordField {
  return (CHANGE_PASSWORD_FIELDS as readonly string[]).includes(truong);
}

function describeFields(error: ApiError): ChangePasswordFailure {
  const fields: ChangePasswordFieldErrors = {};
  for (const { truong, ma } of error.loi ?? []) {
    if (isChangePasswordField(truong))
      fields[truong] ??= fieldMessage(truong, ma);
  }
  return Object.keys(fields).length > 0
    ? { kind: 'fields', fields }
    : { kind: 'message', message: INVALID_DATA_MESSAGE };
}

export function describeChangePasswordError(
  error: unknown,
): ChangePasswordFailure {
  // Đăng xuất trong lúc chờ: cổng sẽ đưa về đăng nhập, không có gì để báo
  if (error instanceof RequestAbortedError) return { kind: 'ignored' };
  if (error instanceof ChangePasswordNotSentError) {
    return { kind: 'message', message: NOT_SENT_MESSAGE };
  }
  // Đã gửi mà không có câu trả lời chuẩn (502/504 của nginx cũng vậy): máy chủ có thể đã đổi xong
  if (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof UnexpectedResponseError
  ) {
    return { kind: 'unknown', message: UNKNOWN_RESULT_MESSAGE };
  }
  if (!(error instanceof ApiError)) {
    return { kind: 'message', message: errorMessageFor(error) };
  }

  switch (error.maLoi) {
    case 'MAT_KHAU_CU_SAI':
      return { kind: 'fields', fields: { matKhauCu: WRONG_CURRENT_MESSAGE } };
    case 'DU_LIEU_KHONG_HOP_LE':
      return describeFields(error);
    case 'LOI_HE_THONG':
      return { kind: 'message', message: SYSTEM_MESSAGE };
  }
  // 401 sau khi đã thử phục hồi (phiên hết thì cổng tự về đăng nhập), 403…: request không được xử lý, thử lại an toàn
  return { kind: 'message', message: errorMessageFor(error) };
}
