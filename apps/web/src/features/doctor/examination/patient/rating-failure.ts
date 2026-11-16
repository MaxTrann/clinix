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
import type { RatingFieldErrors } from './rating-rules';
import { RATING_TEXT } from './rating-text';

// Ánh xạ lỗi của `POST …/rating` (doctor-exam F6; PLAN 5.14; WDG-05, WDG-07, WDG-14). Chọn câu theo `maLoi` (và `loi[].ma`), KHÔNG theo mã HTTP hay `thongBao` (CODING_CONVENTION). Hàm thuần: không đọc đồng hồ, không đụng DOM, không in `thongBao`.
//   field      400 có `loi[]` hiểu được: lỗi hiện ĐÚNG ô, nội dung giữ nguyên, không dải chung (`message` là `null`);
//   retry      503, lỗi lạ, 400 không ánh xạ được (lỗi lập trình): bấm Gửi lại được;
//   final      404, 401, 403, 409 `LICH_HEN_CHUA_HOAN_THANH`: Gửi khoá, chỉ còn `Huỷ`;
//   already    409 `DA_DANH_GIA` (bấm đúp, hai tab, hay lần trước đã lưu mà mất phản hồi): không phải lỗi đỏ, nơi gọi tải lại chi tiết để hiện đánh giá đã gửi;
//   uncertain  mạng, hết giờ, 200 hay 201 sai hình dạng: máy chủ có thể đã lưu, KHÔNG tự gửi lại (API không idempotent), nội dung còn, người dùng bấm lại thì an toàn.
export type RatingFailureKind =
  'field' | 'retry' | 'final' | 'already' | 'uncertain';

export interface RatingFailure {
  message: string | null;
  kind: RatingFailureKind;
  fields: RatingFieldErrors;
}

const failure = (
  message: string | null,
  kind: RatingFailureKind,
  fields: RatingFieldErrors = {},
): RatingFailure => ({ message, kind, fields });

const CODES = {
  invalid: 'DU_LIEU_KHONG_HOP_LE',
  already: 'DA_DANH_GIA',
  notCompleted: 'LICH_HEN_CHUA_HOAN_THANH',
  notFound: 'KHONG_TIM_THAY',
  busy: 'HE_THONG_DANG_BAN',
  forbidden: 'KHONG_DU_QUYEN',
  unauthenticated: 'CHUA_DANG_NHAP',
} as const;

const STAR_CODES: ReadonlySet<string> = new Set([
  'SO_SAO_BAT_BUOC',
  'SO_SAO_KHONG_HOP_LE',
]);

// Ô nào nhận mã nào: `soSao` nhận hai mã số sao, `nhanXet` chỉ nhận `QUA_DAI`. Khoá lạ, mã lạ, phần tử sai dạng bị bỏ; cùng một ô giữ lỗi ĐẦU.
function readFieldErrors(loi: unknown): RatingFieldErrors {
  const fields: RatingFieldErrors = {};
  if (!Array.isArray(loi)) return fields;
  for (const entry of loi as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { truong, ma } = entry as Record<string, unknown>;
    if (typeof truong !== 'string' || typeof ma !== 'string') continue;
    if (
      truong === 'soSao' &&
      fields.soSao === undefined &&
      STAR_CODES.has(ma)
    ) {
      fields.soSao = ma as NonNullable<RatingFieldErrors['soSao']>;
    }
    if (
      truong === 'nhanXet' &&
      fields.nhanXet === undefined &&
      ma === 'QUA_DAI'
    ) {
      fields.nhanXet = 'QUA_DAI';
    }
  }
  return fields;
}

function invalidData(error: ApiError): RatingFailure {
  const fields = readFieldErrors(error.loi);
  return Object.keys(fields).length > 0
    ? failure(null, 'field', fields)
    : failure(GENERIC_ERROR_MESSAGE, 'retry');
}

// Khoá là `maLoi`; dùng `Map` (không phải đối tượng thường) để `maLoi` lạ như "constructor" không trúng khoá của nguyên mẫu
const RULES = new Map<string, (error: ApiError) => RatingFailure>([
  [CODES.invalid, invalidData],
  [CODES.already, () => failure(RATING_TEXT.already, 'already')],
  [CODES.notCompleted, () => failure(RATING_TEXT.notCompleted, 'final')],
  [CODES.notFound, () => failure(RATING_TEXT.notFound, 'final')],
  [CODES.busy, () => failure(RATING_TEXT.busy, 'retry')],
  [CODES.forbidden, () => failure(RATING_TEXT.forbidden, 'final')],
  [CODES.unauthenticated, () => failure(RATING_TEXT.sessionExpired, 'final')],
]);

export function describeRatingFailure(error: unknown): RatingFailure {
  if (error instanceof ApiError) {
    const rule = RULES.get(error.maLoi);
    return rule === undefined
      ? failure(GENERIC_ERROR_MESSAGE, 'retry')
      : rule(error);
  }
  // Mạng đứt, quá giờ, phản hồi lạ (nginx 502, 201 sai hình dạng): máy chủ có thể đã lưu xong ⇒ "chưa rõ", không tự gửi lại
  if (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof UnexpectedResponseError
  ) {
    return failure(RATING_TEXT.unsure, 'uncertain');
  }
  return failure(errorMessageFor(error), 'retry');
}
