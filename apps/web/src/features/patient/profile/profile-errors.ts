import { GENERIC_ERROR_MESSAGE } from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { isValidFullName, isValidPhone, trimAsciiWhitespace } from '../../auth';
import { fromDisplayDate, isRealDate } from './profile-format';
import type { ProfileFormValues, ProfileUpdate } from './profile-types';

// Kiểm form, câu chữ và phân loại lỗi lưu của trang hồ sơ (patient F3; TRACKING F3-E, F3-F). Hàm thuần.
// Câu chữ theo PLAN patient 5.9, chọn theo `maLoi` và `loi[].ma` (KHÔNG dùng `thongBao` của API). Câu chưa có ở 5.9 là [đề xuất].
// Câu họ tên và SĐT phải y hệt auth (features/auth/register/register-errors.ts, không xuất qua index): test PW-10 ghim hai nơi.

export const SAVED_MESSAGE = 'Đã cập nhật thông tin cá nhân.';
export const INVALID_DATA_MESSAGE = 'Dữ liệu không hợp lệ.';
export const SYSTEM_MESSAGE = 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.';
export const NAME_REQUIRED_MESSAGE = 'Vui lòng nhập họ và tên.';
export const BIRTH_DATE_AFTER_TODAY_MESSAGE =
  'Ngày sinh không được sau hôm nay.';
export const BIRTH_DATE_TOO_EARLY_MESSAGE =
  'Ngày sinh không được trước 01/01/1900.';

// Lưu mà không có phản hồi hợp lệ: không biết máy chủ đã ghi chưa. PUT thay cả bộ nên bấm lại an toàn.
const UNSURE_SUFFIX =
  'Bấm Lưu thay đổi để thử lại, hoặc tải lại trang để xem dữ liệu hiện tại.';
export const SAVE_NETWORK_MESSAGE = `Mất kết nối khi đang lưu, chưa rõ thay đổi đã được ghi hay chưa. ${UNSURE_SUFFIX}`;
export const SAVE_TIMEOUT_MESSAGE = `Máy chủ phản hồi quá lâu, chưa rõ thay đổi đã được ghi hay chưa. ${UNSURE_SUFFIX}`;
export const SAVE_UNEXPECTED_MESSAGE = `Không nhận được phản hồi hợp lệ từ máy chủ, chưa rõ thay đổi đã được ghi hay chưa. ${UNSURE_SUFFIX}`;

// Câu theo mã lỗi của từng ô (`loi[].ma`)
export const FIELD_MESSAGES: Record<string, string> = {
  HO_TEN_KHONG_HOP_LE:
    'Họ tên phải có ít nhất một chữ cái, tối đa 100 ký tự và không chứa ký tự điều khiển.',
  SDT_KHONG_HOP_LE: 'Số điện thoại phải 10 số, bắt đầu bằng 0.',
  NGAY_SINH_KHONG_HOP_LE: 'Ngày sinh không hợp lệ.',
  GIOI_TINH_KHONG_HOP_LE: 'Vui lòng chọn giới tính.',
  DIA_CHI_KHONG_HOP_LE:
    'Địa chỉ tối đa 255 ký tự và không chứa ký tự điều khiển.',
};

// Thứ tự ô trên form: focus nhảy tới ô lỗi ĐẦU TIÊN theo thứ tự này, không theo thứ tự `loi[]` của API (B2-B mục 9)
export const PROFILE_FIELDS = [
  'hoTen',
  'soDienThoai',
  'gioiTinh',
  'ngaySinh',
  'diaChi',
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileFieldErrors = Partial<Record<ProfileField, string>>;

export function isProfileField(name: string): name is ProfileField {
  return (PROFILE_FIELDS as readonly string[]).includes(name);
}

export function firstInvalidField(
  errors: ProfileFieldErrors,
): ProfileField | null {
  return PROFILE_FIELDS.find((field) => errors[field] !== undefined) ?? null;
}

// Q7: ngày sinh không trước ngày này (so chuỗi YYYY-MM-DD cùng độ dài)
const BIRTH_DATE_MIN = '1900-01-01';
const ADDRESS_MAX_LENGTH = 255;
// Cùng tập ký tự cấm với họ tên và địa chỉ của API (apps/api/src/patient/validation/address-policy.ts; TECH_DEBT dòng 66)
const FORBIDDEN_IN_ADDRESS = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;

// NFC rồi cắt khoảng trắng ASCII hai đầu (không cắt U+00A0, giống API); rỗng ⇒ null (API lưu NULL)
function normalizedAddress(text: string): string | null {
  const normalized = trimAsciiWhitespace(text.normalize('NFC'));
  return normalized === '' ? null : normalized;
}

// Xuất cho form người thân (patient F6): cùng luật ngày sinh, không chép lại. Ô trống ⇒ không lỗi (người thân tự kiểm "bắt buộc").
export function birthDateError(
  text: string,
  today: string,
): string | undefined {
  const typed = trimAsciiWhitespace(text);
  if (typed === '') return undefined;
  const iso = fromDisplayDate(typed);
  if (iso === null || !isRealDate(iso)) {
    return FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE;
  }
  if (iso > today) return BIRTH_DATE_AFTER_TODAY_MESSAGE;
  if (iso < BIRTH_DATE_MIN) return BIRTH_DATE_TOO_EARLY_MESSAGE;
  return undefined;
}

// Kiểm trước khi gửi (đúng luật PLAN 5.8; API vẫn là nguồn đúng). `today` là YYYY-MM-DD theo giờ Việt Nam.
export function validateProfileForm(
  values: ProfileFormValues,
  today: string,
): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  if (trimAsciiWhitespace(values.hoTen) === '') {
    errors.hoTen = NAME_REQUIRED_MESSAGE;
  } else if (!isValidFullName(values.hoTen)) {
    errors.hoTen = FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE;
  }
  if (!isValidPhone(values.soDienThoai)) {
    errors.soDienThoai = FIELD_MESSAGES.SDT_KHONG_HOP_LE;
  }
  const dateError = birthDateError(values.ngaySinh, today);
  if (dateError !== undefined) errors.ngaySinh = dateError;

  const address = normalizedAddress(values.diaChi);
  if (
    address !== null &&
    (FORBIDDEN_IN_ADDRESS.test(address) ||
      Array.from(address).length > ADDRESS_MAX_LENGTH)
  ) {
    errors.diaChi = FIELD_MESSAGES.DIA_CHI_KHONG_HOP_LE;
  }
  return errors;
}

