import { AppException } from '../common/errors/app.exception.js';
import {
  CA_KHONG_TON_TAI,
  CHI_NHANH_CHUA_KHAI_BAO,
  CHI_NHANH_NGHI,
} from '../scheduling/scheduling.constants.js';

// Mã lỗi, mã sự kiện thông báo và hằng job của module `booking` (PLAN booking 5.14, 5.12, 5.5; TRACKING 3.3 P1-C).
// Frontend chọn thông báo theo MÃ, không theo câu chữ (CODING_CONVENTION). Mã dùng chung đã có ở nơi khác (KHONG_TIM_THAY, KHONG_DU_QUYEN,
// HE_THONG_CHUA_CAU_HINH, HO_SO_NGUOI_THAN_DA_NGUNG) KHÔNG khai lại ở đây.

// Mã có hộp thoại lỗi riêng (HTTP 403, 404, 409, 503). Ba mã đầu của luật giờ nhận khám là của `doctor` (scheduling/): import lại để
// mỗi chuỗi chỉ có MỘT nơi định nghĩa (hướng `appointments → scheduling`, doctor H20).
export const BOOKING_ERROR_CODES = {
  SLOT_NOT_FOUND: 'KHUNG_GIO_KHONG_TON_TAI',
  SLOT_BOOKED: 'KHUNG_GIO_DA_DAT',
  SLOT_HELD: 'KHUNG_GIO_DANG_GIU',
  SLOT_PAST: 'KHUNG_GIO_DA_QUA',
  SLOT_INVALID: 'KHUNG_GIO_KHONG_HOP_LE',
  BRANCH_NOT_DECLARED: CHI_NHANH_CHUA_KHAI_BAO,
  BRANCH_CLOSED: CHI_NHANH_NGHI,
  SHIFT_NOT_ACCEPTED: CA_KHONG_TON_TAI,
  OUTSIDE_OPENING_HOURS: 'NGOAI_GIO_HOAT_DONG',
  DOCTOR_ON_LEAVE: 'BAC_SI_NGHI_PHEP',
  DOCTOR_UNAVAILABLE: 'BAC_SI_KHONG_KHA_DUNG',
  SLOT_OUTSIDE_NEW_SCHEDULE: 'KHUNG_GIO_NGOAI_LICH_MOI',
  BOOKING_LOCKED_NO_SHOW: 'DAT_LICH_BI_KHOA_NO_SHOW',
  OVER_MAX_APPOINTMENTS: 'VUOT_SO_LICH_HEN_TOI_DA',
  OVERLAPPING_APPOINTMENT: 'LICH_HEN_TRUNG_THOI_GIAN',
  NOT_CANCELLABLE: 'LICH_HEN_KHONG_CHO_HUY',
  INVALID_TRANSITION: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
  ONLY_DOCTOR_COMPLETES: 'CHI_BAC_SI_HOAN_THANH',
  UNPAID_BALANCE: 'CON_PHAN_CHUA_THANH_TOAN',
  OUTSIDE_CHECK_IN_WINDOW: 'NGOAI_KHUNG_GIO_TIEP_DON',
  CHECK_IN_WINDOW_NOT_OVER: 'CHUA_QUA_GIO_HEN',
  SYSTEM_BUSY: 'HE_THONG_DANG_BAN', // [đề xuất] mã thứ 25, duyệt 09/11/2026: hết lượt thử lại 1213/1205 (booking-transaction.ts), thay cho 500
} as const;

export type BookingErrorCode =
  (typeof BOOKING_ERROR_CODES)[keyof typeof BOOKING_ERROR_CODES];

// Mã của MỘT trường dữ liệu vào: `ma` trong loi[{truong, ma}] của 400 DU_LIEU_KHONG_HOP_LE (nếp patient, search, admin; P1 câu f).
export const BOOKING_FIELD_ERROR_CODES = {
  INVALID_VISIT_REASON: 'LY_DO_KHAM_KHONG_HOP_LE',
  REASON_REQUIRED: 'LY_DO_BAT_BUOC',
  INVALID_KEYWORD: 'TU_KHOA_KHONG_HOP_LE',
} as const;

export type BookingHttpStatus = 403 | 404 | 409 | 503;

interface BookingErrorSpec {
  status: BookingHttpStatus;
  thongBao: string;
}

