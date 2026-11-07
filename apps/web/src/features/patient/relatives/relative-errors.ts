import { GENERIC_ERROR_MESSAGE } from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { isValidFullName, isValidPhone, trimAsciiWhitespace } from '../../auth';
import {
  FIELD_MESSAGES,
  INVALID_DATA_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  SAVE_NETWORK_MESSAGE,
  SAVE_TIMEOUT_MESSAGE,
  SAVE_UNEXPECTED_MESSAGE,
  SYSTEM_MESSAGE,
  birthDateError,
  isSessionEnded,
} from '../profile/profile-errors';
import { fromDisplayDate, genderLabel } from '../profile/profile-format';
import { relationshipLabel } from './relative-labels';
import type { RelativeFormValues, RelativePayload } from './relatives-types';

// Kiểm form, câu chữ và phân loại lỗi lưu của khối Người thân (patient F6; TRACKING F6-E, F6-F). Hàm thuần.
// Câu chữ theo PLAN patient 5.9, chọn theo `maLoi` và `loi[].ma` (KHÔNG dùng `thongBao` của API); họ tên, SĐT, ngày sinh dùng lại
// câu của F3 (họ tên và SĐT y hệt auth). Câu chưa có ở 5.9 là [đề xuất].

export const ADDED_MESSAGE = 'Đã thêm hồ sơ người thân.';
export const UPDATED_MESSAGE = 'Đã cập nhật hồ sơ người thân.';
export const MISSING_MESSAGE = 'Hồ sơ người thân này không còn tồn tại.';
// PLAN 5.9, `HO_SO_NGUOI_THAN_DA_NGUNG`
export const DEACTIVATED_MESSAGE =
  'Hồ sơ người thân này đã ngừng sử dụng nên không thể chỉnh sửa.';
export const BIRTH_DATE_REQUIRED_MESSAGE = 'Vui lòng nhập ngày sinh.';
export const RELATIONSHIP_REQUIRED_MESSAGE = 'Vui lòng chọn mối quan hệ.';

// POST không idempotent: mất mạng hay quá giờ có thể xảy ra SAU khi máy chủ đã ghi, bấm thêm lần nữa sẽ tạo hồ sơ thứ hai (Q14 không chặn trùng)
const CREATE_UNSURE_SUFFIX =
  'Hãy tải lại danh sách để kiểm tra trước khi thêm lại.';
export const ADD_NETWORK_MESSAGE = `Mất kết nối khi đang thêm, chưa rõ hồ sơ đã được thêm hay chưa. ${CREATE_UNSURE_SUFFIX}`;
export const ADD_TIMEOUT_MESSAGE = `Máy chủ phản hồi quá lâu, chưa rõ hồ sơ đã được thêm hay chưa. ${CREATE_UNSURE_SUFFIX}`;
export const ADD_UNEXPECTED_MESSAGE = `Không nhận được phản hồi hợp lệ từ máy chủ, chưa rõ hồ sơ đã được thêm hay chưa. ${CREATE_UNSURE_SUFFIX}`;

// Câu theo mã lỗi của từng ô (`loi[].ma`); `DIA_CHI_KHONG_HOP_LE` cố ý không có (người thân không có địa chỉ, Q8)
const RELATIVE_FIELD_MESSAGES: Record<string, string> = {
  HO_TEN_KHONG_HOP_LE: FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE,
  MOI_QUAN_HE_KHONG_HOP_LE: RELATIONSHIP_REQUIRED_MESSAGE,
  GIOI_TINH_KHONG_HOP_LE: FIELD_MESSAGES.GIOI_TINH_KHONG_HOP_LE,
  NGAY_SINH_KHONG_HOP_LE: FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE,
  SDT_KHONG_HOP_LE: FIELD_MESSAGES.SDT_KHONG_HOP_LE,
};

// Thứ tự ô trên form: focus nhảy tới ô lỗi ĐẦU TIÊN theo thứ tự này, không theo thứ tự `loi[]` của API
export const RELATIVE_FIELDS = [
  'hoTen',
  'moiQuanHe',
  'gioiTinh',
  'ngaySinh',
  'soDienThoai',
] as const;
export type RelativeField = (typeof RELATIVE_FIELDS)[number];
export type RelativeFieldErrors = Partial<Record<RelativeField, string>>;

function isRelativeField(name: string): name is RelativeField {
  return (RELATIVE_FIELDS as readonly string[]).includes(name);
}

export function firstInvalidRelativeField(
  errors: RelativeFieldErrors,
): RelativeField | null {
  return RELATIVE_FIELDS.find((field) => errors[field] !== undefined) ?? null;
}