// Thân PUT từ các ô ĐÃ qua validateProfileForm: đúng năm khoá, không `email`. SĐT chỉ cắt khoảng trắng (API tự chuẩn hoá thành
// 10 số liền); địa chỉ rỗng ⇒ null; ngày dd/mm/yyyy ⇒ YYYY-MM-DD; chưa chọn giới tính ⇒ null.
export function buildProfileUpdate(values: ProfileFormValues): ProfileUpdate {
  const typedDate = trimAsciiWhitespace(values.ngaySinh);
  return {
    hoTen: trimAsciiWhitespace(values.hoTen),
    soDienThoai: trimAsciiWhitespace(values.soDienThoai),
    gioiTinh: values.gioiTinh === '' ? null : values.gioiTinh,
    ngaySinh: typedDate === '' ? null : fromDisplayDate(typedDate),
    diaChi: normalizedAddress(values.diaChi),
  };
}

// 401: phiên hết hiệu lực, hook của auth đã xoá phiên và cổng đang đưa ra trang đăng nhập; trang không báo thêm
export function isSessionEnded(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export type SaveFailure =
  // Lỗi theo ô; `alert` khác null khi còn mục không gắn được vào ô nào (hộp cảnh báo chung ở đầu form)
  | { kind: 'fields'; fields: ProfileFieldErrors; alert: string | null }
  | { kind: 'message'; message: string }
  | { kind: 'ignored' };

function describeFields(error: ApiError): SaveFailure {
  const fields: ProfileFieldErrors = {};
  let unmapped = false;
  for (const { truong, ma } of error.loi ?? []) {
    // `Object.hasOwn`: `ma` là chuỗi của người khác gửi, không để `constructor` hay `toString` lọt vào bảng câu
    if (isProfileField(truong) && Object.hasOwn(FIELD_MESSAGES, ma)) {
      fields[truong] ??= FIELD_MESSAGES[ma];
    } else {
      unmapped = true;
    }
  }
  const alert =
    unmapped || Object.keys(fields).length === 0 ? INVALID_DATA_MESSAGE : null;
  return { kind: 'fields', fields, alert };
}

export function describeSaveError(error: unknown): SaveFailure {
  // Đăng xuất giữa chừng (client huỷ) và 401 (hook xử lý): không có gì để báo
  if (error instanceof RequestAbortedError || isSessionEnded(error)) {
    return { kind: 'ignored' };
  }
  if (error instanceof ApiError) {
    if (error.maLoi === 'DU_LIEU_KHONG_HOP_LE') return describeFields(error);
    // 500 JSON: giao dịch đã hoàn tác nên chắc chắn chưa ghi
    if (error.maLoi === 'LOI_HE_THONG') {
      return { kind: 'message', message: SYSTEM_MESSAGE };
    }
    return { kind: 'message', message: GENERIC_ERROR_MESSAGE };
  }
  if (error instanceof NetworkError) {
    return { kind: 'message', message: SAVE_NETWORK_MESSAGE };
  }
  if (error instanceof TimeoutError) {
    return { kind: 'message', message: SAVE_TIMEOUT_MESSAGE };
  }
  if (error instanceof UnexpectedResponseError) {
    return { kind: 'message', message: SAVE_UNEXPECTED_MESSAGE };
  }
  return { kind: 'message', message: GENERIC_ERROR_MESSAGE };
}
