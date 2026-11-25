import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { bookingFailureException } from '../create/booking-failure.js';
import type { RescheduleFailure } from './reschedule.types.js';

// MỘT ánh xạ duy nhất từ kết quả từ chối của bộ luật đổi lịch sang `AppException` (reschedule B4; PLAN reschedule 5.13): B6 (Bệnh nhân), B7 (Lễ tân đổi hộ) và B9 (duyệt) dùng chung, nên cùng một nguyên nhân
// luôn ra cùng một mã. Nhánh dùng chung với đặt lịch (`ProfileInactive`, `SlotNotFound`, `Rule`) đi qua `bookingFailureException` để mã và HTTP chỉ có MỘT bảng (`BOOKING_ERRORS`).
// Hai kiểu riêng của duyệt (`RequestNotFound`, `RequestHandled`) KHÔNG ở đây: chưa có mã ở `appointments.constants.ts`, B9 thêm mã và ánh xạ.
// Dùng SAU khi giao dịch đã đóng: trong giao dịch, ném `AppException` hoàn tác cả lần ghi đã làm (bài học A8).

/** Dựng `AppException` cho một lỗi của bộ luật. Phải liệt kê ĐỦ mọi nhánh (kiểm vét cạn lúc biên dịch). */
export function rescheduleFailureException(
  failure: RescheduleFailure,
): AppException {
  switch (failure.kind) {
    case 'NotFound':
      // Không có lịch, của người khác, ngoài phạm vi, hoặc Bệnh nhân gặp lịch `DaDoiLich`: CÙNG một 404 (H10, QB-01, Q31)
      return new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    case 'ProfileInactive':
      return bookingFailureException({ kind: 'ProfileInactive' });
    case 'SlotNotFound':
      return bookingFailureException({ kind: 'SlotNotFound' });
    case 'Rule':
      return bookingFailureException(failure);
  }
}
