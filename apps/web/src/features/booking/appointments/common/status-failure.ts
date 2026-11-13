import {
  errorMessageFor,
  GENERIC_ERROR_MESSAGE,
} from '../../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import { BOOKING_ERROR_CODES } from '../../api/booking-errors';
import {
  alreadyInStateLabel,
  COMMON_ACTION_TEXT,
  transitionLabel,
} from './action-text';
import {
  appointmentStateLabel,
  isAppointmentState,
} from './appointment-status';
import { CODE_INVALID_INPUT, FIELD_CODE_REASON_REQUIRED } from './error-kinds';
import { BUSY_MESSAGE, notCancellableMessage } from './failure-text';
import { COMMON_LIST_TEXT } from './list-text';

// Phần CHUNG của câu lỗi các route ghi đổi trạng thái lịch hẹn: Lễ tân (booking F9; PLAN 5.14, TRACKING 3.30 F9-J) và override của Quản trị viên (F10). Chuyển từ
// `reception/detail/status-failure.ts` lên `common/` ở F10; ba mã chỉ của Lễ tân (`CON_PHAN_CHUA_THANH_TOAN`, `NGOAI_KHUNG_GIO_TIEP_DON`, `CHUA_QUA_GIO_HEN`) ở lại đó và
// vào qua `extraRules`. Chọn câu theo `maLoi` (và `loi[].ma`, `chiTiet`), KHÔNG theo mã HTTP hay `thongBao` (CODING_CONVENTION). Hàm thuần: không đọc đồng hồ, không đụng DOM.
//   kind     `final` = chỉ còn đóng (cùng yêu cầu cùng kết quả); `retry` = bấm lại được (503 hoàn tác trọn, lỗi lạ, lý do bị máy chủ từ chối);
//            `uncertain` = chưa rõ máy chủ đã xử lý chưa (mạng, quá giờ, 200 sai hình dạng): giữ nút, thêm `Tải lại chi tiết`, KHÔNG tự gửi lại.
//   refresh  việc tải lại sau lỗi vì dữ liệu đang hiện đã lệch máy chủ: `detail` = chi tiết (nút theo `chuyenDuoc[]` mới); `detailAndList` = cả danh sách
//            (trạng thái hay sự tồn tại của lịch đã đổi nên dòng trong bảng cũng cũ).
//   field    `reason` = câu thuộc ô lý do, hiện dưới ô thay vì trong khung lỗi chung.
export type FailureKind = 'final' | 'retry' | 'uncertain';
export type FailureRefresh = 'none' | 'detail' | 'detailAndList';

export interface StatusFailure {
  message: string;
  kind: FailureKind;
  refresh: FailureRefresh;
  field?: 'reason';
}

export type FailureRule = (error: ApiError) => StatusFailure;

// Mã `maLoi` của hai mã chỉ có ở route đổi trạng thái (B12, B14). Các mã dùng chung với danh sách và chi tiết đã có ở `BOOKING_ERROR_CODES`.
const CODES = {
  invalidTransition: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
  onlyDoctorCompletes: 'CHI_BAC_SI_HOAN_THANH',
} as const;

// Đọc một khoá của `chiTiet` (kiểu `unknown` do máy chủ gửi): không phải đối tượng hay thiếu khoá ⇒ `undefined`
export function detailField(chiTiet: unknown, key: string): unknown {
  return typeof chiTiet === 'object' && chiTiet !== null
    ? (chiTiet as Record<string, unknown>)[key]
    : undefined;
}

