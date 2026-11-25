import type { AppException } from '../../common/errors/app.exception.js';
import {
  BOOKING_ERROR_CODES,
  bookingException,
} from '../appointments.constants.js';
import { rescheduleFailureException } from './reschedule-failure.js';
import type { RescheduleRejection } from './reschedule.types.js';

// Ánh xạ kết quả từ chối của DUYỆT và TỪ CHỐI yêu cầu đổi lịch sang `AppException` (reschedule B9; PLAN reschedule 5.13; TRACKING reschedule 1.13). Hai kiểu riêng của yêu cầu (`RequestNotFound`, `RequestHandled`)
// mà `rescheduleFailureException` của B4 cố ý không ánh xạ (chưa có mã lúc đó) được ánh xạ ở đây; phần còn lại đẩy sang B4 để cùng một nguyên nhân luôn ra cùng một mã. Dùng SAU khi giao dịch đã đóng.

/**
 * 404 `YEU_CAU_DOI_LICH_KHONG_TON_TAI`: MỘT thân cho "id sai dạng", "không có" và "ngoài phạm vi" (không lộ yêu cầu có tồn tại ở chi nhánh khác). Khác GET của B8 (404 `KHONG_TIM_THAY`): mỗi nhóm route nhất quán
 * trong chính nó, web F4 và F5 biết cả hai mã.
 */
export function requestNotFoundException(): AppException {
  return bookingException(BOOKING_ERROR_CODES.REQUEST_NOT_FOUND);
}

/**
 * Dựng `AppException` cho MỘT từ chối. Phải liệt kê ĐỦ mọi nhánh (kiểm vét cạn lúc biên dịch).
 *  - `RequestNotFound` và `NotFound` (lịch gốc không còn thấy giữa hai lần đọc; không xảy ra bình thường): 404 `YEU_CAU_DOI_LICH_KHONG_TON_TAI`, đã là "yêu cầu không còn dùng được" nên cùng thân;
 *  - `RequestHandled`: 409 `YEU_CAU_DA_XU_LY`;
 *  - còn lại (`ProfileInactive`, `SlotNotFound`, `Rule`): `rescheduleFailureException` của B4 (HTTP từ `BOOKING_ERRORS`, không bảng thứ hai).
 */
export function requestRejectionException(
  rejection: RescheduleRejection,
): AppException {
  switch (rejection.kind) {
    case 'RequestNotFound':
    case 'NotFound':
      return requestNotFoundException();
    case 'RequestHandled':
      return bookingException(BOOKING_ERROR_CODES.REQUEST_HANDLED);
    case 'ProfileInactive':
    case 'SlotNotFound':
    case 'Rule':
      return rescheduleFailureException(rejection);
  }
}
