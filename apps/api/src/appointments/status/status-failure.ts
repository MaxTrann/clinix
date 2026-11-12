import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import {
  BOOKING_ERROR_CODES,
  bookingException,
} from '../appointments.constants.js';
import type { CheckInOutcome } from '../state/check-in.js';
import type { MarkNoShowOutcome } from '../state/mark-no-show.js';

// MỘT ánh xạ duy nhất từ kết quả KHÔNG thành công của `checkIn` và `markNoShow` (cùng đường chỉ-từ-chối của route Lễ tân) sang `AppException` (task B12; TRACKING 3.26 B12-E). Bên trong giao dịch chỉ
// trả KẾT QUẢ CÓ KIỂU; đổi sang lỗi API ở đây, SAU khi giao dịch đã đóng (nếp A8, `cancel-failure.ts` của B10). Huỷ KHÔNG đi qua đây: dùng `cancelOutcomeException` của B10 (cùng mã
// `LICH_HEN_KHONG_CHO_HUY` cho mọi người gọi huỷ). `HE_THONG_DANG_BAN` (503) do `withBookingTransaction` ném khi hết lượt thử lại, không qua đây. Không mã lỗi mới.

export type StatusFailure =
  | Exclude<CheckInOutcome, { kind: 'CheckedIn' }>
  | Exclude<MarkNoShowOutcome, { kind: 'NoShowed' }>;

/** 409 `CHUYEN_TRANG_THAI_KHONG_HOP_LE` kèm `chiTiet` `{ tuTrangThai, denTrangThai }` `[đề xuất]` (câu chữ 5.14: "Không thể chuyển lịch hẹn từ {…} sang {…}"). */
export function invalidTransitionException(
  from: TrangThaiLichHen,
  to: TrangThaiLichHen,
): AppException {
  return bookingException(BOOKING_ERROR_CODES.INVALID_TRANSITION, {
    tuTrangThai: from,
    denTrangThai: to,
  });
}

/** 409 `CHI_BAC_SI_HOAN_THANH`: chọn `HoanThanh` mà không phải Bác sĩ (MT-03). Không `chiTiet`. */
export function onlyDoctorCompletesException(): AppException {
  return bookingException(BOOKING_ERROR_CODES.ONLY_DOCTOR_COMPLETES);
}

/**
 * `to` là đích Lễ tân chọn (chỉ để dựng `chiTiet` của `InvalidState`). Phải liệt kê ĐỦ mọi nhánh (kiểm vét cạn lúc biên dịch).
 *  - `NotFound` ⇒ 404 `KHONG_TIM_THAY` CÙNG thân với mã sai dạng, lịch ngoài chi nhánh, không tồn tại (H10, CT-09).
 *  - `ConfigMissing` ⇒ 409 `HE_THONG_CHUA_CAU_HINH` (cùng mã và câu với `SystemConfigService.getOrThrow`: mã chung của hệ thống, quy tắc 35).
 *  - `OutsideWindow` ⇒ `chiTiet` `{ tu, den }` là ISO 8601 UTC (như `thoiGian` của B11) `[đề xuất]`.
 */
export function statusFailureException(
  failure: StatusFailure,
  to: TrangThaiLichHen,
): AppException {
  switch (failure.kind) {
    case 'NotFound':
      return new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    case 'InvalidState':
      return invalidTransitionException(failure.trangThai, to);
    case 'ConfigMissing':
      return new AppException(409, 'HE_THONG_CHUA_CAU_HINH', {
        thongBao: 'Hệ thống chưa được cấu hình.',
      });
    case 'OwedAmount':
      return bookingException(BOOKING_ERROR_CODES.UNPAID_BALANCE, {
        conPhaiThu: failure.conPhaiThu,
      });
    case 'OutsideWindow':
      return bookingException(BOOKING_ERROR_CODES.OUTSIDE_CHECK_IN_WINDOW, {
        tu: failure.tu.toISOString(),
        den: failure.den.toISOString(),
      });
    case 'NotDue':
      return bookingException(BOOKING_ERROR_CODES.CHECK_IN_WINDOW_NOT_OVER);
  }
}
