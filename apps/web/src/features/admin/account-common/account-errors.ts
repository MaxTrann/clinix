import {
  GENERIC_ERROR_MESSAGE,
  errorMessageFor,
} from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';

// Mã lỗi của API (B17, B18, B19; PLAN 5.9) sang chữ trên màn hình. Giao diện chọn câu theo MÃ (`maLoi`, `loi[].ma`), không theo `thongBao`.
// Chữ lấy NGUYÊN VĂN từ PLAN 5.9 khi có; còn lại là `[đề xuất]`, nhóm duyệt sau (TRACKING admin 9A.12 mục 2.6).

export const FORBIDDEN_MESSAGE = 'Bạn không có quyền thực hiện thao tác này.';
export const NOT_FOUND_MESSAGE = 'Không tìm thấy dữ liệu.';
// 500 LOI_HE_THONG: B18, B19 hoàn tác cả giao dịch nên nói chắc là tài khoản chưa đổi
export const SERVER_ERROR_MESSAGE =
  'Không thực hiện được. Tài khoản chưa bị thay đổi, vui lòng thử lại.';
export const INVALID_REQUEST_MESSAGE =
  'Yêu cầu không hợp lệ. Vui lòng tải lại trang rồi thử lại.';
// Mạng hoặc hết hạn chờ: máy chủ có thể đã xử lý xong. Lần tải lại ngay sau đó cho thấy trạng thái thật.
export const UNKNOWN_RESULT_HINT =
  'Chưa rõ thao tác đã được thực hiện hay chưa.';

const BUSINESS_MESSAGES: Record<string, string> = {
  KHONG_DU_QUYEN: FORBIDDEN_MESSAGE,
  KHONG_TIM_THAY: NOT_FOUND_MESSAGE,
  TRANG_THAI_KHONG_PHU_HOP:
    'Trạng thái hiện tại của tài khoản không cho phép thao tác này.',
  TU_KHOA_TAI_KHOAN: 'Không thể tự khoá tài khoản của chính mình.',
  CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG:
    'Phải còn ít nhất một Quản trị viên Toàn hệ thống đang hoạt động.',
  TAI_KHOAN_CHO_KICH_HOAT:
    'Tài khoản đang chờ kích hoạt. Hãy dùng "Gửi lại liên kết kích hoạt".',
};

// Mã mức trường trong `loi[{truong, ma}]` của 400 DU_LIEU_KHONG_HOP_LE
const FIELD_MESSAGES: Record<string, string> = {
  TAI_KHOAN_KHONG_PHAI_BENH_NHAN:
    'Chỉ mở khoá no-show được cho tài khoản Bệnh nhân.',
  MA_TAI_KHOAN_KHONG_HOP_LE: 'Mã tài khoản không hợp lệ.',
};

function lookup(table: Record<string, string>, key: string) {
  // `Object.hasOwn`: mã như `constructor` hay `__proto__` không được lọt vào qua nguyên mẫu
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Lỗi của `POST …/lock`, `…/unlock`, `…/unlock-no-show` sang chữ. Luôn trả một câu (không bao giờ rỗng). */
export function describeActionFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.maLoi === 'DU_LIEU_KHONG_HOP_LE') {
      for (const item of error.loi ?? []) {
        const message = lookup(FIELD_MESSAGES, item.ma);
        if (message !== undefined) return message;
      }
      return INVALID_REQUEST_MESSAGE;
    }
    const byCode = lookup(BUSINESS_MESSAGES, error.maLoi);
    if (byCode !== undefined) return byCode;
    if (error.status === 403) return FORBIDDEN_MESSAGE;
    if (error.status === 404) return NOT_FOUND_MESSAGE;
    if (error.status === 500 && error.maLoi === 'LOI_HE_THONG')
      return SERVER_ERROR_MESSAGE;
    return GENERIC_ERROR_MESSAGE;
  }
  if (error instanceof NetworkError || error instanceof TimeoutError)
    return `${errorMessageFor(error)} ${UNKNOWN_RESULT_HINT}`;
  return GENERIC_ERROR_MESSAGE;
}

/** Lỗi khi TẢI danh sách hay chi tiết (đọc, không ghi): 403 và 404 có câu riêng, còn lại là câu chung của client (mạng, hết hạn chờ…). */
export function describeLoadFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403 || error.maLoi === 'KHONG_DU_QUYEN')
      return FORBIDDEN_MESSAGE;
    if (error.status === 404 || error.maLoi === 'KHONG_TIM_THAY')
      return NOT_FOUND_MESSAGE;
  }
  return errorMessageFor(error);
}

/** Tài khoản không còn (bị xoá, hay ra khỏi phạm vi của người xem): chi tiết phải đóng và danh sách phải tải lại. */
export function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 404 || error.maLoi === 'KHONG_TIM_THAY')
  );
}

/** Trang yêu cầu vượt số trang hiện có (dữ liệu vừa đổi): `400 DU_LIEU_KHONG_HOP_LE` với `loi[].ma = TRANG_KHONG_HOP_LE`. */
export function isPageOutOfRange(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.maLoi === 'DU_LIEU_KHONG_HOP_LE' &&
    (error.loi ?? []).some((item) => item.ma === 'TRANG_KHONG_HOP_LE')
  );
}
