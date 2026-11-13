import { ApiError } from '../../../shared/api/errors';
import { isoWeekdayLabel } from '../appointments/common/appointment-format';

// Mã lỗi nghiệp vụ của booking mà giao diện chọn câu theo (PLAN booking 5.14). Chọn theo `maLoi`, không theo mã HTTP hay `thongBao`
// (CODING_CONVENTION). F5 thêm các mã A2, A3, A6 vào đây.
export const BOOKING_ERROR_CODES = {
  LOCKED_NO_SHOW: 'DAT_LICH_BI_KHOA_NO_SHOW',
  FORBIDDEN: 'KHONG_DU_QUYEN',
  NOT_CONFIGURED: 'HE_THONG_CHUA_CAU_HINH',
  // Chi tiết và huỷ lịch hẹn của Bệnh nhân (F2). `CHUA_DANG_NHAP` là 401 mà `request()` đã thử làm mới token mà không được.
  UNAUTHENTICATED: 'CHUA_DANG_NHAP',
  NOT_FOUND: 'KHONG_TIM_THAY',
  NOT_CANCELLABLE: 'LICH_HEN_KHONG_CHO_HUY',
  SYSTEM_BUSY: 'HE_THONG_DANG_BAN',
  // Kiểm trước khi đặt (`checks`, tạo lịch; PLAN 5.14): A2 khung giờ, A3 hồ sơ, A6 chi nhánh (booking F4; F5 dùng lại)
  SLOT_NOT_FOUND: 'KHUNG_GIO_KHONG_TON_TAI',
  SLOT_TAKEN: 'KHUNG_GIO_DA_DAT',
  SLOT_HELD: 'KHUNG_GIO_DANG_GIU',
  SLOT_PAST: 'KHUNG_GIO_DA_QUA',
  SLOT_INVALID: 'KHUNG_GIO_KHONG_HOP_LE',
  BRANCH_UNDECLARED: 'CHI_NHANH_CHUA_KHAI_BAO',
  BRANCH_CLOSED: 'CHI_NHANH_NGHI',
  SHIFT_MISSING: 'CA_KHONG_TON_TAI',
  OUTSIDE_HOURS: 'NGOAI_GIO_HOAT_DONG',
  DOCTOR_ON_LEAVE: 'BAC_SI_NGHI_PHEP',
  DOCTOR_UNAVAILABLE: 'BAC_SI_KHONG_KHA_DUNG',
  SLOT_OUTSIDE_NEW_SCHEDULE: 'KHUNG_GIO_NGOAI_LICH_MOI',
  OVER_MAX_APPOINTMENTS: 'VUOT_SO_LICH_HEN_TOI_DA',
  OVERLAPPING_APPOINTMENT: 'LICH_HEN_TRUNG_THOI_GIAN',
  RELATIVE_DEACTIVATED: 'HO_SO_NGUOI_THAN_DA_NGUNG',
} as const;

// Câu của A4 lấy từ PLAN 5.14. Ba câu còn lại là [đề xuất], chờ nhóm duyệt (Figma không có frame cho các trạng thái này, PLAN 4.5).
export const NO_SHOW_LOCK_MESSAGE =
  'Tài khoản đang bị khoá đặt lịch trực tuyến do vắng mặt nhiều lần. Vui lòng liên hệ Lễ tân hoặc Quản trị viên.';
export const BOOKING_BLOCKED_MESSAGE =
  'Hiện chưa thể đặt lịch trực tuyến. Vui lòng liên hệ Lễ tân hoặc Quản trị viên.';
export const FORBIDDEN_MESSAGE = 'Tài khoản này không được phép đặt lịch.';
export const NOT_CONFIGURED_MESSAGE =
  'Hệ thống chưa sẵn sàng nhận đặt lịch. Vui lòng thử lại sau.';

// Nguyên nhân của lỗi quyết định CHỖ nào trên Bước 4 hiện câu và có cho đi tiếp không:
//  - `account`: tài khoản (khoá no-show, không đủ quyền, hệ thống chưa cấu hình);
//  - `slot`: KHUNG GIỜ không đặt được (A2, A3/11a, A6, nghỉ phép…): đổi hồ sơ không cứu được, phải chọn lại khung giờ;
//  - `profile`: riêng HỒ SƠ đi khám (A3: trùng giờ, đủ lịch tối đa, hồ sơ người thân đã ngừng): chọn hồ sơ khác thì có thể đi tiếp.
export type KnownBookingErrorScope = 'account' | 'slot' | 'profile';

export interface KnownBookingError {
  message: string;
  // Có đáng thử lại không: lỗi quyền thì không, hệ thống chưa cấu hình thì có thể đã được cấu hình sau đó
  retryable: boolean;
  scope: KnownBookingErrorScope;
}