// `thongBao` [đề xuất] chỉ để người đọc và log, FRONTEND KHÔNG dựa vào câu này. Câu chung, không tham số: giá trị (số lịch tối đa, mã lịch trùng,
// khoảng giờ…) đi trong `chiTiet` (PLAN 5.14). Câu có tham số cho người dùng thuộc Figma và FE.
export const BOOKING_ERRORS: Record<BookingErrorCode, BookingErrorSpec> = {
  KHUNG_GIO_KHONG_TON_TAI: {
    status: 404,
    thongBao: 'Không tìm thấy khung giờ này.',
  },
  KHUNG_GIO_DA_DAT: {
    status: 409,
    thongBao: 'Khung giờ này vừa có người đặt. Vui lòng chọn khung giờ khác.',
  },
  KHUNG_GIO_DANG_GIU: {
    status: 409,
    thongBao:
      'Khung giờ này đang được người khác giữ chỗ. Vui lòng chọn khung giờ khác hoặc thử lại sau ít phút.',
  },
  KHUNG_GIO_DA_QUA: {
    status: 409,
    thongBao: 'Khung giờ này đã qua. Vui lòng chọn khung giờ khác.',
  },
  KHUNG_GIO_KHONG_HOP_LE: {
    status: 409,
    thongBao: 'Khung giờ này không còn hợp lệ. Vui lòng chọn lại.',
  },
  CHI_NHANH_CHUA_KHAI_BAO: {
    status: 409,
    thongBao: 'Chi nhánh chưa công bố giờ nhận khám vào ngày này.',
  },
  CHI_NHANH_NGHI: {
    status: 409,
    thongBao: 'Chi nhánh nghỉ vào ngày này.',
  },
  CA_KHONG_TON_TAI: {
    status: 409,
    thongBao: 'Chi nhánh không nhận khám vào buổi này.',
  },
  NGOAI_GIO_HOAT_DONG: {
    status: 409,
    thongBao: 'Khung giờ nằm ngoài giờ hoạt động của chi nhánh.',
  },
  BAC_SI_NGHI_PHEP: {
    status: 409,
    thongBao: 'Bác sĩ nghỉ vào thời gian này. Vui lòng chọn khung giờ khác.',
  },
  BAC_SI_KHONG_KHA_DUNG: {
    status: 409,
    thongBao: 'Bác sĩ hiện không nhận đặt lịch.',
  },
  KHUNG_GIO_NGOAI_LICH_MOI: {
    status: 409,
    thongBao:
      'Chi nhánh sắp thay đổi lịch nhận khám nên không nhận đặt vào khung giờ này.',
  },
  DAT_LICH_BI_KHOA_NO_SHOW: {
    status: 403,
    thongBao:
      'Tài khoản đang bị khoá đặt lịch trực tuyến do vắng mặt nhiều lần. Vui lòng liên hệ Lễ tân hoặc Quản trị viên.',
  },
  VUOT_SO_LICH_HEN_TOI_DA: {
    status: 409,
    thongBao: 'Hồ sơ này đã đạt số lịch hẹn đang hoạt động tối đa.',
  },
  LICH_HEN_TRUNG_THOI_GIAN: {
    status: 409,
    thongBao: 'Hồ sơ này đã có lịch hẹn trùng thời gian.',
  },
  LICH_HEN_KHONG_CHO_HUY: {
    status: 409,
    thongBao: 'Lịch hẹn đang ở trạng thái không thể hủy.',
  },
  CHUYEN_TRANG_THAI_KHONG_HOP_LE: {
    status: 409,
    thongBao: 'Không thể chuyển lịch hẹn sang trạng thái này.',
  },
  CHI_BAC_SI_HOAN_THANH: {
    status: 409,
    thongBao:
      'Trạng thái Hoàn thành chỉ do Bác sĩ chuyển sau khi hoàn tất ca khám.',
  },
  CON_PHAN_CHUA_THANH_TOAN: {
    status: 409,
    thongBao:
      'Lịch hẹn còn khoản chưa thanh toán. Vui lòng thu tiền tại quầy trước khi tiếp đón.',
  },
  NGOAI_KHUNG_GIO_TIEP_DON: {
    status: 409,
    thongBao: 'Lịch hẹn chỉ được tiếp đón trong khoảng thời gian quy định.',
  },
  CHUA_QUA_GIO_HEN: {
    status: 409,
    thongBao: 'Chưa hết thời gian tiếp đón nên chưa thể đánh dấu vắng mặt.',
  },
  HE_THONG_DANG_BAN: {
    status: 503,
    thongBao:
      'Hệ thống đang xử lý nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít giây.',
  },
};

