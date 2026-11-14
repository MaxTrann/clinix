import {
  formatVietnamDate,
  formatVietnamTime,
  formatVnd,
  isDecimalAmount,
  isIsoDateTime,
} from '../../common/appointment-format';
import {
  describeFailure,
  detailField,
  stops,
  type FailureRule,
  type StatusFailure,
} from '../../common/status-failure';
import type { ReceptionTarget } from '../api/reception-appointment-types';
import {
  ACTION_TEXT,
  unpaidLabel,
  windowSameDayLabel,
  windowTwoDaysLabel,
} from './detail-messages';

// Câu lỗi của route ghi của Lễ tân (booking F9; PLAN 5.14, TRACKING 3.30 F9-J). Phần CHUNG (bảng `maLoi`, kiểu `StatusFailure`) đã chuyển lên `common/status-failure.ts` ở F10
// (override của Quản trị viên dùng lại); file này chỉ giữ ba mã chỉ có ở route của Lễ tân và chọn câu "chưa rõ" theo ba đích của Lễ tân. Hàm thuần: không đọc đồng hồ, không đụng DOM.
export type {
  FailureKind,
  FailureRefresh,
  StatusFailure,
} from '../../common/status-failure';

// Mã `maLoi` riêng của route này (B12)
const CODES = {
  unpaidBalance: 'CON_PHAN_CHUA_THANH_TOAN',
  outsideWindow: 'NGOAI_KHUNG_GIO_TIEP_DON',
  windowNotOver: 'CHUA_QUA_GIO_HEN',
} as const;

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

// Khoá là `maLoi`; dùng `Map` để `maLoi` lạ như "constructor" không trúng khoá của nguyên mẫu
const RECEPTION_RULES = new Map<string, FailureRule>([
  [
    CODES.unpaidBalance,
    (error) => stops(unpaidMessage(error.chiTiet), 'detail'),
  ],
  [
    CODES.outsideWindow,
    (error) => stops(windowMessage(error.chiTiet), 'detail'),
  ],
  [CODES.windowNotOver, () => stops(ACTION_TEXT.windowNotOver, 'detail')],
]);

export function describeStatusFailure(
  error: unknown,
  target: ReceptionTarget,
): StatusFailure {
  return describeFailure(error, ACTION_TEXT.unsure[target], RECEPTION_RULES);
}