// Kiểm trước khi gửi (đúng luật PLAN 5.8; API vẫn là nguồn đúng). `today` là YYYY-MM-DD theo giờ Việt Nam.
// Khác form Bản thân: quan hệ, giới tính, ngày sinh BẮT BUỘC; SĐT tuỳ chọn (trống hợp lệ); không có địa chỉ.
export function validateRelativeForm(
  values: RelativeFormValues,
  today: string,
): RelativeFieldErrors {
  const errors: RelativeFieldErrors = {};
  if (trimAsciiWhitespace(values.hoTen) === '') {
    errors.hoTen = NAME_REQUIRED_MESSAGE;
  } else if (!isValidFullName(values.hoTen)) {
    errors.hoTen = FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE;
  }
  if (relationshipLabel(values.moiQuanHe) === null) {
    errors.moiQuanHe = RELATIONSHIP_REQUIRED_MESSAGE;
  }
  if (genderLabel(values.gioiTinh) === null) {
    errors.gioiTinh = FIELD_MESSAGES.GIOI_TINH_KHONG_HOP_LE;
  }
  if (trimAsciiWhitespace(values.ngaySinh) === '') {
    errors.ngaySinh = BIRTH_DATE_REQUIRED_MESSAGE;
  } else {
    const dateError = birthDateError(values.ngaySinh, today);
    if (dateError !== undefined) errors.ngaySinh = dateError;
  }
  if (
    trimAsciiWhitespace(values.soDienThoai) !== '' &&
    !isValidPhone(values.soDienThoai)
  ) {
    errors.soDienThoai = FIELD_MESSAGES.SDT_KHONG_HOP_LE;
  }
  return errors;
}

// Thân POST và PUT từ các ô ĐÃ qua validateRelativeForm: đúng năm khoá. SĐT chỉ cắt khoảng trắng (API tự chuẩn hoá thành 10 số liền),
// trống ⇒ null (API coi null, thiếu khoá và rỗng như nhau; PUT thiếu khoá là xoá SĐT); ngày dd/mm/yyyy ⇒ YYYY-MM-DD bằng chuỗi.
export function buildRelativePayload(
  values: RelativeFormValues,
): RelativePayload {
  const phone = trimAsciiWhitespace(values.soDienThoai);
  return {
    hoTen: trimAsciiWhitespace(values.hoTen),
    moiQuanHe: values.moiQuanHe,
    gioiTinh: values.gioiTinh,
    ngaySinh: fromDisplayDate(trimAsciiWhitespace(values.ngaySinh)),
    soDienThoai: phone === '' ? null : phone,
  };
}

export type RelativeSaveFailure =
  // Lỗi theo ô; `alert` khác null khi còn mục không gắn được vào ô nào (hộp cảnh báo chung ở đầu form)
  | { kind: 'fields'; fields: RelativeFieldErrors; alert: string | null }
  // Chắc chắn chưa ghi, hoặc PUT (idempotent, bấm lại an toàn)
  | { kind: 'message'; message: string }
  // POST không rõ kết quả: kèm nút "Tải lại danh sách"
  | { kind: 'uncertain'; message: string }
  // PUT gặp 404 hoặc 409: hồ sơ không còn hoặc đã ngừng; nơi gọi tải lại danh sách và báo `notice`
  | { kind: 'stale'; notice: string }
  | { kind: 'ignored' };

function describeFields(error: ApiError): RelativeSaveFailure {
  const fields: RelativeFieldErrors = {};
  let unmapped = false;
  for (const { truong, ma } of error.loi ?? []) {
    // `Object.hasOwn`: `ma` là chuỗi của người khác gửi, không để `constructor` hay `toString` lọt vào bảng câu
    if (isRelativeField(truong) && Object.hasOwn(RELATIVE_FIELD_MESSAGES, ma)) {
      fields[truong] ??= RELATIVE_FIELD_MESSAGES[ma];
    } else {
      unmapped = true;
    }
  }
  const alert =
    unmapped || Object.keys(fields).length === 0 ? INVALID_DATA_MESSAGE : null;
  return { kind: 'fields', fields, alert };
}

