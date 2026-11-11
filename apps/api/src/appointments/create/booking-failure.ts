import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { PATIENT_ERROR_CODES } from '../../patient/patient.constants.js';
import {
  BOOKING_ERROR_CODES,
  bookingException,
  type BookingErrorCode,
} from '../appointments.constants.js';
import type { BookabilityVerdict } from '../slots/bookability.rules.js';

// MỘT ánh xạ duy nhất từ mọi kết quả KIỂM TRƯỚC KHI ĐẶT sang `AppException` (task B7; TRACKING booking 3.18 B7-G, 3.18.2 mục 4). `POST /booking/checks` (B7) và `POST /booking/appointments` (B8)
// dùng lại đúng hàm này nên hai route luôn trả cùng một mã cho cùng một nguyên nhân. Cặp (mã, HTTP) của nhánh luật lấy từ `BOOKING_ERRORS` (không bảng thứ hai, không mã mới: BCS-01).
//
// Nếp B1, B2: bên trong giao dịch chỉ trả KẾT QUẢ CÓ KIỂU (`BookingFailure`), không ném; đổi sang `AppException` bằng hàm này SAU khi giao dịch đã đóng.

export type BookingFailure =
  /** Không có hàng `benh_nhan` của tài khoản gọi (không phải Bệnh nhân thật): 403 `KHONG_DU_QUYEN` */
  | { kind: 'NoPatientRow' }
  /** Hồ sơ người thân của người khác hoặc không tồn tại: CÙNG một 404 `KHONG_TIM_THAY`, không phân biệt (H10, QB-01) */
  | { kind: 'ProfileMissing' }
  /** Hồ sơ người thân CỦA CHÍNH MÌNH đã ngừng sử dụng: 409 (khác 404 vì đó là hồ sơ của họ nên không lộ gì) */
  | { kind: 'ProfileInactive' }
  /** Không có khung giờ: 404 `KHUNG_GIO_KHONG_TON_TAI` */
  | { kind: 'SlotNotFound' }
  /** Một mã của `evaluateBookability` (kèm `chiTiet` đã qua danh sách trắng của luật) */
  | { kind: 'Rule'; code: BookingErrorCode; chiTiet?: unknown };

/** Phán quyết `ok: false` của luật sang `BookingFailure`; không thêm khoá `chiTiet` khi luật không trả. */
export function failureOfVerdict(
  verdict: Extract<BookabilityVerdict, { ok: false }>,
): BookingFailure {
  return verdict.chiTiet === undefined
    ? { kind: 'Rule', code: verdict.code }
    : { kind: 'Rule', code: verdict.code, chiTiet: verdict.chiTiet };
}

// `thongBao` [đề xuất]: chỉ để người đọc và log, FRONTEND chọn thông báo theo MÃ. Mã `HO_SO_NGUOI_THAN_DA_NGUNG` là của `patient` (không khai lại); câu của patient nói về "chỉnh sửa"
// nên booking dùng câu riêng cho việc đặt lịch.
const PROFILE_INACTIVE_MESSAGE =
  'Hồ sơ người thân này đã ngừng sử dụng nên không thể dùng để đặt lịch.';

/** Dựng `AppException` cho một `BookingFailure`. Phải liệt kê ĐỦ mọi nhánh (kiểm vét cạn lúc biên dịch). */
export function bookingFailureException(failure: BookingFailure): AppException {
  switch (failure.kind) {
    case 'NoPatientRow':
      return new AppException(403, COMMON_ERROR_CODES.FORBIDDEN);
    case 'ProfileMissing':
      return new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    case 'ProfileInactive':
      return new AppException(409, PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED, {
        thongBao: PROFILE_INACTIVE_MESSAGE,
      });
    case 'SlotNotFound':
      return bookingException(BOOKING_ERROR_CODES.SLOT_NOT_FOUND);
    case 'Rule':
      return bookingException(failure.code, failure.chiTiet);
  }
}
