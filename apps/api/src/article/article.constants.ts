// Hằng số của scope "Bài viết và cẩm nang sức khỏe" (PLAN article 5.5, 5.6, 5.7, T7). Giá trị `[đề xuất]` đã được duyệt kỹ thuật ngày 28/11/2026.

/** Bốn bảng của scope; mọi câu ghi của `article/` chỉ được tác động các bảng này (test kiến trúc ABQ-05). */
export const ARTICLE_TABLES = [
  'bai_viet',
  'hashtag',
  'bai_viet_hashtag',
  'benh_nhan_danh_gia_bai_viet',
] as const;

export const ARTICLE_LIMITS = {
  /** `bai_viet.tieu_de` varchar(255): đếm theo điểm mã sau chuẩn hoá NFC. */
  titleMax: 255,
  /** `bai_viet.mo_ta_ngan` varchar(500). */
  summaryMax: 500,
  /** Nội dung tối đa 20.000 ký tự (điểm mã)... */
  contentMaxChars: 20_000,
  /** ...và 60.000 byte UTF-8 (cột `text` chứa tối đa 65.535 byte; emoji chiếm 4 byte). MH15. */
  contentMaxBytes: 60_000,
  /** `hashtag.ten` varchar(50): 1 đến 50 điểm mã sau chuẩn hoá. */
  hashtagMax: 50,
  /** Tối đa 10 thẻ KHÁC NHAU mỗi bài (tính sau khi bỏ trùng). MH7. */
  hashtagsPerArticle: 10,
  /** Trần thô cho mảng `hashtag` gửi lên (chặn mảng khổng lồ trước khi chuẩn hoá). */
  hashtagsRawMax: 50,
  /** Độ dài tối đa của từ khoá `q` (tiêu đề, tiền tố thẻ). */
  queryMax: 100,
  /** Số gợi ý thẻ tối đa. */
  suggestMax: 10,
} as const;

// --- article B2: route công khai (PLAN article 5.7, MH10, T10) ---

/** Giới hạn và tiền tố của API công khai bài viết. Danh sách công khai mặc định 9 bài (lưới 3 cột), tối đa 30; thẻ phổ biến tối đa 20 (5.6). */
export const ARTICLE_PUBLIC = {
  /** Mọi route công khai dưới tiền tố này (tiền tố `/api` do proxy thêm). */
  routePrefix: 'public',
  pageSizeDefault: 9,
  pageSizeMax: 30,
  popularTagsMax: 20,
} as const;