// `mode`: 'create' là POST (không idempotent), 'update' là PUT
export function describeRelativeSaveError(
  error: unknown,
  mode: 'create' | 'update',
): RelativeSaveFailure {
  // Đăng xuất giữa chừng (client huỷ) và 401 (hook xử lý): không có gì để báo
  if (error instanceof RequestAbortedError || isSessionEnded(error)) {
    return { kind: 'ignored' };
  }
  if (error instanceof ApiError) {
    if (error.maLoi === 'DU_LIEU_KHONG_HOP_LE') return describeFields(error);
    if (mode === 'update' && error.maLoi === 'KHONG_TIM_THAY') {
      return { kind: 'stale', notice: MISSING_MESSAGE };
    }
    if (mode === 'update' && error.maLoi === 'HO_SO_NGUOI_THAN_DA_NGUNG') {
      return { kind: 'stale', notice: DEACTIVATED_MESSAGE };
    }
    // 500 JSON: giao dịch đã hoàn tác nên chắc chắn chưa ghi
    if (error.maLoi === 'LOI_HE_THONG') {
      return { kind: 'message', message: SYSTEM_MESSAGE };
    }
    return { kind: 'message', message: GENERIC_ERROR_MESSAGE };
  }
  const unsure =
    error instanceof NetworkError
      ? [ADD_NETWORK_MESSAGE, SAVE_NETWORK_MESSAGE]
      : error instanceof TimeoutError
        ? [ADD_TIMEOUT_MESSAGE, SAVE_TIMEOUT_MESSAGE]
        : error instanceof UnexpectedResponseError
          ? [ADD_UNEXPECTED_MESSAGE, SAVE_UNEXPECTED_MESSAGE]
          : null;
  if (unsure === null) {
    return { kind: 'message', message: GENERIC_ERROR_MESSAGE };
  }
  return mode === 'create'
    ? { kind: 'uncertain', message: unsure[0] }
    : { kind: 'message', message: unsure[1] };
}

// ---- Ngừng sử dụng (patient F7; TRACKING F7-E) ----
// Thông báo thành công cố định, không có họ tên (F6-G: không đưa tên vào thông báo hay vùng `aria-live`)
export const DEACTIVATE_DONE_MESSAGE = 'Đã ngừng sử dụng hồ sơ người thân.';
// PLAN 5.9, `HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN`: đã gồm gợi ý hủy lịch hẹn trước (liên kết tới "Lịch hẹn của tôi" chờ `booking`, Q11)
export const BLOCKED_MESSAGE =
  'Không thể ngừng sử dụng hồ sơ này vì đang có lịch hẹn chưa hoàn tất. Vui lòng hủy các lịch hẹn dưới đây trước.';
// Khác POST tạo (F6): ngừng sử dụng idempotent nên bấm lại là an toàn, không cần nút "Tải lại danh sách"
const DEACTIVATE_UNSURE_SUFFIX =
  'Bấm "Ngừng sử dụng" để thử lại, làm lại không gây hại.';
export const DEACTIVATE_NETWORK_MESSAGE = `Mất kết nối khi đang ngừng sử dụng, chưa rõ hồ sơ đã được ngừng hay chưa. ${DEACTIVATE_UNSURE_SUFFIX}`;
export const DEACTIVATE_TIMEOUT_MESSAGE = `Máy chủ phản hồi quá lâu, chưa rõ hồ sơ đã được ngừng hay chưa. ${DEACTIVATE_UNSURE_SUFFIX}`;
export const DEACTIVATE_UNEXPECTED_MESSAGE = `Không nhận được phản hồi hợp lệ từ máy chủ, chưa rõ hồ sơ đã được ngừng hay chưa. ${DEACTIVATE_UNSURE_SUFFIX}`;

export type DeactivateFailure =
  // Đăng xuất giữa chừng (client huỷ) và 401 (hook của auth xử lý): không có gì để báo
  | { kind: 'ignored' }
  // 404: hồ sơ không còn là của mình ⇒ đóng hộp thoại, báo `notice` và tải lại danh sách
  | { kind: 'missing'; notice: string }
  // Mọi lỗi còn lại: GIỮ hộp thoại, hiện `message`, bấm lại được (idempotent, không tự thử lại)
  | { kind: 'message'; message: string };

export function describeDeactivateError(error: unknown): DeactivateFailure {
  if (error instanceof RequestAbortedError || isSessionEnded(error)) {
    return { kind: 'ignored' };
  }
  if (error instanceof ApiError) {
    if (error.maLoi === 'KHONG_TIM_THAY') {
      return { kind: 'missing', notice: MISSING_MESSAGE };
    }
    // 500 JSON: giao dịch đã hoàn tác nên chắc chắn chưa ngừng
    return {
      kind: 'message',
      message:
        error.maLoi === 'LOI_HE_THONG' ? SYSTEM_MESSAGE : GENERIC_ERROR_MESSAGE,
    };
  }
  if (error instanceof NetworkError) {
    return { kind: 'message', message: DEACTIVATE_NETWORK_MESSAGE };
  }
  if (error instanceof TimeoutError) {
    return { kind: 'message', message: DEACTIVATE_TIMEOUT_MESSAGE };
  }
  if (error instanceof UnexpectedResponseError) {
    return { kind: 'message', message: DEACTIVATE_UNEXPECTED_MESSAGE };
  }
  return { kind: 'message', message: GENERIC_ERROR_MESSAGE };
}
