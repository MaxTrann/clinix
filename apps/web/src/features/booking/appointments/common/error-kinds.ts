import { ApiError } from '../../../../shared/api/errors';
import { BOOKING_ERROR_CODES } from '../../api/booking-errors';

// Phân loại lỗi tải của các trang lịch hẹn (booking F1 và F2 chuyển lên đây ở F8; F8, F10, F11 dùng lại). Chọn câu theo `maLoi`, KHÔNG theo mã HTTP hay
// `thongBao` (CODING_CONVENTION). Hàm thuần; chữ hiển thị do từng trang quyết.

// Mã `maLoi` mà danh sách xử lý riêng. `DU_LIEU_KHONG_HOP_LE` là mã chung của mọi lỗi kiểm dữ liệu: chỉ coi là lỗi từ khoá khi có `loi[].ma` tương ứng
export const CODE_INVALID_INPUT = 'DU_LIEU_KHONG_HOP_LE';
const FIELD_CODE_INVALID_KEYWORD = 'TU_KHOA_KHONG_HOP_LE';
// Mã TRƯỜNG của ô lý do huỷ (F9): 400 `DU_LIEU_KHONG_HOP_LE` với `loi[].ma` này khi `lyDo` rỗng, chỉ khoảng trắng hay quá 255
export const FIELD_CODE_REASON_REQUIRED = 'LY_DO_BAT_BUOC';

// ---- Lỗi tải danh sách ----
// `other`: mạng, quá giờ, phản hồi lạ, 5xx, `maLoi` lạ (kể cả 400 và 409 mà API không có): câu chung của `ErrorState` kèm `Thử lại`.
// `session` và `forbidden` không có `Thử lại` (cùng yêu cầu sẽ cùng kết quả).
export type ListErrorKind = 'keyword' | 'session' | 'forbidden' | 'other';

export function classifyListError(error: unknown): ListErrorKind {
  if (!(error instanceof ApiError)) return 'other';
  if (error.maLoi === BOOKING_ERROR_CODES.UNAUTHENTICATED) return 'session';
  if (error.maLoi === BOOKING_ERROR_CODES.FORBIDDEN) return 'forbidden';
  if (
    error.maLoi === CODE_INVALID_INPUT &&
    error.loi?.some((item) => item.ma === FIELD_CODE_INVALID_KEYWORD)
  ) {
    return 'keyword';
  }
  return 'other';
}

// ---- Lỗi tải trang chi tiết ----
// `notFound`: MỘT màn cho "không có", "của người khác", `DaDoiLich`, mã sai dạng (cùng thân 404, QB-01, H10): không lộ lịch có tồn tại hay không.
// `session`, `forbidden`: cùng yêu cầu sẽ cùng kết quả nên không `Thử lại`. `other`: mạng, quá giờ, phản hồi lạ, 5xx, `maLoi` lạ: câu của `ErrorState` kèm `Thử lại`.
export type DetailErrorKind = 'notFound' | 'session' | 'forbidden' | 'other';

export function classifyDetailError(error: unknown): DetailErrorKind {
  if (!(error instanceof ApiError)) return 'other';
  if (error.maLoi === BOOKING_ERROR_CODES.NOT_FOUND) return 'notFound';
  if (error.maLoi === BOOKING_ERROR_CODES.UNAUTHENTICATED) return 'session';
  if (error.maLoi === BOOKING_ERROR_CODES.FORBIDDEN) return 'forbidden';
  return 'other';
}
