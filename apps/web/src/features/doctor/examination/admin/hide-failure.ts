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
import type { HideReasonCode } from './hide-rules';
import { HIDE_TEXT } from './reviews-text';

// Ánh xạ lỗi của `POST …/hide` (doctor-exam F8; PLAN 5.14; WKD-05, WKD-07, WKD-22). Chọn câu theo `maLoi` (và `loi[].ma`), KHÔNG theo mã HTTP hay `thongBao` (CODING_CONVENTION). Hàm thuần: không đọc đồng hồ, không đụng DOM, không in `thongBao`.
//   field      400 có `loi[]` trường `lyDo` mang một trong bốn mã: lỗi hiện ĐÚNG ô, lý do giữ nguyên, không dải chung (`message` là `null`);
//   retry      503, lỗi lạ, 400 không ánh xạ được (`IS_STRING`, `TRUONG_KHONG_DUOC_PHEP`, `loi[]` rỗng: lỗi lập trình): giữ hộp và lý do, bấm lại được;
//   final      401, 403: `Xác nhận ẩn` khoá, chỉ còn `Hủy`;
//   already    409 `DANH_GIA_DA_AN` (hai Admin, hai tab, hay lần trước đã ẩn mà mất phản hồi): không phải lỗi đỏ, nơi gọi đóng hộp, tải lại danh sách và báo "đã được ẩn";
//   gone       404 (không còn hay ngoài phạm vi): nơi gọi đóng hộp, tải lại danh sách và báo không tìm thấy;
//   uncertain  mạng, hết giờ, 200 sai hình dạng: máy chủ có thể đã ẩn xong ⇒ "chưa rõ", KHÔNG tự gửi lại; lý do còn, bấm lại thì an toàn (lần trước đã ẩn ⇒ 409 ⇒ `already`).
export type HideFailureKind =
  'field' | 'retry' | 'final' | 'already' | 'gone' | 'uncertain';

export interface HideFailure {
  message: string | null;
  kind: HideFailureKind;
  // Mã của ô `lyDo` khi `kind` là `field`, ngược lại `null`
  code: HideReasonCode | null;
}

const failure = (
  message: string | null,
  kind: HideFailureKind,
  code: HideReasonCode | null = null,
): HideFailure => ({ message, kind, code });

const CODES = {
  invalid: 'DU_LIEU_KHONG_HOP_LE',
  already: 'DANH_GIA_DA_AN',
  notFound: 'KHONG_TIM_THAY',
  busy: 'HE_THONG_DANG_BAN',
  forbidden: 'KHONG_DU_QUYEN',
  unauthenticated: 'CHUA_DANG_NHAP',
} as const;

const REASON_CODES: ReadonlySet<string> = new Set<HideReasonCode>([
  'LY_DO_BAT_BUOC',
  'LY_DO_QUA_NGAN',
  'LY_DO_QUA_DAI',
  'NOI_DUNG_KHONG_HOP_LE',
]);

// Câu lỗi của ô "Lý do ẩn" theo mã (lỗi ở máy và lỗi máy chủ dùng chung bảng này)
export function reasonMessage(code: HideReasonCode): string {
  switch (code) {
    case 'LY_DO_BAT_BUOC':
      return HIDE_TEXT.required;
    case 'LY_DO_QUA_NGAN':
      return HIDE_TEXT.tooShort;
    case 'LY_DO_QUA_DAI':
      return HIDE_TEXT.tooLong;
    case 'NOI_DUNG_KHONG_HOP_LE':
      return HIDE_TEXT.rejected;
  }
}

// Chỉ trường `lyDo` và bốn mã trên được nhận; khoá lạ, mã lạ, phần tử sai dạng bị bỏ; giữ lỗi ĐẦU
function readReasonCode(loi: unknown): HideReasonCode | null {
  if (!Array.isArray(loi)) return null;
  for (const entry of loi as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { truong, ma } = entry as Record<string, unknown>;
    if (truong !== 'lyDo' || typeof ma !== 'string') continue;
    if (REASON_CODES.has(ma)) return ma as HideReasonCode;
  }
  return null;
}

function invalidData(error: ApiError): HideFailure {
  const code = readReasonCode(error.loi);
  return code === null
    ? failure(GENERIC_ERROR_MESSAGE, 'retry')
    : failure(null, 'field', code);
}

// Khoá là `maLoi`; dùng `Map` (không phải đối tượng thường) để `maLoi` lạ như "constructor" không trúng khoá của nguyên mẫu
const RULES = new Map<string, (error: ApiError) => HideFailure>([
  [CODES.invalid, invalidData],
  [CODES.already, () => failure(HIDE_TEXT.already, 'already')],
  [CODES.notFound, () => failure(HIDE_TEXT.notFound, 'gone')],
  [CODES.busy, () => failure(HIDE_TEXT.busy, 'retry')],
  [CODES.forbidden, () => failure(HIDE_TEXT.forbidden, 'final')],
  [CODES.unauthenticated, () => failure(HIDE_TEXT.sessionExpired, 'final')],
]);

export function describeHideFailure(error: unknown): HideFailure {
  if (error instanceof ApiError) {
    const rule = RULES.get(error.maLoi);
    return rule === undefined
      ? failure(GENERIC_ERROR_MESSAGE, 'retry')
      : rule(error);
  }
  // Mạng đứt, quá giờ, phản hồi lạ (nginx 502, 200 sai hình dạng): máy chủ có thể đã ẩn xong ⇒ "chưa rõ", không tự gửi lại
  if (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof UnexpectedResponseError
  ) {
    return failure(HIDE_TEXT.unsure, 'uncertain');
  }
  return failure(errorMessageFor(error), 'retry');
}
