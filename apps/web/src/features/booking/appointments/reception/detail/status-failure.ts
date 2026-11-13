import {
  errorMessageFor,
  GENERIC_ERROR_MESSAGE,
} from '../../../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import { BOOKING_ERROR_CODES } from '../../../api/booking-errors';
import {
  formatVietnamDate,
  formatVietnamTime,
  formatVnd,
  isDecimalAmount,
  isIsoDateTime,
} from '../../common/appointment-format';
import {
  appointmentStateLabel,
  isAppointmentState,
} from '../../common/appointment-status';
import {
  CODE_INVALID_INPUT,
  FIELD_CODE_REASON_REQUIRED,
} from '../../common/error-kinds';
import { BUSY_MESSAGE, notCancellableMessage } from '../../common/failure-text';
import { COMMON_LIST_TEXT } from '../../common/list-text';
import type { ReceptionTarget } from '../api/reception-appointment-types';
import {
  ACTION_TEXT,
  alreadyInStateLabel,
  DETAIL_TEXT,
  transitionLabel,
  unpaidLabel,
  windowSameDayLabel,
  windowTwoDaysLabel,
} from './detail-messages';

// Câu lỗi của route ghi của Lễ tân (booking F9; PLAN 5.14, TRACKING 3.30 F9-J). Chọn câu theo `maLoi` (và `loi[].ma`, `chiTiet`), KHÔNG theo mã HTTP hay `thongBao`
// (CODING_CONVENTION). Hàm thuần: không đọc đồng hồ, không đụng DOM.
//   kind     `final` = chỉ còn đóng (cùng yêu cầu cùng kết quả); `retry` = bấm lại được (503 hoàn tác trọn, lỗi lạ, lý do bị máy chủ từ chối);
//            `uncertain` = chưa rõ máy chủ đã xử lý chưa (mạng, quá giờ, 200 sai hình dạng): giữ nút, thêm `Tải lại chi tiết`, KHÔNG tự gửi lại.
//   refresh  việc tải lại sau lỗi vì dữ liệu đang hiện đã lệch máy chủ: `detail` = chi tiết (nút theo `chuyenDuoc[]` mới); `detailAndList` = cả danh sách
//            (trạng thái hay sự tồn tại của lịch đã đổi nên dòng trong bảng cũng cũ).
//   field    `reason` = câu thuộc ô lý do huỷ, hiện dưới ô thay vì trong khung lỗi chung.
export type FailureKind = 'final' | 'retry' | 'uncertain';
export type FailureRefresh = 'none' | 'detail' | 'detailAndList';

export interface StatusFailure {
  message: string;
  kind: FailureKind;
  refresh: FailureRefresh;
  field?: 'reason';
}

// Mã `maLoi` riêng của route này (B12). Các mã dùng chung với danh sách và chi tiết đã có ở `BOOKING_ERROR_CODES`.
const CODES = {
  invalidTransition: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
  onlyDoctorCompletes: 'CHI_BAC_SI_HOAN_THANH',
  unpaidBalance: 'CON_PHAN_CHUA_THANH_TOAN',
  outsideWindow: 'NGOAI_KHUNG_GIO_TIEP_DON',
  windowNotOver: 'CHUA_QUA_GIO_HEN',
} as const;

// Đọc một khoá của `chiTiet` (kiểu `unknown` do máy chủ gửi): không phải đối tượng hay thiếu khoá ⇒ `undefined`
function detailField(chiTiet: unknown, key: string): unknown {
  return typeof chiTiet === 'object' && chiTiet !== null
    ? (chiTiet as Record<string, unknown>)[key]
    : undefined;
}

// Số tiền còn phải thu lấy NGUYÊN CHUỖI của máy chủ qua `formatVnd` (không `Number`); thiếu hay sai dạng ⇒ câu không số
function unpaidMessage(chiTiet: unknown): string {
  const owed = detailField(chiTiet, 'conPhaiThu');
  return typeof owed === 'string' && isDecimalAmount(owed)
    ? unpaidLabel(formatVnd(owed))
    : ACTION_TEXT.unpaidUnknown;
}

