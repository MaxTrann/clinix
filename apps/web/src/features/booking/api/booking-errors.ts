import { ApiError } from '../../../shared/api/errors';

// Mã lỗi nghiệp vụ của booking mà giao diện chọn câu theo (PLAN booking 5.14). Chọn theo `maLoi`, không theo mã HTTP hay `thongBao`
// (CODING_CONVENTION). F5 thêm các mã A2, A3, A6 vào đây.
export const BOOKING_ERROR_CODES = {
  LOCKED_NO_SHOW: 'DAT_LICH_BI_KHOA_NO_SHOW',
  FORBIDDEN: 'KHONG_DU_QUYEN',
  NOT_CONFIGURED: 'HE_THONG_CHUA_CAU_HINH',
} as const;

// Câu của A4 lấy từ PLAN 5.14. Ba câu còn lại là [đề xuất], chờ nhóm duyệt (Figma không có frame cho các trạng thái này, PLAN 4.5).
export const NO_SHOW_LOCK_MESSAGE =
  'Tài khoản đang bị khoá đặt lịch trực tuyến do vắng mặt nhiều lần. Vui lòng liên hệ Lễ tân hoặc Quản trị viên.';
export const BOOKING_BLOCKED_MESSAGE =
  'Hiện chưa thể đặt lịch trực tuyến. Vui lòng liên hệ Lễ tân hoặc Quản trị viên.';
export const FORBIDDEN_MESSAGE = 'Tài khoản này không được phép đặt lịch.';
export const NOT_CONFIGURED_MESSAGE =
  'Hệ thống chưa sẵn sàng nhận đặt lịch. Vui lòng thử lại sau.';

export interface KnownBookingError {
  message: string;
  // Có đáng thử lại không: lỗi quyền thì không, hệ thống chưa cấu hình thì có thể đã được cấu hình sau đó
  retryable: boolean;
}

// Dùng `Map` (không phải đối tượng thường) để `maLoi` lạ như "constructor" không trúng khoá của nguyên mẫu
const KNOWN_ERRORS = new Map<string, KnownBookingError>([
  [
    BOOKING_ERROR_CODES.LOCKED_NO_SHOW,
    { message: NO_SHOW_LOCK_MESSAGE, retryable: false },
  ],
  [
    BOOKING_ERROR_CODES.FORBIDDEN,
    { message: FORBIDDEN_MESSAGE, retryable: false },
  ],
  [
    BOOKING_ERROR_CODES.NOT_CONFIGURED,
    { message: NOT_CONFIGURED_MESSAGE, retryable: true },
  ],
]);

// Câu riêng cho một `maLoi` đã biết; undefined nếu không biết (mạng, quá giờ, 5xx, thân lạ, mã lạ): nơi gọi dùng câu chung của `ErrorState`
export function knownBookingError(
  error: unknown,
): KnownBookingError | undefined {
  return error instanceof ApiError ? KNOWN_ERRORS.get(error.maLoi) : undefined;
}

// Câu cho kết quả `choPhepDatLich = false`: theo `lyDo`; `lyDo` lạ hay vắng thì câu chung (vẫn chặn)
export function eligibilityBlockMessage(lyDo: unknown): string {
  return lyDo === BOOKING_ERROR_CODES.LOCKED_NO_SHOW
    ? NO_SHOW_LOCK_MESSAGE
    : BOOKING_BLOCKED_MESSAGE;
}
