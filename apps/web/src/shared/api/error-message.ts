import { NetworkError, TimeoutError } from './errors';

// Câu chữ [đề xuất], chờ nhóm duyệt (PLAN auth mục 5.5 chưa có các câu này). Câu theo `maLoi` do từng màn hình chọn (F1 trở đi).
export const NETWORK_ERROR_MESSAGE =
  'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.';
export const TIMEOUT_ERROR_MESSAGE =
  'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.';
export const GENERIC_ERROR_MESSAGE = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';

export function errorMessageFor(error: unknown): string {
  if (error instanceof NetworkError) return NETWORK_ERROR_MESSAGE;
  if (error instanceof TimeoutError) return TIMEOUT_ERROR_MESSAGE;
  return GENERIC_ERROR_MESSAGE;
}