// `chiTiet` của lỗi là danh sách trắng do luật của backend dựng (PLAN 5.14); vắng hay sai kiểu ⇒ câu chung không có số liệu, không bao giờ hiện chuỗi lạ.
function readDetail(chiTiet: unknown): Record<string, unknown> {
  return typeof chiTiet === 'object' && chiTiet !== null
    ? (chiTiet as Record<string, unknown>)
    : {};
}

const OPENING_TIME = /^\d{2}:\d{2}$/;
// Dạng mã lịch hẹn mà web chấp nhận (an toàn khi đưa vào câu và URL); bộ đọc 201 của Bước 5 (F5) dùng lại đúng mẫu này
export const APPOINTMENT_CODE = /^[A-Za-z0-9_-]{1,40}$/;

// Câu cố định (không cần `chiTiet`)
const fixed =
  (scope: KnownBookingErrorScope, message: string, retryable = false) =>
  (): KnownBookingError => ({ message, retryable, scope });

// A6: "Chi nhánh nghỉ vào Thứ {thứ}." (`thuTrongTuan` theo ISO, 1 đến 7)
function branchClosed(chiTiet: unknown): KnownBookingError {
  const weekday = isoWeekdayLabel(readDetail(chiTiet).thuTrongTuan);
  return {
    message:
      weekday === null
        ? 'Chi nhánh nghỉ vào ngày này.'
        : `Chi nhánh nghỉ vào ${weekday}.`,
    retryable: false,
    scope: 'slot',
  };
}

// A6: "Ngoài giờ hoạt động, chi nhánh mở cửa từ {giờ mở} đến {giờ đóng}." (`gioMo`, `gioDong` dạng HH:mm; thiếu ⇒ câu không có giờ)
function outsideHours(chiTiet: unknown): KnownBookingError {
  const { gioMo, gioDong } = readDetail(chiTiet);
  const valid =
    typeof gioMo === 'string' &&
    typeof gioDong === 'string' &&
    OPENING_TIME.test(gioMo) &&
    OPENING_TIME.test(gioDong);
  return {
    message: valid
      ? `Ngoài giờ hoạt động, chi nhánh mở cửa từ ${gioMo} đến ${gioDong}.`
      : 'Ngoài giờ hoạt động của chi nhánh.',
    retryable: false,
    scope: 'slot',
  };
}

// A3: "Hồ sơ này đã có {n} lịch hẹn đang hoạt động, là mức tối đa." (`toiDa` là số nguyên dương)
function overMaxAppointments(chiTiet: unknown): KnownBookingError {
  const { toiDa } = readDetail(chiTiet);
  const valid =
    typeof toiDa === 'number' && Number.isInteger(toiDa) && toiDa > 0;
  return {
    message: valid
      ? `Hồ sơ này đã có ${toiDa} lịch hẹn đang hoạt động, là mức tối đa.`
      : 'Hồ sơ này đã đạt số lịch hẹn đang hoạt động tối đa.',
    retryable: false,
    scope: 'profile',
  };
}

// A3: "Hồ sơ này đã có lịch hẹn {mã} trùng thời gian." (`maLichHen`; thiếu hay sai dạng ⇒ câu không có mã)
function overlappingAppointment(chiTiet: unknown): KnownBookingError {
  const { maLichHen } = readDetail(chiTiet);
  const valid =
    typeof maLichHen === 'string' && APPOINTMENT_CODE.test(maLichHen);
  return {
    message: valid
      ? `Hồ sơ này đã có lịch hẹn ${maLichHen} trùng thời gian.`
      : 'Hồ sơ này đã có lịch hẹn trùng thời gian.',
    retryable: false,
    scope: 'profile',
  };
}

