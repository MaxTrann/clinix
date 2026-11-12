import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import {
  BOOKING_ERROR_CODES,
  bookingException,
} from '../appointments.constants.js';
import type { CancelOutcome } from './cancel.types.js';

// MỘT ánh xạ duy nhất từ kết quả huỷ KHÔNG thành công sang `AppException` (TRACKING 3.23 B10-G). Route huỷ của Bệnh nhân (B10), của Lễ tân (B12) và của Quản trị viên (B14) dùng lại đúng hàm này
// nên cả ba trả cùng một mã cho cùng một nguyên nhân (nếp `booking-failure.ts` của B7). Bên trong giao dịch chỉ trả KẾT QUẢ CÓ KIỂU; đổi sang lỗi API ở đây, SAU khi giao dịch đã đóng (nếp A8).
//
// 404 `DaDoiLich` của Bệnh nhân KHÔNG sinh ra ở đây: nó sinh ra ở bước kiểm phạm vi của người gọi `BenhNhan` (`isInCancelScope`: `DaDoiLich` nằm ngoài `PATIENT_VISIBLE_STATES`, nên là `NotFound`),
// nên Lễ tân và Quản trị viên vẫn nhận `NotCancellable` ⇒ 409 với cùng lịch đó (quyết định (j), 12/11/2026).

export type CancelFailure = Exclude<CancelOutcome, { kind: 'Cancelled' }>;

/**
 * `NotFound` ⇒ 404 `KHONG_TIM_THAY` CÙNG thân với mã sai dạng và lịch của người khác (H10, QB-01). `AlreadyCancelled` và `NotCancellable` ⇒ 409 `LICH_HEN_KHONG_CHO_HUY` kèm `chiTiet.trangThai`
 * (lần bấm thứ hai là `DaHuy`, HL-06). Phải liệt kê ĐỦ mọi nhánh (kiểm vét cạn lúc biên dịch).
 */
export function cancelOutcomeException(failure: CancelFailure): AppException {
  switch (failure.kind) {
    case 'NotFound':
      return new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    case 'AlreadyCancelled':
      return bookingException(BOOKING_ERROR_CODES.NOT_CANCELLABLE, {
        trangThai: 'DaHuy',
      });
    case 'NotCancellable':
      return bookingException(BOOKING_ERROR_CODES.NOT_CANCELLABLE, {
        trangThai: failure.trangThai,
      });
  }
}
