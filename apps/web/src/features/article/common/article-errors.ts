import { ApiError } from '../../../shared/api/errors';

// Mã lỗi và chữ của module bài viết (PLAN article 5.8). Web chọn chữ theo MÃ, không theo `thongBao` của máy chủ.
// Mã có thể nằm ở `maLoi` (lỗi nghiệp vụ) hoặc ở `loi[].ma` (lỗi theo ô, khi `maLoi` là `DU_LIEU_KHONG_HOP_LE`): `collectErrorCodes` gom cả hai.
export const ARTICLE_ERROR = {
  invalidData: 'DU_LIEU_KHONG_HOP_LE',
  title: 'TIEU_DE_KHONG_HOP_LE',
  summaryTooLong: 'MO_TA_QUA_DAI',
  summaryInvalid: 'MO_TA_KHONG_HOP_LE',
  contentTooLong: 'NOI_DUNG_QUA_DAI',
  contentInvalid: 'NOI_DUNG_KHONG_HOP_LE',
  contentRequiredToPublish: 'NOI_DUNG_BAT_BUOC_KHI_XUAT_BAN',
  statusInvalid: 'TRANG_THAI_KHONG_HOP_LE',
  tagInvalid: 'THE_KHONG_HOP_LE',
  tooManyTags: 'QUA_NHIEU_THE',
  tagAccentConflict: 'THE_TRUNG_KHONG_DAU',
  tagDisabled: 'THE_DA_TAT',
  forbidden: 'KHONG_DU_QUYEN',
  notFound: 'KHONG_TIM_THAY',
  payloadTooLarge: 'DU_LIEU_QUA_LON',
  // B1 (đã xong) cộng thêm bốn mã dưới; web chuẩn hoá và kiểm trước khi gọi nên hầu như không gặp. Không có chữ riêng và không gắn ô nào:
  // rơi vào nhánh "mã lạ" (dải báo cạnh nút Lưu hay ErrorState). `TRUONG_KHONG_DUOC_PHEP` là khoá lạ trong thân (kể cả `imageUploadId`).
  invalidArticleId: 'MA_BAI_VIET_KHONG_HOP_LE',
  invalidKeyword: 'TU_KHOA_KHONG_HOP_LE',
  invalidPage: 'TRANG_KHONG_HOP_LE',
  fieldNotAllowed: 'TRUONG_KHONG_DUOC_PHEP',
} as const;

export type ArticleErrorCode =
  (typeof ARTICLE_ERROR)[keyof typeof ARTICLE_ERROR];

// Ô của biểu mẫu nhận lỗi
export type ArticleField =
  'tieuDe' | 'moTaNgan' | 'noiDung' | 'hashtag' | 'trangThai';

export const ARTICLE_ERROR_FIELD: Partial<Record<string, ArticleField>> = {
  [ARTICLE_ERROR.title]: 'tieuDe',
  [ARTICLE_ERROR.summaryTooLong]: 'moTaNgan',
  [ARTICLE_ERROR.summaryInvalid]: 'moTaNgan',
  [ARTICLE_ERROR.contentTooLong]: 'noiDung',
  [ARTICLE_ERROR.contentInvalid]: 'noiDung',
  [ARTICLE_ERROR.contentRequiredToPublish]: 'noiDung',
  [ARTICLE_ERROR.statusInvalid]: 'trangThai',
  [ARTICLE_ERROR.tagInvalid]: 'hashtag',
  [ARTICLE_ERROR.tooManyTags]: 'hashtag',
  [ARTICLE_ERROR.tagAccentConflict]: 'hashtag',
  [ARTICLE_ERROR.tagDisabled]: 'hashtag',
};

// Chữ của bảng 5.8 (nguyên văn). Hai câu về thẻ có chỗ điền tên thẻ đã có: `{theDaCo}`.
const ARTICLE_ERROR_TEXT: Partial<Record<string, string>> = {
  [ARTICLE_ERROR.title]: 'Tiêu đề không được để trống và tối đa 255 ký tự.',
  [ARTICLE_ERROR.summaryTooLong]: 'Mô tả ngắn tối đa 500 ký tự.',
  // Chữ mới theo mẫu của `NOI_DUNG_KHONG_HOP_LE` (mã B1 thêm sau PLAN 5.8; Đại sửa được lúc review)
  [ARTICLE_ERROR.summaryInvalid]: 'Mô tả ngắn có ký tự không hợp lệ.',
  [ARTICLE_ERROR.contentTooLong]: 'Nội dung quá dài (tối đa 20.000 ký tự).',
  [ARTICLE_ERROR.contentInvalid]: 'Nội dung có ký tự không hợp lệ.',
  [ARTICLE_ERROR.contentRequiredToPublish]:
    'Cần có nội dung trước khi xuất bản.',
  [ARTICLE_ERROR.statusInvalid]: 'Không tạo bài mới ở trạng thái lưu trữ.',
  [ARTICLE_ERROR.tagInvalid]:
    'Thẻ chỉ gồm chữ, số và dấu gạch ngang (tối đa 50 ký tự).',
  [ARTICLE_ERROR.tooManyTags]: 'Tối đa 10 thẻ mỗi bài.',
  [ARTICLE_ERROR.tagAccentConflict]:
    'Đã có thẻ “{theDaCo}” (khác dấu). Hãy dùng thẻ này.',
  [ARTICLE_ERROR.tagDisabled]: 'Thẻ “{theDaCo}” đã bị tắt, chưa dùng lại được.',
};

// Chữ theo mã, hoặc undefined khi mã không có chữ riêng (nơi gọi dùng chữ chung). `theDaCo` điền vào hai câu về thẻ;
// thiếu `theDaCo` thì trả undefined để nơi gọi dùng câu không kèm tên thẻ.
export function articleErrorText(
  code: string,
  theDaCo?: string | null,
): string | undefined {
  const text = ARTICLE_ERROR_TEXT[code];
  if (text === undefined || !text.includes('{theDaCo}')) return text;
  return typeof theDaCo === 'string' && theDaCo !== ''
    ? text.replace('{theDaCo}', theDaCo)
    : undefined;
}

// Mọi mã của một lỗi API: `maLoi` rồi các `loi[].ma`, bỏ trùng, giữ thứ tự. Lỗi không phải `ApiError` ⇒ [].
export function collectErrorCodes(error: unknown): string[] {
  if (!(error instanceof ApiError)) return [];
  const codes = [error.maLoi, ...(error.loi ?? []).map((item) => item.ma)];
  return [...new Set(codes)];
}

// Tên thẻ đã có trong `chiTiet.theDaCo` của lỗi 409; `chiTiet` là `unknown` nên đọc có kiểm kiểu
export function readExistingTag(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const detail = error.chiTiet;
  if (typeof detail !== 'object' || detail === null) return null;
  const tag = (detail as { theDaCo?: unknown }).theDaCo;
  return typeof tag === 'string' && tag !== '' ? tag : null;
}
