import {
  errorMessageFor,
  GENERIC_ERROR_MESSAGE,
} from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';

// Chữ và câu lỗi của nút `Hoàn thành ca khám` (doctor-exam F1; Figma `459:2`, `461:2`; PLAN 5.14). Chữ có trong Figma: `action`, `prompt`, `confirm`, `cancel`.
// Còn lại là [đề xuất], chờ nhóm duyệt (Figma không có khung cho đang gửi, thành công, lỗi): `groupLabel`, `confirming`, `reload`, `done`, `unsure` và các câu lỗi
// (Đại duyệt qua phiên kiểm 15/11/2026; `Không tìm thấy ca khám này.` thêm "ca khám này" so với PLAN 5.14 cho đủ ý).
export const COMPLETE_TEXT = {
  action: 'Hoàn thành ca khám',
  prompt: 'Xác nhận hoàn thành?',
  groupLabel: 'Xác nhận hoàn thành ca khám',
  confirm: 'Xác nhận',
  confirming: 'Đang hoàn thành...',
  cancel: 'Hủy',
  reload: 'Tải lại chi tiết',
  done: 'Đã hoàn thành ca khám.',
  already: 'Ca khám này đã được hoàn thành.',
  notFound: 'Không tìm thấy ca khám này.',
  notReceived: 'Chỉ hoàn thành được ca khám đã tiếp đón.',
  busy: 'Hệ thống đang bận, thử lại sau ít phút.',
  // Hai câu dưới chép chữ của booking (`COMMON_LIST_TEXT.sessionExpired`, `COMMON_ACTION_TEXT.forbidden`): Q20 phương án C cấm `features/doctor` import `features/booking`
  sessionExpired: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  unsure:
    'Chưa rõ ca khám đã được hoàn thành chưa (mất kết nối hoặc quá thời gian chờ). Hãy tải lại chi tiết để kiểm tra.',
} as const;

// `final`   chỉ còn đóng hàng xác nhận (cùng yêu cầu cùng kết quả, hoặc lịch đã đổi);
// `retry`   bấm lại được (503 hoàn tác trọn, lỗi lạ): hàng xác nhận ở lại;
// `uncertain` chưa rõ máy chủ đã xử lý chưa (mạng, quá giờ, 200 sai hình dạng): KHÔNG tự gửi lại, mời tải lại chi tiết;
// `already` 409 mà lịch ĐÃ `HoanThanh` (bấm lần hai hay ở tab khác): không phải lỗi, nơi gọi hiện như thành công.
// `refresh`: có tải lại chi tiết hay không (dữ liệu đang hiện đã lệch máy chủ nên nút phải khớp lại).
export type FailureKind = 'final' | 'retry' | 'uncertain' | 'already';

export interface CompleteFailure {
  message: string;
  kind: FailureKind;
  refresh: boolean;
}

const MA_LOI = {
  notFound: 'KHONG_TIM_THAY',
  invalidTransition: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
  busy: 'HE_THONG_DANG_BAN',
  forbidden: 'KHONG_DU_QUYEN',
  unauthenticated: 'CHUA_DANG_NHAP',
} as const;

const COMPLETED_STATE = 'HoanThanh';

// Đọc một khoá của `chiTiet` (kiểu `unknown` do máy chủ gửi): không phải đối tượng hay thiếu khoá ⇒ `undefined`
function detailField(chiTiet: unknown, key: string): unknown {
  return typeof chiTiet === 'object' && chiTiet !== null
    ? (chiTiet as Record<string, unknown>)[key]
    : undefined;
}

const failure = (
  message: string,
  kind: FailureKind,
  refresh: boolean,
): CompleteFailure => ({ message, kind, refresh });

// 409: chỉ khi `chiTiet.tuTrangThai` đúng là `HoanThanh` mới coi là "đã hoàn thành"; thiếu hay lạ thì KHÔNG đoán
function invalidTransition(error: ApiError): CompleteFailure {
  return detailField(error.chiTiet, 'tuTrangThai') === COMPLETED_STATE
    ? failure(COMPLETE_TEXT.already, 'already', true)
    : failure(COMPLETE_TEXT.notReceived, 'final', true);
}

// Khoá là `maLoi`; dùng `Map` (không phải đối tượng thường) để `maLoi` lạ như "constructor" không trúng khoá của nguyên mẫu
const RULES = new Map<string, (error: ApiError) => CompleteFailure>([
  [MA_LOI.notFound, () => failure(COMPLETE_TEXT.notFound, 'final', true)],
  [MA_LOI.invalidTransition, invalidTransition],
  [MA_LOI.busy, () => failure(COMPLETE_TEXT.busy, 'retry', false)],
  [MA_LOI.forbidden, () => failure(COMPLETE_TEXT.forbidden, 'final', false)],
  [
    MA_LOI.unauthenticated,
    () => failure(COMPLETE_TEXT.sessionExpired, 'final', false),
  ],
]);

// Chọn câu theo `maLoi` (và `chiTiet.tuTrangThai`), KHÔNG theo mã HTTP hay `thongBao` (CODING_CONVENTION). Hàm thuần: không đọc đồng hồ, không đụng DOM.
export function describeCompleteFailure(error: unknown): CompleteFailure {
  if (error instanceof ApiError) {
    const rule = RULES.get(error.maLoi);
    return rule === undefined
      ? failure(GENERIC_ERROR_MESSAGE, 'retry', false)
      : rule(error);
  }
  // Mạng đứt, quá giờ, phản hồi lạ (nginx 502, 200 sai hình dạng): máy chủ có thể đã xử lý xong ⇒ "chưa rõ", không tự gửi lại
  if (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof UnexpectedResponseError
  ) {
    return failure(COMPLETE_TEXT.unsure, 'uncertain', false);
  }
  return failure(errorMessageFor(error), 'retry', false);
}