// Hai trạng thái phải là trạng thái có nhãn (mã lạ, kể cả `DaDoiLich`, không được hiện "Chưa xác định" giữa câu). Cùng một trạng thái (bấm lần hai ở máy khác) ⇒ câu riêng.
function transitionMessage(chiTiet: unknown): string {
  const from = detailField(chiTiet, 'tuTrangThai');
  const to = detailField(chiTiet, 'denTrangThai');
  if (
    typeof from !== 'string' ||
    typeof to !== 'string' ||
    !isAppointmentState(from) ||
    !isAppointmentState(to)
  ) {
    return COMMON_ACTION_TEXT.transitionUnknown;
  }
  return from === to
    ? alreadyInStateLabel(appointmentStateLabel(from))
    : transitionLabel(appointmentStateLabel(from), appointmentStateLabel(to));
}

export const stops = (
  message: string,
  refresh: FailureRefresh,
): StatusFailure => ({
  message,
  kind: 'final',
  refresh,
});
export const again = (message: string, field?: 'reason'): StatusFailure => ({
  message,
  kind: 'retry',
  refresh: 'none',
  ...(field === undefined ? {} : { field }),
});

// Khoá là `maLoi`; dùng `Map` (không phải đối tượng thường) để `maLoi` lạ như "constructor" không trúng khoá của nguyên mẫu
const BASE_RULES = new Map<string, FailureRule>([
  [
    BOOKING_ERROR_CODES.UNAUTHENTICATED,
    () => stops(COMMON_LIST_TEXT.sessionExpired, 'none'),
  ],
  [
    BOOKING_ERROR_CODES.FORBIDDEN,
    () => stops(COMMON_ACTION_TEXT.forbidden, 'none'),
  ],
  // Một câu cho mọi lý do (không có, chi nhánh khác, mã sai dạng: cùng thân 404); dòng trong bảng đã cũ nên tải lại cả danh sách
  [
    BOOKING_ERROR_CODES.NOT_FOUND,
    () => stops(COMMON_ACTION_TEXT.notFound, 'detailAndList'),
  ],
  [
    BOOKING_ERROR_CODES.NOT_CANCELLABLE,
    (error) => stops(notCancellableMessage(error.chiTiet), 'detailAndList'),
  ],
  [
    CODES.invalidTransition,
    (error) => stops(transitionMessage(error.chiTiet), 'detailAndList'),
  ],
  [
    CODES.onlyDoctorCompletes,
    () => stops(COMMON_ACTION_TEXT.onlyDoctorCompletes, 'detail'),
  ],
  [
    BOOKING_ERROR_CODES.NOT_CONFIGURED,
    () => stops(COMMON_ACTION_TEXT.notConfigured, 'detail'),
  ],
  // 503: hết lượt thử lại deadlock, giao dịch hoàn tác trọn (PLAN 5.3 quy tắc 5) nên bấm lại an toàn (Đại và phiên kiểm duyệt 13/11/2026, như F2)
  [BOOKING_ERROR_CODES.SYSTEM_BUSY, () => again(BUSY_MESSAGE)],
  [
    CODE_INVALID_INPUT,
    (error) =>
      error.loi?.some((item) => item.ma === FIELD_CODE_REASON_REQUIRED)
        ? again(COMMON_ACTION_TEXT.reasonRequired, 'reason')
        : again(GENERIC_ERROR_MESSAGE),
  ],
]);

// `unsure` là câu "chưa rõ" của đích đang gửi (nơi gọi chọn). `extraRules` là mã chỉ có ở route của nơi gọi (không trùng khoá với bảng chung).
export function describeFailure(
  error: unknown,
  unsure: string,
  extraRules?: ReadonlyMap<string, FailureRule>,
): StatusFailure {
  if (error instanceof ApiError) {
    const rule = extraRules?.get(error.maLoi) ?? BASE_RULES.get(error.maLoi);
    return rule?.(error) ?? again(GENERIC_ERROR_MESSAGE);
  }
  // Mạng đứt, quá giờ, 200 sai hình dạng: máy chủ có thể đã xử lý xong ⇒ "chưa rõ", không tự gửi lại
  if (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof UnexpectedResponseError
  ) {
    return { message: unsure, kind: 'uncertain', refresh: 'none' };
  }
  return again(errorMessageFor(error));
}
