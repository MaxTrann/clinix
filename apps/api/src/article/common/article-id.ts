// Id bài viết ở đường dẫn công khai (article B2). BIGINT có dấu của MySQL: tối đa 9223372036854775807 (19 chữ số).
// Có một regex BIGINT lặp ngắn giữa file này và `ArticleIdDto` của DTO admin (B1); chấp nhận để không sửa file B1 (ghi ở TRACKING mục 3.5).
const ID_PATTERN = /^[1-9]\d{0,18}$/;
const MAX_BIGINT = 9223372036854775807n;

/** Chuỗi là số nguyên dương nằm trong khoảng BIGINT, không số 0 đầu, không khoảng trắng. Mọi giá trị khác (số, `null`, mảng…) là sai. */
export function isArticleId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ID_PATTERN.test(value) &&
    BigInt(value) <= MAX_BIGINT
  );
}
