import { errorMessageFor } from '../../shared/api/error-message';
import { ApiError, RequestAbortedError } from '../../shared/api/errors';
import { FIELD_MESSAGES, INVALID_DATA_MESSAGE, SYSTEM_MESSAGE } from '../auth';

// Chữ chọn theo `maLoi` và `loi[].ma`; KHÔNG dùng `thongBao` của API (PLAN admin 5.9).
// Câu nội dung ĐÃ duyệt ở PLAN 5.9. Tiêu đề và câu gợi ý tải lại là [đề xuất] (TRACKING admin 9A.7).
export const INVALID_LINK_TITLE = 'Liên kết không hợp lệ';
export const INVALID_LINK_MESSAGE =
  'Liên kết kích hoạt không còn hiệu lực. Vui lòng liên hệ Quản trị viên để được gửi lại.';
// Tải lại trang làm mất fragment (đã xoá khỏi URL, và token không được lưu vào kho trình duyệt). Câu này hiện giống hệt ở MỌI lý do
// nên không cho dò xem liên kết nào tồn tại (H6).
export const RELOAD_HINT =
  'Nếu bạn vừa tải lại trang, hãy mở lại liên kết trong email.';

// ---- Lời gọi `validate` khi tải trang ----

export type ValidateFailure =
  // Mọi lý do liên kết không dùng được: CÙNG một màn (NS-35, A5)
  | { kind: 'invalid' }
  // Chưa biết liên kết có hợp lệ không (mất mạng, hết giờ, 5xx, 429…): cho thử lại, KHÔNG coi là liên kết hỏng
  | { kind: 'unreachable'; error: unknown }
  | { kind: 'ignored' };

export function describeValidateError(error: unknown): ValidateFailure {
  if (error instanceof RequestAbortedError) return { kind: 'ignored' };
  if (error instanceof ApiError && error.maLoi === 'LIEN_KET_KHONG_HOP_LE') {
    return { kind: 'invalid' };
  }
  return { kind: 'unreachable', error };
}

// ---- Lời gọi `complete` khi gửi form ----

export interface PasswordFieldErrors {
  matKhauMoi?: string;
  xacNhan?: string;
}

export type CompleteFailure =
  | { kind: 'invalid' }
  // Mật khẩu hoặc xác nhận bị API từ chối: liên kết VẪN còn hiệu lực (A6), người dùng sửa và gửi lại
  | { kind: 'fields'; fields: PasswordFieldErrors }
  | { kind: 'message'; message: string }
  | { kind: 'ignored' };

// 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[{ truong, ma }]` (ValidationPipe toàn cục, B16): `truong` là `matKhauMoi` hoặc `xacNhan`
function describeFields(error: ApiError): CompleteFailure {
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

export function describeCompleteError(error: unknown): CompleteFailure {
  if (error instanceof RequestAbortedError) return { kind: 'ignored' };
  if (!(error instanceof ApiError)) {
    return { kind: 'message', message: errorMessageFor(error) };
  }
  switch (error.maLoi) {
    case 'LIEN_KET_KHONG_HOP_LE':
      return { kind: 'invalid' };
    case 'DU_LIEU_KHONG_HOP_LE':
      return describeFields(error);
    case 'LOI_HE_THONG':
      return { kind: 'message', message: SYSTEM_MESSAGE };
  }
  return { kind: 'message', message: errorMessageFor(error) };
}