/**
 * Dựng `AppException` cho một mã của module: cặp (mã, trạng thái HTTP) chỉ có MỘT nơi (`BOOKING_ERRORS`). Ném SAU khi giao dịch đã commit
 * (nếp `LoginService`, A8); `chiTiet` phải là JSON thuần, không chứa bí mật hay dữ liệu cá nhân ngoài phạm vi 5.14.
 */
export function bookingException(
  code: BookingErrorCode,
  chiTiet?: unknown,
): AppException {
  const { status, thongBao } = BOOKING_ERRORS[code];
  return new AppException(status, code, {
    thongBao,
    ...(chiTiet === undefined ? {} : { chiTiet }),
  });
}

// Mã sự kiện của `thong_bao.loai_su_kien` (PLAN 5.12; Q29; `varchar(100)`, không enum). [đề xuất]: một khi đã dùng thì phải ổn định, vì UNIQUE
// `(lich_hen_id, tai_khoan_id, loai_su_kien)` của P7 chống gửi trùng theo chuỗi này.
export const BOOKING_NOTIFICATION_EVENTS = {
  CONFIRMED: 'LichHenDaXacNhan',
  CANCELLED: 'LichHenDaHuy',
  NO_SHOW: 'LichHenVangMat',
  NO_SHOW_LOCK: 'KhoaDatLichNoShow',
} as const;

export type BookingNotificationEvent =
  (typeof BOOKING_NOTIFICATION_EVENTS)[keyof typeof BOOKING_NOTIFICATION_EVENTS];

// Lý do huỷ khi hết hạn giữ chỗ (Q6: `DaHuy` kèm `ly_do_huy` là MỘT hằng, không thông báo). MỘT chuỗi cho cả hết hạn lười (`cancelLapsedHold`, B6b) và `HoldExpiryJob` (B9);
// `lich_hen.ly_do_huy` là `varchar(255)`.
export const HOLD_EXPIRED_CANCEL_REASON = 'Hết thời gian giữ chỗ';

// Lý do huỷ của B10 (Q27; TRACKING 3.23 B10-C). `lich_hen.ly_do_huy` là `varchar(255)`.
//  - Bệnh nhân KHÔNG nhập lý do ở giao diện (Figma 421:2), nên mặc định là hằng này; API vẫn nhận `lyDo` tuỳ chọn ≤ 255.
//  - Nghỉ phép của bác sĩ cũng là HẰNG (Q27): lý do nghỉ phép của bác sĩ là dữ liệu riêng tư, không được chảy vào `ly_do_huy` (Lễ tân và Quản trị viên đọc được).
//  - Lễ tân và Quản trị viên: bắt buộc, chữ tự do 1 đến `CANCEL_REASON_MAX_LENGTH`.
export const PATIENT_CANCEL_REASON = 'Bệnh nhân hủy lịch hẹn';
export const LEAVE_CANCEL_REASON = 'Bác sĩ nghỉ phép'; // [đề xuất] chữ
export const CANCEL_REASON_MAX_LENGTH = 255;

// --- Hằng job [đề xuất], theo nếp `UNVERIFIED_CLEANUP_*` của auth. Hai job chưa viết (B9 hết hạn giữ chỗ, B13 tự Vắng mặt).
// Cron 6 trường (giây phút giờ ngày tháng thứ). Giây lệch nhau và lệch giây 0 để không dồn vào cùng giây với các job khác (auth dặn).
export const HOLD_EXPIRY_JOB_NAME = 'booking-hold-expiry';
export const HOLD_EXPIRY_CRON = '20 * * * * *'; // mỗi phút (PLAN 5.5)
export const NO_SHOW_JOB_NAME = 'booking-no-show';
export const NO_SHOW_CRON = '40 */5 * * * *'; // mỗi 5 phút (Q23)
// Quét ứng viên theo lô; mỗi lượt tối đa MAX_BATCHES lô, phần còn lại để lượt sau (PLAN 5.5, Q23)
export const BOOKING_JOB_BATCH_SIZE = 100;
export const BOOKING_JOB_MAX_BATCHES = 10;
