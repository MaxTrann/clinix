import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';

// Mã lỗi của article (PLAN article 5.8). Web chọn thông báo theo MÃ, không theo câu chữ.

/** Mã của MỘT trường trong `loi[{truong, ma}]` của 400 `DU_LIEU_KHONG_HOP_LE` (DTO gom được nhiều lỗi một lượt). */
export const ARTICLE_FIELD_ERRORS = {
  INVALID_TITLE: 'TIEU_DE_KHONG_HOP_LE',
  SUMMARY_TOO_LONG: 'MO_TA_QUA_DAI',
  /** Thêm ngoài bảng 5.8: mô tả có ký tự điều khiển hay cặp thay thế lẻ (đối xứng với `NOI_DUNG_KHONG_HOP_LE`). */
  INVALID_SUMMARY: 'MO_TA_KHONG_HOP_LE',
  CONTENT_TOO_LONG: 'NOI_DUNG_QUA_DAI',
  INVALID_CONTENT: 'NOI_DUNG_KHONG_HOP_LE',
  INVALID_TAG: 'THE_KHONG_HOP_LE',
  TOO_MANY_TAGS: 'QUA_NHIEU_THE',
  INVALID_STATUS: 'TRANG_THAI_KHONG_HOP_LE',
  INVALID_ARTICLE_ID: 'MA_BAI_VIET_KHONG_HOP_LE',
  INVALID_KEYWORD: 'TU_KHOA_KHONG_HOP_LE',
  INVALID_PAGE: 'TRANG_KHONG_HOP_LE',
} as const;

/** Mã nghiệp vụ trả thẳng ở `maLoi` (không nằm trong `loi[]`). */
export const ARTICLE_ERROR_CODES = {
  CONTENT_REQUIRED_TO_PUBLISH: 'NOI_DUNG_BAT_BUOC_KHI_XUAT_BAN',
  INVALID_INITIAL_STATUS: 'TRANG_THAI_KHONG_HOP_LE',
  TAG_ACCENT_CONFLICT: 'THE_TRUNG_KHONG_DAU',
  TAG_DISABLED: 'THE_DA_TAT',
  /** B2: bộ lọc của route công khai sai dạng (PLAN 5.7: `the`); chi tiết từng trường nằm ở `loi[]`. */
  INVALID_FILTER: 'BO_LOC_KHONG_HOP_LE',
} as const;

/** B2: 400 `BO_LOC_KHONG_HOP_LE` kèm tên trường lọc sai và mã của trường đó (service công khai; nếp `parseFilterId` của search). */
export function invalidFilter(truong: string, ma: string): AppException {
  return new AppException(400, ARTICLE_ERROR_CODES.INVALID_FILTER, {
    thongBao: 'Bộ lọc không hợp lệ.',
    loi: [{ truong, ma }],
  });
}

/** 400 `DU_LIEU_KHONG_HOP_LE` không kèm danh sách trường (thân `PATCH` rỗng). */
export function emptyPatch(): AppException {
  return new AppException(400, COMMON_ERROR_CODES.INVALID_DATA);
}

/** 400 `DU_LIEU_KHONG_HOP_LE` kèm một lỗi của một trường (kiểm ở service). */
export function invalidField(truong: string, ma: string): AppException {
  return new AppException(400, COMMON_ERROR_CODES.INVALID_DATA, {
    loi: [{ truong, ma }],
  });
}

export function articleNotFound(): AppException {
  return new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
}

/** MH2: xuất bản (hay đang xuất bản) mà nội dung rỗng. */
export function contentRequiredToPublish(): AppException {
  return new AppException(400, ARTICLE_ERROR_CODES.CONTENT_REQUIRED_TO_PUBLISH);
}

/** MH1: tạo thẳng ở trạng thái lưu trữ. */
export function invalidInitialStatus(): AppException {
  return new AppException(400, ARTICLE_ERROR_CODES.INVALID_INITIAL_STATUS);
}

/** T6, Q6: thẻ trùng theo collation nhưng khác dấu với thẻ đã có; `theDaCo` là tên đang lưu. */
export function tagAccentConflict(theDaCo: string): AppException {
  return new AppException(409, ARTICLE_ERROR_CODES.TAG_ACCENT_CONFLICT, {
    chiTiet: { theDaCo },
  });
}

/** T6, ABT-11: thẻ đã có nhưng đang tắt; không tự bật lại. */
export function tagDisabled(theDaCo: string): AppException {
  return new AppException(409, ARTICLE_ERROR_CODES.TAG_DISABLED, {
    chiTiet: { theDaCo },
  });
}
