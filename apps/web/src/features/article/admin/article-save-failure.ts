import { errorMessageFor } from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import {
  ARTICLE_ERROR,
  ARTICLE_ERROR_FIELD,
  articleErrorText,
  collectErrorCodes,
  readExistingTag,
} from '../common/article-errors';
import type { FieldErrors } from './article-form-rules';
import { FORM_TEXT, LIST_TEXT, TAG_FALLBACK_TEXT } from './article-text';

// Chọn chữ cho lỗi khi lưu (PLAN article 5.8): theo MÃ (`maLoi` và `loi[].ma`), không theo `thongBao` của máy chủ.
const isStatus = (error: unknown, status: number) =>
  error instanceof ApiError && error.status === status;
const isUnknownOutcome = (error: unknown) =>
  error instanceof NetworkError || error instanceof TimeoutError;

export interface SaveFailure {
  // Lỗi gắn dưới ô; có thì bỏ qua `banner`
  fields: FieldErrors;
  // Lỗi không thuộc ô nào (403, 404, mạng, hết giờ, 5xx): hiện cạnh nút Lưu
  banner: string | null;
}

export function describeSaveFailure(
  error: unknown,
  options: { creating: boolean },
): SaveFailure {
  const codes = collectErrorCodes(error);
  const existing = readExistingTag(error);
  const fields: FieldErrors = {};
  for (const code of codes) {
    const field = ARTICLE_ERROR_FIELD[code];
    if (field === undefined || fields[field] !== undefined) continue;
    const text = articleErrorText(code, existing) ?? TAG_FALLBACK_TEXT[code];
    if (text !== undefined) fields[field] = text;
  }
  if (Object.keys(fields).length > 0) return { fields, banner: null };

  if (codes.includes(ARTICLE_ERROR.forbidden) || isStatus(error, 403)) {
    return { fields, banner: FORM_TEXT.forbidden };
  }
  if (codes.includes(ARTICLE_ERROR.notFound) || isStatus(error, 404)) {
    return { fields, banner: FORM_TEXT.notFound };
  }
  // Tạo mới mà mất mạng hay hết giờ: không biết máy chủ đã ghi chưa nên không bảo "thử lại" ngay
  if (options.creating && isUnknownOutcome(error)) {
    return { fields, banner: FORM_TEXT.unknownCreate };
  }
  return { fields, banner: errorMessageFor(error) };
}

export interface StatusFailure {
  text: string;
  // Bài không còn (404): danh sách phải tải lại
  reload: boolean;
}

// Lỗi khi đổi trạng thái ngay ở một dòng của danh sách
export function describeStatusFailure(error: unknown): StatusFailure {
  const codes = collectErrorCodes(error);
  if (codes.includes(ARTICLE_ERROR.contentRequiredToPublish)) {
    return {
      text:
        articleErrorText(ARTICLE_ERROR.contentRequiredToPublish) ??
        LIST_TEXT.failed,
      reload: false,
    };
  }
  if (codes.includes(ARTICLE_ERROR.forbidden) || isStatus(error, 403)) {
    return { text: LIST_TEXT.forbidden, reload: false };
  }
  if (codes.includes(ARTICLE_ERROR.notFound) || isStatus(error, 404)) {
    return { text: LIST_TEXT.notFound, reload: true };
  }
  if (isUnknownOutcome(error)) {
    return { text: errorMessageFor(error), reload: false };
  }
  return { text: LIST_TEXT.failed, reload: false };
}
