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
  // Chín mã của ĐỔI LỊCH (reschedule B2; PLAN reschedule 5.13). [đề xuất] chữ và mã, Q13 duyệt ở PR. Hai mã của yêu cầu đổi lịch (`YEU_CAU_DOI_LICH_KHONG_TON_TAI`,
  // `YEU_CAU_DA_XU_LY`) do B9 thêm ở cuối khối này (route duyệt và từ chối; GET của B8 vẫn trả `KHONG_TIM_THAY`).
  NOT_RESCHEDULABLE: 'LICH_HEN_KHONG_CHO_DOI',
  RESCHEDULE_TOO_LATE: 'LICH_HEN_DA_QUA_GIO',
  SAME_AS_CURRENT_SLOT: 'KHUNG_GIO_TRUNG_LICH_CU',
  OTHER_DOCTOR_SLOT: 'KHUNG_GIO_KHAC_BAC_SI',
  SERVICE_CHANGED: 'LICH_HEN_KHAC_DICH_VU_HIEN_TAI',
  BRANCH_CHANGED: 'LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI',
  RESCHEDULE_CHAIN_TOO_LONG: 'CHUOI_DOI_LICH_QUA_DAI',
  OVER_SELF_RESCHEDULE_LIMIT: 'VUOT_SO_LAN_TU_DOI',
  RESCHEDULE_REQUEST_PENDING: 'DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET',
  // Hai mã của DUYỆT và TỪ CHỐI yêu cầu (reschedule B9; PLAN reschedule 5.13). [đề xuất] chữ.
  REQUEST_NOT_FOUND: 'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
  REQUEST_HANDLED: 'YEU_CAU_DA_XU_LY',
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
  LICH_HEN_KHONG_CHO_DOI: {
    status: 409,
    thongBao:
      'Lịch hẹn này hiện không thể đổi. Chỉ lịch đã xác nhận mới đổi được.',
  },
  LICH_HEN_DA_QUA_GIO: {
    status: 409,
    thongBao: 'Đã quá giờ hẹn nên không thể đổi lịch.',
  },
  KHUNG_GIO_TRUNG_LICH_CU: {
    status: 409,
    thongBao:
      'Bạn đang chọn đúng khung giờ hiện tại. Vui lòng chọn khung giờ khác.',
  },
  KHUNG_GIO_KHAC_BAC_SI: {
    status: 409,
    thongBao:
      'Chỉ đổi được sang khung giờ của cùng bác sĩ. Muốn đổi bác sĩ, vui lòng huỷ và đặt lại.',
  },
  LICH_HEN_KHAC_DICH_VU_HIEN_TAI: {
    status: 409,
    thongBao:
      'Bác sĩ đã thay đổi dịch vụ so với lúc đặt. Vui lòng huỷ và đặt lịch mới.',
  },
  LICH_HEN_KHAC_CHI_NHANH_HIEN_TAI: {
    status: 409,
    thongBao:
      'Bác sĩ đã thay đổi chi nhánh so với lúc đặt. Vui lòng huỷ và đặt lịch mới.',
  },
  CHUOI_DOI_LICH_QUA_DAI: {
    status: 409,
    thongBao:
      'Lịch hẹn này đã đổi quá nhiều lần. Vui lòng huỷ và đặt lịch mới.',
  },
  VUOT_SO_LAN_TU_DOI: {
    status: 409,
    thongBao:
      'Bạn đã dùng hết số lần tự đổi. Hãy nhập lý do để gửi yêu cầu cho lễ tân.',
  },
  DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET: {
    status: 409,
    thongBao: 'Lịch hẹn này đã có yêu cầu đổi lịch đang chờ duyệt.',
  },
  YEU_CAU_DOI_LICH_KHONG_TON_TAI: {
    status: 404,
    thongBao: 'Không tìm thấy yêu cầu đổi lịch.',
  },
  YEU_CAU_DA_XU_LY: {
    status: 409,
    thongBao: 'Yêu cầu này đã được xử lý.',
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

// Bốn mã thông báo của ĐỔI LỊCH và YÊU CẦU ĐỔI LỊCH (reschedule B3; PLAN reschedule 5.10; Q13 `[đề xuất]`). Hằng RIÊNG, KHÔNG nằm trong `BOOKING_NOTIFICATION_EVENTS` (bốn mã của luồng đặt lịch giữ nguyên:
// BCS-04 và ca của `doctor` đếm "bốn"); worker thư (`MAIL_EVENTS`) thêm đúng bốn mã này. Một khi đã dùng thì phải ổn định (UNIQUE `thong_bao_index_lich_hen` và `thong_bao_index_yeu_cau_doi_lich`
// chống ghi trùng theo chuỗi này; so không phân biệt hoa thường). Danh mục sự kiện của scope thông báo (Trung) phải liệt kê hằng này.
//  - RESCHEDULED: ghi cho lịch MỚI (`thong_bao.lich_hen_id` = lịch mới).
//  - ba loại còn lại: ghi cho YÊU CẦU (`thong_bao.yeu_cau_doi_lich_ngoai_chinh_sach_id`), `lich_hen_id` để trống.
export const RESCHEDULE_NOTIFICATION_EVENTS = {
  RESCHEDULED: 'LichHenDaDoiLich',
  REQUEST_PENDING: 'YeuCauDoiLichDangCho',
  REQUEST_APPROVED: 'YeuCauDoiLichDaDuyet',
  REQUEST_REJECTED: 'YeuCauDoiLichBiTuChoi',
} as const;

export type RescheduleNotificationEvent =
  (typeof RESCHEDULE_NOTIFICATION_EVENTS)[keyof typeof RESCHEDULE_NOTIFICATION_EVENTS];

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