// MỘT bảng `maLoi` ⇒ câu cho MỌI lỗi của bước kiểm trước khi đặt: Bước 4 (`checks`, booking F4) và Bước 5 (F5: `checks` và tạo lịch, WZ-06, WZ-07) dùng đúng bảng này,
// không viết bảng thứ hai. Chữ lấy từ PLAN 5.14; riêng `HO_SO_NGUOI_THAN_DA_NGUNG` (5.14 chỉ có mã) là [đề xuất]. Dùng `Map` (không phải đối tượng thường) để `maLoi`
// lạ như "constructor" không trúng khoá của nguyên mẫu. Giá trị là hàm nhận `chiTiet` vì vài câu cần số liệu (A3, A6).
const KNOWN_ERRORS = new Map<string, (chiTiet: unknown) => KnownBookingError>([
  [BOOKING_ERROR_CODES.LOCKED_NO_SHOW, fixed('account', NO_SHOW_LOCK_MESSAGE)],
  [BOOKING_ERROR_CODES.FORBIDDEN, fixed('account', FORBIDDEN_MESSAGE)],
  [
    BOOKING_ERROR_CODES.NOT_CONFIGURED,
    fixed('account', NOT_CONFIGURED_MESSAGE, true),
  ],
  [
    BOOKING_ERROR_CODES.SLOT_NOT_FOUND,
    fixed('slot', 'Không tìm thấy khung giờ này.'),
  ],
  [
    BOOKING_ERROR_CODES.SLOT_TAKEN,
    fixed(
      'slot',
      'Khung giờ này vừa có người đặt. Vui lòng chọn khung giờ khác.',
    ),
  ],
  [
    BOOKING_ERROR_CODES.SLOT_HELD,
    fixed(
      'slot',
      'Khung giờ này đang được người khác giữ chỗ. Vui lòng chọn khung giờ khác hoặc thử lại sau ít phút.',
      true,
    ),
  ],
  [
    BOOKING_ERROR_CODES.SLOT_PAST,
    fixed('slot', 'Khung giờ này đã qua. Vui lòng chọn khung giờ khác.'),
  ],
  [
    BOOKING_ERROR_CODES.SLOT_INVALID,
    fixed('slot', 'Khung giờ này không còn hợp lệ. Vui lòng chọn lại.'),
  ],
  [
    BOOKING_ERROR_CODES.BRANCH_UNDECLARED,
    fixed('slot', 'Chi nhánh chưa công bố giờ nhận khám vào ngày này.'),
  ],
  [BOOKING_ERROR_CODES.BRANCH_CLOSED, branchClosed],
  [
    BOOKING_ERROR_CODES.SHIFT_MISSING,
    fixed('slot', 'Chi nhánh không nhận khám vào buổi này.'),
  ],
  [BOOKING_ERROR_CODES.OUTSIDE_HOURS, outsideHours],
  [
    BOOKING_ERROR_CODES.DOCTOR_ON_LEAVE,
    fixed(
      'slot',
      'Bác sĩ nghỉ vào thời gian này. Vui lòng chọn khung giờ khác.',
    ),
  ],
  [
    BOOKING_ERROR_CODES.DOCTOR_UNAVAILABLE,
    fixed('slot', 'Bác sĩ hiện không nhận đặt lịch.'),
  ],
  [
    BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE,
    fixed(
      'slot',
      'Chi nhánh sắp thay đổi lịch nhận khám nên không nhận đặt vào khung giờ này.',
    ),
  ],
  [BOOKING_ERROR_CODES.OVER_MAX_APPOINTMENTS, overMaxAppointments],
  [BOOKING_ERROR_CODES.OVERLAPPING_APPOINTMENT, overlappingAppointment],
  [
    BOOKING_ERROR_CODES.RELATIVE_DEACTIVATED,
    fixed('profile', 'Hồ sơ này đã ngừng sử dụng. Vui lòng chọn hồ sơ khác.'),
  ],
  // 404 của `checks` và tạo lịch: hồ sơ người thân của người khác hay không tồn tại (cùng một thân, H10). Nhóm `profile` (chọn hồ sơ khác thì đi tiếp được) nhưng câu TRUNG TÍNH:
  // 404 có thể do hồ sơ hay do khung giờ nên không đổ riêng cho hồ sơ (phiên kiểm, 13/11/2026). Đổi có chủ ý hành vi nhỏ của Bước 4 (trước đây rơi về câu chung kèm `Thử lại`
  // vô ích), có test BIS-07 F5. Câu là [đề xuất], PLAN 5.14 chưa có.
  [
    BOOKING_ERROR_CODES.NOT_FOUND,
    fixed(
      'profile',
      'Không tìm thấy thông tin để đặt lịch. Vui lòng chọn lại hồ sơ đi khám hoặc khung giờ.',
    ),
  ],
]);

// Câu riêng cho một `maLoi` đã biết; undefined nếu không biết (mạng, quá giờ, 5xx, thân lạ, mã lạ): nơi gọi dùng câu chung của `ErrorState`
export function knownBookingError(
  error: unknown,
): KnownBookingError | undefined {
  return error instanceof ApiError
    ? KNOWN_ERRORS.get(error.maLoi)?.(error.chiTiet)
    : undefined;
}

// Câu cho kết quả `choPhepDatLich = false`: theo `lyDo`; `lyDo` lạ hay vắng thì câu chung (vẫn chặn)
export function eligibilityBlockMessage(lyDo: unknown): string {
  return lyDo === BOOKING_ERROR_CODES.LOCKED_NO_SHOW
    ? NO_SHOW_LOCK_MESSAGE
    : BOOKING_BLOCKED_MESSAGE;
}