// `tu` và `den` là ISO 8601 UTC: đổi sang GIỜ VIỆT NAM (không theo múi giờ máy). Thiếu hay sai dạng ⇒ câu không giờ.
function windowMessage(chiTiet: unknown): string {
  const from = detailField(chiTiet, 'tu');
  const to = detailField(chiTiet, 'den');
  if (
    typeof from !== 'string' ||
    typeof to !== 'string' ||
    !isIsoDateTime(from) ||
    !isIsoDateTime(to)
  ) {
    return ACTION_TEXT.windowUnknown;
  }
  const fromDate = formatVietnamDate(from);
  const toDate = formatVietnamDate(to);
  return fromDate === toDate
    ? windowSameDayLabel(
        formatVietnamTime(from),
        formatVietnamTime(to),
        fromDate,
      )
    : windowTwoDaysLabel(
        formatVietnamTime(from),
        fromDate,
        formatVietnamTime(to),
        toDate,
      );
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
    return ACTION_TEXT.transitionUnknown;
  }
  return from === to
    ? alreadyInStateLabel(appointmentStateLabel(from))
    : transitionLabel(appointmentStateLabel(from), appointmentStateLabel(to));
}

const stops = (message: string, refresh: FailureRefresh): StatusFailure => ({
  message,
  kind: 'final',
  refresh,
});
const again = (message: string, field?: 'reason'): StatusFailure => ({
  message,
  kind: 'retry',
  refresh: 'none',
  ...(field === undefined ? {} : { field }),
});

// Khoá là `maLoi`; dùng `Map` (không phải đối tượng thường) để `maLoi` lạ như "constructor" không trúng khoá của nguyên mẫu
const RULES = new Map<string, (error: ApiError) => StatusFailure>([
  [
    BOOKING_ERROR_CODES.UNAUTHENTICATED,
    () => stops(COMMON_LIST_TEXT.sessionExpired, 'none'),
  ],
  [BOOKING_ERROR_CODES.FORBIDDEN, () => stops(ACTION_TEXT.forbidden, 'none')],
  // Một câu cho mọi lý do (không có, chi nhánh khác, mã sai dạng: cùng thân 404); dòng trong bảng đã cũ nên tải lại cả danh sách
  [
    BOOKING_ERROR_CODES.NOT_FOUND,
    () => stops(DETAIL_TEXT.notFound, 'detailAndList'),
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
    () => stops(ACTION_TEXT.onlyDoctorCompletes, 'detail'),
  ],
  [
    CODES.unpaidBalance,
    (error) => stops(unpaidMessage(error.chiTiet), 'detail'),
  ],
  [
    CODES.outsideWindow,
    (error) => stops(windowMessage(error.chiTiet), 'detail'),
  ],
  [CODES.windowNotOver, () => stops(ACTION_TEXT.windowNotOver, 'detail')],
  [
    BOOKING_ERROR_CODES.NOT_CONFIGURED,
    () => stops(ACTION_TEXT.notConfigured, 'detail'),
  ],
  // 503: hết lượt thử lại deadlock, giao dịch hoàn tác trọn (PLAN 5.3 quy tắc 5) nên bấm lại an toàn (Đại và phiên kiểm duyệt 13/11/2026, như F2)
  [BOOKING_ERROR_CODES.SYSTEM_BUSY, () => again(BUSY_MESSAGE)],
  [
    CODE_INVALID_INPUT,
    (error) =>
      error.loi?.some((item) => item.ma === FIELD_CODE_REASON_REQUIRED)
        ? again(ACTION_TEXT.cancel.reasonRequired, 'reason')
        : again(GENERIC_ERROR_MESSAGE),
  ],
]);

export function describeStatusFailure(
  error: unknown,
  target: ReceptionTarget,
): StatusFailure {
  if (error instanceof ApiError) {
    return RULES.get(error.maLoi)?.(error) ?? again(GENERIC_ERROR_MESSAGE);
  }
  // Mạng đứt, quá giờ, 200 sai hình dạng: máy chủ có thể đã xử lý xong ⇒ "chưa rõ", không tự gửi lại
  if (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof UnexpectedResponseError
  ) {
    return {
      message: ACTION_TEXT.unsure[target],
      kind: 'uncertain',
      refresh: 'none',
    };
  }
  return again(errorMessageFor(error));
}
